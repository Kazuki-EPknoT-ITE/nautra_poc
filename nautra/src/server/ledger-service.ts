import { addDays, evaluateDaily, ymdLocal } from "@/domain/labor-law/evaluate";
import { buildIntervals } from "@/domain/labor-law/intervals";
import type { DailyLaborSummary, WorkCategory } from "@/domain/labor-law/types";
import { CREW_MEMBERS, DEMO_TENANT_ID, DEMO_VESSEL, SHORE_PLANNER_ID, crewById } from "@/lib/crew";
import { ulid } from "@/lib/ids";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";
import {
  makeIdempotencyKey,
  resolveApproval,
  type ApprovalPayload,
} from "@/sync-protocol/events";
import { SYNC_SCHEMA_VERSION } from "@/sync-protocol/events";
import { getApprovalEvents, getTimeRecords, pushToStore } from "./store";

/**
 * S-06 労務管理（承認・記録簿）のドメインサービス。
 *
 * 陸上の労務管理責任者が「船員別に日々の労働時間を確認し、承認・差戻しし、
 * 労務管理記録簿（第16号の5書式に相当）として出力する」ための組み立てを行う。
 * 判定は船内と同じ純関数＋同じルール版で行い、ここで再実装しない（要件定義書 12.3）。
 * 承認は役割優先（労務管理責任者 > 船長）で解決される（8.3 / resolveApproval）。
 */

const SHORE_DEVICE = "shore-planner-device";

/** 1日の帯グラフ用の区間（0〜24時を割合で表す） */
export interface DayBar {
  workCategory: WorkCategory;
  /** 0〜1（その日の中での開始位置・幅） */
  start: number;
  width: number;
  label: string;
  /** 終了打刻がまだない区間 */
  open: boolean;
}

export interface LedgerDay {
  date: string;
  summary: DailyLaborSummary;
  bars: DayBar[];
  /** 有効な承認（役割優先で解決したもの） */
  approval: ApprovalPayload | null;
  /** 労務管理責任者による承認が済んでいるか */
  approvedByManager: boolean;
}

export interface LedgerPeriod {
  crewMemberId: string;
  crewName: string;
  position: string;
  /** YYYY-MM */
  month: string;
  days: LedgerDay[];
  totals: {
    workedMinutes: number;
    recordedDays: number;
    violationDays: number;
    cautionDays: number;
    pendingDays: number;
  };
  appliedRuleVersion: string;
}

/** 月の日付一覧（YYYY-MM → その月の全日） */
function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/** 当月（PoC の基準日は「今日」） */
export function currentMonth(now = new Date()): string {
  return ymdLocal(now).slice(0, 7);
}

export function monthOptions(now = new Date(), count = 3): string[] {
  const [y, m] = currentMonth(now).split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

/** 船員1名・1か月分の記録簿を組み立てる */
export function buildLedger(crewMemberId: string, month: string, now = new Date()): LedgerPeriod {
  const crew = crewById(crewMemberId) ?? CREW_MEMBERS[0];
  const records = getTimeRecords().filter((r) => r.crewMemberId === crew.id);
  const approvals = getApprovalEvents().filter((a) => a.payload.crewMemberId === crew.id);
  const ruleSet = DEFAULT_LABOR_RULE_SET;
  const today = ymdLocal(now);

  const days: LedgerDay[] = [];
  let workedMinutes = 0;
  let recordedDays = 0;
  let violationDays = 0;
  let cautionDays = 0;
  let pendingDays = 0;

  for (const date of daysOfMonth(month)) {
    if (date > today) break; // 未来日は記録簿に出さない
    const summary = evaluateDaily({ crewMemberId: crew.id, date, records, now, ruleSet });
    const approval = resolveApproval(approvals.filter((a) => a.payload.date === date));
    if (summary.hasRecords) {
      recordedDays += 1;
      workedMinutes += summary.workedMinutes;
      if (summary.level === "violation") violationDays += 1;
      else if (summary.level === "caution") cautionDays += 1;
      if (!approval || approval.approverRole !== "labor_manager") pendingDays += 1;
    }
    days.push({
      date,
      summary,
      bars: buildDayBars(records, date, now),
      approval,
      approvedByManager: approval?.approverRole === "labor_manager" && approval.decision === "approved",
    });
  }

  return {
    crewMemberId: crew.id,
    crewName: crew.name,
    position: crew.position,
    month,
    days,
    totals: { workedMinutes, recordedDays, violationDays, cautionDays, pendingDays },
    appliedRuleVersion: ruleSet.version,
  };
}

/** その日の打刻区間を 0〜24時の割合に変換する（タイムチャート用） */
function buildDayBars(records: ReturnType<typeof getTimeRecords>, date: string, now: Date): DayBar[] {
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const span = dayEnd.getTime() - dayStart.getTime();

  return buildIntervals(records)
    .map((iv) => {
      const end = iv.endAt ?? now;
      const from = Math.max(iv.startAt.getTime(), dayStart.getTime());
      const to = Math.min(end.getTime(), dayEnd.getTime());
      if (to <= from) return null;
      return {
        workCategory: iv.workCategory,
        start: (from - dayStart.getTime()) / span,
        width: (to - from) / span,
        label: `${iv.workCategory} ${new Date(from).toTimeString().slice(0, 5)}–${new Date(to).toTimeString().slice(0, 5)}`,
        open: iv.endAt === null,
      } satisfies DayBar;
    })
    .filter((b): b is DayBar => b !== null)
    .sort((x, y) => x.start - y.start);
}

export interface ManagerApprovalInput {
  crewMemberId: string;
  /** 対象日（複数日をまとめて承認できる = 日次一括承認） */
  dates: string[];
  decision: "approved" | "remanded";
  reason?: string;
}

/**
 * 労務管理責任者としての承認・差戻しを配信する。
 * 承認も追記型イベントで、船長の承認と同じ経路（同期）に積む。
 * 役割優先（労務管理責任者 > 船長）は resolveApproval が解決する。
 */
export function publishManagerApproval(input: ManagerApprovalInput, now = new Date()): number {
  if (input.dates.length === 0) throw new Error("対象日を選択してください");
  if (input.decision === "remanded" && !input.reason?.trim()) {
    throw new Error("差戻しの理由を入力してください（船内の本人に表示されます）");
  }
  const events = input.dates.map((date) => {
    const payload: ApprovalPayload = {
      id: `appr-${ulid().toLowerCase()}`,
      tenantId: DEMO_TENANT_ID,
      vesselId: DEMO_VESSEL.id,
      crewMemberId: input.crewMemberId,
      date,
      decision: input.decision,
      reason: input.reason?.trim() || undefined,
      approvedBy: SHORE_PLANNER_ID,
      approverRole: "labor_manager",
      decidedAt: now.toISOString(),
    };
    return {
      kind: "approval" as const,
      schemaVersion: SYNC_SCHEMA_VERSION,
      eventId: payload.id,
      deviceId: SHORE_DEVICE,
      idempotencyKey: makeIdempotencyKey(SHORE_DEVICE, payload.id),
      occurredAt: payload.decidedAt,
      payload,
    };
  });
  const outcome = pushToStore(SHORE_DEVICE, events);
  if (outcome.accepted.length + outcome.duplicates.length !== events.length) {
    throw new Error("配信できませんでした（イベントが受理されず隔離されました）");
  }
  return events.length;
}

/**
 * 労務管理記録簿の行（第16号の5書式に相当する項目）。
 * PoC では CSV として出力する（本番は PDF 生成・電子保管。要件定義書 5.2）。
 */
export function ledgerCsv(period: LedgerPeriod): string {
  const header = [
    "日付",
    "労働時間(分)",
    "休息時間合計(分)",
    "休息の分割回数",
    "最長休息(分)",
    "判定",
    "承認",
    "承認者区分",
    "適用ルール版",
  ];
  const levelLabel: Record<string, string> = { ok: "適合", caution: "注意", violation: "警告" };
  const roleLabel: Record<string, string> = { labor_manager: "労務管理責任者", captain: "船長" };
  const rows = period.days
    .filter((d) => d.summary.hasRecords)
    .map((d) => {
      const rest = d.summary.restPeriods;
      const longest = rest.reduce((max, r) => Math.max(max, r.minutes), 0);
      return [
        d.date,
        String(d.summary.workedMinutes),
        String(d.summary.restTotalMinutes),
        String(rest.length),
        String(longest),
        levelLabel[d.summary.level] ?? d.summary.level,
        d.approval ? (d.approval.decision === "approved" ? "承認" : "差戻し") : "未承認",
        d.approval ? (roleLabel[d.approval.approverRole] ?? d.approval.approverRole) : "",
        d.summary.appliedRuleVersion,
      ].join(",");
    });
  const meta = [
    `船員,${period.crewName}（${period.position}）`,
    `船舶,${DEMO_VESSEL.name}`,
    `対象月,${period.month}`,
    `作成,${new Date().toISOString()}`,
    "",
  ];
  return [...meta, header.join(","), ...rows].join("\n");
}

export { addDays };
