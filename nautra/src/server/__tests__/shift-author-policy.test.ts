import { describe, expect, it } from "vitest";
import { makeSeedEvents } from "@/lib/seed";
import { applyPush, createEmptyStoreState } from "@/server/apply-push";
import { checkVesselAuthorPolicy, makeIdempotencyKey, makeRecordEvent, SYNC_SCHEMA_VERSION } from "@/sync-protocol/events";
import { findSupersedeConflicts, latestBySupersedes, type ShiftPlanPayload } from "@/sync-protocol/records";

/**
 * 船長だけが船内で当直を作れる（レビュー SHIFT-04）。
 * 陸上正本の例外なので、サーバが「記録者が船長か」を確かめ、違えば隔離する（破棄しない。ガードレール⑧）。
 * 陸上と船長が同じ当直を別々に変えた場合は、双方を残して競合として示す（自動では解決しない）。
 */

const TODAY = "2026-09-01";
const VESSEL_DEVICE = "vessel-device-001";

function plan(id: string, recordedBy: string, extra: Partial<ShiftPlanPayload> = {}): ShiftPlanPayload {
  return {
    id,
    tenantId: "tenant-demo",
    vesselId: "vessel-001",
    occurredAt: `${TODAY}T08:00:00.000Z`,
    recordedBy,
    deviceId: VESSEL_DEVICE,
    planType: "watch",
    crewMemberId: "crew-nakahara",
    date: TODAY,
    shiftType: "navigation_watch",
    from: "08:00",
    to: "12:00",
    publishedAt: `${TODAY}T07:00:00.000Z`,
    publishedBy: recordedBy,
    ...extra,
  };
}

function seeded() {
  const state = createEmptyStoreState("store-test", 1);
  applyPush(state, "seed-shore-device", makeSeedEvents(TODAY), new Date());
  return state;
}

describe("シフトの記録者ポリシー（船内からは船長だけ）", () => {
  it("船長が船内で作った当直は受理される", () => {
    const state = seeded();
    const r = applyPush(state, VESSEL_DEVICE, [makeRecordEvent("shift_plan", plan("sp-cap-1", "crew-takamatsu"), VESSEL_DEVICE)], new Date());
    expect(r.accepted).toHaveLength(1);
    expect(r.quarantined).toHaveLength(0);
  });

  it("船長以外が船内から送った当直は隔離される（破棄しない）", () => {
    const state = seeded();
    const before = state.quarantine.length;
    const r = applyPush(state, VESSEL_DEVICE, [makeRecordEvent("shift_plan", plan("sp-off-1", "crew-nakahara"), VESSEL_DEVICE)], new Date());
    expect(r.accepted).toHaveLength(0);
    expect(r.quarantined).toEqual(["sp-off-1"]);
    expect(state.quarantine.length).toBe(before + 1);
    expect(state.quarantine.at(-1)?.reason).toMatch(/must be recorded by captain/);
  });

  it("陸上端末からの当直は記録者のロールを問わない（陸上の権限は陸上の画面が確かめる）", () => {
    expect(checkVesselAuthorPolicy("shift_plan", "shore-planner-device", { recordedBy: "shore-fujii" }, () => undefined)).toBeNull();
    // 他の種別には関係しない
    expect(checkVesselAuthorPolicy("time_record", VESSEL_DEVICE, { recordedBy: "crew-nakahara" }, () => "deck_officer")).toBeNull();
  });

  it("同じ送信を二度送っても1件（冪等）", () => {
    const state = seeded();
    const e = makeRecordEvent("shift_plan", plan("sp-cap-2", "crew-takamatsu"), VESSEL_DEVICE);
    applyPush(state, VESSEL_DEVICE, [e], new Date());
    const r = applyPush(state, VESSEL_DEVICE, [e], new Date());
    expect(r.duplicates).toEqual([makeIdempotencyKey(VESSEL_DEVICE, "sp-cap-2")]);
  });

  it("隔離した当直を再送しても、隔離の行は増えない", () => {
    const state = seeded();
    const e = makeRecordEvent("shift_plan", plan("sp-off-2", "crew-nakahara"), VESSEL_DEVICE);
    applyPush(state, VESSEL_DEVICE, [e], new Date());
    const n = state.quarantine.length;
    const r = applyPush(state, VESSEL_DEVICE, [e], new Date());
    expect(r.quarantined).toEqual(["sp-off-2"]);
    expect(state.quarantine.length).toBe(n);
  });

  it("届く順番で結果が変わらない: 船員マスタより先に届いた船長の当直は、マスタが届いた時点で受理に戻る", () => {
    const seedEvents = makeSeedEvents(TODAY);
    const masters = seedEvents.filter((e) => e.kind === "crew_master");
    const others = seedEvents.filter((e) => e.kind !== "crew_master");
    const state = createEmptyStoreState("store-order", 1);
    applyPush(state, "seed-shore-device", others, new Date());
    const early = applyPush(state, VESSEL_DEVICE, [makeRecordEvent("shift_plan", plan("sp-early", "crew-takamatsu"), VESSEL_DEVICE)], new Date());
    expect(early.quarantined).toEqual(["sp-early"]); // まだ記録者のロールが分からない
    const later = applyPush(state, "seed-shore-device", masters, new Date());
    expect(later.released).toBe(1);
    expect(state.events.some((e) => e.event.eventId === "sp-early")).toBe(true);
    expect(state.quarantine.some((q) => (q.raw as { eventId?: string }).eventId === "sp-early")).toBe(false);
  });

  it("記録した時点のロールで判断する: 船長のときにオフラインで作り、降格のあとに届いた当直も受理する。降格後に作った記録は隔離", () => {
    const state = seeded();
    const captainMaster = state.events.filter((e) => e.event.kind === "crew_master").map((e) => e.event.payload as Record<string, unknown>).find((p) => p.crewMemberId === "crew-takamatsu")!;
    const demote = (id: string, recordedAt: string, extra: Record<string, unknown>) =>
      makeRecordEvent("crew_master", { ...captainMaster, id, recordedAt, occurredAt: recordedAt, supersedesId: captainMaster.id, ...extra } as never, "shore-planner-device");
    applyPush(state, "shore-planner-device", [demote("cm-demoted", "2026-09-10T00:00:00.000Z", { role: "deck_officer" })], new Date());
    const before = applyPush(
      state,
      VESSEL_DEVICE,
      [makeRecordEvent("shift_plan", plan("sp-offline", "crew-takamatsu", { recordedAt: "2026-09-05T00:00:00.000Z" } as never), VESSEL_DEVICE)],
      new Date(),
    );
    expect(before.accepted).toHaveLength(1); // 作った時点（9/5）は船長
    const after = applyPush(
      state,
      VESSEL_DEVICE,
      [makeRecordEvent("shift_plan", plan("sp-after", "crew-takamatsu", { recordedAt: "2026-09-12T00:00:00.000Z" } as never), VESSEL_DEVICE)],
      new Date(),
    );
    expect(after.quarantined).toEqual(["sp-after"]); // 降格後（9/12）の記録は船長ではない
  });

  it("陸上と船長が同じ当直を別々に変えると、双方を残して競合になる", () => {
    const state = seeded();
    applyPush(state, VESSEL_DEVICE, [makeRecordEvent("shift_plan", plan("sp-base", "crew-takamatsu"), VESSEL_DEVICE)], new Date());
    const byCaptain = plan("sp-cap-change", "crew-takamatsu", { supersedesId: "sp-base", from: "09:00", to: "13:00" });
    const byShore = plan("sp-shore-change", "shore-fujii", {
      supersedesId: "sp-base",
      deviceId: "shore-planner-device",
      from: "10:00",
      to: "14:00",
    });
    applyPush(state, VESSEL_DEVICE, [makeRecordEvent("shift_plan", byCaptain, VESSEL_DEVICE)], new Date());
    applyPush(
      state,
      "shore-planner-device",
      [{ ...makeRecordEvent("shift_plan", byShore, "shore-planner-device"), schemaVersion: SYNC_SCHEMA_VERSION }],
      new Date(),
    );
    const plans = state.events.filter((e) => e.event.kind === "shift_plan").map((e) => e.event.payload as ShiftPlanPayload);
    const effective = latestBySupersedes(plans).filter((p) => p.supersedesId === "sp-base");
    expect(effective.map((p) => p.id).sort()).toEqual(["sp-cap-change", "sp-shore-change"]);
    expect(findSupersedeConflicts(plans).length).toBeGreaterThan(0);
  });
});
