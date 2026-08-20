import type { EntryType, PunchAction, TimeRecord, WorkCategory } from "@/domain/labor-law/types";
import { DEMO_TENANT_ID, DEMO_VESSEL } from "@/lib/crew";
import {
  makeIdempotencyKey,
  SYNC_SCHEMA_VERSION,
  type ApprovalPayload,
  type SyncEvent,
} from "@/sync-protocol/events";
import { ulid } from "./ids";
import { getMeta, setMeta, vesselDb } from "./vessel-db";
import { isOfflineSim, syncNow } from "./vessel-sync";

/**
 * 船内アプリの書き込みアクション。
 * すべて「ローカル一次記録に追記 → 送信キューへ積む → 可能なら同期」の順で行う
 * （ローカルファースト。基本設計書 8.1）。一次記録の UPDATE/DELETE は行わない。
 */

export async function ensureDeviceId(): Promise<string> {
  let id = await getMeta("deviceId");
  if (!id) {
    id = `dev-${ulid().toLowerCase()}`;
    await setMeta("deviceId", id);
  }
  return id;
}

function timeRecordEvent(record: TimeRecord, deviceId: string): SyncEvent {
  return {
    kind: "time_record",
    schemaVersion: SYNC_SCHEMA_VERSION,
    eventId: record.id,
    deviceId,
    idempotencyKey: makeIdempotencyKey(deviceId, record.id),
    occurredAt: record.occurredAt,
    payload: { ...record },
  };
}

function approvalSyncEvent(payload: ApprovalPayload, deviceId: string): SyncEvent {
  return {
    kind: "approval",
    schemaVersion: SYNC_SCHEMA_VERSION,
    eventId: payload.id,
    deviceId,
    idempotencyKey: makeIdempotencyKey(deviceId, payload.id),
    occurredAt: payload.decidedAt,
    payload,
  };
}

async function trySyncInBackground(): Promise<void> {
  if (await isOfflineSim()) return; // 擬似オフライン中はキューに保持
  void syncNow();
}

export interface PunchInput {
  crewMemberId: string;
  workCategory: WorkCategory;
  action: PunchAction;
  entryType?: EntryType;
  /** 後から打刻・差戻し再入力時に指定。省略時は現在時刻 */
  occurredAt?: Date;
  supersedesId?: string;
  note?: string;
}

export async function recordPunch(input: PunchInput): Promise<TimeRecord> {
  const now = new Date();
  const occurredAt = input.occurredAt ?? now;
  // 未来日時ガード（誤操作防止。基本設計書 6.3）
  if (occurredAt.getTime() > now.getTime() + 60_000) {
    throw new Error("未来の日時では打刻できません");
  }
  const deviceId = await ensureDeviceId();
  const record: TimeRecord = {
    id: ulid(),
    tenantId: DEMO_TENANT_ID,
    vesselId: DEMO_VESSEL.id,
    crewMemberId: input.crewMemberId,
    workCategory: input.workCategory,
    action: input.action,
    occurredAt: occurredAt.toISOString(),
    entryType: input.entryType ?? "realtime",
    supersedesId: input.supersedesId,
    recordedBy: input.crewMemberId,
    deviceId,
    note: input.note,
  };
  await vesselDb.transaction("rw", vesselDb.timeRecords, vesselDb.outbox, async () => {
    await vesselDb.timeRecords.add(record); // 一次記録へ追記（ローカルファースト）
    await vesselDb.outbox.add({
      eventId: record.id,
      event: timeRecordEvent(record, deviceId),
      queuedAt: new Date().toISOString(),
    });
  });
  void trySyncInBackground();
  return record;
}

export interface ApprovalInput {
  crewMemberId: string;
  date: string;
  decision: "approved" | "remanded";
  targetRecordId?: string;
  reason?: string;
  approvedBy: string;
}

/** 船内（船長）承認・差戻し（V-04）。承認イベントも追記＋同期対象 */
export async function recordApproval(input: ApprovalInput): Promise<ApprovalPayload> {
  const deviceId = await ensureDeviceId();
  const payload: ApprovalPayload = {
    id: ulid(),
    tenantId: DEMO_TENANT_ID,
    vesselId: DEMO_VESSEL.id,
    crewMemberId: input.crewMemberId,
    date: input.date,
    decision: input.decision,
    targetRecordId: input.targetRecordId,
    reason: input.reason,
    approvedBy: input.approvedBy,
    approverRole: "captain",
    decidedAt: new Date().toISOString(),
  };
  await vesselDb.transaction("rw", vesselDb.approvals, vesselDb.outbox, async () => {
    await vesselDb.approvals.add(payload);
    await vesselDb.outbox.add({
      eventId: payload.id,
      event: approvalSyncEvent(payload, deviceId),
      queuedAt: new Date().toISOString(),
    });
  });
  void trySyncInBackground();
  return payload;
}

export async function getSelectedCrewId(): Promise<string | undefined> {
  return getMeta("selectedCrewId");
}

export async function setSelectedCrewId(id: string): Promise<void> {
  await setMeta("selectedCrewId", id);
}
