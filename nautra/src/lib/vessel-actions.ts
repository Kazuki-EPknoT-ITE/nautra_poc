import type {
  EntryType,
  ExceptionalWorkKind,
  PunchAction,
  TimeRecord,
  WorkCategory,
} from "@/domain/labor-law/types";
import { DEMO_TENANT_ID, DEMO_VESSEL } from "@/lib/crew";
import {
  makeIdempotencyKey,
  makeRecordEvent,
  SYNC_ENTITY_REGISTRY,
  SYNC_SCHEMA_VERSION,
  type ApprovalPayload,
  type SyncEvent,
} from "@/sync-protocol/events";
import type { RecordKind, RecordPayloadByKind } from "@/sync-protocol/records";
import { ulid } from "./ids";
import { getMeta, setMeta, toRecordRow, vesselDb } from "./vessel-db";
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

/** 連続記録時に同期が毎回走らないようまとめる待ち時間（ミリ秒） */
const BACKGROUND_SYNC_DEBOUNCE_MS = 800;
let backgroundSyncTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 記録直後の同期はまとめて実行する。
 * 連続打刻のたびに Push/Pull を走らせると、通信と再描画が操作のたびに発生して
 * 画面が重くなるため、短時間の連続書き込みは1回の同期に集約する。
 * 記録自体はローカルに確定済みで、同期が遅れても失われない（ローカルファースト）。
 */
async function trySyncInBackground(): Promise<void> {
  if (await isOfflineSim()) return; // 擬似オフライン中はキューに保持
  if (backgroundSyncTimer) clearTimeout(backgroundSyncTimer);
  backgroundSyncTimer = setTimeout(() => {
    backgroundSyncTimer = null;
    void syncNow();
  }, BACKGROUND_SYNC_DEBOUNCE_MS);
}

/** 未来日時ガード（誤操作防止。基本設計書 6.3）。1分の時計ずれは許容 */
export function assertNotFuture(d: Date, now = new Date()): void {
  if (d.getTime() > now.getTime() + 60_000) {
    throw new Error("未来の日時は記録できません");
  }
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
  /**
   * 安全臨時労働・緊急作業の別枠（要件定義書 3.2.5⑥）。
   * 開始打刻に付けると、その区間は労働時間として記録されつつ上限算定から除外される。
   * 誤って常用されないよう、画面側では理由（note）を必須にする。
   */
  exceptionKind?: ExceptionalWorkKind;
}

export async function recordPunch(input: PunchInput): Promise<TimeRecord> {
  const now = new Date();
  const occurredAt = input.occurredAt ?? now;
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
    // 別枠は区間の開始側にだけ付く（終了打刻は開始の区分に従う。WorkInterval.exceptionKind）
    exceptionKind: input.action === "start" ? input.exceptionKind : undefined,
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

/* ───────────── 船内記録（航海日誌・点検・操練・作業・保守）の汎用追記 ───────────── */

/** 全記録種別に共通する列を組み立てる（ID 採番・テナント/船舶・記録者・端末） */
export async function newRecordBase(
  recordedBy: string,
  occurredAt: Date = new Date(),
  supersedesId?: string,
) {
  assertNotFuture(occurredAt);
  const deviceId = await ensureDeviceId();
  return {
    id: ulid(),
    tenantId: DEMO_TENANT_ID,
    vesselId: DEMO_VESSEL.id,
    occurredAt: occurredAt.toISOString(),
    recordedAt: new Date().toISOString(), // 記録作成時刻（端末時計。後入力・訂正の証跡）
    recordedBy,
    deviceId,
    supersedesId,
  };
}

/**
 * 船内記録の追記（種別非依存）。ローカル汎用テーブルへ追記 → outbox → 可能なら同期。
 * 種別ごとの個別実装を持たない（エンティティレジストリ方式。基本設計書 8.6）。
 */
export async function appendRecord<K extends RecordKind>(
  kind: K,
  payload: RecordPayloadByKind[K],
): Promise<RecordPayloadByKind[K]> {
  // 入力時にスキーマ検証し、陸上で隔離される不正イベントを端末側で早期検出する（8.6）
  SYNC_ENTITY_REGISTRY[kind].payload.parse(payload);
  const row = toRecordRow(kind, payload);
  await vesselDb.transaction("rw", vesselDb.records, vesselDb.outbox, async () => {
    await vesselDb.records.add(row);
    await vesselDb.outbox.add({
      eventId: payload.id,
      event: makeRecordEvent(kind, payload, payload.deviceId),
      queuedAt: new Date().toISOString(),
    });
  });
  void trySyncInBackground();
  return payload;
}

/** シフト変更通知を確認済みにする（端末状態。通知自体は記録として保持） */
export async function acknowledgeShiftChanges(until: Date = new Date()): Promise<void> {
  await setMeta("shiftAckAt", until.toISOString());
}

/** 陸上からのお知らせを確認済みにする（端末状態。お知らせ自体は記録として保持） */
export async function acknowledgeNotices(until: Date = new Date()): Promise<void> {
  await setMeta("noticeAckAt", until.toISOString());
}

export async function getSelectedCrewId(): Promise<string | undefined> {
  return getMeta("selectedCrewId");
}

export async function setSelectedCrewId(id: string): Promise<void> {
  await setMeta("selectedCrewId", id);
}
