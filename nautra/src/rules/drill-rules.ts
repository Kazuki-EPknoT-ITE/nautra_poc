import type { DrillType } from "@/sync-protocol/records";

/**
 * 船内操練の実施間隔ルール（rule_sets の「訓練」カテゴリ相当。PoC 既定値）。
 *
 * 要件定義書 3.9 主要機能③「船内操練の実施記録（3.3.2と連携）と**次回期日管理**」に対応する。
 * 9章「操練（訓練）実施記録 — 船内操練の法定記録」も同じ基準で期日を導く。
 *
 * 閾値をドメイン関数や画面の定数として持たない（ガードレール③）。判定関数
 * （src/domain/training/drills.ts）は本ルールセットを**引数で受け取り**、判定結果には
 * 適用した版（id / version）を記録する（基本設計書 5.3(6) applied_rule_version）。
 *
 * ⚠ **人間レビュー必須**（基本設計書 13.7）。
 *   PoC の既定値「3か月（92日）ごと」は仮置きである。実際の実施間隔は船舶の用途・航行区域・
 *   国際航海の有無（SOLAS 第III章の月次／週次要件、船員法・船員労働安全衛生規則、事業者の
 *   安全管理規程）で異なる。採用時は管轄運輸局・安全管理規程の条項を確認し、根拠を ADR に
 *   併記したうえで種別ごとの日数を確定すること。
 */

export interface DrillRuleValues {
  /** 種別ごとの実施間隔（日）。次回期日 = 最終実施日 + この日数 */
  intervalDaysByType: Record<DrillType, number>;
  /** 次回期日までこの日数を切ったら「まもなく期日」（注意）とする */
  cautionDays: number;
  /** 一度も実施していない種別の扱い。true なら「未実施」を警告として扱う */
  treatNeverDoneAsOverdue: boolean;
}

export interface DrillRuleSet {
  id: string;
  version: string;
  source: string;
  effectiveFrom: string;
  values: DrillRuleValues;
}

/** PoC 既定値: どの種別も3か月（92日）ごと。根拠は上記のとおり人間レビュー必須 */
export const DEFAULT_DRILL_RULE_SET: DrillRuleSet = {
  id: "ruleset-drill-2026-04",
  version: "2026-04.1",
  source:
    "事業者 安全管理規程（PoC 既定値・根拠条項は採用時に確定）/ 船員法・船員労働安全衛生規則 / " +
    "SOLAS 第III章（国際航海船の操練要件）。PoC は一律「3か月ごと」を仮置きする",
  effectiveFrom: "2026-04-01",
  values: {
    intervalDaysByType: {
      fire: 92,
      abandon_ship: 92,
      man_overboard: 92,
      emergency_steering: 92,
      oil_spill: 92,
      other: 92,
    },
    cautionDays: 14,
    treatNeverDoneAsOverdue: true,
  },
};
