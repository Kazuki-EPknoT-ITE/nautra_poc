import type { TimeRecord } from "@/domain/labor-law/types";
import {
  isRecordKind,
  SYNC_SCHEMA_VERSION,
  syncPushResponseSchema,
  type ApprovalPayload,
  type SyncEvent,
} from "@/sync-protocol/events";
import type { AnyRecordPayload } from "@/sync-protocol/records";
import { getMeta, setMeta, vesselDb, type VesselRecordRow } from "./vessel-db";

/**
 * 船内→陸上 Push / 陸上→船内 Pull の同期クライアント（基本設計書 8.1）。
 * - ローカルファースト: 記録は常に IndexedDB へ先に書かれ、outbox から送信される
 * - 冪等: 冪等キー付きイベントを送信。重複 ACK も消し込み対象
 * - 再開可能: バッチごとに ACK を確認して消し込む（チェックポイント）。
 *   途中失敗時は残りが outbox に保持され、次回同期で再開される
 * - 擬似オフライン: 通信断デモ用のトグル（meta.offlineSim）
 * - 種別非依存: Pull 受信はエンティティレジストリの種別をそのまま汎用テーブルへ適用する
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
    if (outcome.quarantined.length > 0) {
      const prev = Number((await getMeta("quarantinedByServer")) ?? "0");
      await setMeta("quarantinedByServer", String(prev + outcome.quarantined.length));
    }
    await vesselDb.outbox.bulkDelete(toDelete);
    pushed += toDelete.length;
    if (toDelete.length === 0) break; // 前進しない場合は打ち切り（無限ループ防止）
  }
  return pushed;
}

/**
 * 受信イベントのローカル適用。一次記録は追記のみ: 同一IDが既にあれば書き換えず読み飛ばす
 * （再受信は冪等。自端末発の記録が Pull で戻ってきても内容は同一）。
 */
async function applyPulledEvent(event: SyncEvent): Promise<void> {
  if (event.kind === "time_record") {
    const payload = event.payload as TimeRecord;
    if (!(await vesselDb.timeRecords.get(payload.id))) await vesselDb.timeRecords.add(payload);
  } else if (event.kind === "approval") {
    const payload = event.payload as ApprovalPayload;
    if (!(await vesselDb.approvals.get(payload.id))) await vesselDb.approvals.add(payload);
  } else if (isRecordKind(event.kind)) {
    const payload = event.payload as AnyRecordPayload;
    if (!(await vesselDb.records.get(payload.id))) {
      await vesselDb.records.add({ ...payload, kind: event.kind } as VesselRecordRow);
    }
  }
  // レジストリ外の種別はクライアントでも適用しない（サーバ側で隔離済みのため通常は到達しない）
}

/**
 * 陸上ストアが作り直された（storeId が変わった）場合、ローカルの受信レプリカを破棄して
 * カーソル 0 から取り直す。未送信の outbox は保持する（端末側の記録は失わない。8.6）。
 * PoC のデモデータ再生成に対応するための措置で、本番ではストアの再作成は想定しない。
 */
async function resetReplicaIfStoreChanged(
  storeId: string | undefined,
  cursor: number,
): Promise<boolean> {
  if (!storeId) return false;
  const known = await getMeta("serverStoreId");
  if (known === storeId) return false;
  // 既知IDと不一致、または出所不明のレプリカ（旧版端末: ID未保存だがカーソルが進んでいる）
  const mustReset = known !== undefined || cursor > 0;
  if (mustReset) {
    await vesselDb.transaction(
      "rw",
      vesselDb.timeRecords,
      vesselDb.approvals,
      vesselDb.records,
      async () => {
        await vesselDb.timeRecords.clear();
        await vesselDb.approvals.clear();
        await vesselDb.records.clear();
      },
    );
  }
  await setMeta("serverStoreId", storeId);
  await setMeta("pullCursor", "0");
  return mustReset;
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
      serverVersion?: number;
      quarantineCount?: number;
      storeId?: string;
    };
    if (await resetReplicaIfStoreChanged(data.storeId, cursor)) {
      cursor = 0;
      continue; // ストア変更: 先頭から取り直す
    }
    if (typeof data.serverVersion === "number" && data.serverVersion < cursor) {
      // サーバ側のバージョンがカーソルより小さい = ストアが巻き戻っている。先頭から再取得
      cursor = 0;
      await setMeta("pullCursor", "0");
      continue;
    }
    for (const stored of data.events) {
      await applyPulledEvent(stored.event);
      pulled += 1;
    }
    cursor = data.nextCursor;
    await setMeta("pullCursor", String(cursor)); // バージョンカーソル保存（再開可能）
    if (typeof data.quarantineCount === "number") {
      await setMeta("serverQuarantineCount", String(data.quarantineCount));
    }
    if (!data.hasMore) break;
  }
  return pulled;
}

let syncInFlight: Promise<SyncResult> | null = null;

/** 同期を実行する。多重起動は合流させる（同時 Push による二重送信を防ぐ。冪等キーで二重適用はされない） */
export function syncNow(): Promise<SyncResult> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = runSync().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function runSync(): Promise<SyncResult> {
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

/**
 * アプリ起動時の同期: 初回はマスタ・履歴の受信、2回目以降も差分 Pull と未送信の Push を行う
 * （起動時・定期・手動の3契機。基本設計書 8.1）。擬似オフライン中はスキップされる。
 */
export async function ensureInitialSync(): Promise<void> {
  await syncNow();
}
