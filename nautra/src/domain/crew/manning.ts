import type { CheckLevel } from "@/domain/labor-law/types";
import { INSURANCE_FRESHNESS_DAYS, type CredentialRuleSet } from "@/rules/credential-rules";
import type {
  CredentialCategory,
  CredentialPayload,
  CrewMasterPayload,
  InsuranceKind,
} from "@/sync-protocol/masters";
import { evaluateCredential, freshnessOf, type CredentialStatus } from "./freshness";

/**
 * 配乗可否の判定（要件定義書 3.1.2「配乗ブロック条件」）。
 *
 * **この関数が唯一の判定経路**である（12.3 単一実体の原則）:
 * - 3.1.4 船員カルテの「配乗可否ステータス」は入力項目ではなく、ここで算出する**導出値**
 * - 3.1.2 配乗計画ボードのブロック表示も同じ関数を使う
 * - 3.8.3⑥ 添付要件チェッカーは同じ素材（証書・保険）を届出の観点で判定する（filing/requirements.ts）
 * これらを二重に実装しない。
 *
 * ブロック条件（3.1.2）:
 *   免状期限切れ / 健康診断期限切れ / 基本訓練未修了（2026-02 以降の新規雇入）/
 *   保険加入未確認 / 直近の休息時間・労働時間の法定基準抵触
 *
 * 判定は「除外（block）」と「注意表示（warn）」を区別する。
 * 要件は「警告付きで除外・注意表示する」であり、黙って候補から消さない。
 */

/** ブロック事由の重み。block = 配乗不可 / warn = 注意（配乗はできるが確認が要る） */
export type ManningSeverity = "block" | "warn";

export interface ManningIssue {
  key: string;
  severity: ManningSeverity;
  /** 画面見出し用の短い名前 */
  label: string;
  /** 日常語の説明（なぜ止まっているか・何をすれば解けるか） */
  detail: string;
}

export type ManningStatus = "eligible" | "caution" | "blocked";

export interface ManningEligibility {
  crewMemberId: string;
  status: ManningStatus;
  issues: ManningIssue[];
  /** 2段階アラートの色（画面の表示語彙を労務判定と揃える） */
  level: CheckLevel;
  /** 参照した証書の判定結果（画面で内訳を出せるようにする） */
  credentialStatuses: CredentialStatus[];
}

/** 基本訓練の修了確認が雇入届出で求められるようになった日（船員法第81条の2等） */
export const STCW_BASIC_REQUIRED_FROM = "2026-02-14";

export interface ManningInput {
  crewMemberId: string;
  master?: CrewMasterPayload;
  /** その船員の有効な証書（latestBySupersedes 済み） */
  credentials: CredentialPayload[];
  /** 判定基準日 YYYY-MM-DD */
  today: string;
  ruleSet: CredentialRuleSet;
  /**
   * 直近の労務判定（3.1.2「直近の休息時間・労働時間の法定基準抵触」）。
   * 労務ドメインの判定結果を渡す（ここで労働時間を計算し直さない）。
   */
  laborLevel?: CheckLevel;
  laborNote?: string;
  /** 乗船予定日（新規雇入の判定に使う。省略時は today） */
  embarkOn?: string;
  /** 実技講習が必要な船員か（特定の船員のみ義務。3.9） */
  practicalTrainingRequired?: boolean;
}

const CATEGORY_LABEL: Partial<Record<CredentialCategory, string>> = {
  license: "海技免状",
  medical: "健康証明書",
  stcw_basic: "基本訓練修了証",
  stcw_practical: "実技講習修了証",
  radio_operator: "無線従事者資格",
  small_craft: "小型船舶操縦士免許",
  endorsement: "認定（航海当直部員等）",
};

const INSURANCE_LABEL: Record<InsuranceKind, string> = {
  seamen: "船員保険",
  workers_accident: "労災保険",
  employment: "雇用保険",
};

/**
 * 配乗可否を判定する。
 * 返り値の issues は「なぜ止まっているか」を日常語で説明し、画面はこれをそのまま出す。
 */
export function evaluateManningEligibility(input: ManningInput): ManningEligibility {
  const {
    crewMemberId,
    master,
    credentials,
    today,
    ruleSet,
    laborLevel,
    laborNote,
    embarkOn,
    practicalTrainingRequired,
  } = input;
  const issues: ManningIssue[] = [];
  const statuses = credentials.map((c) => evaluateCredential(c, today, ruleSet));

  /* ── ① 免状・健康証明書などの必須証書 ── */
  const requiredCategories: CredentialCategory[] = ["license", "medical", "stcw_basic"];
  if (practicalTrainingRequired) requiredCategories.push("stcw_practical");

  for (const category of requiredCategories) {
    const label = CATEGORY_LABEL[category] ?? category;
    const held = statuses.filter((s) => s.credential.category === category && !s.credential.revoked);

    // 基本訓練は 2026-02-14 以降の新規雇入で必須（それ以前の乗船中の船員は注意にとどめる）
    const effectiveOn = embarkOn ?? today;
    const stcwRequiredNow = effectiveOn >= STCW_BASIC_REQUIRED_FROM;

    if (held.length === 0) {
      const isBlocking =
        category === "stcw_basic" || category === "stcw_practical" ? stcwRequiredNow : true;
      issues.push({
        key: `missing_${category}`,
        severity: isBlocking ? "block" : "warn",
        label: `${label}が未登録`,
        detail:
          category === "stcw_basic"
            ? `${label}が登録されていません。2026年2月14日以降の雇入届出では修了確認が求められ、確認できないと届出が受理保留になります。`
            : `${label}が登録されていません。配乗の前に登録してください。`,
      });
      continue;
    }

    // 同じ区分を複数持つ場合は「最も状態の良いもの」で判定する（上級免状の併有など）
    const best = held.reduce((a, b) => (rank(a) <= rank(b) ? a : b));
    if (best.expiry === "expired") {
      issues.push({
        key: `expired_${category}`,
        severity: "block",
        label: `${label}の期限切れ`,
        detail: `${best.credential.name}: ${best.message}`,
      });
    } else if (best.expiry === "start_due" || best.expiry === "expiring") {
      issues.push({
        key: `expiring_${category}`,
        severity: "warn",
        label: `${label}の期限が近い`,
        detail: `${best.credential.name}: ${best.message}`,
      });
    }
    if (best.freshness !== "fresh") {
      issues.push({
        key: `stale_${category}`,
        severity: "warn",
        label: `${label}は要再確認`,
        detail: `${best.credential.name}: ${best.message} 原本を確認して確認日を更新してください。`,
      });
    }
  }

  /* ── ② 保険加入の確認（3.8.1: 未確認は届出の受理保留リスク） ── */
  const insurances = master?.insurances ?? [];
  for (const kind of ["seamen", "workers_accident", "employment"] as InsuranceKind[]) {
    const entry = insurances.find((i) => i.kind === kind);
    const label = INSURANCE_LABEL[kind];
    if (!entry || !entry.number) {
      issues.push({
        key: `insurance_missing_${kind}`,
        severity: "block",
        label: `${label}の加入が未確認`,
        detail: `${label}の加入が確認できません。確認できないまま届け出ると受理が保留されることがあります。`,
      });
      continue;
    }
    const { state, daysSinceVerified } = freshnessOf(
      entry.lastVerifiedOn,
      today,
      INSURANCE_FRESHNESS_DAYS,
    );
    if (state !== "fresh") {
      issues.push({
        key: `insurance_stale_${kind}`,
        severity: "warn",
        label: `${label}は要再確認`,
        detail:
          state === "never"
            ? `${label}の加入を一度も確認していません。`
            : `${label}の加入確認から ${daysSinceVerified}日 経ちました（要再確認）。`,
      });
    }
  }

  /* ── ③ 直近の労働時間・休息時間（労務ドメインの判定結果を受け取る） ── */
  if (laborLevel === "violation") {
    issues.push({
      key: "labor_violation",
      severity: "block",
      label: "直近の労働時間・休息が基準を外れている",
      detail: laborNote ?? "直近の記録に基準超過があります。解消してから配乗してください。",
    });
  } else if (laborLevel === "caution") {
    issues.push({
      key: "labor_caution",
      severity: "warn",
      label: "直近の労働時間が上限に近い",
      detail: laborNote ?? "直近の記録が上限に近づいています。配乗の前に確認してください。",
    });
  }

  /* ── ④ 退職・登録抹消 ── */
  if (master?.retiredOn && master.retiredOn <= today) {
    issues.push({
      key: "retired",
      severity: "block",
      label: "在籍していません",
      detail: `${master.retiredOn} に退職・登録抹消となっています。`,
    });
  }

  const hasBlock = issues.some((i) => i.severity === "block");
  const status: ManningStatus = hasBlock ? "blocked" : issues.length > 0 ? "caution" : "eligible";
  return {
    crewMemberId,
    status,
    issues,
    level: hasBlock ? "violation" : issues.length > 0 ? "caution" : "ok",
    credentialStatuses: statuses,
  };
}

/** 状態の良さ（小さいほど良い）。同区分の証書から代表を選ぶために使う */
function rank(s: CredentialStatus): number {
  const order: Record<string, number> = {
    valid: 0,
    no_expiry: 1,
    expiring: 2,
    start_due: 3,
    unknown: 4,
    expired: 5,
  };
  return order[s.expiry] ?? 9;
}

/** 配乗可否の表示ラベル（画面に文言ロジックを散らさない） */
export function manningStatusLabel(status: ManningStatus): string {
  if (status === "eligible") return "配乗できます";
  if (status === "caution") return "確認してから配乗";
  return "配乗できません";
}
