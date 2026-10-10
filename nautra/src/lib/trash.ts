import { latestBySupersedes, type TrashEntryPayload } from "@/sync-protocol/records";

/**
 * 外された（ゴミ箱に入った）実体の ID。陸上と船内の両方がこの1つで決める（S-18）。
 * 例: 陸上の配置表で外した当直は、船内でも当直として出さない（「船内には取り消しとして届きます」）。
 * 復元すると `restoredAt` 付きの新しい版が積まれ、ここから外れる。
 */
export function trashedIdsOf(entries: readonly TrashEntryPayload[], kind?: string): Set<string> {
  const ids = new Set<string>();
  for (const e of latestBySupersedes([...entries])) {
    if (e.restoredAt) continue;
    if (kind && e.entityKind !== kind) continue;
    ids.add(e.entityId);
  }
  return ids;
}
