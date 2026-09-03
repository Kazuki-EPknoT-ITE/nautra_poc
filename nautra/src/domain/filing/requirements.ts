import { evaluateCredential, freshnessOf } from "@/domain/crew/freshness";
import { STCW_BASIC_REQUIRED_FROM } from "@/domain/crew/manning";
import type { CheckLevel } from "@/domain/labor-law/types";
import { INSURANCE_FRESHNESS_DAYS, type CredentialRuleSet } from "@/rules/credential-rules";
import type {
  CredentialCategory,
  CredentialPayload,
  CrewMasterPayload,
  FilingType,
  InsuranceKind,
} from "@/sync-protocol/masters";

/**
 * 添付要件チェッカー（要件定義書 3.8.3 実装機能⑥）。
 *
 *   「保険加入確認・基本訓練修了証・海技免状の有効性を届出前に自動検証し、不備を警告する」
 *
 * 12.4 の要請により、**3つの状態を区別**して返す:
 *   - `ok`       … 有効期限内かつ最終確認日も新しい
 *   - `recheck`  … 有効期限内だが最終確認日が閾値超過 = **要再確認**（不適合ではない）
 *   - `ng`       … 期限切れ・未登録 = **不適合**（このまま届け出ると受理保留のリスク）
 *
 * 判定は配乗ブロック条件（domain/crew/manning.ts）と同じ素材を使うが、観点が異なる
 * （配乗は「乗せてよいか」、ここは「届出が受理されるか」）。素材の判定関数は共用する。
 */

export type RequirementState = "ok" | "recheck" | "ng";

export interface RequirementItem {
  key: string;
  label: string;
  state: RequirementState;
  detail: string;
  /** 参照した証書（画面から原本確認へ誘導するため） */
  credentialId?: string;
}

export interface CrewRequirementResult {
  crewMemberId: string;
  crewName: string;
  items: RequirementItem[];
  /** そのまま届け出られるか（ng が1件でもあれば false） */
  submittable: boolean;
  /** 要再確認が1件でもあるか */
  hasRecheck: boolean;
  level: CheckLevel;
}

export interface FilingCheckResult {
  results: CrewRequirementResult[];
  /** 全対象が届出可能か */
  submittable: boolean;
  ngCount: number;
  recheckCount: number;
}

const INSURANCE_LABEL: Record<InsuranceKind, string> = {
  seamen: "船員保険",
  workers_accident: "労災保険",
  employment: "雇用保険",
};

export interface FilingCheckTarget {
  crewMemberId: string;
  crewName: string;
  /** 効力発生日（乗船日・下船日）。基本訓練の要否判定に使う */
  effectiveOn: string;
  master?: CrewMasterPayload;
  credentials: CredentialPayload[];
  /** 実技講習が必要な船員か（特定の船員のみ義務） */
  practicalTrainingRequired?: boolean;
}

/**
 * 届出の添付要件を検証する。
 *
 * 雇止（discharge）は乗船に必要な資格の検証を要さないため、
 * 検証対象を届出種別で切り替える（不要な警告で作業を止めない）。
 */
export function checkFilingRequirements(params: {
  filingType: FilingType;
  targets: FilingCheckTarget[];
  today: string;
  ruleSet: CredentialRuleSet;
}): FilingCheckResult {
  const { filingType, targets, today, ruleSet } = params;
  const needsCredentials = filingType !== "discharge";

  const results = targets.map((t) => {
    const items: RequirementItem[] = [];

    /* ── 船員手帳番号（届出書・海員名簿の必須項目） ── */
    if (!t.master?.seamanBookNo) {
      items.push({
        key: "seaman_book",
        label: "船員手帳番号",
        state: "ng",
        detail: "船員手帳番号が登録されていません。届出書に転記できません。",
      });
    } else {
      items.push({
        key: "seaman_book",
        label: "船員手帳番号",
        state: "ok",
        detail: t.master.seamanBookNo,
      });
    }

    if (needsCredentials) {
      const required: { category: CredentialCategory; label: string; blockingFrom?: string }[] = [
        { category: "license", label: "海技免状" },
        { category: "medical", label: "健康証明書" },
        { category: "stcw_basic", label: "基本訓練修了証", blockingFrom: STCW_BASIC_REQUIRED_FROM },
      ];
      if (t.practicalTrainingRequired) {
        required.push({
          category: "stcw_practical",
          label: "実技講習修了証",
          blockingFrom: STCW_BASIC_REQUIRED_FROM,
        });
      }

      for (const req of required) {
        const held = t.credentials.filter(
          (c) => c.category === req.category && !c.revoked,
        );
        // 施行日前の届出では基本訓練は不備扱いにしない（過剰な警告を出さない）
        const isBlocking = req.blockingFrom ? t.effectiveOn >= req.blockingFrom : true;
        if (held.length === 0) {
          items.push({
            key: req.category,
            label: req.label,
            state: isBlocking ? "ng" : "recheck",
            detail: isBlocking
              ? `${req.label}が登録されていません。提示できないと届出の受理が保留されることがあります。`
              : `${req.label}が未登録です（この効力発生日では必須ではありません）。`,
          });
          continue;
        }
        const statuses = held.map((c) => evaluateCredential(c, today, ruleSet));
        const best = statuses.reduce((a, b) => (stateRank(a.expiry) <= stateRank(b.expiry) ? a : b));
        if (best.expiry === "expired") {
          items.push({
            key: req.category,
            label: req.label,
            state: "ng",
            detail: `${best.credential.name}: ${best.message}`,
            credentialId: best.credential.id,
          });
        } else if (best.freshness !== "fresh") {
          // 12.4: 有効期限内でも最終確認日が古いものは「要再確認」（不適合とは区別する）
          items.push({
            key: req.category,
            label: req.label,
            state: "recheck",
            detail: `${best.credential.name}: ${best.message}`,
            credentialId: best.credential.id,
          });
        } else {
          items.push({
            key: req.category,
            label: req.label,
            state: "ok",
            detail: `${best.credential.name}${best.credential.expiresOn ? `（${best.credential.expiresOn} まで）` : ""}`,
            credentialId: best.credential.id,
          });
        }
      }
    }

    /* ── 保険加入の確認（平成22年6月〜。未確認は受理保留のリスク） ── */
    const insurances = t.master?.insurances ?? [];
    for (const kind of ["seamen", "workers_accident", "employment"] as InsuranceKind[]) {
      const entry = insurances.find((i) => i.kind === kind);
      const label = INSURANCE_LABEL[kind];
      if (!entry?.number) {
        items.push({
          key: `insurance_${kind}`,
          label,
          state: "ng",
          detail: `${label}の加入が確認できません（記号番号が未登録）。`,
        });
        continue;
      }
      const { state, daysSinceVerified } = freshnessOf(
        entry.lastVerifiedOn,
        today,
        INSURANCE_FRESHNESS_DAYS,
      );
      items.push({
        key: `insurance_${kind}`,
        label,
        state: state === "fresh" ? "ok" : "recheck",
        detail:
          state === "fresh"
            ? `${entry.number}（${entry.lastVerifiedOn} 確認）`
            : state === "never"
              ? `${label}の加入を一度も確認していません。`
              : `確認から ${daysSinceVerified}日 経過（要再確認）。`,
      });
    }

    const ng = items.some((i) => i.state === "ng");
    const recheck = items.some((i) => i.state === "recheck");
    return {
      crewMemberId: t.crewMemberId,
      crewName: t.crewName,
      items,
      submittable: !ng,
      hasRecheck: recheck,
      level: (ng ? "violation" : recheck ? "caution" : "ok") as CheckLevel,
    };
  });

  return {
    results,
    submittable: results.every((r) => r.submittable),
    ngCount: results.reduce((a, r) => a + r.items.filter((i) => i.state === "ng").length, 0),
    recheckCount: results.reduce((a, r) => a + r.items.filter((i) => i.state === "recheck").length, 0),
  };
}

function stateRank(e: string): number {
  const order: Record<string, number> = {
    valid: 0,
    no_expiry: 1,
    expiring: 2,
    start_due: 3,
    unknown: 4,
    expired: 5,
  };
  return order[e] ?? 9;
}

export const REQUIREMENT_STATE_LABEL: Record<RequirementState, string> = {
  ok: "適合",
  recheck: "要再確認",
  ng: "不適合",
};
