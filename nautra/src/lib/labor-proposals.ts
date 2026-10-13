import type { TimeRecord } from "@/domain/labor-law/types";
import type { ApprovalPayload } from "@/sync-protocol/events";

/**
 * 修正案つきの差戻し（レビュー LABOR-06）が本人に反映されたか。船内・陸上の両方がこの1つを使う。
 *
 * - 直す案（change）: 対象の打刻が置き換えられていれば反映済み（本人が自分で入れ直した場合も含む）
 * - 足す案（add）: この案の ID（proposalId）を持つ打刻があれば反映済み
 */
export type ProposalStatus = "pending" | "applied";

export function proposalStatusOf(approval: ApprovalPayload, records: readonly TimeRecord[]): ProposalStatus {
  if (records.some((r) => r.proposalId === approval.id)) return "applied";
  if (approval.proposal?.kind === "change" && approval.targetRecordId) {
    return records.some((r) => r.supersedesId === approval.targetRecordId) ? "applied" : "pending";
  }
  return "pending";
}

/** 本人の確認待ちの修正案（新しい順） */
export function pendingProposals(
  approvals: readonly ApprovalPayload[],
  records: readonly TimeRecord[],
  crewMemberId: string,
): ApprovalPayload[] {
  return approvals
    .filter((a) => a.crewMemberId === crewMemberId && a.decision === "remanded" && a.proposal)
    .filter((a) => proposalStatusOf(a, records) === "pending")
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
}
