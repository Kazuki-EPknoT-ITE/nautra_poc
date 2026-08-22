import { describe, expect, it } from "vitest";
import { applyPush, createEmptyStoreState } from "@/server/apply-push";
import {
  isRecordKind,
  knownSyncEventSchema,
  makeRecordEvent,
  SYNC_ENTITY_REGISTRY,
  SYNC_KINDS,
} from "../events";
import {
  latestBySupersedes,
  RECORD_KINDS,
  type ShiftPlanPayload,
  type VoyageLogPayload,
} from "../records";

/**
 * エンティティレジストリ（8.6）と船内記録・シフト計画の同期に関するテスト。
 * 「新種別はスキーマ登録のみで Push/Pull・冪等・隔離が有効になる」ことを検証する。
 */

const base = (id: string, occurredAt = "2026-08-21T06:00:00.000Z") => ({
  id,
  tenantId: "tenant-demo",
  vesselId: "vessel-001",
  occurredAt,
  recordedBy: "crew-sato",
  deviceId: "dev-1",
});

describe("エンティティレジストリ（基本設計書 8.6）", () => {
  it("船内記録の全種別がレジストリに登録され、判別ユニオンで受理される", () => {
    for (const kind of RECORD_KINDS) {
      expect(SYNC_KINDS).toContain(kind);
      expect(isRecordKind(kind)).toBe(true);
      expect(SYNC_ENTITY_REGISTRY[kind].policy).toMatch(/append_only|plan_actual_split/);
    }
    const log: VoyageLogPayload = { ...base("vl-1"), logType: "departure", port: "横浜" };
    const ev = makeRecordEvent("voyage_log", log, "dev-1");
    expect(knownSyncEventSchema.safeParse(ev).success).toBe(true);
    expect(ev.idempotencyKey).toBe("dev-1:vl-1");
  });

  it("シフト計画は計画・実績分離ポリシー、陸上発（origin=shore）として宣言される", () => {
    expect(SYNC_ENTITY_REGISTRY.shift_plan.policy).toBe("plan_actual_split");
    expect(SYNC_ENTITY_REGISTRY.shift_plan.origin).toBe("shore");
  });

  it("新種別のイベントは Push で受理され、再送は冪等重複になり、未知種別は隔離される", () => {
    const state = createEmptyStoreState("store-test", 1);
    const log: VoyageLogPayload = { ...base("vl-2"), logType: "position", speedKnots: 11.5 };
    const ev = makeRecordEvent("voyage_log", log, "dev-1");
    const unknown = { kind: "fuel_record_v9", eventId: "x-1", deviceId: "dev-1", payload: {} };

    const first = applyPush(state, "dev-1", [ev, unknown], new Date("2026-08-21T07:00:00Z"));
    expect(first.accepted).toEqual(["dev-1:vl-2"]);
    expect(first.quarantined).toEqual(["x-1"]);
    expect(state.quarantine[0].raw).toEqual(unknown); // 原文保持

    const again = applyPush(state, "dev-1", [ev], new Date("2026-08-21T07:01:00Z"));
    expect(again.duplicates).toEqual(["dev-1:vl-2"]);
    expect(state.events.filter((e) => e.event.kind === "voyage_log")).toHaveLength(1);
  });

  it("未知フィールドは破棄されず往復保全される（passthrough）", () => {
    const log = { ...base("vl-3"), logType: "remark", remarks: "x", futureField: { nested: true } };
    const ev = makeRecordEvent("voyage_log", log as VoyageLogPayload, "dev-1");
    const parsed = knownSyncEventSchema.parse(ev);
    expect((parsed.payload as Record<string, unknown>).futureField).toEqual({ nested: true });
  });
});

describe("latestBySupersedes（追記専用レコードからの有効最新の導出）", () => {
  const plan = (id: string, from: string, supersedesId?: string): ShiftPlanPayload => ({
    ...base(id),
    planType: "watch",
    crewMemberId: "crew-sato",
    date: "2026-08-22",
    shiftType: "cargo_watch",
    from,
    to: "18:00",
    publishedAt: "2026-08-20T00:00:00.000Z",
    publishedBy: "shore-yamamoto",
    supersedesId,
  });

  it("supersedesId で置き換えられた計画は除外され、置換後のみが有効になる", () => {
    const original = plan("s-1", "12:00");
    const changed = plan("s-2", "13:00", "s-1");
    const effective = latestBySupersedes([original, changed]);
    expect(effective.map((p) => p.id)).toEqual(["s-2"]);
  });

  it("同一IDの再受信は1件にまとめ、順序に依存しない", () => {
    const original = plan("s-1", "12:00");
    const changed = plan("s-2", "13:00", "s-1");
    const a = latestBySupersedes([changed, original, original]);
    const b = latestBySupersedes([original, changed, changed]);
    expect(a.map((p) => p.id)).toEqual(["s-2"]);
    expect(b.map((p) => p.id)).toEqual(["s-2"]);
  });

  it("訂正の連鎖（A→B→C）では最後の訂正のみが有効になり、原本は入力配列に保持される", () => {
    const a = plan("a", "12:00");
    const b = plan("b", "13:00", "a");
    const c = plan("c", "14:00", "b");
    const input = [a, b, c];
    expect(latestBySupersedes(input).map((p) => p.id)).toEqual(["c"]);
    expect(input).toHaveLength(3); // 非破壊
  });
});
