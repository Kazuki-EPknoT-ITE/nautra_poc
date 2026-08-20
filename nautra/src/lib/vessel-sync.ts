import type { TimeRecord } from "@/domain/labor-law/types";
import {
  SYNC_SCHEMA_VERSION,
  syncPushResponseSchema,
  type ApprovalPayload,
  type SyncEvent,
} from "@/sync-protocol/events";
import { getMeta, setMeta, vesselDb } from "./vessel-db";

/**
 * 船内→陸上 Push / 陸上→船内 Pull の同期クライアント（基本設計書 8.1）。
 * - ローカルファースト: 記録は常に IndexedDB へ先に書かれ、outbox から送信される
 * - 冪等: 冪等キー付きイベントを送信。重複 ACK も消し込み対象
 * - 再開可能: バッチごとに ACK を確認して消し込む（チェックポイント）。
 *   途中失敗時は残りが outbox に保持され、次回同期で再開される
 * - 擬似オフライン: 通信断デモ用のトグル（meta.offlineSim）
 */

const BATCH_SIZE = 500;

export interface SyncResult {
  ok: boolean;
  pushed: number;
  pulled: number;
  skippedOffline?: boolean;
  error?: string;
}

export async function isOfflineSim(): Promise<boolean> {
  return (await getMeta("offlineSim")) === "1";
}

export async function setOfflineSim(v: boolean): Promise<void> {
  await setMeta("offlineSim", v ? "1" : "0");
}

async function pushOutbox(): Promise<number> {
  let pushed = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await vesselDb.outbox.orderBy("queuedAt").limit(BATCH_SIZE).toArray();
    if (batch.length === 0) break;
    const deviceId = batch[0].event.deviceId;
    const res = await fetch("/api/v1/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId,
        schemaVersion: SYNC_SCHEMA_VERSION,
        events: batch.map((b) => b.event),
      }),
    });
    if (!res.ok) throw new Error(`push failed: HTTP ${res.status}`);
    const outcome = syncPushResponseSchema.parse(await res.json());
    // ACK 済み（受理＋冪等重複）のみ消し込み = チェックポイント。それ以外は残す
    const acked = new Set([...outcome.accepted, ...outcome.duplicates]);
    const toDelete = batch
      .filter((b) => acked.has(b.event.idempotencyKey) || outcome.quarantined.includes(b.eventId))
      .map((b) => b.eventId);
    await vesselDb.outbox.bulkDelete(toDelete);
    pushed += toDelete.length;
    if (toDelete.length === 0) break; // 前進しない場合は打ち切り（無限ループ防止）
  }
  return pushed;
}

async function applyPulledEvent(event: SyncEvent): Promise<void> {
  if (event.kind === "time_record") {
    // 同一IDの再受信は同内容の再適用（冪等）。一次記録の内容書換えは発生しない
    await vesselDb.timeRecords.put(event.payload as TimeRecord);
  } else if (event.kind === "approval") {
    await vesselDb.approvals.put(event.payload as ApprovalPayload);
  }
}

async function pullSince(): Promise<number> {
  let pulled = 0;
  let cursor = Number((await getMeta("pullCursor")) ?? "0");
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`/api/v1/sync/pull?since=${cursor}`);
    if (!res.ok) throw new Error(`pull failed: HTTP ${res.status}`);
    const data = (await res.json()) as {
      events: { event: SyncEvent; serverSeq: number }[];
      nextCursor: number;
      hasMore: boolean;
    };
    for (const stored of data.events) {
      await applyPulledEvent(stored.event);
      pulled += 1;
    }
    cursor = data.nextCursor;
    await setMeta("pullCursor", String(cursor)); // バージョンカーソル保存（再開可能）
    if (!data.hasMore) break;
  }
  return pulled;
}

export async function syncNow(): Promise<SyncResult> {
  if (await isOfflineSim()) {
    return { ok: false, pushed: 0, pulled: 0, skippedOffline: true };
  }
  try {
    const pushed = await pushOutbox();
    const pulled = await pullSince();
    await setMeta("lastSyncAt", new Date().toISOString());
    await setMeta("lastSyncError", "");
    return { ok: true, pushed, pulled };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await setMeta("lastSyncError", message);
    return { ok: false, pushed: 0, pulled: 0, error: message };
  }
}

/** 初回起動時: サーバからマスタ・履歴を受信する（Pull によるマスタ配信の PoC 表現） */
export async function ensureInitialSync(): Promise<void> {
  const cursor = await getMeta("pullCursor");
  if (cursor === undefined) {
    await syncNow();
  }
}
