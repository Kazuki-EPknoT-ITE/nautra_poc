import type { LaborRuleSet } from "@/domain/labor-law/types";

/**
 * rule_sets / rule_values（基本設計書 5.3(6)）の PoC 表現。
 * 本番では有効期間（effective_from/to）つきの定義テーブルから取得し、
 * 法改正・労使協定の改定は本定義の版追加で行う（コード変更・再デプロイ不要）。
 * ドメイン判定関数はこの値を引数で受け取り、内部に法令定数を持たない（ガードレール⑪）。
 * 閾値の変更は人間レビュー必須領域（基本設計書 13.7）。
 */
export const DEFAULT_LABOR_RULE_SET: LaborRuleSet = {
  id: "ruleset-law-2026-04",
  version: "2026-04.1",
  source:
    "船員法 労働時間規制（上限 日14h/週72h）・休息要件（PoC 既定値。労使協定により変動）",
  effectiveFrom: "2026-04-01",
  values: {
    dailyMaxMinutes: 14 * 60,
    weeklyMaxMinutes: 72 * 60,
    restMinDailyMinutes: 10 * 60,
    restLongestMinMinutes: 6 * 60,
    restSplitMax: 2,
    cautionRatio: 0.9,
  },
};
