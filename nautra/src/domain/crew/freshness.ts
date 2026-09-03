import type { CheckLevel } from "@/domain/labor-law/types";
import type { CredentialRuleSet } from "@/rules/credential-rules";
import type { CredentialCategory, CredentialPayload } from "@/sync-protocol/masters";

/**
 * packages/domain/crew 相当。証書・写しの「有効期限」と「鮮度」の判定（純関数・UI/DB 非依存）。
 *
 * 要件定義書 12.4「鮮度管理（外部に正本があるデータ）」:
 * - 有効期限とは別に **最終確認日** と **確認方法** を保持する
 * - 最終確認日から一定期間（既定 180 日）確認がないものを「未確認」として検知する
 * - 有効期限内であっても鮮度切れは「**要再確認**」として警告し、
 *   **有効期限切れ（不適合）とは区別して**表示する
 *
 * 要件定義書 6.6②「期限は提出期限でなく**着手期限**で管理」:
 * - 満了日そのものではなく、準備リードタイクを引いた着手期限で発報する
 *
 * 閾値は CredentialRuleSet から注入し、この関数は法令定数を内部に持たない（ガードレール③）。
 */

/** 有効期限の状態（不適合＝expired と、鮮度の問題は別種のアラート） */
export type ExpiryState =
  /** 期限内で余裕がある */
  | "valid"
  /** 着手期限を過ぎた（更新手続に着手すべき） */
  | "start_due"
  /** 満了が近い（注意） */
  | "expiring"
  /** 期限切れ = 不適合 */
  | "expired"
  /** 期限を持たない証書（修了証など） */
  | "no_expiry"
  /** 有効期限が未登録 */
  | "unknown";

/** 鮮度の状態（12.4。期限とは独立に判定する） */
export type FreshnessState =
  /** 閾値内に確認済み */
  | "fresh"
  /** 閾値を超えた = 要再確認 */
  | "stale"
  /** 一度も確認していない */
  | "never";

export interface CredentialStatus {
  credential: CredentialPayload;
  expiry: ExpiryState;
  freshness: FreshnessState;
  /** 満了までの日数（負なら経過日数）。期限なし・未登録は null */
  daysToExpiry: number | null;
  /** 着手期限（YYYY-MM-DD）。期限なし・未登録は null */
  startOn: string | null;
  /** 着手期限までの日数 */
  daysToStart: number | null;
  /** 最終確認からの経過日数 */
  daysSinceVerified: number | null;
  /** 2段階アラートの色（3.2.5 と同じ語彙で画面に渡す） */
  level: CheckLevel;
  /** 利用者向けの一文（法令用語ではなく日常語） */
  message: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD の差（b - a、日数）。時刻・タイムゾーンの影響を受けないよう日付だけで計算する */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

/** YYYY-MM-DD に日数を足す */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * 鮮度の判定（12.4）。
 * lastVerifiedOn が無ければ "never"、閾値超過なら "stale"。
 */
export function freshnessOf(
  lastVerifiedOn: string | undefined,
  today: string,
  thresholdDays: number,
): { state: FreshnessState; daysSinceVerified: number | null } {
  if (!lastVerifiedOn) return { state: "never", daysSinceVerified: null };
  const elapsed = daysBetween(lastVerifiedOn, today);
  return { state: elapsed > thresholdDays ? "stale" : "fresh", daysSinceVerified: elapsed };
}

/**
 * 証書1件の状態を判定する。
 * 「期限切れ（不適合）」と「要再確認（鮮度切れ）」を別の軸として返す（12.4）。
 */
export function evaluateCredential(
  credential: CredentialPayload,
  today: string,
  ruleSet: CredentialRuleSet,
): CredentialStatus {
  const rule =
    ruleSet.values.byCategory[credential.category as CredentialCategory] ??
    ruleSet.values.byCategory.other;
  const freshnessDays = rule.freshnessDays ?? ruleSet.values.defaultFreshnessDays;
  const { state: freshness, daysSinceVerified } = freshnessOf(
    credential.lastVerifiedOn,
    today,
    freshnessDays,
  );

  let expiry: ExpiryState;
  let daysToExpiry: number | null = null;
  let startOn: string | null = null;
  let daysToStart: number | null = null;

  if (credential.revoked) {
    expiry = "expired";
  } else if (!credential.expiresOn) {
    expiry = rule.noExpiry ? "no_expiry" : "unknown";
  } else {
    daysToExpiry = daysBetween(today, credential.expiresOn);
    startOn = addDaysYmd(credential.expiresOn, -rule.leadTimeDays);
    daysToStart = daysBetween(today, startOn);
    if (daysToExpiry < 0) expiry = "expired";
    else if (daysToStart <= 0) expiry = "start_due";
    else if (daysToExpiry <= ruleSet.values.cautionDays) expiry = "expiring";
    else expiry = "valid";
  }

  // 2段階アラート（3.2.5 と同じ語彙）: 不適合＝警告(赤) / 着手期限・鮮度＝注意(黄)
  let level: CheckLevel = "ok";
  if (expiry === "expired") level = "violation";
  else if (expiry === "start_due" || expiry === "expiring" || expiry === "unknown") level = "caution";
  if (freshness !== "fresh" && level === "ok") level = "caution";

  return {
    credential,
    expiry,
    freshness,
    daysToExpiry,
    startOn,
    daysToStart,
    daysSinceVerified,
    level,
    message: describeCredential({ expiry, freshness, daysToExpiry, daysToStart, daysSinceVerified }),
  };
}

/** 判定結果を日常語の一文にする（画面に文言ロジックを散らさない） */
function describeCredential(s: {
  expiry: ExpiryState;
  freshness: FreshnessState;
  daysToExpiry: number | null;
  daysToStart: number | null;
  daysSinceVerified: number | null;
}): string {
  const parts: string[] = [];
  switch (s.expiry) {
    case "expired":
      parts.push(
        s.daysToExpiry === null
          ? "失効しています"
          : `期限が ${Math.abs(s.daysToExpiry)}日 過ぎています`,
      );
      break;
    case "start_due":
      parts.push(
        `更新の手続きを始める時期です（あと ${s.daysToExpiry}日 で期限。講習や検査の予約が要ります）`,
      );
      break;
    case "expiring":
      parts.push(`あと ${s.daysToExpiry}日 で期限です`);
      break;
    case "unknown":
      parts.push("有効期限が登録されていません");
      break;
    case "no_expiry":
      parts.push("期限のない証書です");
      break;
    default:
      if (s.daysToExpiry !== null) parts.push(`あと ${s.daysToExpiry}日 有効です`);
  }
  if (s.freshness === "never") parts.push("原本を一度も確認していません");
  else if (s.freshness === "stale")
    parts.push(`最後に確認してから ${s.daysSinceVerified}日 経ちました（要再確認）`);
  return parts.join("。");
}

/** 証書一覧の判定（有効なもののみ。失効・訂正済みは呼び出し側で latestBySupersedes 済みを渡す） */
export function evaluateCredentials(
  credentials: CredentialPayload[],
  today: string,
  ruleSet: CredentialRuleSet,
): CredentialStatus[] {
  return credentials
    .map((c) => evaluateCredential(c, today, ruleSet))
    .sort((a, b) => {
      const order: Record<CheckLevel, number> = { violation: 0, caution: 1, ok: 2 };
      if (order[a.level] !== order[b.level]) return order[a.level] - order[b.level];
      return (a.daysToExpiry ?? 99999) - (b.daysToExpiry ?? 99999);
    });
}
