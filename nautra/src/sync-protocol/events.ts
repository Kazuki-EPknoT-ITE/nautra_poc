import { z } from "zod";
import {
  RECORD_PAYLOAD_SCHEMAS,
  type RecordKind,
  type RecordPayloadByKind,
} from "./records";

/**
 * packages/sync-protocol 相当（基本設計書 8章）。
 * 同期イベントの型（Zod = 単一情報源）・冪等キー・競合解決の純関数を置く。
 *
 * エンティティレジストリ方式（8.6）: 追記型エンティティは SYNC_ENTITY_REGISTRY に
 * 「ペイロードの Zod スキーマ」と「競合ポリシー種別（8.3）」を登録するだけで、
 * Push/Pull・冪等キー処理・チェックポイント・隔離が共通実装で有効になる。
 * 同期処理の種別ごとの個別実装は行わない。
 */

export const SYNC_SCHEMA_VERSION = 1;

/** 冪等キー = deviceId + イベントID（8.2） */
export function makeIdempotencyKey(deviceId: string, eventId: string): string {
  return `${deviceId}:${eventId}`;
}

/** 競合ポリシー種別（8.3 の分類を列挙型で保持し、エンティティごとに宣言する） */
export type ConflictPolicy =
  | "append_only" // 打刻・一次記録: 追記のみ。競合は構造的に発生しない
  | "shore_priority" // マスタ: 陸上優先
  | "role_priority" // 承認: 役割優先順位（労務管理責任者 > 船長）・同 role 後勝ち
  | "plan_actual_split"; // シフト・配乗: 計画は陸上優先、実績は船内で別レコード

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

function eventSchemaFor<K extends string, P extends z.ZodTypeAny>(kind: K, payload: P) {
  return z.object({ kind: z.literal(kind), ...eventEnvelope, payload }).passthrough();
}

/** 既知エンティティのレジストリ（種別 → ペイロードスキーマ・競合ポリシー・発生元） */
export const SYNC_ENTITY_REGISTRY = {
  time_record: { payload: timeRecordPayloadSchema, policy: "append_only", origin: "vessel" },
  approval: { payload: approvalPayloadSchema, policy: "role_priority", origin: "both" },
  voyage_log: { payload: RECORD_PAYLOAD_SCHEMAS.voyage_log, policy: "append_only", origin: "vessel" },
  checklist_result: {
    payload: RECORD_PAYLOAD_SCHEMAS.checklist_result,
    policy: "append_only",
    origin: "vessel",
  },
  drill_record: { payload: RECORD_PAYLOAD_SCHEMAS.drill_record, policy: "append_only", origin: "vessel" },
  alcohol_check: {
    payload: RECORD_PAYLOAD_SCHEMAS.alcohol_check,
    policy: "append_only",
    origin: "vessel",
  },
  work_report: { payload: RECORD_PAYLOAD_SCHEMAS.work_report, policy: "append_only", origin: "vessel" },
  maintenance_record: {
    payload: RECORD_PAYLOAD_SCHEMAS.maintenance_record,
    policy: "append_only",
    origin: "vessel",
  },
  shift_plan: {
    payload: RECORD_PAYLOAD_SCHEMAS.shift_plan,
    policy: "plan_actual_split",
    origin: "shore",
  },
} as const satisfies Record<
  string,
  { payload: z.ZodTypeAny; policy: ConflictPolicy; origin: "vessel" | "shore" | "both" }
>;

export type SyncKind = keyof typeof SYNC_ENTITY_REGISTRY;
export const SYNC_KINDS = Object.keys(SYNC_ENTITY_REGISTRY) as SyncKind[];

export const timeRecordEventSchema = eventSchemaFor("time_record", timeRecordPayloadSchema);
export const approvalEventSchema = eventSchemaFor("approval", approvalPayloadSchema);
export const voyageLogEventSchema = eventSchemaFor("voyage_log", RECORD_PAYLOAD_SCHEMAS.voyage_log);
export const checklistResultEventSchema = eventSchemaFor(
  "checklist_result",
  RECORD_PAYLOAD_SCHEMAS.checklist_result,
);
export const drillRecordEventSchema = eventSchemaFor("drill_record", RECORD_PAYLOAD_SCHEMAS.drill_record);
export const alcoholCheckEventSchema = eventSchemaFor(
  "alcohol_check",
  RECORD_PAYLOAD_SCHEMAS.alcohol_check,
);
export const workReportEventSchema = eventSchemaFor("work_report", RECORD_PAYLOAD_SCHEMAS.work_report);
export const maintenanceRecordEventSchema = eventSchemaFor(
  "maintenance_record",
  RECORD_PAYLOAD_SCHEMAS.maintenance_record,
);
export const shiftPlanEventSchema = eventSchemaFor("shift_plan", RECORD_PAYLOAD_SCHEMAS.shift_plan);

/** 既知イベント種別の判別ユニオン（レジストリの全種別） */
export const knownSyncEventSchema = z.discriminatedUnion("kind", [
  timeRecordEventSchema,
  approvalEventSchema,
  voyageLogEventSchema,
  checklistResultEventSchema,
  drillRecordEventSchema,
  alcoholCheckEventSchema,
  workReportEventSchema,
  maintenanceRecordEventSchema,
  shiftPlanEventSchema,
]);

export type TimeRecordEvent = z.infer<typeof timeRecordEventSchema>;
export type ApprovalEvent = z.infer<typeof approvalEventSchema>;
export type SyncEvent = z.infer<typeof knownSyncEventSchema>;
export type ApprovalPayload = z.infer<typeof approvalPayloadSchema>;

/** 船内記録イベント（time_record / approval 以外の追記型エンティティ） */
export type RecordSyncEvent = Extract<SyncEvent, { kind: RecordKind }>;

export function isRecordKind(kind: string): kind is RecordKind {
  return kind in RECORD_PAYLOAD_SCHEMAS;
}

/** 汎用イベント組み立て（端末側 outbox / 陸上側シード・配信の双方で使用） */
export function makeRecordEvent<K extends RecordKind>(
  kind: K,
  payload: RecordPayloadByKind[K],
  deviceId: string,
): SyncEvent {
  return {
    kind,
    schemaVersion: SYNC_SCHEMA_VERSION,
    eventId: payload.id,
    deviceId,
    idempotencyKey: makeIdempotencyKey(deviceId, payload.id),
    occurredAt: payload.occurredAt,
    payload,
  } as SyncEvent;
}

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

export { latestBySupersedes } from "./records";
export type { RecordKind, RecordPayloadByKind } from "./records";
