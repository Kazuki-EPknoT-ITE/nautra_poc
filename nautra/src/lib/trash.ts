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

/**
 * 版の鎖の最新だけを残し、外されたものを除く。**順番が大事**: 先に外したものを除いてから最新を選ぶと、
 * 変更した版（最新）を外したときに、置き換えられていた元の版が「最新」として生き返ってしまう
 * （船内の当直に、陸上で外したはずの 22:00–23:00 が何本も残っていた）。陸上の配置表と同じ順にする。
 */
export function latestExcludingTrashed<T extends { id: string; supersedesId?: string }>(
  rows: readonly T[],
  removed: ReadonlySet<string>,
): T[] {
  return latestBySupersedes([...rows]).filter((r) => !removed.has(r.id));
}
