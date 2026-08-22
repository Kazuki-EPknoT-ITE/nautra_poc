import type { EquipmentKind, MaintenanceRecordPayload } from "@/sync-protocol/records";

/**
 * 保守記録からの導出（単一実装。メニューのバッジと保守画面のボードで共用する。要件定義書 12.3）。
 * 正は maintenance_record の履歴であり、導出値は保存しない。
 */

/** 機器ごとの最新記録（occurredAt が最大のもの） */
export function latestByEquipment(
  records: MaintenanceRecordPayload[],
): Map<EquipmentKind, MaintenanceRecordPayload> {
  const map = new Map<EquipmentKind, MaintenanceRecordPayload>();
  for (const r of records) {
    const cur = map.get(r.equipment);
    if (!cur || r.occurredAt > cur.occurredAt) map.set(r.equipment, r);
  }
  return map;
}

/** 要対応（最新記録が要注意・不良の機器） */
export function openMaintenanceIssues(records: MaintenanceRecordPayload[]): MaintenanceRecordPayload[] {
  return [...latestByEquipment(records).values()].filter((r) => r.condition !== "good");
}
