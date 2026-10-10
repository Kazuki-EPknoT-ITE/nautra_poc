"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createVesselMaster,
  saveVesselPhoto,
  updateVesselMaster,
  type VesselMasterFormInput,
} from "@/server/vessel-master-service";
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

/* ═══════════════ 船の登録・編集・写真（レビュー VESSEL-02 / VESSEL-03 / ASSIGN-04） ═══════════════ */

const field = (formData: FormData, key: string) => String(formData.get(key) ?? "");

function vesselForm(formData: FormData): VesselMasterFormInput {
  return {
    name: field(formData, "name"),
    vesselType: field(formData, "vesselType"),
    grossTonnage: field(formData, "grossTonnage"),
    imoNumber: field(formData, "imoNumber"),
    mmsi: field(formData, "mmsi"),
    navigationArea: field(formData, "navigationArea"),
    requiredCrew: field(formData, "requiredCrew"),
    builtOn: field(formData, "builtOn"),
    referencePeriodDays: field(formData, "referencePeriodDays"),
  };
}

function revalidateVessels(vesselId?: string) {
  revalidatePath("/shore/fleet");
  if (vesselId) revalidatePath(`/shore/fleet/${vesselId}`);
  revalidatePath("/shore/manning");
  revalidatePath("/shore/shifts");
  revalidatePath("/shore/dispatch");
  revalidatePath("/shore");
}

/** 船を登録する。登録後は戻り先（配乗計画など）か、船の一覧のその船へ送る */
export async function createVesselAction(_prev: FleetFormState, formData: FormData): Promise<FleetFormState> {
  let to = "";
  try {
    const actor = await actorId();
    const { vesselId } = createVesselMaster({ form: vesselForm(formData), actor });
    const photo = field(formData, "photoDataUrl");
    if (photo) saveVesselPhoto({ vesselId, dataUrl: photo, actor });
    revalidateVessels(vesselId);
    const back = field(formData, "back");
    to = back.startsWith("/shore/") ? back : `/shore/fleet?vessel=${vesselId}`;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  redirect(to);
}

/** 船の情報を直す（追記型） */
export async function updateVesselAction(_prev: FleetFormState, formData: FormData): Promise<FleetFormState> {
  try {
    const actor = await actorId();
    const vesselId = field(formData, "vesselId");
    if (!vesselId) throw new Error("対象の船が特定できません。画面を開き直してください");
    const { changed } = updateVesselMaster({ vesselId, form: vesselForm(formData), actor });
    revalidateVessels(vesselId);
    return {
      ok: true,
      message: changed.length === 0 ? "変更はありません" : `保存しました（${changed.join("・")}）。前の内容も履歴として残っています`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 船の写真を保存する（選んだ時点で保存。マスタの保存とは別の経路） */
export async function saveVesselPhotoAction(vesselId: string, dataUrl: string): Promise<FleetFormState> {
  try {
    const actor = await actorId();
    const saved = saveVesselPhoto({ vesselId, dataUrl, actor });
    revalidateVessels(vesselId);
    if (!saved) return { ok: true, message: "写真は変わっていません" };
    return { ok: true, message: dataUrl.trim() ? "船の写真を登録しました" : "船の写真を外しました" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
