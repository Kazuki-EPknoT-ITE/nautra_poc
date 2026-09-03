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
  // 船内へのお知らせ・速報: 陸上が正本（船内は参照のみ）
  notice: {
    payload: RECORD_PAYLOAD_SCHEMAS.notice,
    policy: "append_only",
    origin: "shore",
  },
  // 記録項目テンプレート: 船長（船内）と陸上のどちらからも配信できる
  record_template: {
    payload: RECORD_PAYLOAD_SCHEMAS.record_template,
    policy: "append_only",
    origin: "both",
  },

  /* ── マスタ・計画（要件定義書 12.5「船員・船舶マスター/配乗計画は陸上を優先」） ──
     船内での変更は「変更依頼」として起票し、陸上の承認を経て反映する。
     船内端末から直接 Push された場合は checkOriginPolicy で隔離される（破棄しない）。 */
  crew_master: { payload: RECORD_PAYLOAD_SCHEMAS.crew_master, policy: "shore_priority", origin: "shore" },
  credential: { payload: RECORD_PAYLOAD_SCHEMAS.credential, policy: "shore_priority", origin: "shore" },
  vessel_master: {
    payload: RECORD_PAYLOAD_SCHEMAS.vessel_master,
    policy: "shore_priority",
    origin: "shore",
  },
  // 乗下船・配乗計画は「計画は陸上・実績は船内の別レコード」（12.5 計画/実績分離）
  embarkation: {
    payload: RECORD_PAYLOAD_SCHEMAS.embarkation,
    policy: "plan_actual_split",
    origin: "shore",
  },
  evaluation: { payload: RECORD_PAYLOAD_SCHEMAS.evaluation, policy: "shore_priority", origin: "shore" },
  leave_record: {
    payload: RECORD_PAYLOAD_SCHEMAS.leave_record,
    policy: "shore_priority",
    origin: "shore",
  },
  maintenance_plan: {
    payload: RECORD_PAYLOAD_SCHEMAS.maintenance_plan,
    policy: "plan_actual_split",
    origin: "shore",
  },
  part_stock: { payload: RECORD_PAYLOAD_SCHEMAS.part_stock, policy: "shore_priority", origin: "shore" },
  dock_plan: { payload: RECORD_PAYLOAD_SCHEMAS.dock_plan, policy: "shore_priority", origin: "shore" },
  filing: { payload: RECORD_PAYLOAD_SCHEMAS.filing, policy: "shore_priority", origin: "shore" },
  procedure_task: {
    payload: RECORD_PAYLOAD_SCHEMAS.procedure_task,
    policy: "shore_priority",
    origin: "shore",
  },
  training_plan: {
    payload: RECORD_PAYLOAD_SCHEMAS.training_plan,
    policy: "shore_priority",
    origin: "shore",
  },
  sms_document: {
    payload: RECORD_PAYLOAD_SCHEMAS.sms_document,
    policy: "shore_priority",
    origin: "shore",
  },
  charter_contract: {
    payload: RECORD_PAYLOAD_SCHEMAS.charter_contract,
    policy: "shore_priority",
    origin: "shore",
  },
  invoice: { payload: RECORD_PAYLOAD_SCHEMAS.invoice, policy: "shore_priority", origin: "shore" },
  expense: { payload: RECORD_PAYLOAD_SCHEMAS.expense, policy: "shore_priority", origin: "shore" },
  payroll: { payload: RECORD_PAYLOAD_SCHEMAS.payroll, policy: "shore_priority", origin: "shore" },
  subsidy: { payload: RECORD_PAYLOAD_SCHEMAS.subsidy, policy: "shore_priority", origin: "shore" },
  // 位置情報は外部（AIS/GPS）を陸上のアダプタが取り込む。船内からは配信しない
  vessel_position: {
    payload: RECORD_PAYLOAD_SCHEMAS.vessel_position,
    policy: "shore_priority",
    origin: "shore",
  },
  voyage_schedule: {
    payload: RECORD_PAYLOAD_SCHEMAS.voyage_schedule,
    policy: "plan_actual_split",
    origin: "shore",
  },
  generated_document: {
    payload: RECORD_PAYLOAD_SCHEMAS.generated_document,
    policy: "shore_priority",
    origin: "shore",
  },
  agreement: { payload: RECORD_PAYLOAD_SCHEMAS.agreement, policy: "shore_priority", origin: "shore" },

  /* ── 双方向の追記型（船内が起票し、陸上が追記で応答する） ── */
  // 事故・ヒヤリハット報告: 船内の一次記録。原因分析・行政報告の追記は陸上から
  incident_report: {
    payload: RECORD_PAYLOAD_SCHEMAS.incident_report,
    policy: "append_only",
    origin: "both",
  },
  // 健康アンケート・匿名相談: 船内が回答し、陸上の窓口が対応状況を追記する
  wellbeing_response: {
    payload: RECORD_PAYLOAD_SCHEMAS.wellbeing_response,
    policy: "append_only",
    origin: "both",
  },
  // 監査証跡（12.6）: 陸上・船内・外部連携のいずれからも積まれる追記専用ログ
  audit_log: { payload: RECORD_PAYLOAD_SCHEMAS.audit_log, policy: "append_only", origin: "both" },
} as const satisfies Record<
  string,
  { payload: z.ZodTypeAny; policy: ConflictPolicy; origin: "vessel" | "shore" | "both" }
>;

export type SyncKind = keyof typeof SYNC_ENTITY_REGISTRY;
export const SYNC_KINDS = Object.keys(SYNC_ENTITY_REGISTRY) as SyncKind[];

/**
 * 陸上側の端末ID規約（PoC）。本番は sync_devices の role（vessel/shore）で判定する。
 * 陸上発（origin=shore）のエンティティ = 計画・マスタは陸上端末からのみ受理する（8.3 陸上優先）。
 */
export function isShoreDevice(deviceId: string): boolean {
  return deviceId.startsWith("shore-") || deviceId.startsWith("seed-shore-");
}

/**
 * 競合ポリシー／発生元の適用（純関数）。受理可能なら null、違反なら理由文字列を返す。
 * 違反イベントは破棄せず隔離（sync_conflicts / sync_quarantine 相当）して「要確認」にする。
 */
export function checkOriginPolicy(kind: string, deviceId: string): string | null {
  const def = (SYNC_ENTITY_REGISTRY as Record<string, { origin: "vessel" | "shore" | "both" }>)[kind];
  if (!def) return null; // 未知種別は別経路（未知種別隔離）で扱う
  if (def.origin === "shore" && !isShoreDevice(deviceId)) {
    return `origin policy: ${kind} is shore-authoritative (received from ${deviceId})`;
  }
  return null;
}

export const timeRecordEventSchema = eventSchemaFor("time_record", timeRecordPayloadSchema);
export const approvalEventSchema = eventSchemaFor("approval", approvalPayloadSchema);

/**
 * 既知イベント種別の判別ユニオン（レジストリの全種別）。
 *
 * **レジストリから生成する**。以前は種別ごとに手で列挙しており、登録漏れがあると
 * その種別が「未知種別」として隔離され続ける事故が起きえた（ガードレール⑧の注意書き）。
 * ここで導出することで、SYNC_ENTITY_REGISTRY に足すだけで Push/Pull の受理まで完了する
 * （ガードレール⑨「登録するだけで完了させる」）。登録漏れ検査のテストも引き続き通る。
 */
const registryEventSchemas = (Object.keys(SYNC_ENTITY_REGISTRY) as SyncKind[]).map((kind) =>
  eventSchemaFor(kind, SYNC_ENTITY_REGISTRY[kind].payload),
);

export const knownSyncEventSchema = z.discriminatedUnion(
  "kind",
  registryEventSchemas as unknown as [
    (typeof registryEventSchemas)[number],
    (typeof registryEventSchemas)[number],
    ...(typeof registryEventSchemas)[number][],
  ],
);

export type TimeRecordEvent = z.infer<typeof timeRecordEventSchema>;
export type ApprovalEvent = z.infer<typeof approvalEventSchema>;
export type ApprovalPayload = z.infer<typeof approvalPayloadSchema>;

/**
 * 同期イベントの型。判別ユニオンをレジストリ上の写像として定義するため、
 * 種別を1つ足すと型も自動で広がる（実行時スキーマと型定義が乖離しない）。
 */
export type SyncEvent = {
  [K in SyncKind]: {
    kind: K;
    schemaVersion: number;
    eventId: string;
    deviceId: string;
    idempotencyKey: string;
    occurredAt: string;
    payload: z.infer<(typeof SYNC_ENTITY_REGISTRY)[K]["payload"]>;
  };
}[SyncKind];

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
