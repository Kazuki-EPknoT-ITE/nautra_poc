import { ulid } from "@/lib/ids";
import { carryOverFields } from "@/lib/master-fields";
import { COMPANY_SCOPE_ID } from "@/lib/seed-masters";
import { PHOTO_MAX_BYTES, type VesselMasterPayload, type VesselPhotoPayload } from "@/sync-protocol/masters";
import { effective, publishMaster, vesselMasterOf, vesselNameOf, writeAuditLog } from "./master-service";

/**
 * 船の登録・編集（レビュー VESSEL-02 / ASSIGN-04）と船の写真（VESSEL-03）。
 *
 * **船の登録はこの経路だけ**（S-11「船」の画面）。配乗計画など他の画面は「船を登録」から
 * ここへ案内するだけで、船舶マスタを書き換えない（12.3 更新経路は1つ。船員マスタと同じ考え方）。
 * 登録した船は配乗ボード・シフト・配船の各画面へそのまま出る（どれも有効な船舶マスタから並べる）。
 */

export interface VesselMasterFormInput {
  name: string;
  vesselType: string;
  grossTonnage: string;
  imoNumber: string;
  mmsi: string;
  navigationArea: string;
  requiredCrew: string;
  builtOn: string;
  referencePeriodDays: string;
}

const norm = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return s === "" ? undefined : s;
};

function num(label: string, v: string): number | undefined {
  const s = norm(v);
  if (s === undefined) return undefined;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label}は0以上の数で入力してください`);
  return n;
}

/** 入力を船舶マスタの項目に直す（検証を含む）。新規・編集で同じものを通す */
function toFields(f: VesselMasterFormInput) {
  const name = norm(f.name);
  if (!name) throw new Error("船名を入力してください");
  // 「9612345」でも「IMO 9612345」でも受け、既存のデータと同じ「IMO 9612345」の形で持つ
  const imoRaw = norm(f.imoNumber);
  const imoDigits = imoRaw?.match(/^(?:IMO\s*)?(\d{7})$/i)?.[1];
  if (imoRaw && !imoDigits) throw new Error("IMO番号は7桁の数字で入力してください");
  const imoNumber = imoDigits ? `IMO ${imoDigits}` : undefined;
  const mmsi = norm(f.mmsi);
  if (mmsi && !/^\d{9}$/.test(mmsi)) throw new Error("MMSI は9桁の数字で入力してください");
  const builtOn = norm(f.builtOn);
  if (builtOn && !/^\d{4}-\d{2}-\d{2}$/.test(builtOn)) throw new Error("建造日の形式が正しくありません");
  return {
    name,
    vesselType: norm(f.vesselType),
    grossTonnage: num("総トン数", f.grossTonnage),
    imoNumber,
    mmsi,
    navigationArea: norm(f.navigationArea),
    requiredCrew: num("法定定員", f.requiredCrew),
    builtOn,
    referencePeriodDays: num("基準労働期間", f.referencePeriodDays),
  };
}

const LABELS: Record<string, string> = {
  name: "船名",
  vesselType: "船種",
  grossTonnage: "総トン数",
  imoNumber: "IMO番号",
  mmsi: "MMSI",
  navigationArea: "航行区域",
  requiredCrew: "法定定員",
  builtOn: "建造日",
  referencePeriodDays: "基準労働期間",
};

export function createVesselMaster(input: {
  form: VesselMasterFormInput;
  actor: string;
  now?: Date;
}): { vesselId: string; published: VesselMasterPayload } {
  const fields = toFields(input.form);
  if (effective("vessel_master").some((v) => !v.retiredOn && v.name === fields.name)) {
    throw new Error(`「${fields.name}」は既に登録されています`);
  }
  const vesselId = `vessel-${ulid().toLowerCase()}`;
  const published = publishMaster(
    "vessel_master",
    { targetVesselId: vesselId, ...fields },
    { vesselId: COMPANY_SCOPE_ID, actor: input.actor, now: input.now },
  );
  writeAuditLog({
    action: "create",
    entityKind: "vessel_master",
    entityId: vesselId,
    actor: input.actor,
    channel: "shore",
    now: input.now,
    summary: `船を登録: ${fields.name}`,
  });
  return { vesselId, published };
}

/** 船の情報を直す（追記型。前の版は履歴として残る）。デモの船でマスタが無ければ初版として作る */
export function updateVesselMaster(input: {
  vesselId: string;
  form: VesselMasterFormInput;
  actor: string;
  now?: Date;
}): { changed: string[] } {
  const fields = toFields(input.form);
  const current = vesselMasterOf(input.vesselId);
  const before = (current ?? {}) as Record<string, unknown>;
  const changed = Object.keys(LABELS).filter(
    (k) => String(before[k] ?? "") !== String((fields as Record<string, unknown>)[k] ?? ""),
  );
  if (current && changed.length === 0) return { changed: [] };
  publishMaster(
    "vessel_master",
    {
      ...(current ? carryOverFields(current as unknown as Record<string, unknown>) : {}),
      targetVesselId: input.vesselId,
      ...fields,
    },
    { vesselId: COMPANY_SCOPE_ID, actor: input.actor, now: input.now, supersedesId: current?.id },
  );
  writeAuditLog({
    action: current ? "update" : "create",
    entityKind: "vessel_master",
    entityId: input.vesselId,
    actor: input.actor,
    channel: "shore",
    now: input.now,
    summary: `船の情報を更新: ${fields.name}（${changed.map((k) => LABELS[k]).join("・") || "初版"}）`,
  });
  return { changed: changed.map((k) => LABELS[k]!) };
}

/* ── 船の写真（VESSEL-03） ── */

export function vesselPhotoOf(vesselId: string): string | undefined {
  const row = effective("vessel_photo").find((p) => p.targetVesselId === vesselId);
  return row && !row.removed ? row.dataUrl : undefined;
}

export function vesselPhotoMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of effective("vessel_photo")) {
    if (!p.removed && p.dataUrl) map.set(p.targetVesselId, p.dataUrl);
  }
  return map;
}

/** 船の写真を保存する（追記型。空文字は「写真を外す」）。変わらなければ何もしない */
export function saveVesselPhoto(input: {
  vesselId: string;
  dataUrl: string;
  actor: string;
  now?: Date;
}): VesselPhotoPayload | null {
  const current = effective("vessel_photo").find((p) => p.targetVesselId === input.vesselId);
  const dataUrl = input.dataUrl.trim();
  const removing = dataUrl === "";
  if (removing && (!current || current.removed)) return null;
  if (!removing && current && !current.removed && current.dataUrl === dataUrl) return null;
  if (!removing) {
    if (!dataUrl.startsWith("data:image/")) throw new Error("画像として読み取れませんでした。別のファイルでお試しください");
    if (dataUrl.length > PHOTO_MAX_BYTES) {
      throw new Error(`写真が大きすぎます（${Math.round(dataUrl.length / 1024)}KB）。別の写真でお試しください`);
    }
  }
  const saved = publishMaster(
    "vessel_photo",
    { targetVesselId: input.vesselId, dataUrl: removing ? "" : dataUrl, bytes: dataUrl.length, removed: removing || undefined },
    { vesselId: COMPANY_SCOPE_ID, actor: input.actor, now: input.now, supersedesId: current?.id },
  );
  writeAuditLog({
    action: "update",
    entityKind: "vessel_photo",
    entityId: input.vesselId,
    actor: input.actor,
    channel: "shore",
    now: input.now,
    // 画像そのものはログに載せない
    summary: `${vesselNameOf(input.vesselId)} の写真を${removing ? "外した" : "登録"}`,
  });
  return saved;
}
