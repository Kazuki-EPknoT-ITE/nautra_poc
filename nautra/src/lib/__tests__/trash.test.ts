import { describe, expect, it } from "vitest";
import { trashedIdsOf } from "../trash";
import type { TrashEntryPayload } from "@/sync-protocol/records";

/** 外した当直は陸上・船内の両方で出さない。復元すれば戻る（S-18） */
const entry = (id: string, entityId: string, extra: Partial<TrashEntryPayload> = {}): TrashEntryPayload =>
  ({
    id,
    tenantId: "t",
    vesselId: "company-demo",
    occurredAt: "2026-10-01T00:00:00Z",
    recordedBy: "shore-fujii",
    deviceId: "shore-planner-device",
    publishedAt: "2026-10-01T00:00:00Z",
    publishedBy: "shore-fujii",
    entityKind: "当直シフト",
    entityId,
    entityLabel: entityId,
    mode: "delete",
    action: "外した",
    restorableUntil: "2026-10-31",
    ...extra,
  }) as TrashEntryPayload;

describe("外した実体（ゴミ箱）", () => {
  it("外した当直の ID が入り、別の種別は入らない", () => {
    const ids = trashedIdsOf([entry("t1", "shift-a"), entry("t2", "task-x", { entityKind: "作業タスク" })], "当直シフト");
    expect([...ids]).toEqual(["shift-a"]);
  });
  it("復元した（restoredAt の付いた新しい版がある）ものは入らない", () => {
    const ids = trashedIdsOf([entry("t1", "shift-a"), entry("t1b", "shift-a", { supersedesId: "t1", restoredAt: "2026-10-02T00:00:00Z" })]);
    expect(ids.has("shift-a")).toBe(false);
  });
});
