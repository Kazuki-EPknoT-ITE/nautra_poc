"use server";

import { revalidatePath } from "next/cache";
import { publishManagerApproval } from "@/server/ledger-service";

export interface ApprovalFormState {
  ok: boolean;
  message: string;
}

/**
 * S-06: 労務管理責任者としての承認・差戻し（Server Action）。
 * 対象日をまとめて処理できる（日次一括承認）。
 */
export async function approveDaysAction(
  _prev: ApprovalFormState,
  formData: FormData,
): Promise<ApprovalFormState> {
  try {
    const crewMemberId = String(formData.get("crewMemberId") ?? "");
    const decision = String(formData.get("decision") ?? "approved") as "approved" | "remanded";
    const dates = formData.getAll("dates").map(String).filter(Boolean);
    const count = publishManagerApproval({
      crewMemberId,
      dates,
      decision,
      reason: String(formData.get("reason") ?? ""),
    });
    revalidatePath("/shore/labor");
    revalidatePath("/shore");
    return {
      ok: true,
      message:
        decision === "approved"
          ? `${count}日分を承認しました（船内の次回同期で反映されます）`
          : `${count}日分を差戻しました（本人が打刻を直せます）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
