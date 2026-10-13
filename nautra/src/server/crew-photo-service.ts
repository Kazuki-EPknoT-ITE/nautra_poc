import { COMPANY_SCOPE_ID } from "@/lib/seed-masters";
import { carryOverFields } from "@/lib/master-fields";
import { crewNameOf, effective, publishMaster, writeAuditLog } from "@/server/master-service";
import { PHOTO_MAX_BYTES, type CrewPhotoPayload } from "@/sync-protocol/masters";

/**
 * 顔写真の保管（3.1.1）。
 *
 * 船員マスタとは**別のエンティティ**に持つ。写真は本文より桁違いに重く、マスタに
 * 載せると住所を直しただけで画像ぶんの版が積み上がる。分けておけば、写真の差し替えは
 * マスタの版を増やさず、マスタの履歴も軽いままになる。
 *
 * 画像そのものを同期に載せるのは、**船内が回線の無いところで顔を出す**ため（10.1）。
 * 共用端末のサインインは顔で選ぶのがいちばん速く、そこで画像が取れないと意味がない。
 * 縮小は端末側で済ませ、ここでは**大きさの上限だけ**を見張る。
 */

/** いま有効な顔写真（取り外したものは返さない） */
export function crewPhotoOf(crewMemberId: string): string | undefined {
  const row = effective("crew_photo").find((p) => p.crewMemberId === crewMemberId);
  return row && !row.removed ? row.dataUrl : undefined;
}

/** 船員ID → 顔写真。一覧・ボードはこれを1回引いて使う（1件ずつ探さない） */
export function crewPhotoMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of effective("crew_photo")) {
    if (!p.removed && p.dataUrl) map.set(p.crewMemberId, p.dataUrl);
  }
  return map;
}

export interface SaveCrewPhotoInput {
  crewMemberId: string;
  /** 縮小済みの data URL。空文字は「写真を外す」 */
  dataUrl: string;
  actor: string;
  now?: Date;
}

/**
 * 顔写真を保存する（追記型）。同じ船員の前の写真は supersedesId で置き換える。
 * 監査ログには**画像そのものを載せない**（ログが画像で埋まると読めなくなる）。
 */
export function saveCrewPhoto(input: SaveCrewPhotoInput): CrewPhotoPayload | null {
  const current = effective("crew_photo").find((p) => p.crewMemberId === input.crewMemberId);
  const dataUrl = input.dataUrl.trim();
  const removing = dataUrl === "";

  // 変わっていないなら何もしない（押しただけで版が増えないようにする）
  if (removing && (!current || current.removed)) return null;
  if (!removing && current && !current.removed && current.dataUrl === dataUrl) return null;

  if (!removing) {
    if (!dataUrl.startsWith("data:image/")) {
      throw new Error("画像として読み取れませんでした。別のファイルでお試しください");
    }
    if (dataUrl.length > PHOTO_MAX_BYTES) {
      throw new Error(
        `写真が大きすぎます（${Math.round(dataUrl.length / 1024)}KB）。${Math.round(
          PHOTO_MAX_BYTES / 1024,
        )}KB までにしてください`,
      );
    }
  }

  const base = current ? carryOverFields(current as unknown as Record<string, unknown>) : {};
  const published = publishMaster(
    "crew_photo",
    {
      ...base,
      crewMemberId: input.crewMemberId,
      dataUrl: removing ? "" : dataUrl,
      bytes: removing ? 0 : dataUrl.length,
      removed: removing ? true : undefined,
    },
    {
      vesselId: COMPANY_SCOPE_ID,
      supersedesId: current?.id,
      actor: input.actor,
      now: input.now,
    },
  );

  writeAuditLog({
    action: "update",
    entityKind: "crew_photo",
    entityId: input.crewMemberId,
    before: current && !current.removed ? "登録あり" : "未登録",
    after: removing ? "未登録" : "登録あり",
    actor: input.actor,
    summary: `${crewNameOf(input.crewMemberId)} の顔写真を${removing ? "外した" : "登録した"}`,
    now: input.now,
  });

  return published;
}
