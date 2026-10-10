import {
  AUTHOR_POLICY_PREFIX,
  checkOriginPolicy,
  checkVesselAuthorPolicy,
  knownSyncEventSchema,
  type SyncEvent,
} from "@/sync-protocol/events";

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
  /** 記録者のロールが分かって隔離から戻した件数（船員マスタが後から届いたとき。SHIFT-04） */
  released?: number;
}

export function applyPush(
  state: StoreState,
  deviceId: string,
  rawEvents: unknown[],
  now: Date,
): ApplyPushResult {
  const seen = new Set(state.events.map((e) => e.event.idempotencyKey));
  // 隔離済みのイベントの再送は、隔離の行を増やさずに「隔離」とだけ返す
  const held = new Set(state.quarantine.map((q) => keyOf(q.raw)).filter((k): k is string => Boolean(k)));
  // 記録者のロールの引き当ては、この Push の間は1つの索引を使い回す（イベントごとに全件を走査しない）
  let roles = buildRoleIndex(state);
  let mastersArrived = false;
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
    const event = parsed.data as SyncEvent;
    if (seen.has(event.idempotencyKey)) {
      duplicates.push(event.idempotencyKey);
      continue;
    }
    if (held.has(event.idempotencyKey)) {
      quarantined.push(event.eventId);
      continue;
    }
    // 競合ポリシー／発生元の適用（8.3）: 陸上正本の種別を船内端末から受けた場合は隔離（破棄しない）
    const policyViolation =
      checkOriginPolicy(event.kind, event.deviceId) ??
      checkVesselAuthorPolicy(event.kind, event.deviceId, event.payload, (id, at) => roleAt(roles, id, at));
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
    if (event.kind === "crew_master") mastersArrived = true;
    seen.add(event.idempotencyKey);
    state.version += 1;
    state.events.push({ event, serverSeq: state.version, serverReceivedAt: receivedAt });
    accepted.push(event.idempotencyKey);
  }

  // 船員マスタが届いたら、記録者のロールが分からず隔離していた計画を見直す（届く順番で結果が変わらないように）
  let released = 0;
  if (mastersArrived) {
    roles = buildRoleIndex(state);
    released = releaseAuthorQuarantine(state, roles, seen, receivedAt);
  }
  return { accepted, duplicates, quarantined, released };
}

function keyOf(raw: unknown): string | undefined {
  const k = (raw as { idempotencyKey?: unknown } | null)?.idempotencyKey;
  return typeof k === "string" ? k : undefined;
}

/**
 * 記録者のロールが分からず（船員マスタが未着）隔離していた記録を、いまの船員マスタで見直して戻す。
 * 戻すのは「記録者ポリシーで隔離したもの」だけ。未知種別などの隔離はここでは触らない。
 */
function releaseAuthorQuarantine(state: StoreState, roles: RoleIndex, seen: Set<string>, receivedAt: string): number {
  let released = 0;
  const keep: QuarantinedEvent[] = [];
  for (const q of state.quarantine) {
    if (!q.reason.startsWith(AUTHOR_POLICY_PREFIX)) {
      keep.push(q);
      continue;
    }
    const parsed = knownSyncEventSchema.safeParse(q.raw);
    if (!parsed.success) {
      keep.push(q);
      continue;
    }
    const event = parsed.data as SyncEvent;
    const again = checkVesselAuthorPolicy(event.kind, event.deviceId, event.payload, (id, at) => roleAt(roles, id, at));
    if (again || seen.has(event.idempotencyKey)) {
      keep.push(q);
      continue;
    }
    seen.add(event.idempotencyKey);
    state.version += 1;
    state.events.push({ event, serverSeq: state.version, serverReceivedAt: receivedAt });
    released += 1;
  }
  state.quarantine = keep;
  return released;
}

/** 船員ID → 船員マスタの版（記録日時の昇順）。ロールと退職日だけを持つ */
type RoleIndex = Map<string, { at: string; role?: string; retiredOn?: string }[]>;

function buildRoleIndex(state: StoreState): RoleIndex {
  const index: RoleIndex = new Map();
  for (const { event } of state.events) {
    if (event.kind !== "crew_master") continue;
    const p = event.payload as { crewMemberId?: string; role?: string; retiredOn?: string; recordedAt?: string; occurredAt?: string };
    if (!p.crewMemberId) continue;
    const list = index.get(p.crewMemberId) ?? [];
    list.push({ at: p.recordedAt ?? p.occurredAt ?? "", role: p.role, retiredOn: p.retiredOn });
    index.set(p.crewMemberId, list);
  }
  for (const list of index.values()) list.sort((x, y) => x.at.localeCompare(y.at));
  return index;
}

/**
 * 記録した時点で有効だった版のロール（SHIFT-04）。記録が最初の版より前なら最初の版を使う。
 * その時点で退職していればロールは無いものとして扱う。
 */
function roleAt(index: RoleIndex, crewMemberId: string, at: string | undefined): string | undefined {
  const list = index.get(crewMemberId);
  if (!list || list.length === 0) return undefined;
  const when = at ?? list[list.length - 1]!.at;
  const version = [...list].reverse().find((v) => v.at <= when) ?? list[0]!;
  if (version.retiredOn && version.retiredOn <= when.slice(0, 10)) return undefined;
  return version.role;
}
