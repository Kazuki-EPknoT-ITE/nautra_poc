import Dexie, { type EntityTable } from "dexie";
import type { TimeRecord } from "@/domain/labor-law/types";
import type { ApprovalPayload, SyncEvent } from "@/sync-protocol/events";
import type { RecordKind, RecordPayloadByKind } from "@/sync-protocol/records";

/**
 * 船内端末のローカルストア（IndexedDB / Dexie。基本設計書 3.1「船内オフライン」）。
 * - timeRecords: 一次記録（追記のみ。UPDATE/DELETE は行わない）
 * - approvals: 船内承認・差戻し（追記のみ）
 * - records: 船内記録（航海日誌・点検・操練・作業・保守）とシフト計画（陸上配信）。
 *   エンティティレジストリ（sync-protocol）の種別を kind 列で保持する汎用追記テーブル。
 *   種別追加時にテーブル追加（スキーマ移行）を不要にする（基本設計書 8.6）
 * - outbox: 送信キュー（同期イベント。ACK 後に消し込み）
 * - meta: 端末ID・同期カーソル・選択中打刻者などの端末状態
 *
 * クライアントコンポーネントからのみ参照すること（(vessel) ルートはオフライン完結）。
 */

export interface OutboxItem {
  eventId: string;
  event: SyncEvent;
  queuedAt: string;
}

export interface MetaItem {
  key: string;
  value: string;
}

/** 汎用記録行 = 種別 + ペイロード（ペイロード列をそのまま索引に使う） */
export type VesselRecordRow<K extends RecordKind = RecordKind> = RecordPayloadByKind[K] & {
  kind: K;
};

class VesselDB extends Dexie {
  timeRecords!: EntityTable<TimeRecord, "id">;
  approvals!: EntityTable<ApprovalPayload, "id">;
  records!: EntityTable<VesselRecordRow, "id">;
  outbox!: EntityTable<OutboxItem, "eventId">;
  meta!: EntityTable<MetaItem, "key">;

  constructor() {
    super("nautra-vessel-poc");
    this.version(1).stores({
      timeRecords: "id, crewMemberId, occurredAt",
      approvals: "id, crewMemberId, date",
      outbox: "eventId, queuedAt",
      meta: "key",
    });
    this.version(2).stores({
      timeRecords: "id, crewMemberId, occurredAt",
      approvals: "id, crewMemberId, date",
      records: "id, kind, occurredAt, [kind+date], [kind+crewMemberId]",
      outbox: "eventId, queuedAt",
      meta: "key",
    });
  }
}

export const vesselDb = new VesselDB();

export async function getMeta(key: string): Promise<string | undefined> {
  return (await vesselDb.meta.get(key))?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await vesselDb.meta.put({ key, value });
}
