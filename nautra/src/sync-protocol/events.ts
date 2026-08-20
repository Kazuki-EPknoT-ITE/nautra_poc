import { z } from "zod";

/**
 * packages/sync-protocol 相当（基本設計書 8章）。
 * 同期イベントの型（Zod = 単一情報源）・冪等キー・競合解決の純関数を置く。
 * 追記型エンティティのレジストリ方式（8.6）: 新しい記録種別は本ファイルへの
 * スキーマ登録のみで Push/Pull・冪等処理が有効になる。
 */

export const SYNC_SCHEMA_VERSION = 1;

/** 冪等キー = deviceId + イベントID（8.2） */
export function makeIdempotencyKey(deviceId: string, eventId: string): string {
  return `${deviceId}:${eventId}`;
}

const workCategorySchema = z.enum([
  "navigation_watch",
  "cargo",
  "standby",
  "maintenance",
  "other",
]);

export const timeRecordPayloadSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    vesselId: z.string(),
    crewMemberId: z.string(),
    workCategory: workCategorySchema,
    action: z.enum(["start", "end"]),
    occurredAt: z.string(),
    entryType: z.enum(["realtime", "after", "resubmit"]),
    supersedesId: z.string().optional(),
    recordedBy: z.string(),
    deviceId: z.string(),
    note: z.string().optional(),
  })
  .passthrough(); // 未知フィールドは破棄せず往復保全（8.6）

export const approvalPayloadSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    vesselId: z.string(),
    crewMemberId: z.string(),
    /** 対象日 YYYY-MM-DD */
    date: z.string(),
    decision: z.enum(["approved", "remanded"]),
    /** 差戻し時の対象レコードID */
    targetRecordId: z.string().optional(),
    reason: z.string().optional(),
    approvedBy: z.string(),
    approverRole: z.enum(["captain", "labor_manager"]),
    decidedAt: z.string(),
  })
  .passthrough();

const eventEnvelope = {
  schemaVersion: z.number(),
  eventId: z.string(),
  deviceId: z.string(),
  idempotencyKey: z.string(),
  /** 端末時刻（サーバ受信時刻はサーバ側で併記保持。8.2） */
  occurredAt: z.string(),
};

export const timeRecordEventSchema = z
  .object({
    kind: z.literal("time_record"),
    ...eventEnvelope,
    payload: timeRecordPayloadSchema,
  })
  .passthrough();

export const approvalEventSchema = z
  .object({
    kind: z.literal("approval"),
    ...eventEnvelope,
    payload: approvalPayloadSchema,
  })
  .passthrough();

/** 既知イベント種別のレジストリ（8.6 エンティティレジストリ方式） */
export const knownSyncEventSchema = z.discriminatedUnion("kind", [
  timeRecordEventSchema,
  approvalEventSchema,
]);

export type TimeRecordEvent = z.infer<typeof timeRecordEventSchema>;
export type ApprovalEvent = z.infer<typeof approvalEventSchema>;
export type SyncEvent = z.infer<typeof knownSyncEventSchema>;
export type ApprovalPayload = z.infer<typeof approvalPayloadSchema>;

export const syncPushRequestSchema = z.object({
  deviceId: z.string(),
  schemaVersion: z.number(),
  /** 各イベントはサーバ側で個別にパースし、未知種別は隔離する（8.6） */
  events: z.array(z.unknown()).max(500), // バッチ上限 500件/リクエスト（8.2）
});

export const syncPushResponseSchema = z.object({
  accepted: z.array(z.string()), // 受理した idempotencyKey
  duplicates: z.array(z.string()), // 冪等キー重複（適用済み）
  quarantined: z.array(z.string()), // 未知種別として隔離した eventId
  serverVersion: z.number(),
  serverReceivedAt: z.string(),
});

export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;

/**
 * 承認の競合解決（8.3 / 要件定義書 12.5）:
 * 役割優先順位（労務管理責任者 > 船長）。同 role の同時承認は後勝ち＋履歴保全。
 * すべての承認イベントは保持し、有効な1件を導出する純関数。
 */
const ROLE_PRIORITY: Record<string, number> = {
  labor_manager: 2,
  captain: 1,
};

export function resolveApproval(
  events: { payload: ApprovalPayload; serverSeq?: number }[],
): ApprovalPayload | null {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => {
    const pa = ROLE_PRIORITY[a.payload.approverRole] ?? 0;
    const pb = ROLE_PRIORITY[b.payload.approverRole] ?? 0;
    if (pa !== pb) return pa - pb;
    const sa = a.serverSeq ?? 0;
    const sb = b.serverSeq ?? 0;
    if (sa !== sb) return sa - sb;
    return a.payload.decidedAt.localeCompare(b.payload.decidedAt);
  });
  return sorted[sorted.length - 1].payload;
}
