"use server";

import { revalidatePath } from "next/cache";
import { publishShiftChange } from "@/server/shift-service";
import type { ShiftType } from "@/sync-protocol/records";

export interface ShiftChangeFormState {
  ok: boolean;
  message: string;
}

/** S-10: シフト変更の配信（Server Action。API ルート同様に薄い入出力層としドメインサービスへ委譲） */
export async function publishShiftChangeAction(
  _prev: ShiftChangeFormState,
  formData: FormData,
): Promise<ShiftChangeFormState> {
  try {
    const supersedesId = String(formData.get("supersedesId") ?? "");
    const shiftType = String(formData.get("shiftType") ?? "") as ShiftType;
    const from = String(formData.get("from") ?? "");
    const to = String(formData.get("to") ?? "");
    const changeNote = String(formData.get("changeNote") ?? "");
    if (!supersedesId) throw new Error("変更するシフトを選択してください");
    const published = publishShiftChange({ supersedesId, shiftType, from, to, changeNote });
    revalidatePath("/shore/shifts");
    revalidatePath("/shore");
    return {
      ok: true,
      message: `配信しました: ${published.date} ${published.from}–${published.to}（船内の次回同期で変更通知になります）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
