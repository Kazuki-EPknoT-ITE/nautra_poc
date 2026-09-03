import { addDays, evaluateDaily, evaluateWeekly, ymdLocal } from "@/domain/labor-law/evaluate";
import type { CheckLevel, LaborCheck, TimeRecord } from "@/domain/labor-law/types";
import { SHIFT_TO_WORK } from "@/lib/assigned-work";
import { DEMO_TENANT_ID, DEMO_VESSEL, SHORE_PLANNER_ID } from "@/lib/crew";
import { ulid } from "@/lib/ids";
import { shiftWindow } from "@/lib/shift-plain";
import { makeIdempotencyKey, makeRecordEvent } from "@/sync-protocol/events";
import {
  findSupersedeConflicts,
  latestBySupersedes,
  SHIFT_TYPES,
  shiftPlanPayloadSchema,
  STATION_SCENARIOS,
  type ShiftPlanPayload,
  type ShiftType,
  type StationScenario,
} from "@/sync-protocol/records";
import { currentLaborRuleSet } from "./labor-rules";
import { crewNameOf, listCrewMasters } from "./master-service";
import { getRecordsOfKind, pushToStore } from "./store";

/**
 * 陸上のシフト管理サービス（manning ドメイン。S-10 簡易版）。
 * 計画は陸上正本: 変更は既存計画を supersedes する新規レコードとして配信し、
 * 船内は Pull で受信して「変更通知」として提示する（基本設計書 8.3 計画・実績分離）。
 */

const SHORE_DEVICE = "shore-planner-device";

export interface ShiftWeek {
  today: string;
  days: string[];
  /** crewId|date → 有効なシフト（開始時刻順） */
  cells: Record<string, ShiftPlanPayload[]>;
  changes: ShiftPlanPayload[];
  /** 自動解決不能な競合（同一シフトへの複数の変更）。双方保持して要確認 */
  conflicts: ReturnType<typeof findSupersedeConflicts<ShiftPlanPayload>>;
}

export function getShiftWeek(now = new Date()): ShiftWeek {
  const today = ymdLocal(now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 1));
  const all = getRecordsOfKind("shift_plan");
  const effective = latestBySupersedes(all).filter((p) => p.planType === "watch");
  const cells: Record<string, ShiftPlanPayload[]> = {};
  for (const p of effective) {
    if (!p.date) continue;
    const key = `${p.crewMemberId}|${p.date}`;
    (cells[key] ??= []).push(p);
  }
  for (const arr of Object.values(cells)) arr.sort((a, b) => (a.from ?? "").localeCompare(b.from ?? ""));
  const changes = all
    .filter((p) => p.supersedesId)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { today, days, cells, changes, conflicts: findSupersedeConflicts(all) };
}

/** 通常配置表（船内の持ち場）。場面ごとに全船員分を返す */
export function getStationPlans(): Record<string, ShiftPlanPayload[]> {
  const effective = latestBySupersedes(getRecordsOfKind("shift_plan")).filter(
    (p) => p.planType === "station",
  );
  const byScenario: Record<string, ShiftPlanPayload[]> = {};
  for (const p of effective) {
    if (!p.scenario) continue;
    (byScenario[p.scenario] ??= []).push(p);
  }
  return byScenario;
}

export interface PublishStationChangeInput {
  /** 置き換える既存の配置ID */
  supersedesId: string;
  station: string;
  duty: string;
  changeNote?: string;
  changeId?: string;
}

/**
 * 通常配置表の変更を配信する（当直と同じく追記のみ・陸上正本）。
 * 船内は SSE 通知 → Pull で即座に新しい持ち場を表示する。
 */
export function publishStationChange(
  input: PublishStationChangeInput,
  now = new Date(),
): ShiftPlanPayload {
  const all = getRecordsOfKind("shift_plan");
  const original = all.find((p) => p.id === input.supersedesId);
  if (!original || original.planType !== "station" || !original.scenario) {
    throw new Error("対象の配置が見つかりません");
  }
  if (!latestBySupersedes(all).some((p) => p.id === original.id)) {
    throw new Error("この配置は既に変更済みです。画面を更新して最新の配置を選び直してください");
  }
  const station = input.station.trim();
  const duty = input.duty.trim();
  if (!station) throw new Error("持ち場を入力してください");
  const payload: ShiftPlanPayload = shiftPlanPayloadSchema.parse({
    id: input.changeId?.trim() || `station-${ulid().toLowerCase()}`,
    tenantId: DEMO_TENANT_ID,
    vesselId: DEMO_VESSEL.id,
    occurredAt: now.toISOString(),
    recordedAt: now.toISOString(),
    recordedBy: SHORE_PLANNER_ID,
    deviceId: SHORE_DEVICE,
    supersedesId: original.id,
    planType: "station",
    crewMemberId: original.crewMemberId,
    scenario: original.scenario as StationScenario,
    station,
    duty: duty || original.duty,
    publishedAt: now.toISOString(),
    publishedBy: SHORE_PLANNER_ID,
    changeNote: input.changeNote?.trim() || undefined,
  });
  const outcome = pushToStore(SHORE_DEVICE, [makeRecordEvent("shift_plan", payload, SHORE_DEVICE)]);
  const key = makeIdempotencyKey(SHORE_DEVICE, payload.id);
  if (!outcome.accepted.includes(key) && !outcome.duplicates.includes(key)) {
    throw new Error("配信できませんでした（イベントが受理されず隔離されました）");
  }
  return payload;
}

export interface PublishShiftChangeInput {
  /** 置き換える既存シフトID */
  supersedesId: string;
  shiftType: ShiftType;
  from: string;
  to: string;
  changeNote?: string;
  /**
   * 変更イベントID（冪等キーの元）。画面側で採番して渡すと再試行・二重送信が同一イベントになる。
   * 省略時はサーバで採番する（PoC）。
   */
  changeId?: string;
}

/** シフト変更を配信する（既存計画を無効化する新規レコードを追記。原本は保持） */
export function publishShiftChange(input: PublishShiftChangeInput, now = new Date()): ShiftPlanPayload {
  const all = getRecordsOfKind("shift_plan");
  const original = all.find((p) => p.id === input.supersedesId);
  if (!original || original.planType !== "watch" || !original.date) {
    throw new Error("対象のシフトが見つかりません");
  }
  // 既に置き換え済みの原本をさらに置き換えると分岐（自動解決不能な競合）になるため拒否する（8.3）
  if (!latestBySupersedes(all).some((p) => p.id === original.id)) {
    throw new Error("このシフトは既に変更済みです。画面を更新して最新のシフトを選び直してください");
  }
  if (!/^\d{2}:\d{2}$/.test(input.from) || !/^\d{2}:\d{2}$/.test(input.to)) {
    throw new Error("時刻は HH:MM で指定してください");
  }
  const payload: ShiftPlanPayload = shiftPlanPayloadSchema.parse({
    id: input.changeId?.trim() || `shift-${ulid().toLowerCase()}`,
    tenantId: DEMO_TENANT_ID,
    vesselId: DEMO_VESSEL.id,
    occurredAt: new Date(`${original.date}T${input.from}:00`).toISOString(),
    recordedAt: now.toISOString(),
    recordedBy: SHORE_PLANNER_ID,
    deviceId: SHORE_DEVICE,
    supersedesId: original.id,
    planType: "watch",
    crewMemberId: original.crewMemberId,
    date: original.date,
    shiftType: input.shiftType,
    from: input.from,
    to: input.to,
    publishedAt: now.toISOString(),
    publishedBy: SHORE_PLANNER_ID,
    changeNote: input.changeNote?.trim() || undefined,
  });
  const outcome = pushToStore(SHORE_DEVICE, [makeRecordEvent("shift_plan", payload, SHORE_DEVICE)]);
  const key = makeIdempotencyKey(SHORE_DEVICE, payload.id);
  if (!outcome.accepted.includes(key) && !outcome.duplicates.includes(key)) {
    throw new Error("配信できませんでした（イベントが受理されず隔離されました）");
  }
  return payload;
}

/* ═══════════════ S-10 新規作成（当直シフト・通常配置表） ═══════════════ */

const HHMM = /^\d{2}:\d{2}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** 一度に作れる日数の上限（誤入力で数百件を配信しないための安全弁） */
const MAX_RANGE_DAYS = 62;

export interface PublishNewShiftInput {
  crewMemberId: string;
  /** 開始日（含む） */
  fromDate: string;
  /** 終了日（含む）。省略時は fromDate の1日だけ作る */
  toDate?: string;
  shiftType: ShiftType;
  from: string;
  to: string;
  changeNote?: string;
}

/** 入力から作成対象の日付一覧を出す（範囲指定の一括作成） */
export function shiftDatesOf(input: PublishNewShiftInput): string[] {
  const to = input.toDate?.trim() || input.fromDate;
  if (!YMD.test(input.fromDate) || !YMD.test(to)) {
    throw new Error("日付は YYYY-MM-DD で指定してください");
  }
  if (to < input.fromDate) throw new Error("終了日は開始日以降にしてください");
  const dates: string[] = [];
  for (let d = input.fromDate; d <= to; d = addDays(d, 1)) {
    dates.push(d);
    if (dates.length > MAX_RANGE_DAYS) {
      throw new Error(`一度に作れるのは ${MAX_RANGE_DAYS}日 までです。期間を分けてください`);
    }
  }
  return dates;
}

function assertShiftInput(input: PublishNewShiftInput): void {
  if (!input.crewMemberId) throw new Error("船員を選んでください");
  if (!SHIFT_TYPES.includes(input.shiftType)) throw new Error("当直の種別が不正です");
  if (!HHMM.test(input.from) || !HHMM.test(input.to)) {
    throw new Error("時刻は HH:MM で指定してください");
  }
  if (input.from === input.to) throw new Error("開始と終了に同じ時刻は指定できません");
}

/**
 * 当直シフトを**新規に作成**して配信する（基本設計書 S-10「当直・停泊・荷役シフトの作成・配信」）。
 * 変更（publishShiftChange）と同じく追記のみで、原本は書き換えない。
 * 日付範囲を指定すると同じパターンを日ごとに作る（不規則勤務の入力を減らす）。
 */
export function publishNewShift(
  input: PublishNewShiftInput,
  now = new Date(),
): ShiftPlanPayload[] {
  assertShiftInput(input);
  const dates = shiftDatesOf(input);
  const created: ShiftPlanPayload[] = [];
  const events = dates.map((date) => {
    const payload: ShiftPlanPayload = shiftPlanPayloadSchema.parse({
      id: `shift-${ulid().toLowerCase()}`,
      tenantId: DEMO_TENANT_ID,
      vesselId: DEMO_VESSEL.id,
      occurredAt: new Date(`${date}T${input.from}:00`).toISOString(),
      recordedAt: now.toISOString(),
      recordedBy: SHORE_PLANNER_ID,
      deviceId: SHORE_DEVICE,
      planType: "watch",
      crewMemberId: input.crewMemberId,
      date,
      shiftType: input.shiftType,
      from: input.from,
      to: input.to,
      publishedAt: now.toISOString(),
      publishedBy: SHORE_PLANNER_ID,
      changeNote: input.changeNote?.trim() || undefined,
    });
    created.push(payload);
    return makeRecordEvent("shift_plan", payload, SHORE_DEVICE);
  });
  const outcome = pushToStore(SHORE_DEVICE, events);
  if (outcome.accepted.length + outcome.duplicates.length !== events.length) {
    throw new Error("配信できませんでした（イベントが受理されず隔離されました）");
  }
  return created;
}

export interface PublishNewStationInput {
  crewMemberId: string;
  scenario: StationScenario;
  station: string;
  duty: string;
  changeNote?: string;
}

/** 通常配置表に**新しい持ち場を追加**して配信する（これまでは変更のみだった） */
export function publishNewStation(
  input: PublishNewStationInput,
  now = new Date(),
): ShiftPlanPayload {
  if (!input.crewMemberId) throw new Error("船員を選んでください");
  if (!STATION_SCENARIOS.includes(input.scenario)) throw new Error("場面の指定が不正です");
  const station = input.station.trim();
  if (!station) throw new Error("持ち場を入力してください");

  const payload: ShiftPlanPayload = shiftPlanPayloadSchema.parse({
    id: `station-${ulid().toLowerCase()}`,
    tenantId: DEMO_TENANT_ID,
    vesselId: DEMO_VESSEL.id,
    occurredAt: now.toISOString(),
    recordedAt: now.toISOString(),
    recordedBy: SHORE_PLANNER_ID,
    deviceId: SHORE_DEVICE,
    planType: "station",
    crewMemberId: input.crewMemberId,
    scenario: input.scenario,
    station,
    duty: input.duty.trim() || undefined,
    publishedAt: now.toISOString(),
    publishedBy: SHORE_PLANNER_ID,
    changeNote: input.changeNote?.trim() || undefined,
  });
  const outcome = pushToStore(SHORE_DEVICE, [makeRecordEvent("shift_plan", payload, SHORE_DEVICE)]);
  const key = makeIdempotencyKey(SHORE_DEVICE, payload.id);
  if (!outcome.accepted.includes(key) && !outcome.duplicates.includes(key)) {
    throw new Error("配信できませんでした（イベントが受理されず隔離されました）");
  }
  return payload;
}

/* ═══════════════ 3.2.3 公平な配分の可視化 ═══════════════ */

export interface WatchLoadRow {
  crewMemberId: string;
  crewName: string;
  /** 期間内に割り当てられた当直の合計（分） */
  minutes: number;
  /** 当直の本数 */
  count: number;
  /** 全員の平均との差（分）。＋は多い、−は少ない */
  diffFromAverage: number;
}

export interface WatchLoad {
  from: string;
  to: string;
  rows: WatchLoadRow[];
  averageMinutes: number;
}

/**
 * 直近の当直時間を船員別に合計する（3.2.3「不規則勤務の中でも**公平な配分**と
 * 法令遵守を両立させる」）。偏りが見えるよう平均との差も返す。
 * 計画（陸上正本）からの導出値であり、どこにも保存しない（ガードレール④）。
 */
export function buildWatchLoad(now = new Date(), days = 14): WatchLoad {
  const to = ymdLocal(now);
  const from = addDays(to, -(days - 1));
  const plans = latestBySupersedes(getRecordsOfKind("shift_plan")).filter(
    (p) =>
      p.planType === "watch" &&
      p.date !== undefined &&
      p.date >= from &&
      p.date <= to &&
      p.shiftType !== "off",
  );

  const totals = new Map<string, { minutes: number; count: number }>();
  for (const m of listCrewMasters()) totals.set(m.crewMemberId, { minutes: 0, count: 0 });
  for (const p of plans) {
    const win = shiftWindow(p);
    if (!win) continue;
    const entry = totals.get(p.crewMemberId) ?? { minutes: 0, count: 0 };
    entry.minutes += Math.round((win[1].getTime() - win[0].getTime()) / 60000);
    entry.count += 1;
    totals.set(p.crewMemberId, entry);
  }

  const entries = [...totals.entries()];
  const sum = entries.reduce((a, [, v]) => a + v.minutes, 0);
  const averageMinutes = entries.length > 0 ? Math.round(sum / entries.length) : 0;
  const rows: WatchLoadRow[] = entries
    .map(([crewMemberId, v]) => ({
      crewMemberId,
      crewName: crewNameOf(crewMemberId),
      minutes: v.minutes,
      count: v.count,
      diffFromAverage: v.minutes - averageMinutes,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  return { from, to, rows, averageMinutes };
}

/* ═══════════════ 作成時の法令チェック（事前判定） ═══════════════ */

/**
 * シフト計画を「そのとおり働いた場合の打刻」に置き換える。
 * 判定は打刻から行うドメイン純関数を使い回し、計画用の判定を別実装しない。
 */
function planToTimeRecords(plans: ShiftPlanPayload[]): TimeRecord[] {
  const records: TimeRecord[] = [];
  for (const p of plans) {
    if (!p.shiftType || p.shiftType === "off") continue;
    const win = shiftWindow(p);
    if (!win) continue;
    const base = {
      tenantId: p.tenantId,
      vesselId: p.vesselId,
      crewMemberId: p.crewMemberId,
      workCategory: SHIFT_TO_WORK[p.shiftType][0] ?? ("other" as const),
      entryType: "after" as const,
      recordedBy: p.publishedBy,
      deviceId: p.deviceId,
    };
    records.push({
      ...base,
      id: `${p.id}-plan-s`,
      action: "start",
      occurredAt: win[0].toISOString(),
    });
    records.push({
      ...base,
      id: `${p.id}-plan-e`,
      action: "end",
      occurredAt: win[1].toISOString(),
    });
  }
  return records;
}

export interface ShiftComplianceWarning {
  date: string;
  check: LaborCheck;
  level: CheckLevel;
}

export interface ShiftCompliance {
  warnings: ShiftComplianceWarning[];
  appliedRuleVersion: string;
  /** 判定対象にした日 */
  dates: string[];
}

/**
 * 作成しようとしているシフトを**含めた場合**の法令判定（3.2.5 ①②④）。
 * 計画どおり働いたと仮定して日14h・週72h・休息を確認する。
 * 作成そのものは止めず、警告として提示する（計画変更の判断は人が行う）。
 */
export function checkShiftPlanCompliance(
  input: PublishNewShiftInput,
  now = new Date(),
): ShiftCompliance {
  assertShiftInput(input);
  const dates = shiftDatesOf(input);
  const ruleSet = currentLaborRuleSet(now);

  const existing = latestBySupersedes(getRecordsOfKind("shift_plan")).filter(
    (p) => p.planType === "watch" && p.crewMemberId === input.crewMemberId,
  );
  const proposed: ShiftPlanPayload[] = dates.map((date) => ({
    id: `preview-${date}`,
    tenantId: DEMO_TENANT_ID,
    vesselId: DEMO_VESSEL.id,
    occurredAt: now.toISOString(),
    recordedBy: SHORE_PLANNER_ID,
    deviceId: SHORE_DEVICE,
    planType: "watch",
    crewMemberId: input.crewMemberId,
    date,
    shiftType: input.shiftType,
    from: input.from,
    to: input.to,
    publishedAt: now.toISOString(),
    publishedBy: SHORE_PLANNER_ID,
  }));

  const records = planToTimeRecords([...existing, ...proposed]);
  const warnings: ShiftComplianceWarning[] = [];
  // 判定の基準時刻は対象期間の翌日にする（未来日を「進行中の日」と誤認させない）
  const lastDate = dates[dates.length - 1];
  const after = new Date(`${addDays(lastDate, 1)}T00:00:00`);
  const at = after.getTime() > now.getTime() ? after : now;

  for (const date of dates) {
    const day = evaluateDaily({
      crewMemberId: input.crewMemberId,
      date,
      records,
      now: at,
      ruleSet,
    });
    for (const check of day.checks) {
      if (check.level !== "ok") warnings.push({ date, check, level: check.level });
    }
    const week = evaluateWeekly({
      crewMemberId: input.crewMemberId,
      endDate: date,
      records,
      now: at,
      ruleSet,
    });
    if (week.check.level !== "ok") {
      warnings.push({ date, check: week.check, level: week.check.level });
    }
  }

  return { warnings, appliedRuleVersion: ruleSet.version, dates };
}
