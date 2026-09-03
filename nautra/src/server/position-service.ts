import {
  crewChangesInPeriod,
  evaluatePositionFreshness,
  type CrewChangeWarning,
  type PositionFreshness,
} from "@/lib/position-plain";
import type { VesselPositionPayload, VoyageSchedulePayload } from "@/sync-protocol/masters";
import { carryOverFields } from "@/lib/master-fields";
import { crewNameOf, effective, listVessels, publishMaster, writeAuditLog } from "./master-service";

/**
 * S-12 配船・位置情報（要件定義書 3.7.1 / 3.7.2）。
 *
 * ⚠ 3.7.1 の留意点への対応:
 *   「無償AISサービスは可用性・データ品質のSLAがないため、配船判断の**参考情報**と位置づけ、
 *    **商用APIへの差替え可能なアダプタ設計**とする。AIS非搭載の小型船はスマホGPSによる
 *    位置共有で補完する」
 *
 * そのため位置の**取得はこのファイルの `fetchPositions()` 1か所に閉じてある**。
 * PoC は同期ストア（船内・陸上から届いた vessel_position レコード）を読むだけだが、
 * 本番で商用 AIS API に差し替えるときは **この関数の中身だけ**を置き換えればよい
 * （画面・集計は「位置の配列」しか知らない）。取得元は payload の `source` に必ず残し、
 * AIS / スマホGPS / 手入力を区別できるようにする。
 */

/* ═══════════════ 位置取得アダプタ（差替え点） ═══════════════ */

/**
 * 位置情報の取得アダプタ。
 *
 * PoC: 同期ストアに蓄積された vessel_position を返す（外部通信なし・オフラインで動く）。
 * 本番: ここを商用 AIS 配信 API の呼び出しに置き換える。
 *   - 応答は `VesselPositionPayload` に正規化して返すこと（画面・集計を変えないため）
 *   - 取得できなかった船は**黙って落とさず**、直近の蓄積値を返して鮮度で古さを示すこと
 *   - 取得失敗は例外にせず空配列を返し、画面は「参考情報」の注記を出したまま成立させること
 */
export function fetchPositions(): VesselPositionPayload[] {
  return effective("vessel_position");
}

export interface VesselPositionView {
  vesselId: string;
  vesselName: string;
  latest: VesselPositionPayload | null;
  freshness: PositionFreshness | null;
  /** 航跡（古い順。簡易海図に線で描く） */
  track: VesselPositionPayload[];
}

/** 船ごとの最新位置と航跡（観測日時の新しいものを最新とする） */
export function buildPositionViews(now = new Date(), trackLimit = 12): VesselPositionView[] {
  const positions = fetchPositions();
  return listVessels().map((v) => {
    const track = positions
      .filter((p) => p.targetVesselId === v.id)
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
      .slice(-trackLimit);
    const latest = track.length > 0 ? track[track.length - 1] : null;
    return {
      vesselId: v.id,
      vesselName: v.name,
      latest,
      freshness: latest ? evaluatePositionFreshness(latest.observedAt, now) : null,
      track,
    };
  });
}

/* ═══════════════ 3.7.2 配船スケジュール ═══════════════ */

export interface ScheduleView {
  schedule: VoyageSchedulePayload;
  vesselName: string;
  /** その期間に乗下船の予定がある船員（3.7.2③ 配乗状況の確認） */
  crewChanges: (CrewChangeWarning & { crewName: string })[];
}

/** 乗下船の「予定」だけを取り出す（実績は配船の判断材料にしない） */
export function plannedCrewChanges(): CrewChangeWarning[] {
  return effective("embarkation")
    .filter((e) => e.status === "planned")
    .map((e) => ({
      crewMemberId: e.crewMemberId,
      date: e.date,
      eventType: e.eventType,
      duty: e.duty,
    }));
}

/** 期間に重なる乗下船の予定（船を指定するとその船の分だけ） */
export function crewChangesFor(
  fromIso: string,
  toIso: string,
): (CrewChangeWarning & { crewName: string })[] {
  const from = ymdOf(fromIso);
  const to = ymdOf(toIso);
  if (!from || !to) return [];
  return crewChangesInPeriod(plannedCrewChanges(), from, to).map((c) => ({
    ...c,
    crewName: crewNameOf(c.crewMemberId),
  }));
}

/** ISO / YYYY-MM-DD いずれの入力からもローカル日を取り出す */
function ymdOf(value: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 配船スケジュール一覧（出港の早い順）。乗下船の予定と突き合わせた警告つき */
export function buildScheduleViews(): ScheduleView[] {
  const names = new Map(listVessels().map((v) => [v.id, v.name]));
  return effective("voyage_schedule")
    .sort((a, b) => a.departureAt.localeCompare(b.departureAt))
    .map((s) => ({
      schedule: s,
      vesselName: names.get(s.targetVesselId) ?? s.targetVesselId,
      crewChanges: s.status === "canceled" ? [] : crewChangesFor(s.departureAt, s.arrivalAt),
    }));
}

export interface ScheduleInput {
  targetVesselId: string;
  voyageNo?: string;
  departurePort: string;
  arrivalPort: string;
  departureAt: string;
  arrivalAt: string;
  cargoKind?: string;
  quantity?: string;
  counterparty?: string;
  status: VoyageSchedulePayload["status"];
  planningNote?: string;
}

/** 配船スケジュールを新規に登録する（追記型） */
export function createVoyageSchedule(
  input: ScheduleInput,
  actor?: string,
  now = new Date(),
): VoyageSchedulePayload {
  const departureAt = toIso(input.departureAt);
  const arrivalAt = toIso(input.arrivalAt);
  if (!input.departurePort.trim() || !input.arrivalPort.trim()) {
    throw new Error("出港地と入港地を入力してください");
  }
  if (!departureAt || !arrivalAt) throw new Error("出港日時と入港日時を入力してください");
  if (arrivalAt < departureAt) throw new Error("入港日時は出港日時より後にしてください");

  const published = publishMaster(
    "voyage_schedule",
    {
      targetVesselId: input.targetVesselId,
      voyageNo: input.voyageNo?.trim() || undefined,
      departurePort: input.departurePort.trim(),
      arrivalPort: input.arrivalPort.trim(),
      departureAt,
      arrivalAt,
      cargoKind: input.cargoKind?.trim() || undefined,
      quantity: input.quantity?.trim() || undefined,
      counterparty: input.counterparty?.trim() || undefined,
      status: input.status,
      planningNote: input.planningNote?.trim() || undefined,
    },
    { vesselId: input.targetVesselId, actor, now },
  );
  writeAuditLog({
    action: "create",
    entityKind: "voyage_schedule",
    entityId: published.id,
    after: `${published.departurePort} → ${published.arrivalPort}`,
    actor,
    summary: `配船を登録（${published.voyageNo ?? "航海番号なし"}）`,
    now,
  });
  return published;
}

/** 配船スケジュールの状態だけを進める（訂正は supersedesId 付きの追記） */
export function updateScheduleStatus(
  scheduleId: string,
  status: VoyageSchedulePayload["status"],
  actor?: string,
  now = new Date(),
): VoyageSchedulePayload {
  const row = effective("voyage_schedule").find((s) => s.id === scheduleId);
  if (!row) throw new Error("この配船は既に更新されています。画面を開き直してください");
  const published = publishMaster(
    "voyage_schedule",
    { ...carryOverFields(row), status },
    { supersedesId: row.id, vesselId: row.vesselId, actor, now },
  );
  writeAuditLog({
    action: "update",
    entityKind: "voyage_schedule",
    entityId: published.id,
    before: `状態: ${row.status}`,
    after: `状態: ${status}`,
    actor,
    summary: `配船の状態を変更（${row.voyageNo ?? row.departurePort}）`,
    now,
  });
  return published;
}

/* ═══════════════ 3.7.1 手入力での位置更新（AIS 非搭載船の補完） ═══════════════ */

export interface ManualPositionInput {
  targetVesselId: string;
  lat: number;
  lon: number;
  speedKnots?: number;
  courseDeg?: number;
  navStatus?: VesselPositionPayload["navStatus"];
  destination?: string;
  eta?: string;
  observedAt?: string;
  note?: string;
}

/**
 * 位置を手入力で登録する（AIS 非搭載の小型船・受信が途切れた船の補完）。
 * 取得元は必ず `manual` として残し、AIS 由来の値と区別できるようにする。
 */
export function publishManualPosition(
  input: ManualPositionInput,
  actor?: string,
  now = new Date(),
): VesselPositionPayload {
  if (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90) {
    throw new Error("緯度は -90 〜 90 の数値で入力してください");
  }
  if (!Number.isFinite(input.lon) || input.lon < -180 || input.lon > 180) {
    throw new Error("経度は -180 〜 180 の数値で入力してください");
  }
  const observedAt = toIso(input.observedAt ?? "") ?? now.toISOString();
  const published = publishMaster(
    "vessel_position",
    {
      targetVesselId: input.targetVesselId,
      source: "manual",
      lat: input.lat,
      lon: input.lon,
      speedKnots: input.speedKnots,
      courseDeg: input.courseDeg,
      navStatus: input.navStatus ?? "unknown",
      destination: input.destination?.trim() || undefined,
      eta: toIso(input.eta ?? "") ?? undefined,
      observedAt,
      note: input.note?.trim() || undefined,
    },
    { vesselId: input.targetVesselId, actor, now },
  );
  writeAuditLog({
    action: "create",
    entityKind: "vessel_position",
    entityId: published.id,
    after: `手入力: ${input.lat}, ${input.lon}`,
    actor,
    summary: "位置を手入力で登録（AIS 非搭載・受信途切れの補完）",
    now,
  });
  return published;
}

/** "YYYY-MM-DDTHH:MM"（ローカル）→ ISO。空・不正は null */
function toIso(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
