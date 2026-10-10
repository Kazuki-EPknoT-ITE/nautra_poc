import { latestBySupersedes, type NoticePayload } from "@/sync-protocol/records";

/**
 * お知らせ・速報の選別（純関数）。船内画面と陸上サービスの双方が使う。
 * 取り消し・訂正は supersedesId で置き換えられ、期限切れは表示しない。
 * 並びは新しい順（速報を上に固定はしない。区分は表示側でチップと文言で示す）。
 */
export function effectiveNotices(all: NoticePayload[], now = new Date()): NoticePayload[] {
  const iso = now.toISOString();
  return latestBySupersedes(all)
    .filter((n) => !n.expiresAt || n.expiresAt > iso)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/**
 * 未読の選別。
 *
 * お知らせは**1件ずつ開いて読む**（詳細を開いたものが既読。レビュー NEWS-03）。
 * 以前の「確認しました」でまとめて既読にした時刻（`ackAt`）より前の配信も既読として扱う
 * （端末に残っている既読状態を無駄にしない）。
 */
export function unreadNotices(
  notices: NoticePayload[],
  ackAt: string | undefined,
  readIds: ReadonlySet<string> = new Set(),
): NoticePayload[] {
  return notices.filter((n) => !readIds.has(n.id) && (!ackAt || n.publishedAt > ackAt));
}
