"use server";

import { revalidatePath } from "next/cache";
import { requireShore } from "@/server/shore-session";
import { markConsultationReceived, respondToConsultation } from "@/server/wellbeing-service";

export interface WellbeingFormState {
  ok: boolean;
  message: string;
}

const DENIED: WellbeingFormState = {
  ok: false,
  message: "健康・相談を扱う権限がありません（担当者を切り替えてください）",
};

/**
 * 匿名の相談への回答・受付（Server Action）。
 * 相談者を特定しうる情報は扱わない。回答は追記で、元の相談は残る。
 */
export async function respondConsultationAction(
  _prev: WellbeingFormState,
  formData: FormData,
): Promise<WellbeingFormState> {
  const guard = await requireShore("view_wellbeing");
  if (!guard.ok) return DENIED;
  try {
    const responseId = String(formData.get("responseId") ?? "");
    if (String(formData.get("mode") ?? "respond") === "receive") {
      markConsultationReceived(responseId, guard.staff.id);
      revalidatePath("/shore/wellbeing");
      return { ok: true, message: "受付を記録しました（船内には「陸上が受付」と表示されます）" };
    }
    respondToConsultation(
      { responseId, response: String(formData.get("response") ?? "") },
      guard.staff.id,
    );
    revalidatePath("/shore/wellbeing");
    return { ok: true, message: "回答しました（船内の相談画面に表示されます）" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
