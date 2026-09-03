/**
 * 運用構成の選択肢（要件定義書 3.2.1 打刻認証 / 10.5 段階的実装・代替構成）。
 *
 * どちらも「事業者ごとに運用が違う」ことを前提にした**設定**であり、
 * コードの分岐ではなくデータとして持つ。テナント設定（S-15）から選ぶ。
 */

/* ═══════════ 3.2.1 打刻認証の方式 ═══════════
 *
 *   「打刻認証は運用に応じ選択可能（認証なし＋打刻者表示 / IC カード / 生体 / パスワード）」
 *
 * 共用端末の1台運用から個人端末まで、船によって現実的な方式が違う。
 * どれを選んでも **打刻者が記録に残る**ことは共通で、そこは方式で変えない。
 */

export type PunchAuthMethodId = "display_only" | "pin" | "ic_card" | "biometric";

export interface PunchAuthMethod {
  id: PunchAuthMethodId;
  label: string;
  /** どういう船に向くか */
  suitedFor: string;
  /** 強度（弱い順）。運用の説明に使う */
  strength: "low" | "medium" | "high";
  /** 追加のハードウェアが要るか */
  needsHardware: boolean;
  /** PoC で動くか（動かないものは本番実装の予定として明示する） */
  availableInPoc: boolean;
  note: string;
}

export const PUNCH_AUTH_METHODS: PunchAuthMethod[] = [
  {
    id: "display_only",
    label: "認証なし（打刻者を選んで表示）",
    suitedFor: "少人数で顔が見える船。取り違えより手数の少なさを優先する場合",
    strength: "low",
    needsHardware: false,
    availableInPoc: true,
    note: "打刻者を一覧から選ぶだけ。誰の記録かは残るが、本人であることの確認はしない。",
  },
  {
    id: "pin",
    label: "PIN（暗証番号）",
    suitedFor: "共用端末を複数名で使う船。追加の機材が要らない",
    strength: "medium",
    needsHardware: false,
    availableInPoc: true,
    note: "顔写真の一覧から本人を選び、4桁の PIN を入れる。PoC はこの方式で動作する。",
  },
  {
    id: "ic_card",
    label: "IC カード",
    suitedFor: "手袋のまま素早く打刻したい船。乗下船の入退でカードを使っている場合",
    strength: "medium",
    needsHardware: true,
    availableInPoc: false,
    note: "カードリーダー（NFC）が要る。本番では WebNFC / 専用リーダーのアダプタとして実装する。",
  },
  {
    id: "biometric",
    label: "生体認証（指紋・顔）",
    suitedFor: "取り違えを確実に防ぎたい運用",
    strength: "high",
    needsHardware: true,
    availableInPoc: false,
    note:
      "端末の生体認証（WebAuthn / プラットフォーム認証器）を使う。生体情報は端末内に留まり、" +
      "サーバへは送らない（個人情報保護法上の要配慮情報を持たない設計）。",
  },
];

export const DEFAULT_PUNCH_AUTH_METHOD: PunchAuthMethodId = "pin";

export function punchAuthMethod(id: string | undefined | null): PunchAuthMethod {
  return (
    PUNCH_AUTH_METHODS.find((m) => m.id === id) ??
    PUNCH_AUTH_METHODS.find((m) => m.id === DEFAULT_PUNCH_AUTH_METHOD)!
  );
}

/* ═══════════ 10.5 段階的実装・代替構成（縮退構成） ═══════════
 *
 *   「必須（法令直結）機能と任意（効率化）機能を区分し、事業者の習熟度に応じて
 *    段階導入できること」
 *   「国交省要件定義書 第5章の代替構成案（**打刻のみ＋記録簿ファイル運用**、
 *    **船内管理者機能を陸上側に統合** 等）に相当する縮退構成をサポートし、導入費用を抑えられること」
 *
 * ここでは「どの機能群を有効にするか」の束を定義する。
 * 機能群は**法令直結（必須）**と**効率化（任意）**に分けてあり、
 * 縮退構成でも必須の機能群は必ず含まれる。
 */

export type FeatureGroupId =
  | "punch" // 打刻・労働時間
  | "ledger" // 労務管理記録簿
  | "onboard_approval" // 船内承認（船長）
  | "vessel_records" // 航海日誌・点検・作業記録
  | "shift" // 当直・配置表
  | "crew_master" // 船員マスタ・資格管理
  | "filing" // 一括届出
  | "procedures" // 手続き・期限管理
  | "training" // 訓練管理
  | "fleet" // 船舶保守・検査
  | "dispatch" // 配船・位置情報
  | "office" // 傭船・請求・経理
  | "evaluation" // 人事考課
  | "wellbeing"; // 健康・相談

export interface FeatureGroup {
  id: FeatureGroupId;
  label: string;
  /** 法令に直結する必須機能か（要件定義書 10.5 の区分） */
  required: boolean;
  basis: string;
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  { id: "punch", label: "打刻・労働時間", required: true, basis: "船員法第67条の2（客観的な方法による把握）" },
  { id: "ledger", label: "労務管理記録簿", required: true, basis: "船員法第67条・第16号の5書式" },
  { id: "onboard_approval", label: "船内承認（船長）", required: false, basis: "運用上の確認。陸上に統合可" },
  { id: "vessel_records", label: "航海日誌・点検・作業記録", required: true, basis: "船員法・船舶安全法に基づく記録" },
  { id: "shift", label: "当直・配置表", required: false, basis: "運用の効率化" },
  { id: "crew_master", label: "船員マスタ・資格管理", required: true, basis: "船舶職員法（配乗要件）・船員法第81条の2" },
  { id: "filing", label: "一括届出", required: true, basis: "船員法第37条（雇入契約成立等の届出）" },
  { id: "procedures", label: "手続き・期限管理", required: false, basis: "失念防止（効率化）" },
  { id: "training", label: "訓練管理", required: true, basis: "船員法第81条の2等（基本訓練。2026-02-14 施行）" },
  { id: "fleet", label: "船舶保守・検査", required: false, basis: "効率化" },
  { id: "dispatch", label: "配船・位置情報", required: false, basis: "効率化" },
  { id: "office", label: "傭船・請求・経理", required: false, basis: "効率化" },
  { id: "evaluation", label: "人事考課", required: false, basis: "効率化（法令要件ではない）" },
  { id: "wellbeing", label: "健康・相談", required: false, basis: "船員法（健康確保措置）の補助。努力義務" },
];

export type DeploymentTierId = "minimal" | "standard" | "full";

export interface DeploymentTier {
  id: DeploymentTierId;
  label: string;
  description: string;
  /** この構成で有効になる機能群 */
  features: FeatureGroupId[];
  /** 国交省要件定義書 第5章 代替構成案との対応 */
  note: string;
}

export const DEPLOYMENT_TIERS: DeploymentTier[] = [
  {
    id: "minimal",
    label: "最小構成（打刻＋記録簿）",
    description:
      "法令に直結する最小限だけを入れる。船内は打刻に専念し、承認と記録簿の管理は陸上で行う。",
    features: ["punch", "ledger", "crew_master", "filing", "training", "vessel_records"],
    note:
      "国交省要件定義書 第5章の代替構成案「打刻のみ＋記録簿ファイル運用」「船内管理者機能を" +
      "陸上側に統合」に相当。船内承認（船長）を外し、陸上の労務管理責任者が承認する運用にする。",
  },
  {
    id: "standard",
    label: "標準構成",
    description: "船内の記録・当直と、陸上の労務・届出・手続きまでを一通り使う。",
    features: [
      "punch",
      "ledger",
      "onboard_approval",
      "vessel_records",
      "shift",
      "crew_master",
      "filing",
      "procedures",
      "training",
      "fleet",
    ],
    note: "多くの内航事業者が最初に到達する構成。効率化の中核（届出・期限管理）まで含む。",
  },
  {
    id: "full",
    label: "全機能",
    description: "配船・経理・人事考課・健康相談まで含めた全機能。",
    features: FEATURE_GROUPS.map((f) => f.id),
    note: "複数隻を保有し、陸上に複数名の担当がいる事業者向け。",
  },
];

export const DEFAULT_DEPLOYMENT_TIER: DeploymentTierId = "full";

export function deploymentTier(id: string | undefined | null): DeploymentTier {
  return (
    DEPLOYMENT_TIERS.find((t) => t.id === id) ??
    DEPLOYMENT_TIERS.find((t) => t.id === DEFAULT_DEPLOYMENT_TIER)!
  );
}

/** 構成に含まれない機能群を求める（画面の出し分け・導入見積りの説明に使う） */
export function disabledFeatures(tierId: DeploymentTierId): FeatureGroup[] {
  const enabled = new Set(deploymentTier(tierId).features);
  return FEATURE_GROUPS.filter((f) => !enabled.has(f.id));
}
