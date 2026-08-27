import type { TimeRecord } from "@/domain/labor-law/types";
import {
  isRecordKind,
  SYNC_KINDS,
  SYNC_SCHEMA_VERSION,
  syncPushResponseSchema,
  type ApprovalPayload,
  type SyncEvent,
} from "@/sync-protocol/events";
import type { AnyRecordPayload } from "@/sync-protocol/records";
import { getMeta, setMeta, vesselDb, type ReplicaArchiveRow, type VesselRecordRow } from "./vessel-db";

/**
 * 船内→陸上 Push / 陸上→船内 Pull の同期クライアント（基本設計書 8.1）。
 * - ローカルファースト: 記録は常に IndexedDB へ先に書かれ、outbox から送信される
 * - 冪等: 冪等キー付きイベントを送信。重複 ACK も消し込み対象
 * - 再開可能: バッチごとに ACK を確認して消し込む（チェックポイント）。
 *   途中失敗時は残りが outbox に保持され、次回同期で再開される
 * - 擬似オフライン: 通信断デモ用のトグル（meta.offlineSim）
 * - 種別非依存: Pull 受信はエンティティレジストリの種別をそのまま汎用テーブルへ適用する。
 *   端末側で未対応の種別は破棄せずローカル隔離し、件数を表示する（8.6）
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
      // 陸上で隔離された（未対応種別・ポリシー違反）件数を端末側でも把握できるようにする
      const prev = Number((await getMeta("quarantinedByServer")) ?? "0");
      await setMeta("quarantinedByServer", String(prev + outcome.quarantined.length));
    }
    await vesselDb.outbox.bulkDelete(toDelete);
    pushed += toDelete.length;
    if (toDelete.length === 0) break; // 前進しない場合は打ち切り（無限ループ防止）
  }
  return pushed;
}

/** 既存IDを1回の読み取りで判定し、新規行だけを一括追記する（追記のみ・再受信は冪等） */
async function bulkAddNew<T extends { id: string }>(
  table: { bulkGet: (ids: string[]) => Promise<(T | undefined)[]>; bulkAdd: (rows: T[]) => Promise<unknown> },
  rows: T[],
): Promise<number> {
  if (rows.length === 0) return 0;
  // 同一バッチ内の重複を先に除く
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  const existing = await table.bulkGet(unique.map((r) => r.id));
  const fresh = unique.filter((_, i) => existing[i] === undefined);
  if (fresh.length > 0) await table.bulkAdd(fresh);
  return fresh.length;
}

/**
 * 受信イベントのローカル適用（バッチ単位で1トランザクション）。
 * 一次記録は追記のみ: 同一IDが既にあれば書き換えず読み飛ばす（再受信は冪等。自端末発の記録が
 * Pull で戻ってきても内容は同一）。レジストリ外の種別は破棄せずローカル隔離する（8.6）。
 *
 * 1件ずつ書くと IndexedDB の往復と画面の再描画がイベント数だけ発生し、初回同期
 * （200件超）で数秒かかる。種別ごとにまとめ、単一トランザクションで書くことで
 * 往復と再描画を1回に抑える。
 */
async function applyPulledEvents(events: { event: SyncEvent }[], receivedAt: string): Promise<void> {
  const timeRecords: TimeRecord[] = [];
  const approvals: ApprovalPayload[] = [];
  const records: VesselRecordRow[] = [];
  const unknown: { kind: string; eventId: string; raw: unknown }[] = [];

  for (const { event } of events) {
    const kind = (event as { kind: string }).kind;
    if (kind === "time_record") {
      timeRecords.push(event.payload as TimeRecord);
    } else if (kind === "approval") {
      approvals.push(event.payload as ApprovalPayload);
    } else if (isRecordKind(kind)) {
      records.push({ ...(event.payload as AnyRecordPayload), kind } as VesselRecordRow);
    } else if (!(SYNC_KINDS as string[]).includes(kind)) {
      unknown.push({
        kind,
        eventId: String((event as { eventId?: unknown }).eventId ?? "(unknown)"),
        raw: event,
      });
    }
  }

  // 適用するものが無ければ書き込みトランザクションを開かない
  // （定期同期のたびに書き込みロックを取ると、利用者の打刻がその後ろで待たされる）
  if (
    timeRecords.length === 0 &&
    approvals.length === 0 &&
    records.length === 0 &&
    unknown.length === 0
  ) {
    return;
  }

  await vesselDb.transaction(
    "rw",
    vesselDb.timeRecords,
    vesselDb.approvals,
    vesselDb.records,
    vesselDb.quarantine,
    async () => {
      await bulkAddNew(vesselDb.timeRecords, timeRecords);
      await bulkAddNew(vesselDb.approvals, approvals);
      await bulkAddNew(vesselDb.records, records);
      if (unknown.length > 0) {
        const ids = unknown.map((u) => u.eventId);
        const already = new Set(
          (await vesselDb.quarantine.where("eventId").anyOf(ids).toArray()).map((q) => q.eventId),
        );
        const fresh = unknown
          .filter((u) => !already.has(u.eventId))
          .map((u) => ({
            kind: u.kind,
            eventId: u.eventId,
            raw: u.raw,
            reason: "unknown event kind on this device (app update required)",
            receivedAt,
          }));
        if (fresh.length > 0) await vesselDb.quarantine.bulkAdd(fresh);
      }
    },
  );
}

/**
 * ローカル隔離の再処理（8.6）。
 * 端末が未対応だった種別は破棄せず quarantine に保持している。アプリ更新で対応種別が
 * 増えたあと、隔離済みイベントを本来のテーブルへ適用し直し、隔離から取り除く。
 * これを行わないと、更新前の端末（別タブ・別端末）が先に受信した配信が
 * 更新後も欠けたままになる。再処理は追記のみで、既存行は書き換えない。
 */
async function reprocessLocalQuarantine(): Promise<number> {
  const rows = await vesselDb.quarantine.toArray();
  const known = rows.filter((q) => isRecordKind(q.kind) || q.kind === "time_record" || q.kind === "approval");
  if (known.length === 0) return 0;
  const events = known
    .map((q) => (q.raw as { event?: SyncEvent })?.event ?? (q.raw as SyncEvent))
    .filter((e): e is SyncEvent => Boolean(e && (e as { payload?: unknown }).payload));
  if (events.length > 0) await applyPulledEvents(events.map((event) => ({ event })), new Date().toISOString());
  const seqs = known.map((q) => q.seq).filter((seq): seq is number => seq !== undefined);
  if (seqs.length > 0) await vesselDb.quarantine.bulkDelete(seqs);
  return known.length;
}

/**
 * 陸上ストアが作り直された（storeId が変わった）場合、ローカルの受信レプリカを退避して
 * カーソル 0 から取り直す。
 * - 退避先 replicaArchive に全行を保持する（一次記録を消さない。要件定義書 12.5 / ガードレール②）
 * - 未送信の outbox はそのまま保持する（端末側の記録は失わない。8.6）
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
    const archivedAt = new Date().toISOString();
    const fromStore = known ?? "(unknown)";
    await vesselDb.transaction(
      "rw",
      vesselDb.timeRecords,
      vesselDb.approvals,
      vesselDb.records,
      vesselDb.replicaArchive,
      async () => {
        const rows: ReplicaArchiveRow[] = [];
        for (const r of await vesselDb.timeRecords.toArray())
          rows.push({ storeId: fromStore, table: "timeRecords", id: r.id, row: r, archivedAt });
        for (const r of await vesselDb.approvals.toArray())
          rows.push({ storeId: fromStore, table: "approvals", id: r.id, row: r, archivedAt });
        for (const r of await vesselDb.records.toArray())
          rows.push({ storeId: fromStore, table: "records", id: r.id, row: r, archivedAt });
        if (rows.length > 0) await vesselDb.replicaArchive.bulkAdd(rows); // 退避（破棄しない）
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
      events: { event: SyncEvent; serverSeq: number; serverReceivedAt?: string }[];
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
    const receivedAt = new Date().toISOString();
    await applyPulledEvents(data.events, receivedAt);
    pulled += data.events.length;
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
let rerunRequested = false;

/**
 * 同期を実行する。実行中の再要求は合流させ（同時 Push による二重送信を防ぐ）、
 * 終了後に 1 回だけ再走して実行中に追記された記録の滞留を減らす。
 */
export function syncNow(): Promise<SyncResult> {
  if (syncInFlight) {
    rerunRequested = true;
    return syncInFlight;
  }
  syncInFlight = runSync().finally(() => {
    syncInFlight = null;
    if (rerunRequested) {
      rerunRequested = false;
      void syncNow();
    }
  });
  return syncInFlight;
}

async function runSync(): Promise<SyncResult> {
  if (await isOfflineSim()) {
    return { ok: false, pushed: 0, pulled: 0, skippedOffline: true };
  }
  try {
    await reprocessLocalQuarantine(); // アプリ更新で対応した種別を先に取り込む（8.6）
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
