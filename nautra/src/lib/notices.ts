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

/** 未読（端末が最後に確認した時刻より後に配信されたもの） */
export function unreadNotices(notices: NoticePayload[], ackAt: string | undefined): NoticePayload[] {
  return notices.filter((n) => !ackAt || n.publishedAt > ackAt);
}
