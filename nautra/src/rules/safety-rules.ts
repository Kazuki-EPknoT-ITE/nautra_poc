/**
 * 船内安全運用の基準値（rule_sets の「安全管理」カテゴリ相当。PoC 既定値）。
 * 本番では事業者の安全管理規程・労使協定に基づき rule_sets から供給し、判定関数は引数で受け取る
 * （ガードレール⑪ と同じ扱い。閾値変更は人間レビュー必須領域 13.7）。
 */
export const DEFAULT_SAFETY_RULE_SET = {
  id: "ruleset-safety-2026-04",
  version: "2026-04.1",
  source: "事業者 安全管理規程（PoC 既定値）。アルコール検知の基準値は規程に従い設定する",
  values: {
    /** 呼気中アルコール濃度の乗務可否基準（mg/L）。この値以上は乗務不可 */
    alcoholLimitMgPerL: 0.15,
  },
} as const;

export function judgeAlcohol(valueMgPerL: number, limitMgPerL: number): "pass" | "fail" {
  return valueMgPerL >= limitMgPerL ? "fail" : "pass";
}
