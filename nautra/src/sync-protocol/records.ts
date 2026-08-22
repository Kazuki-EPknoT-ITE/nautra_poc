import { z } from "zod";

/**
 * 船内記録（voyage / maintenance / manning ドメイン）の同期ペイロード定義。
 * 基本設計書 5.2「船内記録: voyage_logs / checklist_results / drills / work_reports /
 * standby_records / fuel_records / handovers」「保守: maintenance_records」
 * 「配乗: shifts（計画=陸上正本）」の PoC 表現。
 *
 * すべて追記専用。訂正は supersedesId 付きの新規レコードで表現し、原本は物理保持する
 * （要件定義書 12.3: 一次記録はイミュータブル）。
 * 未知フィールドは passthrough で往復保全する（基本設計書 8.6）。
 */

/** 全記録種別に共通する列（一次記録の証跡性: 端末採番ID・記録者・端末） */
const recordBase = {
  id: z.string(),
  tenantId: z.string(),
  vesselId: z.string(),
  /** 記録対象の日時（端末時刻・ISO 8601） */
  occurredAt: z.string(),
  /** 記録者（共用端末では選択方式） */
  recordedBy: z.string(),
  deviceId: z.string(),
  /** 訂正時に無効化する対象レコードID（元レコードは物理保持） */
  supersedesId: z.string().optional(),
  note: z.string().optional(),
};

/* ───────────────────────── 03 航海日誌（V-05） ───────────────────────── */

export const VOYAGE_LOG_TYPES = ["departure", "arrival", "position", "remark"] as const;
export type VoyageLogType = (typeof VOYAGE_LOG_TYPES)[number];

export const voyageLogPayloadSchema = z
  .object({
    ...recordBase,
    logType: z.enum(VOYAGE_LOG_TYPES),
    port: z.string().optional(),
    route: z.string().optional(),
    /** 船位（緯度経度または地点名） */
    position: z.string().optional(),
    courseDeg: z.number().optional(),
    speedKnots: z.number().optional(),
    engineRpm: z.number().optional(),
    weather: z.string().optional(),
    wind: z.string().optional(),
    seaState: z.string().optional(),
    visibility: z.string().optional(),
    remarks: z.string().optional(),
  })
  .passthrough();
export type VoyageLogPayload = z.infer<typeof voyageLogPayloadSchema>;

/* ─────────────── 03 チェックリスト・点検・操練・アルコール検知（V-06） ─────────────── */

export const CHECKLIST_TEMPLATE_IDS = ["pre_departure", "safety_patrol"] as const;
export type ChecklistTemplateId = (typeof CHECKLIST_TEMPLATE_IDS)[number];

export const checklistItemResultSchema = z.object({
  key: z.string(),
  label: z.string(),
  group: z.string(),
  result: z.enum(["ok", "ng", "na"]),
  note: z.string().optional(),
});
export type ChecklistItemResult = z.infer<typeof checklistItemResultSchema>;

export const checklistResultPayloadSchema = z
  .object({
    ...recordBase,
    templateId: z.enum(CHECKLIST_TEMPLATE_IDS),
    /** テンプレート版（テンプレート変更後も結果の意味が追えるように保持） */
    templateVersion: z.string(),
    items: z.array(checklistItemResultSchema),
    overall: z.enum(["pass", "fail"]),
    remarks: z.string().optional(),
  })
  .passthrough();
export type ChecklistResultPayload = z.infer<typeof checklistResultPayloadSchema>;

export const DRILL_TYPES = [
  "fire",
  "abandon_ship",
  "man_overboard",
  "emergency_steering",
  "oil_spill",
  "other",
] as const;
export type DrillType = (typeof DRILL_TYPES)[number];

export const drillRecordPayloadSchema = z
  .object({
    ...recordBase,
    drillType: z.enum(DRILL_TYPES),
    leader: z.string(),
    participants: z.array(z.string()),
    durationMinutes: z.number(),
    remarks: z.string().optional(),
  })
  .passthrough();
export type DrillRecordPayload = z.infer<typeof drillRecordPayloadSchema>;

export const alcoholCheckPayloadSchema = z
  .object({
    ...recordBase,
    /** 被検者 */
    crewMemberId: z.string(),
    /** 呼気中アルコール濃度 mg/L */
    valueMgPerL: z.number(),
    method: z.enum(["detector", "visual"]),
    result: z.enum(["pass", "fail"]),
    checkedBy: z.string(),
    /** 判定に用いた基準値（証跡として保持） */
    limitMgPerL: z.number(),
  })
  .passthrough();
export type AlcoholCheckPayload = z.infer<typeof alcoholCheckPayloadSchema>;

/* ─────────────── 05 作業・待機・燃料・引継記録（V-07） ─────────────── */

export const WORK_REPORT_TYPES = ["cargo", "standby", "fuel", "handover"] as const;
export type WorkReportType = (typeof WORK_REPORT_TYPES)[number];

export const workReportPayloadSchema = z
  .object({
    ...recordBase,
    reportType: z.enum(WORK_REPORT_TYPES),
    /** 作業者・報告者 */
    crewMemberId: z.string(),
    startedAt: z.string(),
    endedAt: z.string().optional(),
    // 荷役
    port: z.string().optional(),
    cargoKind: z.string().optional(),
    operation: z.enum(["load", "unload"]).optional(),
    quantity: z.string().optional(),
    // スタンバイ待機（荷役待ち等。待機時間の見える化）
    standbyReason: z.string().optional(),
    // 燃料
    fuelType: z.string().optional(),
    fuelOperation: z.enum(["bunkering", "consumption"]).optional(),
    fuelQuantityL: z.number().optional(),
    remainingOnBoardL: z.number().optional(),
    // 引継
    handoverTo: z.string().optional(),
    handoverItems: z.string().optional(),
    remarks: z.string().optional(),
  })
  .passthrough();
export type WorkReportPayload = z.infer<typeof workReportPayloadSchema>;

/* ─────────────── 05 日常点検・保守記録（要件 3.4.1） ─────────────── */

export const EQUIPMENT_KINDS = [
  "main_engine",
  "generator",
  "steering_gear",
  "deck_machinery",
  "hull",
  "nav_equipment",
  "lifesaving",
  "other",
] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

export const MAINTENANCE_RECORD_TYPES = ["daily_inspection", "maintenance", "repair"] as const;
export type MaintenanceRecordType = (typeof MAINTENANCE_RECORD_TYPES)[number];

export const maintenanceRecordPayloadSchema = z
  .object({
    ...recordBase,
    equipment: z.enum(EQUIPMENT_KINDS),
    recordType: z.enum(MAINTENANCE_RECORD_TYPES),
    crewMemberId: z.string(),
    condition: z.enum(["good", "attention", "defect"]),
    runningHours: z.number().optional(),
    action: z.string().optional(),
    nextDueDate: z.string().optional(),
    remarks: z.string().optional(),
  })
  .passthrough();
export type MaintenanceRecordPayload = z.infer<typeof maintenanceRecordPayloadSchema>;

/* ─────────────── 04 当直シフト・配置表（V-08。計画＝陸上正本） ─────────────── */

export const SHIFT_TYPES = [
  "navigation_watch",
  "engine_watch",
  "port_watch",
  "cargo_watch",
  "off",
] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

export const STATION_SCENARIOS = ["arrival_departure", "cargo", "emergency"] as const;
export type StationScenario = (typeof STATION_SCENARIOS)[number];

export const shiftPlanPayloadSchema = z
  .object({
    ...recordBase,
    planType: z.enum(["watch", "station"]),
    crewMemberId: z.string(),
    // watch（当直シフト）
    date: z.string().optional(),
    shiftType: z.enum(SHIFT_TYPES).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    // station（通常配置表）
    scenario: z.enum(STATION_SCENARIOS).optional(),
    station: z.string().optional(),
    duty: z.string().optional(),
    /** 陸上での配信日時・配信者。変更通知の基準 */
    publishedAt: z.string(),
    publishedBy: z.string(),
    changeNote: z.string().optional(),
  })
  .passthrough();
export type ShiftPlanPayload = z.infer<typeof shiftPlanPayloadSchema>;

/* ─────────────── 種別 → ペイロード型の対応表 ─────────────── */

export const RECORD_PAYLOAD_SCHEMAS = {
  voyage_log: voyageLogPayloadSchema,
  checklist_result: checklistResultPayloadSchema,
  drill_record: drillRecordPayloadSchema,
  alcohol_check: alcoholCheckPayloadSchema,
  work_report: workReportPayloadSchema,
  maintenance_record: maintenanceRecordPayloadSchema,
  shift_plan: shiftPlanPayloadSchema,
} as const;

export type RecordKind = keyof typeof RECORD_PAYLOAD_SCHEMAS;
export const RECORD_KINDS = Object.keys(RECORD_PAYLOAD_SCHEMAS) as RecordKind[];

export type RecordPayloadByKind = {
  [K in RecordKind]: z.infer<(typeof RECORD_PAYLOAD_SCHEMAS)[K]>;
};
export type AnyRecordPayload = RecordPayloadByKind[RecordKind];

/**
 * 追記専用レコード群から「有効な最新」を導出する純関数。
 * supersedesId で無効化されたレコードを除外し、同一IDの重複（再受信）を1件にする。
 * 打刻（effectiveRecords）と同じ規則を船内記録・シフト計画にも適用する。
 */
export function latestBySupersedes<T extends { id: string; supersedesId?: string }>(
  items: T[],
): T[] {
  const superseded = new Set<string>();
  for (const it of items) if (it.supersedesId) superseded.add(it.supersedesId);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    if (superseded.has(it.id) || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}
