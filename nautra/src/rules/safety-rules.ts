/**
 * 船内安全運用の基準値（rule_sets の「安全管理」カテゴリ相当。PoC 既定値）。
 * 本番では事業者の安全管理規程・労使協定に基づき rule_sets（有効期間つき）から供給し、
 * 判定関数（src/domain/safety）は引数で受け取る（ガードレール⑪ と同じ扱い）。
 * 判定結果には適用した版（appliedRuleSetId / appliedRuleVersion）を記録する（基本設計書 5.3(6)）。
 *
 * ⚠ 基準値の根拠（規程の条項・施行日）は人間レビュー必須領域（基本設計書 13.7）。
 *   PoC 既定値 0.15 mg/L は仮置きであり、採用時は ADR に根拠を併記すること。
 */
export const DEFAULT_SAFETY_RULE_SET = {
  id: "ruleset-safety-2026-04",
  version: "2026-04.1",
  source: "事業者 安全管理規程（PoC 既定値・根拠条項は採用時に確定）。アルコール検知の基準値",
  effectiveFrom: "2026-04-01",
  values: {
    /** 呼気中アルコール濃度の乗務可否基準（mg/L）。この値以上は乗務不可 */
    alcoholLimitMgPerL: 0.15,
  },
} as const;
