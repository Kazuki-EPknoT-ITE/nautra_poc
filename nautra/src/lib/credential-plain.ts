import type { ExpiryState, FreshnessState } from "@/domain/crew/freshness";
import type { CheckLevel } from "@/domain/labor-law/types";

/**
 * 証書の判定を画面の語彙（2段階アラート）に言い換える純関数。
 *
 * 要件定義書 12.4 は「**有効期限切れ（不適合）と要再確認（鮮度切れ）を区別して表示する**」ことを
 * 求めている。`CredentialStatus.level` は両方をまとめた総合判定なので、
 * 期限のバッジに使うと「有効」なのに注意色が付いてしまう。
 * そのため軸ごとの色をここで決め、画面はこの関数だけを使う（画面に文言・色ロジックを散らさない）。
 */

/** 有効期限だけを見た2段階アラート（鮮度は含めない） */
export function expiryLevel(expiry: ExpiryState): CheckLevel {
  if (expiry === "expired") return "violation";
  if (expiry === "start_due" || expiry === "expiring" || expiry === "unknown") return "caution";
  return "ok";
}

/** 最終確認日（鮮度）だけを見た2段階アラート。期限切れとは別種のアラート（12.4） */
export function freshnessLevel(freshness: FreshnessState): CheckLevel {
  return freshness === "fresh" ? "ok" : "caution";
}
