import type { CredentialCategory } from "@/sync-protocol/masters";

/**
 * 資格・証書の期限／鮮度に関するルール（rule_sets の「証書」カテゴリ相当。PoC 既定値）。
 *
 * 要件定義書 6.5「期限管理・アラート」と 6.6②「期限は提出期限でなく**着手期限**で管理」に対応する。
 * 免状更新は講習・身体検査の段取りが要るため、満了日アラートでは遅い。
 * 各証書に**準備リードタイム**を持たせ、着手期限（= 満了日 − リードタイム）で発報する。
 *
 * 12.4 鮮度管理: 外部に正本があるデータは、有効期限とは別に「最終確認日」を持ち、
 * 一定期間（既定 180 日）確認がないものを「要再確認」として**不適合とは区別して**警告する。
 *
 * ⚠ 各リードタイム・鮮度閾値の根拠（省令・運用）は人間レビュー必須領域（基本設計書 13.7）。
 */

export interface CredentialCategoryRule {
  /** 準備リードタイム（日）。着手期限 = 満了日 − この日数 */
  leadTimeDays: number;
  /** 鮮度閾値（日）。最終確認日からこの日数を超えたら「要再確認」 */
  freshnessDays: number;
  /** 配乗・雇入届出の必須要件か（欠けると配乗ブロック／届出の受理保留リスク） */
  requiredForEmbarkation: boolean;
  /** 期限を持たない証書（修了証など）。期限判定を行わない */
  noExpiry?: boolean;
  /** 根拠・補足 */
  basis: string;
}

export interface CredentialRuleSet {
  id: string;
  version: string;
  source: string;
  effectiveFrom: string;
  values: {
    /** 既定の鮮度閾値（12.4「既定：180日。項目ごとに設定可能」） */
    defaultFreshnessDays: number;
    /** 満了までこの日数を切ったら「注意（黄）」。着手期限を過ぎたら「警告（赤）」 */
    cautionDays: number;
    byCategory: Record<CredentialCategory, CredentialCategoryRule>;
  };
}

export const DEFAULT_CREDENTIAL_RULE_SET: CredentialRuleSet = {
  id: "ruleset-credential-2026-04",
  version: "2026-04.1",
  source:
    "船舶職員及び小型船舶操縦者法（免状更新5年・1年前申請可）/ 船員法施行規則（健康証明書）/ " +
    "船員法第81条の2等（基本訓練・実技講習）/ 電波法（無線局免許5年）/ 船舶安全法（検査証書）",
  effectiveFrom: "2026-04-01",
  values: {
    defaultFreshnessDays: 180,
    cautionDays: 60,
    byCategory: {
      license: {
        // 海技免状: 5年ごとの更新。更新講習・身体検査の段取りに時間が要るため1年前から着手
        leadTimeDays: 365,
        freshnessDays: 180,
        requiredForEmbarkation: true,
        basis: "海技免状（5年更新・1年前から更新申請可）",
      },
      small_craft: {
        leadTimeDays: 365,
        freshnessDays: 180,
        requiredForEmbarkation: false,
        basis: "小型船舶操縦士免許（5年更新）",
      },
      radio_operator: {
        leadTimeDays: 60,
        freshnessDays: 180,
        requiredForEmbarkation: false,
        noExpiry: true,
        basis: "無線従事者資格（終身。第二級海上特殊無線技士以上）",
      },
      medical: {
        // 健康証明書: 1年（色覚は6年）。受診予約から交付まで数週間を見込む
        leadTimeDays: 60,
        freshnessDays: 180,
        requiredForEmbarkation: true,
        basis: "健康証明書（1年 / 色覚6年）",
      },
      stcw_basic: {
        // 2026-02-14 以降、雇入契約成立の届出時に修了確認が必要（未確認は受理保留リスク）
        leadTimeDays: 90,
        freshnessDays: 180,
        requiredForEmbarkation: true,
        noExpiry: true,
        basis: "STCW 基本訓練修了証（船員法第81条の2等。2026-02-14 施行）",
      },
      stcw_practical: {
        leadTimeDays: 90,
        freshnessDays: 180,
        requiredForEmbarkation: true,
        noExpiry: true,
        basis: "登録実技講習（生存・消火）修了証。特定の船員に義務",
      },
      endorsement: {
        leadTimeDays: 60,
        freshnessDays: 180,
        requiredForEmbarkation: false,
        noExpiry: true,
        basis: "航海当直部員・危険物等取扱責任者・特定海域運航責任者の認定（2026-04-01 施行の認定方法拡大）",
      },
      vessel_survey: {
        // 船舶検査証書: 定期・中間検査の手配と入渠調整に時間が要る
        leadTimeDays: 120,
        freshnessDays: 365,
        requiredForEmbarkation: false,
        basis: "船舶検査証書（定期検査・中間検査）",
      },
      radio_station: {
        leadTimeDays: 90,
        freshnessDays: 365,
        requiredForEmbarkation: false,
        basis: "無線局免許（5年）",
      },
      other: {
        leadTimeDays: 30,
        freshnessDays: 180,
        requiredForEmbarkation: false,
        basis: "その他の証書",
      },
    },
  },
};

/** 保険の加入確認（3.8.1 / 12.2）。正本は外部機関にあり、鮮度管理の対象 */
export const INSURANCE_FRESHNESS_DAYS = 180;
