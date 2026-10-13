import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ymdLocal } from "@/domain/labor-law/evaluate";
import { effectiveRecords } from "@/domain/labor-law/intervals";
import type { TimeRecord } from "@/domain/labor-law/types";
import { proposalStatusOf } from "@/lib/labor-proposals";
import {
  approvalEventSchema,
  makeIdempotencyKey,
  resolveApproval,
  SYNC_SCHEMA_VERSION,
} from "@/sync-protocol/events";

/**
 * 修正案つきの差戻し（レビュー LABOR-06）。
 * 要件定義書 3.2.1「承認者も修正不可、修正は本人への差戻しのみ」を守ったまま、陸上が「正しくはこう」を送れること。
 */

type Service = typeof import("@/server/labor-proposal-service");
type Store = typeof import("@/server/store");
type Master = typeof import("@/server/master-service");

let svc: Service;
let store: Store;
let master: Master;
const ACTOR = { id: "shore-taniguchi" };

function pickTarget(): TimeRecord {
  const eff = effectiveRecords(store.getTimeRecords()).filter((r) => r.action === "start");
  const target = eff[eff.length - 1];
  if (!target) throw new Error("デモの打刻がありません");
  return target;
}

const minus = (iso: string, minutes: number) => new Date(new Date(iso).getTime() - minutes * 60_000).toISOString();

beforeAll(async () => {
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "nautra-proposal-")));
  svc = await import("@/server/labor-proposal-service");
  store = await import("@/server/store");
  master = await import("@/server/master-service");
});

describe("修正案つきの差戻し（陸上は打刻を書かない）", () => {
  it("理由が空なら送れない", () => {
    const t = pickTarget();
    expect(() =>
      svc.publishCorrectionProposal(
        {
          crewMemberId: t.crewMemberId,
          date: ymdLocal(new Date(t.occurredAt)),
          changes: [{ targetId: t.id, occurredAt: minus(t.occurredAt, 5), workCategory: t.workCategory }],
          additions: [],
          reason: " ",
          opToken: "tok-empty-reason",
        },
        ACTOR,
      ),
    ).toThrow(/理由/);
  });

  it("送ると差戻し（承認イベント）が積まれ、打刻は1件も増えない。その日の承認は差戻しに戻る", () => {
    const t = pickTarget();
    const date = ymdLocal(new Date(t.occurredAt));
    const recordsBefore = store.getTimeRecords().length;
    const n = svc.publishCorrectionProposal(
      {
        crewMemberId: t.crewMemberId,
        date,
        changes: [{ targetId: t.id, occurredAt: minus(t.occurredAt, 5), workCategory: t.workCategory }],
        additions: [],
        reason: "当直表と照合すると開始は5分前です",
        opToken: "tok-change-1",
      },
      ACTOR,
    );
    expect(n).toBe(1);
    expect(store.getTimeRecords()).toHaveLength(recordsBefore); // 陸上は打刻を書かない
    const mine = store.getApprovalEvents().filter((a) => a.payload.crewMemberId === t.crewMemberId && a.payload.date === date);
    const sent = mine.find((a) => a.payload.id === "appr-prop-tok-change-1-1")!;
    expect(sent.payload).toMatchObject({
      decision: "remanded",
      targetRecordId: t.id,
      approverRole: "labor_manager",
      approvedBy: ACTOR.id,
      proposal: { kind: "change", action: t.action, workCategory: t.workCategory },
    });
    expect(resolveApproval(mine)?.decision).toBe("remanded");
    expect(master.listAuditLogs(50).some((l) => l.summary?.includes("修正案つきの差戻し"))).toBe(true);
    // 本人がまだ直していないので「確認待ち」
    expect(svc.buildProposalDay(t.crewMemberId, date).proposals[0]?.status).toBe("pending");
  });

  it("同じ送信を二度送っても案は1件のまま（送信の札から ID を決めるので冪等）", () => {
    const t = pickTarget();
    const date = ymdLocal(new Date(t.occurredAt));
    const input = {
      crewMemberId: t.crewMemberId,
      date,
      changes: [{ targetId: t.id, occurredAt: minus(t.occurredAt, 5), workCategory: t.workCategory }],
      additions: [],
      reason: "再送の確認",
      opToken: "tok-resend-1",
    };
    svc.publishCorrectionProposal(input, ACTOR);
    const count = store.getApprovalEvents().length;
    svc.publishCorrectionProposal(input, ACTOR);
    expect(store.getApprovalEvents()).toHaveLength(count);
  });

  it.each<[string, { workCategory?: "rest"; shiftDays?: number; future?: boolean }, RegExp]>([
    ["休息への付け替えは案にできない（労働時間を消すことになる）", { workCategory: "rest" }, /作業の種類/],
    ["前後1日より離れた時刻にはできない（別の日へ移して違反を隠させない）", { shiftDays: -3 }, /前後1日/],
    ["未来の時刻にはできない", { future: true }, /未来/],
  ])("%s", (_name, opt, error) => {
    const t = pickTarget();
    const at = opt.future
      ? new Date(Date.now() + 86_400_000).toISOString()
      : opt.shiftDays
        ? minus(t.occurredAt, -opt.shiftDays * 1440)
        : t.occurredAt;
    expect(() =>
      svc.publishCorrectionProposal(
        {
          crewMemberId: t.crewMemberId,
          date: ymdLocal(new Date(t.occurredAt)),
          changes: [{ targetId: t.id, occurredAt: at, workCategory: (opt.workCategory ?? t.workCategory) as never }],
          additions: [],
          reason: "検証",
          opToken: `tok-invalid-${Math.random().toString(36).slice(2, 10)}`,
        },
        ACTOR,
      ),
    ).toThrow(error);
  });

  it("本人が案のとおりに再入力すると「反映済み」になり、判定はその打刻で取り直される", () => {
    const t = pickTarget();
    const date = ymdLocal(new Date(t.occurredAt));
    const sent = store
      .getApprovalEvents()
      .map((a) => a.payload)
      .find((a) => a.id === "appr-prop-tok-change-1-1")!;
    // 船内の端末が本人名義で入れた再入力（同期で届いたもの）を模す
    const resubmit: TimeRecord = {
      ...t,
      id: "tr-crew-resubmit-1",
      occurredAt: sent.proposal!.occurredAt,
      entryType: "resubmit",
      supersedesId: t.id,
      recordedBy: t.crewMemberId,
      deviceId: "vessel-device-e2e",
      proposalId: sent.id,
    };
    const outcome = store.pushToStore("vessel-device-e2e", [
      {
        kind: "time_record",
        schemaVersion: SYNC_SCHEMA_VERSION,
        eventId: resubmit.id,
        deviceId: "vessel-device-e2e",
        idempotencyKey: makeIdempotencyKey("vessel-device-e2e", resubmit.id),
        occurredAt: new Date().toISOString(),
        payload: resubmit,
      },
    ]);
    expect(outcome.accepted).toHaveLength(1);
    expect(proposalStatusOf(sent, store.getTimeRecords())).toBe("applied");
    const day = svc.buildProposalDay(t.crewMemberId, date);
    expect(day.records.some((r) => r.id === resubmit.id)).toBe(true);
    expect(day.records.some((r) => r.id === t.id)).toBe(false);
    expect(svc.pendingProposalDates(t.crewMemberId).has(date)).toBe(
      day.proposals.some((p) => p.status === "pending"),
    );
  });

  it("修正案つきの差戻しは同期スキーマに合い、未知の項目も往復で失われない（旧版端末の互換）", () => {
    const sent = store
      .getApprovalEvents()
      .find((a) => a.payload.id === "appr-prop-tok-change-1-1")!;
    const parsed = approvalEventSchema.parse({
      kind: "approval",
      schemaVersion: SYNC_SCHEMA_VERSION,
      eventId: sent.payload.id,
      deviceId: "shore-planner-device",
      idempotencyKey: makeIdempotencyKey("shore-planner-device", sent.payload.id),
      occurredAt: sent.payload.decidedAt,
      payload: { ...sent.payload, futureField: "keep" },
    });
    expect(parsed.payload.proposal?.kind).toBe("change");
    expect((parsed.payload as Record<string, unknown>).futureField).toBe("keep");
  });
});
