"use server";

import { revalidatePath } from "next/cache";
import { advancePartOrder, receiveParts, setPrepTaskDone, upsertFinding } from "@/server/fleet-service";
import { requireShore } from "@/server/shore-session";

/**
 * S-11 の書き込み（Server Action）。
 * 画面を隠すだけでは不十分なため、**この中でも権限を再チェックする**（10.3）。
 * 実処理は fleet-service へ委譲し、ここは薄い入出力層に留める。
 */

export interface FleetFormState {
  ok: boolean;
  message: string;
}

async function actorId(): Promise<string> {
  const guard = await requireShore("manage_fleet");
  if (!guard.ok) {
    throw new Error(
      guard.reason === "signed_out"
        ? "サインインしてください"
        : "この操作を行う権限がありません（運航管理の担当者に依頼してください）",
    );
  }
  return guard.staff.id;
}

/** 部品の発注を1段階進める（手配なし → 手配依頼中 → 発注済） */
export async function advancePartOrderAction(stockId: string): Promise<FleetFormState> {
  try {
    const actor = await actorId();
    const published = advancePartOrder(stockId, actor);
    revalidatePath("/shore/fleet");
    return { ok: true, message: `${published.partName} を「手配」の次の段階に進めました` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 入荷を登録して在庫を足す */
export async function receivePartsAction(
  _prev: FleetFormState,
  formData: FormData,
): Promise<FleetFormState> {
  try {
    const actor = await actorId();
    const stockId = String(formData.get("stockId") ?? "");
    const quantity = Number(formData.get("quantity") ?? "0");
    const published = receiveParts(stockId, quantity, actor);
    revalidatePath("/shore/fleet");
    return {
      ok: true,
      message: `${published.partName} を入荷しました（在庫 ${published.quantity}${published.unit ?? ""}）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 入渠前の準備タスクを消し込む */
export async function setPrepTaskAction(
  dockId: string,
  taskKey: string,
  done: boolean,
): Promise<FleetFormState> {
  try {
    const actor = await actorId();
    setPrepTaskDone(dockId, taskKey, done, actor);
    revalidatePath("/shore/fleet");
    return { ok: true, message: done ? "完了にしました" : "未完了に戻しました" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 検査の指摘事項を追加・更新する */
export async function upsertFindingAction(
  _prev: FleetFormState,
  formData: FormData,
): Promise<FleetFormState> {
  try {
    const actor = await actorId();
    const published = upsertFinding(
      {
        dockId: String(formData.get("dockId") ?? ""),
        key: String(formData.get("key") ?? "") || undefined,
        content: String(formData.get("content") ?? ""),
        dueOn: String(formData.get("dueOn") ?? ""),
        status: String(formData.get("status") ?? "open") as "open" | "in_progress" | "closed",
        action: String(formData.get("action") ?? ""),
      },
      actor,
    );
    revalidatePath("/shore/fleet");
    return { ok: true, message: `${published.title} の指摘を記録しました` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
