import { describe, expect, it } from "vitest";
import { latestExcludingTrashed, trashedIdsOf } from "../trash";
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

describe("版の鎖から外したものを除く（latestExcludingTrashed）", () => {
  const v1 = { id: "s1", from: "22:00", to: "23:00" };
  const v2 = { id: "s2", supersedesId: "s1", from: "22:00", to: "23:30" };
  it("変更した版を外すと、元の版も出ない（元の版が生き返らない）", () => {
    expect(latestExcludingTrashed([v1, v2], new Set(["s2"]))).toEqual([]);
  });
  it("外していなければ最新の版だけが残る", () => {
    expect(latestExcludingTrashed([v1, v2], new Set())).toEqual([v2]);
  });
  it("鎖の無い別の当直には影響しない", () => {
    const other = { id: "s9", from: "02:00", to: "03:00" };
    expect(latestExcludingTrashed([v1, v2, other], new Set(["s2"]))).toEqual([other]);
  });
});
