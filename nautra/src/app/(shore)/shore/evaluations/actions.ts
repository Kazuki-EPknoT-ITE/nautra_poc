"use server";

import { revalidatePath } from "next/cache";
import { publishEvaluation } from "@/server/evaluation-service";
import { requireShore } from "@/server/shore-session";
import { EVALUATION_ITEMS } from "@/sync-protocol/masters";

export interface EvaluationFormState {
  ok: boolean;
  message: string;
}

/**
 * S-13: 人事考課の記入・訂正（Server Action）。
 * 画面を隠すだけでは足りないため、ここでも権限を再確認する（10.3）。
 */
export async function saveEvaluationAction(
  _prev: EvaluationFormState,
  formData: FormData,
): Promise<EvaluationFormState> {
  const guard = await requireShore("edit_evaluation");
  if (!guard.ok) {
    return { ok: false, message: "人事考課を記入する権限がありません（担当者を切り替えてください）" };
  }
  try {
    const scores: Record<string, number> = {};
    for (const key of EVALUATION_ITEMS) {
      scores[key] = Number(formData.get(`score_${key}`) ?? Number.NaN);
    }
    const supersedesId = String(formData.get("supersedesId") ?? "").trim();
    const published = publishEvaluation(
      {
        crewMemberId: String(formData.get("crewMemberId") ?? ""),
        periodFrom: String(formData.get("periodFrom") ?? ""),
        periodTo: String(formData.get("periodTo") ?? ""),
        scores,
        comment: String(formData.get("comment") ?? ""),
        evaluatedBy: String(formData.get("evaluatedBy") ?? ""),
        disclosedToCrew: formData.get("disclosedToCrew") === "on",
        supersedesId: supersedesId || undefined,
      },
      guard.staff.id,
    );
    revalidatePath("/shore/evaluations");
    return {
      ok: true,
      message: `${supersedesId ? "訂正" : "記入"}しました（本人開示: ${
        published.disclosedToCrew ? "する" : "しない"
      }）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
