import { CREW_MEMBERS, DEMO_TENANT_ID, DEMO_VESSEL, SHORE_PLANNER_ID, personName } from "@/lib/crew";
import { ulid } from "@/lib/ids";
import { COMPANY_SCOPE_ID, DEMO_VESSEL_2 } from "@/lib/seed-masters";
import { makeIdempotencyKey, makeRecordEvent } from "@/sync-protocol/events";
import {
  latestBySupersedes,
  RECORD_PAYLOAD_SCHEMAS,
  type CredentialPayload,
  type CrewMasterPayload,
  type RecordKind,
  type RecordPayloadByKind,
  type VesselMasterPayload,
} from "@/sync-protocol/records";
import { getRecordsOfKind, pushToStore } from "./store";

/**
 * マスタ・事務エンティティの共通アクセス層（陸上）。
 *
 * 種別ごとに読み書きの実装を作らない（ガードレール⑨）。
 * 「有効な最新を取る」「追記で配信する」の2つだけをここに置き、
 * 画面ごとのサービスは**業務的な組み立て**（判定・集約）に専念する。
 *
 * すべての書き込みは**追記型の同期イベント**として積まれ、船内と同じ経路（Push/Pull・
 * 冪等キー）を通る。専用の書き込み経路は作らない（12.3 単一経路 / 12.6 監査証跡）。
 */

export const SHORE_DEVICE = "shore-planner-device";

/** 事業者共通スコープ（特定の船に紐づかないマスタ） */
export { COMPANY_SCOPE_ID, DEMO_VESSEL_2 };

/** 船舶の一覧（マスタがあればマスタ、無ければデモ定数） */
export function listVessels(): { id: string; name: string }[] {
  const masters = effective("vessel_master").filter((v) => !v.retiredOn);
  if (masters.length > 0) return masters.map((v) => ({ id: v.targetVesselId, name: v.name }));
  return [DEMO_VESSEL, DEMO_VESSEL_2].map((v) => ({ id: v.id, name: v.name }));
}

export function vesselMasterOf(vesselId: string): VesselMasterPayload | undefined {
  return effective("vessel_master").find((v) => v.targetVesselId === vesselId);
}

export function vesselNameOf(vesselId: string): string {
  return (
    vesselMasterOf(vesselId)?.name ??
    [DEMO_VESSEL, DEMO_VESSEL_2].find((v) => v.id === vesselId)?.name ??
    vesselId
  );
}

/**
 * 有効な最新レコード（訂正・取り消し済みを除く）。
 * 追記専用ストアから「いま有効な1件」を導く唯一の入口。
 */
export function effective<K extends RecordKind>(kind: K): RecordPayloadByKind[K][] {
  return latestBySupersedes(
    getRecordsOfKind(kind) as unknown as { id: string; supersedesId?: string }[],
  ) as unknown as RecordPayloadByKind[K][];
}

/** 訂正・取り消しを含む全履歴（新しい順。監査・履歴表示用） */
export function history<K extends RecordKind>(kind: K): RecordPayloadByKind[K][] {
  return [...getRecordsOfKind(kind)].reverse();
}

/* ═══════════════ 船員マスタ（12.2: アプリが正本） ═══════════════ */

export function listCrewMasters(includeRetired = false): CrewMasterPayload[] {
  const rows = effective("crew_master");
  return (includeRetired ? rows : rows.filter((c) => !c.retiredOn)).sort((a, b) =>
    a.crewMemberId.localeCompare(b.crewMemberId),
  );
}

export function crewMasterOf(crewMemberId: string): CrewMasterPayload | undefined {
  return effective("crew_master").find((c) => c.crewMemberId === crewMemberId);
}

/**
 * 表示名の解決。**船員マスタを正本とし**、未登録の ID だけデモ定数へフォールバックする
 * （12.2: 船員基本情報の正本はアプリ内マスタ）。
 */
export function crewNameOf(crewMemberId: string): string {
  return crewMasterOf(crewMemberId)?.name ?? personName(crewMemberId);
}

/** 船員 ID → 表示名の対応表（一覧描画で毎行探索しないため） */
export function crewNameMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of CREW_MEMBERS) map.set(c.id, c.name);
  for (const m of effective("crew_master")) map.set(m.crewMemberId, m.name);
  return map;
}

/** 年齢は保持せず生年月日から算出する（12.3 導出値を持たない） */
export function ageOf(birthDate: string | undefined, today: string): number | null {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/* ═══════════════ 資格・証書 ═══════════════ */

export function credentialsOf(subjectType: "crew" | "vessel", subjectId: string): CredentialPayload[] {
  return effective("credential").filter(
    (c) => c.subjectType === subjectType && c.subjectId === subjectId && !c.revoked,
  );
}

export function allCredentials(): CredentialPayload[] {
  return effective("credential").filter((c) => !c.revoked);
}

/* ═══════════════ 追記型の配信（共通） ═══════════════ */

export interface PublishOptions {
  /** 訂正・取り消し時に置き換える既存レコードのID */
  supersedesId?: string;
  /** 冪等キーの元になるID。再試行・二重送信を同一イベントにする */
  recordId?: string;
  /** 事業者共通スコープに置くマスタは COMPANY_SCOPE_ID を渡す */
  vesselId?: string;
  actor?: string;
  now?: Date;
}

/**
 * マスタ・事務エンティティを1件配信する（追記のみ）。
 *
 * 訂正は `supersedesId` 付きの新規レコードで表し、原本は物理保持する。
 * 呼び出し側は「変更後の完全な姿」を渡す（差分ではない）。
 */
export function publishMaster<K extends RecordKind>(
  kind: K,
  fields: Record<string, unknown>,
  options: PublishOptions = {},
): RecordPayloadByKind[K] {
  const now = options.now ?? new Date();
  const iso = now.toISOString();
  const id = options.recordId?.trim() || `${kind}-${ulid().toLowerCase()}`;

  if (options.supersedesId) {
    const alive = effective(kind) as unknown as { id: string }[];
    if (!alive.some((r) => r.id === options.supersedesId)) {
      throw new Error("この内容は既に更新・取り消し済みです。画面を開き直して最新を確認してください");
    }
  }

  const schema = RECORD_PAYLOAD_SCHEMAS[kind];
  const payload = schema.parse({
    id,
    tenantId: DEMO_TENANT_ID,
    vesselId: options.vesselId ?? DEMO_VESSEL.id,
    occurredAt: iso,
    recordedAt: iso,
    recordedBy: options.actor ?? SHORE_PLANNER_ID,
    deviceId: SHORE_DEVICE,
    supersedesId: options.supersedesId || undefined,
    publishedAt: iso,
    publishedBy: options.actor ?? SHORE_PLANNER_ID,
    ...fields,
  }) as RecordPayloadByKind[K];

  const outcome = pushToStore(SHORE_DEVICE, [makeRecordEvent(kind, payload, SHORE_DEVICE)]);
  const key = makeIdempotencyKey(SHORE_DEVICE, id);
  if (!outcome.accepted.includes(key) && !outcome.duplicates.includes(key)) {
    throw new Error("保存できませんでした（イベントが受理されず隔離されました）");
  }
  return payload;
}

/* ═══════════════ 12.6 監査証跡 ═══════════════ */

/**
 * 監査ログを1件積む。
 * マスタ更新・要配慮個人情報の参照・出力は、この関数を通して必ず記録する。
 * 追記型なので後から書き換えられない（10.4 一次記録のイミュータブル性）。
 */
export function writeAuditLog(input: {
  action: "create" | "update" | "view_sensitive" | "export" | "sign_in" | "sign_out";
  entityKind: string;
  entityId?: string;
  before?: string;
  after?: string;
  channel?: "shore" | "vessel" | "external";
  actor?: string;
  externalSource?: string;
  summary?: string;
  now?: Date;
}): void {
  publishMaster(
    "audit_log",
    {
      action: input.action,
      entityKind: input.entityKind,
      entityId: input.entityId,
      before: input.before,
      after: input.after,
      channel: input.channel ?? "shore",
      actor: input.actor ?? SHORE_PLANNER_ID,
      externalSource: input.externalSource,
      summary: input.summary,
    },
    { vesselId: COMPANY_SCOPE_ID, actor: input.actor, now: input.now },
  );
}

/** 監査ログ（新しい順） */
export function listAuditLogs(limit = 100) {
  return [...getRecordsOfKind("audit_log")]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, limit);
}

/** 今日（ローカル日 YYYY-MM-DD） */
export function todayLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
