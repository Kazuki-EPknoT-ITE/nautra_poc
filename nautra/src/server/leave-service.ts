import { daysBetween } from "@/domain/crew/freshness";
import { DEFAULT_CREDENTIAL_RULE_SET } from "@/rules/credential-rules";
import { LEAVE_KINDS, type LeaveKind, type LeaveRecordPayload } from "@/sync-protocol/records";
import {
  COMPANY_SCOPE_ID,
  crewNameOf,
  effective,
  listCrewMasters,
  publishMaster,
  todayLocal,
  writeAuditLog,
} from "./master-service";

/**
 * 3.2.4 休日・有給休暇・補償休日の管理。
 *
 * 「船員法に基づく休日、補償休日、有給休暇の付与状況を記録・管理し、**未消化の休日を可視化**する。
 *  休暇日数の付与や編集は**管理者権限のみ**が行える。」
 *
 * 設計:
 * - 正本は追記型の `leave_record`（付与 / 取得の2種類のイベント）。
 * - **残日数は導出値**（付与 − 取得）であり、どこにも保存しない（ガードレール④ / 12.3）。
 *   時効（`expiresOn`）を過ぎた付与は残日数から除き、「時効切れ」として別に数える。
 * - 休日の付与状況は法令チェック（3.2.5⑤ 週1日以上）にも渡す。判定そのものは
 *   `domain/labor-law/evaluate.ts` の `evaluateRestDays` が行い、ここは日付集合を作るだけ。
 */

/** 時効・期限が近いと見なす日数。証書の「まもなく期限」と同じ閾値を使う（rule_sets から注入） */
const EXPIRING_SOON_DAYS = DEFAULT_CREDENTIAL_RULE_SET.values.cautionDays;

export interface LeaveKindBalance {
  kind: LeaveKind;
  /** 有効な付与の合計（時効切れを除く） */
  granted: number;
  /** 時効を過ぎた付与の合計 */
  expired: number;
  taken: number;
  /** 残日数（導出値。保存しない） */
  remaining: number;
}

export interface ExpiringGrant {
  record: LeaveRecordPayload;
  daysToExpiry: number;
}

export interface LeaveBalance {
  crewMemberId: string;
  crewName: string;
  kinds: LeaveKindBalance[];
  /** 有給休暇の残日数（未消化の可視化で最初に見る値） */
  paidRemaining: number;
  /** 未消化の休日（有給以外の休日・補償休日の残り） */
  holidayRemaining: number;
  /** 時効が近い付与（未消化のまま失効しそうなもの） */
  expiringGrants: ExpiringGrant[];
  /** 記録の履歴（新しい順） */
  records: LeaveRecordPayload[];
}

function leaveRecordsOf(crewMemberId: string): LeaveRecordPayload[] {
  return effective("leave_record").filter((r) => r.crewMemberId === crewMemberId);
}

/**
 * 休日として扱う日（3.2.5⑤ の判定に渡す日付集合）。
 *
 * - 「取得」された休暇日はその日が休みなので休日に数える。
 * - 「付与」は法定休日・補償休日のみ休日に数える（その日を休みとして与えたという意味）。
 *   有給・特別休暇の付与は**年次の権利付与**であり、その日が休みだったわけではないため除く。
 */
export function leaveDatesOf(crewMemberId: string): Set<string> {
  const dates = new Set<string>();
  for (const r of leaveRecordsOf(crewMemberId)) {
    if (r.action === "take") dates.add(r.date);
    else if (r.kind === "statutory_holiday" || r.kind === "compensatory") dates.add(r.date);
  }
  return dates;
}

/** 船員1人分の休暇残（導出値） */
export function buildLeaveBalance(crewMemberId: string, now = new Date()): LeaveBalance {
  const today = todayLocal(now);
  const records = leaveRecordsOf(crewMemberId);

  const kinds: LeaveKindBalance[] = LEAVE_KINDS.map((kind) => {
    const ofKind = records.filter((r) => r.kind === kind);
    let granted = 0;
    let expired = 0;
    let taken = 0;
    for (const r of ofKind) {
      if (r.action === "take") {
        taken += r.days;
      } else if (r.expiresOn && r.expiresOn < today) {
        expired += r.days; // 時効切れの付与は残日数に数えない
      } else {
        granted += r.days;
      }
    }
    return { kind, granted, expired, taken, remaining: Math.max(0, granted - taken) };
  });

  const expiringGrants: ExpiringGrant[] = records
    .filter((r) => r.action === "grant" && r.expiresOn && r.expiresOn >= today)
    .map((r) => ({ record: r, daysToExpiry: daysBetween(today, r.expiresOn as string) }))
    .filter((g) => g.daysToExpiry <= EXPIRING_SOON_DAYS)
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry);

  const paid = kinds.find((k) => k.kind === "paid_leave");
  const holiday = kinds
    .filter((k) => k.kind !== "paid_leave")
    .reduce((sum, k) => sum + k.remaining, 0);

  return {
    crewMemberId,
    crewName: crewNameOf(crewMemberId),
    kinds,
    paidRemaining: paid?.remaining ?? 0,
    holidayRemaining: holiday,
    expiringGrants,
    records: [...records].sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/** 全船員の休暇残（S-06 の一覧。未消化の可視化） */
export function buildLeaveBoard(now = new Date()): LeaveBalance[] {
  return listCrewMasters().map((m) => buildLeaveBalance(m.crewMemberId, now));
}

/** 時効が近い付与を全船員ぶん集めた警告一覧（3.2.4「未消化の休日を可視化する」） */
export function expiringLeaveAlerts(
  now = new Date(),
): { crewMemberId: string; crewName: string; grant: ExpiringGrant }[] {
  return buildLeaveBoard(now).flatMap((b) =>
    b.expiringGrants.map((grant) => ({
      crewMemberId: b.crewMemberId,
      crewName: b.crewName,
      grant,
    })),
  );
}

/* ═══════════════ 付与・取得の登録（管理者権限のみ。3.2.4） ═══════════════ */

export interface PublishLeaveInput {
  crewMemberId: string;
  kind: LeaveKind;
  action: "grant" | "take";
  /** 付与日 / 取得日 */
  date: string;
  /** 日数（半日取得を許すため小数可） */
  days: number;
  /** 付与の時効（有給の消滅時効。取得では使わない） */
  expiresOn?: string;
  reason?: string;
  /** 実施者（監査証跡。呼び出し側でサインイン中のスタッフを渡す） */
  actor: string;
  recordId?: string;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 休日・有給の付与／取得を1件配信する（追記のみ）。
 * 権限（`edit_leave`）の確認は呼び出し元の Server Action が `requireShore` で行う。
 */
export function publishLeaveRecord(
  input: PublishLeaveInput,
  now = new Date(),
): LeaveRecordPayload {
  if (!input.crewMemberId) throw new Error("対象の船員を選んでください");
  if (!YMD.test(input.date)) throw new Error("日付は YYYY-MM-DD で指定してください");
  if (input.expiresOn && !YMD.test(input.expiresOn)) {
    throw new Error("時効の日付は YYYY-MM-DD で指定してください");
  }
  if (input.expiresOn && input.expiresOn <= input.date) {
    throw new Error("時効の日付は付与日より後にしてください");
  }
  if (!Number.isFinite(input.days) || input.days <= 0) {
    throw new Error("日数は 0 より大きい数で入力してください");
  }
  if (input.days > 366) throw new Error("日数が大きすぎます（366日まで）");
  if (!LEAVE_KINDS.includes(input.kind)) throw new Error("休暇の種類が不正です");

  const payload = publishMaster(
    "leave_record",
    {
      crewMemberId: input.crewMemberId,
      kind: input.kind,
      action: input.action,
      date: input.date,
      days: input.days,
      expiresOn: input.action === "grant" ? input.expiresOn : undefined,
      reason: input.reason?.trim() || undefined,
      grantedBy: input.action === "grant" ? input.actor : undefined,
    },
    { vesselId: COMPANY_SCOPE_ID, actor: input.actor, recordId: input.recordId, now },
  );

  writeAuditLog({
    action: "create",
    entityKind: "leave_record",
    entityId: payload.id,
    actor: input.actor,
    after: `${input.kind} ${input.action} ${input.date} ${input.days}日`,
    summary: `${crewNameOf(input.crewMemberId)} の休暇を${input.action === "grant" ? "付与" : "取得登録"}`,
    now,
  });

  return payload;
}
