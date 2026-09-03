/**
 * 陸上事務・健康相談窓口の運用しきい値（rule_sets 相当。PoC 既定値）。
 *
 * 要件定義書 3.6.1（契約情報・期限管理）/ 3.6.2（まるめ時間設定による給与連携）/
 * 3.5.3（求人情報の的確表示＝最新性の維持）に対応する。
 *
 * ガードレール③のとおり、判定に使う数値は画面やサービスに直書きせず、ここから注入する。
 * 法令そのものの数値ではなく**事業者の運用設定**にあたる値だが、
 * 「どこを見れば変えられるか」を1か所に集約する意図は労働時間ルールセットと同じ。
 * 本番は事業者ごとの設定テーブル（有効期間つき）から取得する。
 */

export type PayrollRoundingMode = "floor" | "ceil" | "nearest";

export interface OfficeRuleSet {
  id: string;
  version: string;
  source: string;
  effectiveFrom: string;
  values: {
    /** 傭船契約の満了までこの日数を切ったら「期限が近い」として知らせる（3.6.1） */
    charterExpiryCautionDays: number;
    /** 請求の支払期限までこの日数を切ったら「入金予定日が近い」として知らせる（3.6.1） */
    invoiceDueCautionDays: number;
    /** 給与連携のまるめ単位（分）。船員給与の時間外は打刻からこの単位でまるめる（3.6.2） */
    payrollRoundingUnitMinutes: number;
    /**
     * まるめ方。既定は四捨五入（nearest）。
     * 切り捨て一辺倒は実働に対する賃金の目減りにつながるため既定にしない。
     */
    payrollRoundingMode: PayrollRoundingMode;
    /**
     * 船内環境（Wi-Fi・居室・設備）の確認日がこの日数より古ければ「要再確認」。
     * 船員職業安定法の求人情報の的確表示義務は**最新性の維持**を求めるため（3.5.3）。
     */
    jobPostingFreshnessDays: number;
    /**
     * 健康アンケート・ストレスチェックの集計を表示する最小回答数。
     * 回答が少ないと集計から個人が推測できてしまうため、これを下回る場合は集計を出さない
     * （3.5.3 匿名が原則 / 10.3 要配慮個人情報の保護）。
     */
    wellbeingMinResponses: number;
  };
}

export const DEFAULT_OFFICE_RULE_SET: OfficeRuleSet = {
  id: "ruleset-office-2026-04",
  version: "2026-04.1",
  source:
    "事業者の運用設定（PoC 既定値）。内航海運業法（傭船契約）/ 船員法・労使協定（給与のまるめ）/ " +
    "船員職業安定法（求人情報の的確表示）/ 個人情報保護法（匿名集計の下限）",
  effectiveFrom: "2026-04-01",
  values: {
    charterExpiryCautionDays: 60,
    invoiceDueCautionDays: 7,
    payrollRoundingUnitMinutes: 15,
    payrollRoundingMode: "nearest",
    jobPostingFreshnessDays: 180,
    wellbeingMinResponses: 3,
  },
};
