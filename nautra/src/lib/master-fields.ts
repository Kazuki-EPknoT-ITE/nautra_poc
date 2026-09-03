/**
 * 追記型マスタを「訂正（supersedesId 付きの新規レコード）」として配信するときの共通処理。
 *
 * 要件定義書 12.3 / ガードレール②: マスタの UPDATE は禁止で、変更は
 * 「変更後の完全な姿」を持つ新しいレコードを追記して表す。
 * そのとき **発行元の列（ID・配信日時・記録者・端末）は引き継がない**。
 * 引き継ぐと「いつ・誰が・どの端末から直したか」が原本のもので上書きされ、
 * 監査証跡（12.6）が壊れるため。
 */

/** publishMaster が毎回新しく採番・記録する列（引き継いではいけないもの） */
const ISSUER_KEYS = new Set([
  "id",
  "tenantId",
  "vesselId",
  "occurredAt",
  "recordedAt",
  "recordedBy",
  "deviceId",
  "supersedesId",
  "publishedAt",
  "publishedBy",
]);

/**
 * 既存レコードから「業務上の中身」だけを取り出す。
 * 戻り値に変更分を重ねて publishMaster へ渡すと、差分ではなく完全な姿で追記できる。
 */
export function carryOverFields(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (ISSUER_KEYS.has(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}
