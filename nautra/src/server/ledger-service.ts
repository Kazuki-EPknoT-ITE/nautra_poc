import {
  addDays,
  evaluateDaily,
  evaluatePeriod,
  evaluateRestDays,
  monthRange,
  startOfLocalDay,
  ymdLocal,
  type PeriodLaborSummary,
} from "@/domain/labor-law/evaluate";
import { buildIntervals } from "@/domain/labor-law/intervals";
import {
  ledgerRowKey,
  parseLedgerCsv,
  type LedgerImportResult,
  type LedgerImportRow,
} from "@/domain/labor-law/ledger-import";
import type {
  DailyLaborSummary,
  LaborCheck,
  LaborCheckKey,
  TimeRecord,
  WorkCategory,
} from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";
import { CREW_MEMBERS, DEMO_TENANT_ID, DEMO_VESSEL, SHORE_PLANNER_ID, crewById } from "@/lib/crew";
import { ulid } from "@/lib/ids";
import {
  makeIdempotencyKey,
  resolveApproval,
  type ApprovalPayload,
} from "@/sync-protocol/events";
import { SYNC_SCHEMA_VERSION } from "@/sync-protocol/events";
import { currentLaborRuleSet } from "./labor-rules";
import { leaveDatesOf } from "./leave-service";
import {
  COMPANY_SCOPE_ID,
  crewMasterOf,
  crewNameOf,
  listCrewMasters,
  publishMaster,
  vesselNameOf,
  writeAuditLog,
} from "./master-service";
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

/**
 * 集計単位（要件定義書 3.2.1「自動集計機能（日単位・週単位・4週単位・月単位）」）。
 * 判定は `evaluatePeriod` に委譲し、ここでは期間の切り出しだけを行う。
 */
export interface LedgerAggregates {
  /** 直近4週間（28日窓）。four_week_max / reference_period を判定する */
  fourWeek: PeriodLaborSummary;
  /** 対象月。monthly_overtime を判定する */
  monthly: PeriodLaborSummary;
  /** 週1日以上の休日付与（3.2.5⑤）。休暇記録の日付を渡して判定する */
  restDay: LaborCheck;
  /** 直近1週間で休日と数えられた日 */
  restDates: string[];
  /** 休日として登録されている日（付与・取得） */
  leaveDates: string[];
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
  aggregates: LedgerAggregates;
  appliedRuleVersion: string;
}

/**
 * 判定に使われた実績値を取り出す。
 *
 * 休息の分割回数・最長休息は「日を跨いで連続する休息」を1つに繋いで数えるため、
 * 暦日で切った `restPeriods` の件数とは一致しない。記録簿には**判定に使った値**を載せる
 * （表の数字と判定が食い違うと、検査時に説明できなくなる）。
 */
export function checkActualOf(
  summary: DailyLaborSummary,
  key: LaborCheckKey,
  fallback: number,
): number {
  return summary.checks.find((c) => c.key === key)?.actual ?? fallback;
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
  const crew = ledgerSubject(crewMemberId);
  const records = getTimeRecords().filter((r) => r.crewMemberId === crew.id);
  const approvals = getApprovalEvents().filter((a) => a.payload.crewMemberId === crew.id);
  // 判定は労使協定を反映したルールで行う（6.5。DEFAULT を直接使わない）
  const ruleSet = currentLaborRuleSet(now);
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
    aggregates: buildLedgerAggregates(crew.id, month, now),
    appliedRuleVersion: ruleSet.version,
  };
}

/**
 * 記録簿の対象船員。船員マスタを正本とし、乗組員以外（予備船員等）も選べるようにする。
 */
function ledgerSubject(crewMemberId: string): { id: string; name: string; position: string } {
  const crew = crewById(crewMemberId);
  if (crew) return { id: crew.id, name: crew.name, position: crew.position };
  const master = crewMasterOf(crewMemberId);
  if (master)
    return { id: master.crewMemberId, name: master.name, position: master.position ?? "" };
  const fallback = CREW_MEMBERS[0];
  return { id: fallback.id, name: fallback.name, position: fallback.position };
}

/** 記録簿で切り替えられる船員（マスタ順） */
export function ledgerCrewOptions(): { id: string; name: string; position: string }[] {
  const masters = listCrewMasters();
  if (masters.length > 0)
    return masters.map((m) => ({
      id: m.crewMemberId,
      name: m.name,
      position: m.position ?? "",
    }));
  return CREW_MEMBERS.map((c) => ({ id: c.id, name: c.name, position: c.position }));
}

/**
 * 4週単位・月単位の集計と休日付与の判定（3.2.1 / 3.2.5③⑤）。
 * 日単位・週単位は `buildLedger` の各行と S-01 が持つため、ここでは長い窓だけを扱う。
 */
export function buildLedgerAggregates(
  crewMemberId: string,
  month: string,
  now = new Date(),
): LedgerAggregates {
  const ruleSet = currentLaborRuleSet(now);
  const records = getTimeRecords().filter((r) => r.crewMemberId === crewMemberId);
  const leaveDates = leaveDatesOf(crewMemberId);
  const today = ymdLocal(now);
  const range = monthRange(month);
  // 未来日は集計しない（記録簿と同じ扱い）
  const monthTo = range.to > today ? today : range.to;
  const fourWeekTo = monthTo;
  const fourWeekFrom = addDays(fourWeekTo, -27);

  const fourWeek = evaluatePeriod({
    crewMemberId,
    from: fourWeekFrom,
    to: fourWeekTo,
    records,
    leaveDates,
    now,
    ruleSet,
    include: ["four_week_max", "reference_period", "rest_day"],
  });
  const monthly = evaluatePeriod({
    crewMemberId,
    from: range.from,
    to: monthTo,
    records,
    leaveDates,
    now,
    ruleSet,
    include: ["monthly_overtime", "rest_day"],
  });
  const restWeek = evaluateRestDays({
    crewMemberId,
    // 過去月を見ているときはその月の末日を終端にする（表示している期間の判定を出す）
    endDate: monthTo >= range.from ? monthTo : today,
    records,
    leaveDates,
    now,
    ruleSet,
  });

  return {
    fourWeek,
    monthly,
    restDay: restWeek.check,
    restDates: restWeek.restDates,
    leaveDates: [...leaveDates].sort(),
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
        String(checkActualOf(d.summary, "rest_split", rest.length)),
        String(checkActualOf(d.summary, "rest_longest", longest)),
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

/* ═══════════════ 3.2.2 記録簿の PDF 出力（印刷ビュー用のスナップショット） ═══════════════ */

export interface LedgerPrintRow {
  date: string;
  workedMinutes: number;
  restTotalMinutes: number;
  restSplit: number;
  restLongestMinutes: number;
  exceptionalMinutes: number;
  isRestDay: boolean;
  level: string;
  approval: string;
  approver: string;
}

/**
 * 印刷（PDF 化）用のスナップショット。
 * 見出しの語は持たず**値だけ**を持つ。日本語／英語の様式は画面が i18n から見出しを引いて描く
 * （3.2.2「英語版様式にも対応可能な設計とする」）。
 */
export interface LedgerPrintData {
  crewMemberId: string;
  crewName: string;
  position: string;
  seamanBookNo?: string;
  vesselName: string;
  month: string;
  rows: LedgerPrintRow[];
  totals: {
    workedMinutes: number;
    workedDays: number;
    restDays: number;
    overtimeMinutes: number;
    weeklyAverageMinutes: number;
    exceptionalMinutes: number;
  };
  approver: { name: string; decidedAt: string } | null;
  appliedRuleVersion: string;
  generatedAt: string;
}

export function buildLedgerPrint(
  crewMemberId: string,
  month: string,
  now = new Date(),
): LedgerPrintData {
  const period = buildLedger(crewMemberId, month, now);
  const restDates = new Set(period.aggregates.leaveDates);
  const rows: LedgerPrintRow[] = period.days
    .filter((d) => d.summary.hasRecords || restDates.has(d.date))
    .map((d) => ({
      date: d.date,
      workedMinutes: d.summary.workedMinutes,
      restTotalMinutes: d.summary.restTotalMinutes,
      restSplit: checkActualOf(d.summary, "rest_split", d.summary.restPeriods.length),
      restLongestMinutes: checkActualOf(
        d.summary,
        "rest_longest",
        d.summary.restPeriods.reduce((max, r) => Math.max(max, r.minutes), 0),
      ),
      exceptionalMinutes: d.summary.exceptionalMinutes,
      isRestDay: !d.summary.hasRecords || restDates.has(d.date),
      level: d.summary.hasRecords ? d.summary.level : "ok",
      approval: d.approval ? d.approval.decision : "pending",
      approver: d.approval ? crewNameOf(d.approval.approvedBy) : "",
    }));

  // 労務管理責任者の承認のうち最も新しいもの（記録簿の承認欄に載せる）
  const managerApproval = period.days
    .map((d) => d.approval)
    .filter((a): a is ApprovalPayload => a?.approverRole === "labor_manager" && a.decision === "approved")
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];

  const master = crewMasterOf(period.crewMemberId);
  return {
    crewMemberId: period.crewMemberId,
    crewName: period.crewName,
    position: period.position,
    seamanBookNo: master?.seamanBookNo,
    vesselName: vesselNameOf(DEMO_VESSEL.id),
    month: period.month,
    rows,
    totals: {
      workedMinutes: period.totals.workedMinutes,
      workedDays: period.aggregates.monthly.workedDays,
      restDays: period.aggregates.monthly.restDays,
      overtimeMinutes: period.aggregates.monthly.overtimeMinutes,
      weeklyAverageMinutes: period.aggregates.fourWeek.weeklyAverageMinutes,
      exceptionalMinutes: period.aggregates.monthly.exceptionalMinutes,
    },
    approver: managerApproval
      ? { name: crewNameOf(managerApproval.approvedBy), decidedAt: managerApproval.decidedAt }
      : null,
    appliedRuleVersion: period.appliedRuleVersion,
    generatedAt: now.toISOString(),
  };
}

/**
 * 生成した記録簿を帳票センター（S-14）に残し、出力を監査ログに記録する（12.6）。
 * 提出物はスナップショットで保管し、以後マスタが更新されても書き換えない（12.3）。
 */
export function publishLedgerDocument(
  crewMemberId: string,
  month: string,
  actor: string,
  now = new Date(),
): { id: string; title: string } {
  const snapshot = buildLedgerPrint(crewMemberId, month, now);
  const doc = publishMaster(
    "generated_document",
    {
      kind: "labor_ledger",
      title: t.documentKind.labor_ledger,
      subjectLabel: `${month} / ${snapshot.crewName}（${snapshot.position}）`,
      snapshot,
      format: "pdf",
      generatedOn: ymdLocal(now),
    },
    { vesselId: COMPANY_SCOPE_ID, actor, now },
  );
  writeAuditLog({
    action: "export",
    entityKind: "generated_document",
    entityId: doc.id,
    actor,
    summary: `${snapshot.crewName} の労務管理記録簿（${month}）を出力`,
    now,
  });
  return { id: doc.id, title: `${doc.title}（${month} / ${snapshot.crewName}）` };
}

/* ═══════════════ 3.2.2 国交省 Excel マクロ様式の取込（CSV 経由） ═══════════════ */

/** 取込済みの行キー（time_record に保持した importKey）。再取込を弾くために使う */
function importedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const r of getTimeRecords() as (TimeRecord & { importKey?: string })[]) {
    if (r.importKey) keys.add(r.importKey);
  }
  return keys;
}

/** 取込の別名表（船員の氏名・作業種別の日本語表記）をマスタと i18n から作る */
function importOptions() {
  const crewAliases: Record<string, string> = {};
  const crewIds: string[] = [];
  for (const c of ledgerCrewOptions()) {
    crewIds.push(c.id);
    crewAliases[c.name] = c.id;
    crewAliases[c.name.replace(/\s+/g, "")] = c.id;
  }
  const categoryAliases: Record<string, WorkCategory> = {};
  for (const [key, label] of Object.entries(t.workCategory)) {
    categoryAliases[label] = key as WorkCategory;
  }
  // 様式で使われる略記も受ける（「スタンバイ（待機）」を「スタンバイ」と書く事業者が多い）
  categoryAliases["スタンバイ"] = "standby";
  categoryAliases["待機"] = "standby";
  categoryAliases["その他"] = "other";
  return { crewIds, crewAliases, categoryAliases, existingKeys: importedKeys() };
}

export interface LedgerImportPreview extends LedgerImportResult {
  /** プレビュー表示のための氏名解決（画面で ID を出さない） */
  crewNames: Record<string, string>;
}

/** 取込前のプレビュー（検証結果だけを返し、書き込みは行わない） */
export function previewLedgerImport(text: string): LedgerImportPreview {
  const result = parseLedgerCsv(text, importOptions());
  const crewNames: Record<string, string> = {};
  for (const r of result.rows) crewNames[r.crewMemberId] = crewNameOf(r.crewMemberId);
  return { ...result, crewNames };
}

/** 取込行 → 打刻レコードID（同じ勤務は同じIDになり、再取込しても二重に増えない） */
function importRecordId(key: string, suffix: "s" | "e"): string {
  return `imp-${key.replace(/[|:]/g, "-")}-${suffix}`;
}

function importOccurredAt(row: LedgerImportRow, which: "start" | "end"): string {
  const hhmm = which === "start" ? row.start : row.end;
  // 24:00 は「その日の終わり」= 翌日 00:00
  if (hhmm === "24:00") return startOfLocalDay(addDays(row.date, 1)).toISOString();
  return new Date(`${row.date}T${hhmm}:00`).toISOString();
}

export interface LedgerImportOutcome {
  imported: number;
  duplicated: number;
  issues: number;
  preview: LedgerImportPreview;
}

/**
 * 取込を確定する。
 * 取り込んだ行は**打刻レコードとして追記**する（既存レコードは上書きしない。12.3）。
 * 事後入力（entryType: "after"）とし、備考に取込であることを残して実打刻と区別できるようにする。
 */
export function commitLedgerImport(
  text: string,
  actor: string,
  now = new Date(),
): LedgerImportOutcome {
  const preview = previewLedgerImport(text);
  if (preview.rows.length === 0) {
    return { imported: 0, duplicated: 0, issues: preview.issues.length, preview };
  }

  const events = preview.rows.flatMap((row) =>
    (["start", "end"] as const).map((action) => {
      const id = importRecordId(row.key, action === "start" ? "s" : "e");
      const occurredAt = importOccurredAt(row, action);
      const payload = {
        id,
        tenantId: DEMO_TENANT_ID,
        vesselId: DEMO_VESSEL.id,
        crewMemberId: row.crewMemberId,
        workCategory: row.workCategory,
        action,
        occurredAt,
        entryType: "after" as const,
        recordedBy: actor,
        deviceId: SHORE_DEVICE,
        note: row.note ? `Excel様式から取込 / ${row.note}` : "Excel様式から取込",
        // 未知フィールドは passthrough で保全される（8.6）。再取込の重複判定に使う
        importKey: row.key,
      };
      return {
        kind: "time_record" as const,
        schemaVersion: SYNC_SCHEMA_VERSION,
        eventId: id,
        deviceId: SHORE_DEVICE,
        idempotencyKey: makeIdempotencyKey(SHORE_DEVICE, id),
        occurredAt,
        payload,
      };
    }),
  );

  const outcome = pushToStore(SHORE_DEVICE, events);
  if (outcome.accepted.length + outcome.duplicates.length !== events.length) {
    throw new Error("取り込めませんでした（イベントが受理されず隔離されました）");
  }
  writeAuditLog({
    action: "create",
    entityKind: "time_record",
    actor,
    after: `取込 ${preview.rows.length}件`,
    summary: `国交省Excel様式（CSV）から打刻を ${preview.rows.length}件 取り込み`,
    now,
  });

  return {
    imported: Math.round(outcome.accepted.length / 2),
    duplicated: Math.round(outcome.duplicates.length / 2),
    issues: preview.issues.length,
    preview,
  };
}

export { addDays, ledgerRowKey };
