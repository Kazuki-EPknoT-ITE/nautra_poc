import { checkOriginPolicy, knownSyncEventSchema, type SyncEvent } from "@/sync-protocol/events";

/**
 * 同期 Push の適用ロジック（純関数寄り・ファイルI/O 非依存でテスト可能）。
 * 冪等キーによる重複排除・未知種別の隔離（sync_quarantine 相当）を担う（基本設計書 8.2 / 8.6）。
 */

export interface StoredEvent {
  event: SyncEvent;
  serverSeq: number;
  /** サーバ受信時刻（端末時刻 event.occurredAt と併記保持。8.2） */
  serverReceivedAt: string;
}

export interface QuarantinedEvent {
  /** 原文のまま保持（破棄しない。8.6） */
  raw: unknown;
  reason: string;
  serverSeq: number;
  serverReceivedAt: string;
}

export interface StoreState {
  /** ストア識別子（作り直し検知用。端末はこれが変わるとレプリカを取り直す） */
  storeId: string;
  /** 投入済みデモデータの版（PoC: 版が上がるとストアを作り直す） */
  seedVersion: number;
  /** バージョンカーソル（Pull の since に対応） */
  version: number;
  events: StoredEvent[];
  quarantine: QuarantinedEvent[];
}

export function createEmptyStoreState(storeId = "store-local", seedVersion = 0): StoreState {
  return { storeId, seedVersion, version: 0, events: [], quarantine: [] };
}

export interface ApplyPushResult {
  accepted: string[];
  duplicates: string[];
  quarantined: string[];
}

export function applyPush(
  state: StoreState,
  deviceId: string,
  rawEvents: unknown[],
  now: Date,
): ApplyPushResult {
  const seen = new Set(state.events.map((e) => e.event.idempotencyKey));
  const receivedAt = now.toISOString();
  const accepted: string[] = [];
  const duplicates: string[] = [];
  const quarantined: string[] = [];

  for (const raw of rawEvents) {
    const parsed = knownSyncEventSchema.safeParse(raw);
    if (!parsed.success) {
      // 未知種別・未知スキーマはエラーとせず隔離し、原文を保持する（8.6）
      state.version += 1;
      state.quarantine.push({
        raw,
        reason: "unknown event kind or schema mismatch",
        serverSeq: state.version,
        serverReceivedAt: receivedAt,
      });
      const eventId =
        typeof raw === "object" && raw !== null && "eventId" in raw
          ? String((raw as { eventId: unknown }).eventId)
          : "(unknown)";
      quarantined.push(eventId);
      continue;
    }
    const event = parsed.data;
    if (seen.has(event.idempotencyKey)) {
      duplicates.push(event.idempotencyKey);
      continue;
    }
    // 競合ポリシー／発生元の適用（8.3）: 陸上正本の種別を船内端末から受けた場合は隔離（破棄しない）
    const policyViolation = checkOriginPolicy(event.kind, event.deviceId);
    if (policyViolation) {
      state.version += 1;
      state.quarantine.push({
        raw,
        reason: policyViolation,
        serverSeq: state.version,
        serverReceivedAt: receivedAt,
      });
      quarantined.push(event.eventId);
      continue;
    }
    seen.add(event.idempotencyKey);
    state.version += 1;
    state.events.push({ event, serverSeq: state.version, serverReceivedAt: receivedAt });
    accepted.push(event.idempotencyKey);
  }

  return { accepted, duplicates, quarantined };
}
