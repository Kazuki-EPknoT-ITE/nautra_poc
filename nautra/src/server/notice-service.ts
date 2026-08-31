import { DEMO_TENANT_ID, DEMO_VESSEL, SHORE_PLANNER_ID } from "@/lib/crew";
import { ulid } from "@/lib/ids";
import { effectiveNotices } from "@/lib/notices";
import { makeIdempotencyKey, makeRecordEvent } from "@/sync-protocol/events";
import {
  latestBySupersedes,
  noticePayloadSchema,
  type NoticeLevel,
  type NoticePayload,
} from "@/sync-protocol/records";
import { getRecordsOfKind, pushToStore } from "./store";

/**
 * 陸上から船内へのお知らせ・速報の配信（PoC）。
 * 追記のみ: 取り消し・訂正は supersedesId 付きの新しいお知らせで表す。
 * 船内は受信して機能メニュー右側のお知らせ欄に表示する（船内からは配信できない）。
 */

const SHORE_DEVICE = "shore-planner-device";

/** 有効なお知らせ（取り消し済み・期限切れを除く。新しい順） */
export function getNotices(now = new Date()): NoticePayload[] {
  return effectiveNotices(getRecordsOfKind("notice"), now);
}

/** 配信履歴（訂正・取り消し済みも含む。新しい順） */
export function getNoticeHistory(): NoticePayload[] {
  return [...getRecordsOfKind("notice")].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export interface PublishNoticeInput {
  level: NoticeLevel;
  title: string;
  body?: string;
  /** 取り消し・訂正時に置き換える既存お知らせのID */
  supersedesId?: string;
  noticeId?: string;
}

export function publishNotice(input: PublishNoticeInput, now = new Date()): NoticePayload {
  const title = input.title.trim();
  if (!title) throw new Error("見出しを入力してください");
  if (input.supersedesId) {
    const all = getRecordsOfKind("notice");
    if (!latestBySupersedes(all).some((n) => n.id === input.supersedesId)) {
      throw new Error("このお知らせは既に取り消し・訂正済みです");
    }
  }
  const payload: NoticePayload = noticePayloadSchema.parse({
    id: input.noticeId?.trim() || `notice-${ulid().toLowerCase()}`,
    tenantId: DEMO_TENANT_ID,
    vesselId: DEMO_VESSEL.id,
    occurredAt: now.toISOString(),
    recordedAt: now.toISOString(),
    recordedBy: SHORE_PLANNER_ID,
    deviceId: SHORE_DEVICE,
    supersedesId: input.supersedesId || undefined,
    level: input.level,
    title,
    body: input.body?.trim() || undefined,
    publishedAt: now.toISOString(),
    publishedBy: SHORE_PLANNER_ID,
  });
  const outcome = pushToStore(SHORE_DEVICE, [makeRecordEvent("notice", payload, SHORE_DEVICE)]);
  const key = makeIdempotencyKey(SHORE_DEVICE, payload.id);
  if (!outcome.accepted.includes(key) && !outcome.duplicates.includes(key)) {
    throw new Error("配信できませんでした（イベントが受理されず隔離されました）");
  }
  return payload;
}
