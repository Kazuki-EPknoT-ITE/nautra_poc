import { describe, expect, it } from "vitest";
import { applyPush, createEmptyStoreState } from "@/server/apply-push";
import {
  checkOriginPolicy,
  checkVesselAuthorPolicy,
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
  recordedBy: "crew-nakahara",
  deviceId: "dev-1",
});

describe("エンティティレジストリ（基本設計書 8.6）", () => {
  it("船内記録の全種別がレジストリに登録され、判別ユニオンで受理される", () => {
    // 8.3 の競合ポリシーは4種。どの種別も必ずいずれかを宣言していること
    // （船内の一次記録は append_only、マスタは shore_priority、計画は plan_actual_split）
    const policies = ["append_only", "shore_priority", "role_priority", "plan_actual_split"];
    for (const kind of RECORD_KINDS) {
      expect(SYNC_KINDS).toContain(kind);
      expect(isRecordKind(kind)).toBe(true);
      expect(policies, `${kind} のポリシー宣言が不正`).toContain(SYNC_ENTITY_REGISTRY[kind].policy);
    }
    // 船内で作られる一次記録は追記のみ（事後改変不可。要件定義書 3.2.1 / 12.5）
    for (const kind of ["voyage_log", "checklist_result", "drill_record", "work_report"] as const) {
      expect(SYNC_ENTITY_REGISTRY[kind].policy).toBe("append_only");
      expect(SYNC_ENTITY_REGISTRY[kind].origin).toBe("vessel");
    }
    // マスタは陸上優先（12.5「船員・船舶マスターは陸上を優先」）
    for (const kind of ["crew_master", "credential", "vessel_master"] as const) {
      expect(SYNC_ENTITY_REGISTRY[kind].policy).toBe("shore_priority");
      expect(SYNC_ENTITY_REGISTRY[kind].origin).toBe("shore");
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

  it("船内へのお知らせ・速報は陸上正本（origin=shore）: 船内端末からの配信は受理しない", () => {
    expect(SYNC_ENTITY_REGISTRY.notice.origin).toBe("shore");
    expect(checkOriginPolicy("notice", "shore-planner-device")).toBeNull();
    expect(checkOriginPolicy("notice", "dev-01abc")).toMatch(/shore-authoritative/);
  });

  it("シフト計画は計画・実績分離ポリシーで、陸上と船長（船内）が書ける（レビュー SHIFT-04）", () => {
    expect(SYNC_ENTITY_REGISTRY.shift_plan.policy).toBe("plan_actual_split");
    expect(SYNC_ENTITY_REGISTRY.shift_plan.origin).toBe("both");
    expect(SYNC_ENTITY_REGISTRY.shift_plan.vesselAuthorRole).toBe("captain");
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

  it("航海日誌の作った種類（custom）は種類のキーと名前つきで受理し、キーの無いものは隔離する。再送は冪等", () => {
    const state = createEmptyStoreState("store-test", 1);
    const ok = { ...base("vl-c1"), logType: "custom", customTypeKey: "custom:01JA", customTypeName: "投錨" } as VoyageLogPayload;
    const broken = { ...base("vl-c2"), logType: "custom" } as VoyageLogPayload;
    const evOk = makeRecordEvent("voyage_log", ok, "dev-1");
    const evBroken = makeRecordEvent("voyage_log", broken, "dev-1");
    const r = applyPush(state, "dev-1", [evOk, evBroken], new Date("2026-10-14T07:00:00Z"));
    expect(r.accepted).toEqual(["dev-1:vl-c1"]);
    expect(r.quarantined).toEqual([evBroken.eventId]);
    expect(state.quarantine[0].raw).toEqual(evBroken); // 原文保持
    const again = applyPush(state, "dev-1", [evOk], new Date("2026-10-14T07:01:00Z"));
    expect(again.duplicates).toEqual(["dev-1:vl-c1"]);
  });

  it("記録項目テンプレート: 選択肢・時刻・必須・しまうを受理し、選択肢1つは隔離。船内からは船長の配信だけ受理する", () => {
    const tplBase = {
      ...base("tpl-v1"),
      recordedBy: "c-cap",
      usage: "voyage_log",
      templateKey: "custom:01JA",
      name: "投錨",
      version: "1",
      publishedAt: "2026-10-14T00:00:00.000Z",
      publishedBy: "c-cap",
      items: [
        { key: "item_a_1", label: "天気", group: "投錨", inputType: "choice", options: ["晴", "雨"], required: true },
        { key: "item_a_2", label: "投錨時刻", group: "投錨", inputType: "time" },
      ],
      retired: true,
    };
    const good = makeRecordEvent("record_template", tplBase as never, "shore-planner-device");
    expect(knownSyncEventSchema.safeParse(good).success).toBe(true);
    const oneOption = { ...tplBase, id: "tpl-v2", items: [{ key: "k", label: "風", group: "x", inputType: "choice", options: ["北"] }] };
    expect(knownSyncEventSchema.safeParse(makeRecordEvent("record_template", oneOption as never, "shore-planner-device")).success).toBe(false);
    expect(SYNC_ENTITY_REGISTRY.record_template.vesselAuthorRole).toBe("captain");
    expect(checkVesselAuthorPolicy("record_template", "dev-01abc", { recordedBy: "c-cap" }, () => "captain")).toBeNull();
    expect(checkVesselAuthorPolicy("record_template", "dev-01abc", { recordedBy: "c-x" }, () => "deck_officer")).toMatch(/author policy/);
    expect(checkVesselAuthorPolicy("record_template", "shore-planner-device", { recordedBy: "shore-x" }, () => undefined)).toBeNull();
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
    crewMemberId: "crew-nakahara",
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
    crewMemberId: "crew-nakahara",
    date: "2026-08-22",
    shiftType: "cargo_watch",
    from: "12:00",
    to: "18:00",
    publishedAt: "2026-08-20T00:00:00.000Z",
    publishedBy: "shore-yamamoto",
  };

  it("陸上正本の種別（船員マスタ等）は船内端末からの Push を隔離する（破棄しない）", () => {
    expect(checkOriginPolicy("crew_master", "shore-planner-device")).toBeNull();
    expect(checkOriginPolicy("crew_master", "dev-01abc")).toMatch(/shore-authoritative/);
  });

  it("シフト計画は陸上端末からは受理、船内端末からは船長の記録だけ受理し、ほかは隔離する（破棄しない）", () => {
    expect(checkOriginPolicy("shift_plan", "shore-planner-device")).toBeNull();
    expect(checkOriginPolicy("shift_plan", "seed-shore-device")).toBeNull();
    expect(checkOriginPolicy("shift_plan", "dev-01abc")).toBeNull(); // 発生元では止めず、記録者で判断する
    expect(checkVesselAuthorPolicy("shift_plan", "dev-01abc", { recordedBy: "c-cap" }, () => "captain")).toBeNull();
    expect(checkVesselAuthorPolicy("shift_plan", "dev-01abc", { recordedBy: "c-x" }, () => "deck_rating")).toMatch(/author policy/);
    expect(checkOriginPolicy("voyage_log", "dev-01abc")).toBeNull(); // 船内発の一次記録は受理

    const state = createEmptyStoreState("store-test", 1);
    const fromVessel = makeRecordEvent("shift_plan", { ...plan, id: "s-vessel" }, "dev-01abc");
    const fromShore = makeRecordEvent("shift_plan", plan, "shore-planner-device");
    const r = applyPush(state, "dev-01abc", [fromVessel, fromShore], new Date("2026-08-21T00:00:00Z"));
    expect(r.quarantined).toEqual(["s-vessel"]);
    expect(r.accepted).toEqual(["shore-planner-device:s-shore"]);
    // 船員マスタが無い（記録者のロールが分からない）ので、船内からの計画は隔離される
    expect(state.quarantine[0].reason).toMatch(/author policy/);
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
