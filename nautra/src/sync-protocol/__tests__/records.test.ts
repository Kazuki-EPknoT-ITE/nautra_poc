import { describe, expect, it } from "vitest";
import { applyPush, createEmptyStoreState } from "@/server/apply-push";
import {
  checkOriginPolicy,
  isRecordKind,
  knownSyncEventSchema,
  makeRecordEvent,
  SYNC_ENTITY_REGISTRY,
  SYNC_KINDS,
} from "../events";
import {
  findSupersedeConflicts,
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

  it("レジストリに登録した種別は必ず判別ユニオンにも含まれる（登録漏れで隔離されない）", () => {
    // union に無い種別はサーバで「未知種別」として隔離されてしまうため、登録と同時に検査する
    const inUnion = new Set(
      knownSyncEventSchema.options.map((o) => (o.shape.kind as { value: string }).value),
    );
    for (const kind of SYNC_KINDS) {
      expect(inUnion.has(kind), `${kind} が knownSyncEventSchema に未登録`).toBe(true);
    }
  });

  it("記録項目テンプレートは船内（船長）・陸上のどちらからも配信できる（origin=both）", () => {
    expect(SYNC_ENTITY_REGISTRY.record_template.origin).toBe("both");
    expect(checkOriginPolicy("record_template", "dev-01abc")).toBeNull();
    expect(checkOriginPolicy("record_template", "shore-planner-device")).toBeNull();
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

  it("同一原本を2件が無効化する分岐は、双方を保持したまま『競合（要確認）』として検出される", () => {
    const a = plan("a", "12:00");
    const b = plan("b", "13:00", "a");
    const c = plan("c", "14:00", "a"); // 分岐
    const conflicts = findSupersedeConflicts([a, b, c]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].supersedesId).toBe("a");
    expect(conflicts[0].candidates.map((p) => p.id).sort()).toEqual(["b", "c"]);
    // 双方保持: latestBySupersedes はどちらも落とさない
    expect(latestBySupersedes([a, b, c]).map((p) => p.id).sort()).toEqual(["b", "c"]);
    // 分岐のない連鎖は競合なし
    expect(findSupersedeConflicts([a, b])).toHaveLength(0);
  });
});

describe("競合ポリシー／発生元の適用（基本設計書 8.3: 計画は陸上優先）", () => {
  const plan: ShiftPlanPayload = {
    ...base("s-shore"),
    planType: "watch",
    crewMemberId: "crew-sato",
    date: "2026-08-22",
    shiftType: "cargo_watch",
    from: "12:00",
    to: "18:00",
    publishedAt: "2026-08-20T00:00:00.000Z",
    publishedBy: "shore-yamamoto",
  };

  it("陸上正本の種別（shift_plan）は陸上端末からのみ受理し、船内端末からの Push は隔離する（破棄しない）", () => {
    expect(checkOriginPolicy("shift_plan", "shore-planner-device")).toBeNull();
    expect(checkOriginPolicy("shift_plan", "seed-shore-device")).toBeNull();
    expect(checkOriginPolicy("shift_plan", "dev-01abc")).toMatch(/shore-authoritative/);
    expect(checkOriginPolicy("voyage_log", "dev-01abc")).toBeNull(); // 船内発の一次記録は受理

    const state = createEmptyStoreState("store-test", 1);
    const fromVessel = makeRecordEvent("shift_plan", { ...plan, id: "s-vessel" }, "dev-01abc");
    const fromShore = makeRecordEvent("shift_plan", plan, "shore-planner-device");
    const r = applyPush(state, "dev-01abc", [fromVessel, fromShore], new Date("2026-08-21T00:00:00Z"));
    expect(r.quarantined).toEqual(["s-vessel"]);
    expect(r.accepted).toEqual(["shore-planner-device:s-shore"]);
    expect(state.quarantine[0].reason).toMatch(/origin policy/);
    expect(state.quarantine[0].raw).toEqual(fromVessel); // 原文保持
  });

  it("チェックリスト項目（ネスト）の未知フィールドもサーバ保存時に保持される", () => {
    const state = createEmptyStoreState("store-test", 1);
    const ev = makeRecordEvent(
      "checklist_result",
      {
        ...base("chk-1"),
        templateId: "pre_departure",
        templateVersion: "2026-04.1",
        items: [{ key: "k", label: "l", group: "g", result: "ok", photoId: "p-1" } as never],
        overall: "pass",
      },
      "dev-1",
    );
    applyPush(state, "dev-1", [ev], new Date("2026-08-21T00:00:00Z"));
    const stored = state.events[0].event.payload as { items: Record<string, unknown>[] };
    expect(stored.items[0].photoId).toBe("p-1");
  });
});
