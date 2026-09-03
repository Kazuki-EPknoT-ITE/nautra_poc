/**
 * packages/domain/payroll 相当。給与連携の「まるめ時間」の純関数（UI・DB・fetch 依存禁止）。
 *
 * 要件定義書 3.6.2「船員給与計算（船員特有の手当体系を含む。**まるめ時間設定による給与連携**）」。
 *
 * 設計の要点:
 * - まるめ単位・まるめ方は引数で受け取り、この関数は既定値を内部に持たない
 *   （設定は `src/rules/office-rules.ts`。ガードレール③）。
 * - **打刻の実績は書き換えない**。まるめは給与計算のための表示・連携の変換であり、
 *   一次記録（打刻）はそのまま残る（12.3）。画面では実績とまるめ後の両方を見せ、
 *   まるめによって何分増減したのかが分かるようにする。
 * - 既定のまるめ方を四捨五入としているのは、切り捨て一辺倒だと実働に対して
 *   賃金が目減りし続けるため（端数処理は労使で取り決める事項。人間レビュー必須領域）。
 */

export type RoundingMode = "floor" | "ceil" | "nearest";

export interface RoundingEffect {
  /** 打刻から求めた実績の分数 */
  rawMinutes: number;
  /** まるめ後の分数（給与へ連携する値） */
  roundedMinutes: number;
  /** まるめによる増減（プラス＝切り上がった） */
  diffMinutes: number;
  unitMinutes: number;
  mode: RoundingMode;
}

/**
 * 分数を指定の単位でまるめる。
 *
 * - 単位が 1 分以下・不正な場合はまるめない（実績をそのまま返す）
 * - 実績が 0 以下・不正な場合は 0 を返す（時間外は負にならない）
 * - nearest はちょうど半分のとき切り上げる（労働者に不利にならない側へ倒す）
 */
export function roundMinutes(
  minutes: number,
  unitMinutes: number,
  mode: RoundingMode = "nearest",
): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  if (!Number.isFinite(unitMinutes) || unitMinutes <= 1) return Math.round(minutes);
  const units = minutes / unitMinutes;
  switch (mode) {
    case "floor":
      return Math.floor(units) * unitMinutes;
    case "ceil":
      return Math.ceil(units) * unitMinutes;
    default:
      return Math.round(units) * unitMinutes;
  }
}

/**
 * まるめの前後をまとめて返す（画面で「実績 ◯分 → まるめ後 ◯分」と両方見せるため）。
 * 画面側でまるめ計算を再実装させない。
 */
export function roundingEffect(
  minutes: number,
  unitMinutes: number,
  mode: RoundingMode = "nearest",
): RoundingEffect {
  const rawMinutes = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0;
  const roundedMinutes = roundMinutes(minutes, unitMinutes, mode);
  return {
    rawMinutes,
    roundedMinutes,
    diffMinutes: roundedMinutes - rawMinutes,
    unitMinutes,
    mode,
  };
}
