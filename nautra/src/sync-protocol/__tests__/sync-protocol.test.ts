import { describe, expect, it } from "vitest";
import {
  approvalEventSchema,
  knownSyncEventSchema,
  makeIdempotencyKey,
  resolveApproval,
  timeRecordEventSchema,
} from "../events";
import { applyPush, createEmptyStoreState } from "@/server/apply-push";

function trEvent(eventId: string, deviceId = "dev-1", extra: Record<string, unknown> = {}) {
  return {
    kind: "time_record",
    schemaVersion: 1,
    eventId,
    deviceId,
    idempotencyKey: makeIdempotencyKey(deviceId, eventId),
    occurredAt: "2026-08-10T00:00:00.000Z",
    payload: {
      id: eventId,
      tenantId: "tenant-demo",
      vesselId: "vessel-001",
      crewMemberId: "c1",
      workCategory: "cargo",
      action: "start",
      occurredAt: "2026-08-10T00:00:00.000Z",
      entryType: "realtime",
      recordedBy: "c1",
      deviceId,
    },
    ...extra,
  };
}

describe("同期の冪等性（基本設計書 8.2）", () => {
  it("同一バッチの再送は二重適用されない（冪等キーで重複排除）", () => {
    const state = createEmptyStoreState();
    const batch = [trEvent("e1"), trEvent("e2")];
    const r1 = applyPush(state, "dev-1", batch, new Date("2026-08-10T01:00:00Z"));
    expect(r1.accepted.length).toBe(2);
    const r2 = applyPush(state, "dev-1", batch, new Date("2026-08-10T01:05:00Z"));
    expect(r2.accepted.length).toBe(0);
    expect(r2.duplicates.length).toBe(2);
    expect(state.events.length).toBe(2);
  });

  it("部分再送（チェックポイント再開）でも欠落・重複なく収束する", () => {
    const state = createEmptyStoreState();
    applyPush(state, "dev-1", [trEvent("e1")], new Date());
    // 通信断後、e1 を含むバッチ全体を再送
    const r = applyPush(state, "dev-1", [trEvent("e1"), trEvent("e2"), trEvent("e3")], new Date());
    expect(r.accepted.sort()).toEqual(["dev-1:e2", "dev-1:e3"]);
    expect(state.events.length).toBe(3);
  });

  it("異なる端末の同一イベントIDは別イベントとして受理する（冪等キー= deviceId + eventId）", () => {
    const state = createEmptyStoreState();
    applyPush(state, "dev-1", [trEvent("e1", "dev-1")], new Date());
    const r = applyPush(state, "dev-2", [trEvent("e1", "dev-2")], new Date());
    expect(r.accepted.length).toBe(1);
    expect(state.events.length).toBe(2);
  });
});

describe("未知イベント・互換性（基本設計書 8.6: データ非破壊）", () => {
  it("未知のイベント種別はエラーにせず隔離（quarantine）し、破棄しない", () => {
    const state = createEmptyStoreState();
    const unknownEvent = {
      kind: "fuel_record", // 未登録の種別
      schemaVersion: 1,
      eventId: "f1",
      deviceId: "dev-1",
      idempotencyKey: "dev-1:f1",
      occurredAt: "2026-08-10T00:00:00.000Z",
      payload: { litres: 1200 },
    };
    const r = applyPush(state, "dev-1", [trEvent("e1"), unknownEvent], new Date());
    expect(r.accepted).toEqual(["dev-1:e1"]);
    expect(r.quarantined).toEqual(["f1"]);
    expect(state.quarantine.length).toBe(1);
    expect((state.quarantine[0].raw as { kind: string }).kind).toBe("fuel_record");
  });

  it("未知フィールドはバリデーションで破棄されず原文保持される（passthrough）", () => {
    const ev = trEvent("e1", "dev-1", { futureField: "keep-me" });
    const parsed = timeRecordEventSchema.parse(ev);
    expect((parsed as Record<string, unknown>).futureField).toBe("keep-me");
  });

  it("既知種別は discriminatedUnion で判別できる", () => {
    const parsed = knownSyncEventSchema.parse(trEvent("e1"));
    expect(parsed.kind).toBe("time_record");
  });
});

describe("承認の競合解決（8.3: 役割優先・後勝ち・履歴保全）", () => {
  const approval = (
    role: "captain" | "labor_manager",
    decision: "approved" | "remanded",
    decidedAt: string,
    serverSeq: number,
  ) => ({
    serverSeq,
    payload: {
      id: `a-${serverSeq}`,
      tenantId: "tenant-demo",
      vesselId: "vessel-001",
      crewMemberId: "c1",
      date: "2026-08-10",
      decision,
      approvedBy: role === "captain" ? "crew-kato" : "shore-manager",
      approverRole: role,
      decidedAt,
    },
  });

  it("労務管理責任者の判断は船長より優先される", () => {
    const resolved = resolveApproval([
      approval("labor_manager", "remanded", "2026-08-11T00:00:00Z", 1),
      approval("captain", "approved", "2026-08-11T09:00:00Z", 2),
    ]);
    expect(resolved?.approverRole).toBe("labor_manager");
    expect(resolved?.decision).toBe("remanded");
  });

  it("同一役割の承認は後勝ち（履歴は保全され、導出のみ）", () => {
    const events = [
      approval("captain", "approved", "2026-08-11T00:00:00Z", 1),
      approval("captain", "remanded", "2026-08-11T01:00:00Z", 2),
    ];
    const resolved = resolveApproval(events);
    expect(resolved?.decision).toBe("remanded");
    expect(events.length).toBe(2); // 履歴はどちらも残る
  });

  it("承認イベントのスキーマ検証", () => {
    const parsed = approvalEventSchema.parse({
      kind: "approval",
      schemaVersion: 1,
      eventId: "a1",
      deviceId: "dev-1",
      idempotencyKey: "dev-1:a1",
      occurredAt: "2026-08-10T10:00:00.000Z",
      payload: approval("captain", "approved", "2026-08-10T10:00:00Z", 1).payload,
    });
    expect(parsed.payload.decision).toBe("approved");
  });
});
