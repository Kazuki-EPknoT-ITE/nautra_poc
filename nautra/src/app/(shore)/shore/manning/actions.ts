"use server";

import { revalidatePath } from "next/cache";
import { registerEmbarkation } from "@/server/manning-plan-service";
import { buildManningRow } from "@/server/manning-service";
import { todayLocal, vesselNameOf } from "@/server/master-service";
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
    revalidatePath("/shore/filings");
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

/**
 * 配乗ボードのドラッグ＆ドロップ（デザイン正本 `design/poc_design` の S-05）。
 *
 * カードを船の列へ落とす＝**乗船の登録**、配乗待ちへ落とす＝**下船の登録**。
 * 見た目は入れ替えでも、中で起きるのは追記型の乗下船イベントの発行で、
 * 手続きの連鎖生成（6.6①）も通常の登録と同じ経路を通る。
 *
 * 配乗ブロックに当たる船員は、`acknowledge` が無いと登録しない。
 * 「黙って弾く」のでも「黙って通す」のでもなく、事由を見せて判断させるため（3.1.2）。
 */
export async function moveCrewAction(
  crewMemberId: string,
  targetVesselId: string | null,
  duty: string,
  acknowledge: boolean,
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
    const row = buildManningRow(crewMemberId);
    if (!row) return { ok: false, message: "この船員の情報が見つかりません。" };

    // 配乗待ちへ戻す = いま乗っている船からの下船
    const vesselId = targetVesselId ?? row.currentVesselId;
    if (!vesselId) {
      return { ok: false, message: `${row.name} はどの船にも乗っていません。` };
    }
    if (targetVesselId && row.currentVesselId === targetVesselId) {
      return { ok: false, message: `${row.name} はすでにこの船に乗っています。` };
    }

    const result = registerEmbarkation({
      crewMemberId,
      targetVesselId: vesselId,
      eventType: targetVesselId ? "on" : "off",
      date: todayLocal(),
      duty: duty || row.position,
      status: "planned",
      acknowledgeBlock: acknowledge,
      actor: guard.staff.id,
    });

    revalidatePath("/shore/manning");
    revalidatePath("/shore/filings");
    revalidatePath("/shore/fleet");

    return {
      ok: true,
      message: targetVesselId
        ? `${row.name} を ${vesselNameOf(vesselId)} に配乗しました（${result.procedures.length}件の手続きを起票）`
        : `${row.name} を ${vesselNameOf(vesselId)} から下船にしました（${result.procedures.length}件の手続きを起票）`,
      procedureTitles: result.procedures.map((p) => `${p.title}（提出期限 ${p.dueOn}）`),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
