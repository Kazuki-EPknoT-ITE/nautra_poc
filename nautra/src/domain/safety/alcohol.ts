/**
 * packages/domain/safety 相当。アルコール検知の適否判定（純関数）。
 * 基準値は rule_sets（src/rules/safety-rules.ts）から引数で受け取り、内部に定数を持たない
 * （ガードレール⑪ と同じ扱い）。
 */
export type AlcoholResult = "pass" | "fail";

/** 呼気中アルコール濃度（mg/L）が基準値以上なら乗務不可 */
export function judgeAlcohol(valueMgPerL: number, limitMgPerL: number): AlcoholResult {
  return valueMgPerL >= limitMgPerL ? "fail" : "pass";
}
