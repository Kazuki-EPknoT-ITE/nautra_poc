import { describe, expect, it } from "vitest";
import { effectiveNotices, unreadNotices } from "../notices";
import { noticePayloadSchema, type NoticePayload } from "@/sync-protocol/records";

/**
 * お知らせ・速報の選別のテスト（メニュー右側のお知らせ欄・陸上の配信画面で共用）。
 * 追記のみ = 取り消し・訂正は新しいお知らせで置き換え、原本は保持される。
 */
const notice = (over: Partial<NoticePayload> = {}): NoticePayload =>
  noticePayloadSchema.parse({
    id: "n-1",
    tenantId: "tenant-demo",
    vesselId: "vessel-001",
    occurredAt: "2026-08-29T00:00:00.000Z",
    recordedBy: "shore-yamamoto",
    deviceId: "shore-planner-device",
    level: "info",
    title: "お知らせ",
    publishedAt: "2026-08-29T00:00:00.000Z",
    publishedBy: "shore-yamamoto",
    ...over,
  });

const now = new Date("2026-08-30T00:00:00.000Z");

describe("お知らせの選別", () => {
  it("新しい順に並び、原本は入力配列に残る（非破壊）", () => {
    const older = notice({ id: "a", publishedAt: "2026-08-28T00:00:00.000Z" });
    const newer = notice({ id: "b", publishedAt: "2026-08-29T12:00:00.000Z" });
    const input = [older, newer];
    expect(effectiveNotices(input, now).map((n) => n.id)).toEqual(["b", "a"]);
    expect(input).toHaveLength(2);
  });

  it("訂正・取り消しされたお知らせは表示されない（置き換え後だけが残る）", () => {
    const original = notice({ id: "a", title: "出港 09:00" });
    const corrected = notice({ id: "b", title: "出港 11:00", supersedesId: "a" });
    expect(effectiveNotices([original, corrected], now).map((n) => n.id)).toEqual(["b"]);
  });

  it("期限切れは表示しない（期限なしは表示し続ける）", () => {
    const expired = notice({ id: "a", expiresAt: "2026-08-29T23:00:00.000Z" });
    const alive = notice({ id: "b", expiresAt: "2026-08-31T00:00:00.000Z" });
    const forever = notice({ id: "c" });
    expect(effectiveNotices([expired, alive, forever], now).map((n) => n.id).sort()).toEqual(["b", "c"]);
  });

  it("未読は最後に確認した時刻より後に配信されたもの（未確認なら全件）", () => {
    const list = [
      notice({ id: "new", publishedAt: "2026-08-29T12:00:00.000Z" }),
      notice({ id: "old", publishedAt: "2026-08-28T00:00:00.000Z" }),
    ];
    expect(unreadNotices(list, "2026-08-29T00:00:00.000Z").map((n) => n.id)).toEqual(["new"]);
    expect(unreadNotices(list, undefined)).toHaveLength(2);
    expect(unreadNotices(list, "2026-08-30T00:00:00.000Z")).toHaveLength(0);
  });
});
