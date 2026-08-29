"use server";

import { revalidatePath } from "next/cache";
import { publishShiftChange, publishStationChange } from "@/server/shift-service";
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

/** S-10: 通常配置表の変更配信（船内は SSE 通知で即座に反映される） */
export async function publishStationChangeAction(
  _prev: ShiftChangeFormState,
  formData: FormData,
): Promise<ShiftChangeFormState> {
  try {
    const supersedesId = String(formData.get("supersedesId") ?? "");
    if (!supersedesId) throw new Error("変更する配置を選択してください");
    const published = publishStationChange({
      supersedesId,
      station: String(formData.get("station") ?? ""),
      duty: String(formData.get("duty") ?? ""),
      changeNote: String(formData.get("changeNote") ?? ""),
    });
    revalidatePath("/shore/shifts");
    return {
      ok: true,
      message: `配信しました: ${published.station}（船内の配置表に即座に反映されます）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
