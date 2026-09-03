"use server";

import { revalidatePath } from "next/cache";
import {
  arrangeTraining,
  completeTraining,
  publishTrainingMaterial,
} from "@/server/training-service";
import { requireShore } from "@/server/shore-session";
import type { TrainingKind } from "@/sync-protocol/records";

export interface TrainingFormState {
  ok: boolean;
  message: string;
}

async function guardTraining(): Promise<
  { ok: true; actor: string } | { ok: false; message: string }
> {
  const guard = await requireShore("manage_training");
  if (guard.ok) return { ok: true, actor: guard.staff.id };
  return {
    ok: false,
    message:
      guard.reason === "signed_out"
        ? "サインインし直してください。"
        : "訓練を管理する権限がありません。",
  };
}

function revalidate() {
  revalidatePath("/shore/training");
  // 修了の登録は届出の添付要件チェックと配乗可否に効く（3.9 主要機能②）
  revalidatePath("/shore/filings");
  revalidatePath("/shore/manning");
  revalidatePath("/shore/procedures");
}

/** 4.4② 未修了者に受講を手配する */
export async function arrangeTrainingAction(
  _prev: TrainingFormState,
  formData: FormData,
): Promise<TrainingFormState> {
  const guard = await guardTraining();
  if (!guard.ok) return { ok: false, message: guard.message };

  try {
    const plan = arrangeTraining({
      crewMemberId: String(formData.get("crewMemberId") ?? ""),
      trainingKind: String(formData.get("trainingKind") ?? "stcw_basic") as TrainingKind,
      title: String(formData.get("title") ?? ""),
      institution: String(formData.get("institution") ?? ""),
      scheduledOn: String(formData.get("scheduledOn") ?? ""),
      actor: guard.actor,
    });
    revalidate();
    return {
      ok: true,
      message: `手配しました: ${plan.title}${plan.scheduledOn ? `（${plan.scheduledOn} 受講予定）` : ""}`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 4.4③④ 修了を登録し、修了証を作って届出の添付要件へ自動連携する */
export async function completeTrainingAction(
  _prev: TrainingFormState,
  formData: FormData,
): Promise<TrainingFormState> {
  const guard = await guardTraining();
  if (!guard.ok) return { ok: false, message: guard.message };

  try {
    const { credential } = completeTraining({
      planId: String(formData.get("planId") ?? ""),
      completedOn: String(formData.get("completedOn") ?? ""),
      credentialName: String(formData.get("credentialName") ?? ""),
      issuer: String(formData.get("issuer") ?? ""),
      number: String(formData.get("number") ?? ""),
      expiresOn: String(formData.get("expiresOn") ?? ""),
      actor: guard.actor,
    });
    revalidate();
    return {
      ok: true,
      message: `修了を登録しました: ${credential.name}。届出の添付要件チェックにすぐ反映されます。`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 3.9 主要機能④ 教材・手順書を配信する */
export async function publishMaterialAction(
  _prev: TrainingFormState,
  formData: FormData,
): Promise<TrainingFormState> {
  const guard = await guardTraining();
  if (!guard.ok) return { ok: false, message: guard.message };

  try {
    const plan = publishTrainingMaterial({
      crewMemberId: String(formData.get("crewMemberId") ?? ""),
      trainingKind: String(formData.get("trainingKind") ?? "internal") as TrainingKind,
      title: String(formData.get("title") ?? ""),
      materialName: String(formData.get("materialName") ?? ""),
      materialBody: String(formData.get("materialBody") ?? ""),
      actor: guard.actor,
    });
    revalidate();
    return { ok: true, message: `配信しました: ${plan.materialName}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
