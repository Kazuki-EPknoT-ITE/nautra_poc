"use server";

import { revalidatePath } from "next/cache";
import { registerEmbarkation } from "@/server/manning-plan-service";
import { requireShore } from "@/server/shore-session";

export interface ManningFormState {
  ok: boolean;
  message: string;
  /** この登録で起票された手続きの標題（画面に一覧で出す） */
  procedureTitles?: string[];
}

/**
 * S-05: 乗下船イベントの登録（Server Action）。
 * 画面を隠すだけでは足りないため、ここでも権限を再チェックする（10.3）。
 * 判定・配信はサービス層へ委譲し、ここは入出力の変換だけを行う。
 */
export async function registerEmbarkationAction(
  _prev: ManningFormState,
  formData: FormData,
): Promise<ManningFormState> {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) {
    return {
      ok: false,
      message:
        guard.reason === "signed_out"
          ? "サインインし直してください。"
          : "配乗計画を変更する権限がありません。",
    };
  }

  try {
    const eventType = String(formData.get("eventType") ?? "on") as "on" | "off";
    const result = registerEmbarkation({
      crewMemberId: String(formData.get("crewMemberId") ?? ""),
      targetVesselId: String(formData.get("targetVesselId") ?? ""),
      eventType,
      date: String(formData.get("date") ?? ""),
      duty: String(formData.get("duty") ?? ""),
      contractType:
        (String(formData.get("contractType") ?? "") as "start" | "renew" | "change" | "end") ||
        undefined,
      status: String(formData.get("status") ?? "planned") as "planned" | "actual",
      acknowledgeBlock: formData.get("acknowledgeBlock") === "on",
      actor: guard.staff.id,
    });

    revalidatePath("/shore/manning");
    revalidatePath("/shore/procedures");
    revalidatePath("/shore/filings");

    const head = `登録しました: ${eventType === "on" ? "乗船" : "下船"} ${result.embarkation.date}`;
    const chain = `この登録で ${result.procedures.length}件 の手続きが起票されました。`;
    const note = result.blockNote ? `（事由を承知のうえで登録: ${result.blockNote}）` : "";
    return {
      ok: true,
      message: `${head}。${chain}${note}`,
      procedureTitles: result.procedures.map((p) => `${p.title}（提出期限 ${p.dueOn}）`),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
