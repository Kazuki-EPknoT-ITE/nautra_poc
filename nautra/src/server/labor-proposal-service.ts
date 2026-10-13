import { addDays, evaluateDaily, ymdLocal } from "@/domain/labor-law/evaluate";
import { effectiveRecords } from "@/domain/labor-law/intervals";
import {
  WORK_CATEGORIES,
  type DailyLaborSummary,
  type PunchAction,
  type TimeRecord,
  type WorkCategory,
} from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";
import {
  approvalEventSchema,
  makeIdempotencyKey,
  SYNC_SCHEMA_VERSION,
  type ApprovalPayload,
} from "@/sync-protocol/events";
import { proposalStatusOf, type ProposalStatus } from "@/lib/labor-proposals";
import { currentLaborRuleSet } from "./labor-rules";
import { crewNameOf, writeAuditLog } from "./master-service";
import { getApprovalEvents, getTimeRecords, pushToStore } from "./store";

/**
 * 修正案つきの差戻し（レビュー LABOR-06。利用者の判断 2026-10-10）。
 *
 * 警告・注意が出た日の打刻について、陸上の労務管理責任者が「正しくはこう」という案と理由を
 * 差戻しに添えて船内へ送る。**打刻を入れるのは本人**で、船内で「この内容で直す」を押すと
 * 本人名義の再入力（resubmit）／事後入力（after）として追記される。
 *
 * 要件定義書 3.2.1「承認者も修正不可、修正は本人への差戻しのみ」と 12.2「更新経路: 本人の打刻のみ」
 * をそのまま守るための形で、陸上が打刻を直接書く経路は作らない（法令レビューの指摘 R-1）。
 * 差戻しは承認イベントなので、送った時点でその日の承認は「差戻し」に戻る（役割優先 12.5）。
 */

const SHORE_DEVICE = "shore-planner-device";

export interface ProposalChange {
  /** 直してほしい打刻（いま有効なもの） */
  targetId: string;
  occurredAt: string;
  workCategory: WorkCategory;
}

export interface ProposalAddition {
  workCategory: WorkCategory;
  action: PunchAction;
  occurredAt: string;
}

export interface ProposalInput {
  crewMemberId: string;
  date: string;
  changes: ProposalChange[];
  additions: ProposalAddition[];
  reason: string;
  /**
   * 送信ごとの使い捨ての札（画面が作る）。差戻しの ID をこれから決めるので、
   * 応答が遅れて二度押されても同じ冪等キーになり、案が二重に積まれない。
   */
  opToken: string;
}

export interface ProposalActor {
  id: string;
}

export interface ProposalRow {
  approval: ApprovalPayload;
  /** 直してほしい元の打刻（追加の案では null） */
  target: TimeRecord | null;
  status: ProposalStatus;
}

export interface ProposalDay {
  crewMemberId: string;
  crewName: string;
  date: string;
  summary: DailyLaborSummary;
  /** その日のいま有効な打刻（時刻順） */
  records: TimeRecord[];
  /** その日に送った修正案（新しい順） */
  proposals: ProposalRow[];
}

const dayOf = (iso: string) => ymdLocal(new Date(iso));

export function buildProposalDay(crewMemberId: string, date: string, now = new Date()): ProposalDay {
  const records = getTimeRecords().filter((r) => r.crewMemberId === crewMemberId);
  const byId = new Map(records.map((r) => [r.id, r]));
  const proposals = getApprovalEvents()
    .map((a) => a.payload)
    .filter((a) => a.crewMemberId === crewMemberId && a.date === date && a.proposal)
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
    .map((approval) => ({
      approval,
      target: approval.targetRecordId ? (byId.get(approval.targetRecordId) ?? null) : null,
      status: proposalStatusOf(approval, records),
    }));
  return {
    crewMemberId,
    crewName: crewNameOf(crewMemberId),
    date,
    summary: evaluateDaily({ crewMemberId, date, records, now, ruleSet: currentLaborRuleSet(now) }),
    records: effectiveRecords(records)
      .filter((r) => dayOf(r.occurredAt) === date)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    proposals,
  };
}

/** その日に「本人の確認待ち」の修正案があるか（記録簿・カレンダーの印に使う導出値） */
export function pendingProposalDates(crewMemberId: string): Set<string> {
  const records = getTimeRecords().filter((r) => r.crewMemberId === crewMemberId);
  const out = new Set<string>();
  for (const { payload } of getApprovalEvents()) {
    if (payload.crewMemberId !== crewMemberId || !payload.proposal) continue;
    if (proposalStatusOf(payload, records) === "pending") out.add(payload.date);
  }
  return out;
}

function describe(p: { occurredAt: string; workCategory: WorkCategory; action: PunchAction }): string {
  const hhmm = new Date(p.occurredAt).toTimeString().slice(0, 5);
  return `${hhmm} ${t.workCategory[p.workCategory]}の${p.action === "start" ? "開始" : "終了"}`;
}

/** 修正案つきの差戻しを送る。戻り値は送った案の数 */
export function publishCorrectionProposal(input: ProposalInput, actor: ProposalActor, now = new Date()): number {
  const reason = input.reason.trim();
  if (!reason) throw new Error("理由を入力してください（船内の本人に表示されます）");
  if (!/^[a-z0-9-]{8,64}$/i.test(input.opToken)) throw new Error("送信の札が正しくありません。画面を開き直してください");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("日付が正しくありません");
  if (input.changes.length === 0 && input.additions.length === 0) throw new Error("直す打刻がありません");

  const records = getTimeRecords().filter((r) => r.crewMemberId === input.crewMemberId);
  const effective = new Map(effectiveRecords(records).map((r) => [r.id, r]));
  const allowedDays = new Set([addDays(input.date, -1), input.date, addDays(input.date, 1)]);

  /** 時刻の検査: 形式・未来でない・対象日の前後1日以内（別の日へ移して違反を見えなくさせない） */
  const checkTime = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) throw new Error("時刻の形式が正しくありません");
    if (d.getTime() > now.getTime()) throw new Error("未来の時刻にはできません");
    if (!allowedDays.has(ymdLocal(d))) throw new Error("対象の日から離れた時刻にはできません（前後1日まで）");
    return d.toISOString();
  };
  const checkCategory = (c: WorkCategory) => {
    // 休息への付け替えは労働時間を消すことになるので、案としても出させない
    if (!WORK_CATEGORIES.includes(c)) throw new Error("作業の種類が正しくありません");
    return c;
  };

  const base = {
    tenantId: records[0]?.tenantId,
    vesselId: records[0]?.vesselId,
  };
  const payloads: ApprovalPayload[] = [];
  const lines: string[] = [];
  let n = 0;
  const nextId = () => `appr-prop-${input.opToken.toLowerCase()}-${++n}`;

  for (const ch of input.changes) {
    const target = effective.get(ch.targetId);
    if (!target) throw new Error("直そうとした打刻が見つかりません（既に直されたか、別の船員の記録です）");
    const occurredAt = checkTime(ch.occurredAt);
    const workCategory = checkCategory(ch.workCategory);
    if (occurredAt === new Date(target.occurredAt).toISOString() && workCategory === target.workCategory) continue;
    const proposal = { kind: "change" as const, workCategory, action: target.action, occurredAt };
    payloads.push({
      id: nextId(),
      tenantId: target.tenantId,
      vesselId: target.vesselId,
      crewMemberId: input.crewMemberId,
      date: input.date,
      decision: "remanded",
      targetRecordId: target.id,
      reason,
      proposal,
      approvedBy: actor.id,
      approverRole: "labor_manager",
      decidedAt: now.toISOString(),
    });
    lines.push(`${describe(target)} → ${describe(proposal)}`);
  }
  for (const add of input.additions) {
    if (!base.tenantId || !base.vesselId) throw new Error("この船員の打刻がまだ無いため、追加を依頼できません");
    // 船は「その日の打刻」の船を使う（転船した船員を別の船の記録にしない）。無ければ直近の打刻の船
    const sameDay = records.filter((r) => dayOf(r.occurredAt) === input.date);
    const ref = sameDay[sameDay.length - 1] ?? records[records.length - 1]!;
    const proposal = {
      kind: "add" as const,
      workCategory: checkCategory(add.workCategory),
      action: add.action,
      occurredAt: checkTime(add.occurredAt),
    };
    payloads.push({
      id: nextId(),
      tenantId: ref.tenantId,
      vesselId: ref.vesselId,
      crewMemberId: input.crewMemberId,
      date: input.date,
      decision: "remanded",
      reason,
      proposal,
      approvedBy: actor.id,
      approverRole: "labor_manager",
      decidedAt: now.toISOString(),
    });
    lines.push(`追加 ${describe(proposal)}`);
  }
  if (payloads.length === 0) throw new Error("変更がありません（時刻も作業も元のままです）");

  const events = payloads.map((payload) => ({
    kind: "approval" as const,
    schemaVersion: SYNC_SCHEMA_VERSION,
    eventId: payload.id,
    deviceId: SHORE_DEVICE,
    idempotencyKey: makeIdempotencyKey(SHORE_DEVICE, payload.id),
    occurredAt: payload.decidedAt,
    payload,
  }));
  // 1件でもスキーマに合わなければ何も送らない（一部だけ積まれて監査ログと食い違うのを防ぐ）
  for (const e of events) approvalEventSchema.parse(e);
  const outcome = pushToStore(SHORE_DEVICE, events);
  const stored = outcome.accepted.length + outcome.duplicates.length;

  writeAuditLog({
    action: "create",
    entityKind: "approval",
    entityId: payloads.map((p) => p.id).join(","),
    actor: actor.id,
    channel: "shore",
    now,
    summary:
      `修正案つきの差戻し: ${crewNameOf(input.crewMemberId)} の ${input.date}（${lines.join(" / ")}）。理由: ${reason}` +
      (stored !== events.length ? `。受理 ${stored}/${events.length}件` : ""),
  });
  if (stored !== events.length) throw new Error("一部の案を送れませんでした（イベントが受理されず隔離されました）");
  return payloads.length;
}
