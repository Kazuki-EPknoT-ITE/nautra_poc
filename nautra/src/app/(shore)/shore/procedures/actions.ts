"use server";

import { revalidatePath } from "next/cache";
import type { BusinessEvent } from "@/domain/procedures/chain";
import { createChainedProcedures } from "@/server/manning-plan-service";
import { completeProcedure, createProcedureTask } from "@/server/procedure-service";
import { requireShore } from "@/server/shore-session";
import type { ProcedureGroup } from "@/sync-protocol/records";

export interface ProcedureFormState {
  ok: boolean;
  message: string;
  createdTitles?: string[];
}

async function guardProcedures(): Promise<
  { ok: true; actor: string } | { ok: false; message: string }
> {
  const guard = await requireShore("manage_procedures");
  if (guard.ok) return { ok: true, actor: guard.staff.id };
  return {
    ok: false,
    message:
      guard.reason === "signed_out"
        ? "サインインし直してください。"
        : "手続き・期限を管理する権限がありません。",
  };
}

function revalidate() {
  revalidatePath("/shore/procedures");
  revalidatePath("/shore");
}

/** 手続きの消込（完了にする）。訂正は追記なので、完了も新しいレコードで表す */
export async function completeProcedureAction(
  _prev: ProcedureFormState,
  formData: FormData,
): Promise<ProcedureFormState> {
  const guard = await guardProcedures();
  if (!guard.ok) return { ok: false, message: guard.message };

  try {
    const done = completeProcedure(String(formData.get("taskId") ?? ""), guard.actor);
    revalidate();
    return { ok: true, message: `完了にしました: ${done.title}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 新しい手続きを起票する */
export async function createProcedureAction(
  _prev: ProcedureFormState,
  formData: FormData,
): Promise<ProcedureFormState> {
  const guard = await guardProcedures();
  if (!guard.ok) return { ok: false, message: guard.message };

  try {
    const subjectType = String(formData.get("subjectType") ?? "company") as
      | "crew"
      | "vessel"
      | "company";
    const leadRaw = String(formData.get("leadTimeDays") ?? "").trim();
    const task = createProcedureTask({
      group: String(formData.get("group") ?? "B") as ProcedureGroup,
      title: String(formData.get("title") ?? ""),
      basis: String(formData.get("basis") ?? ""),
      subjectType,
      subjectId: String(formData.get("subjectId") ?? "") || undefined,
      dueOn: String(formData.get("dueOn") ?? "") || undefined,
      leadTimeDays: leadRaw === "" ? undefined : Number(leadRaw),
      actor: guard.actor,
    });
    revalidate();
    return { ok: true, message: `起票しました: ${task.title}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 6.6① イベント駆動の連鎖生成。
 * 「乗船／下船／採用／決算期末」を選ぶと、必要な手続き一式がまとめて起票される。
 */
export async function chainFromEventAction(
  _prev: ProcedureFormState,
  formData: FormData,
): Promise<ProcedureFormState> {
  const guard = await guardProcedures();
  if (!guard.ok) return { ok: false, message: guard.message };

  try {
    const created = createChainedProcedures({
      event: String(formData.get("event") ?? "embark") as BusinessEvent,
      eventDate: String(formData.get("eventDate") ?? ""),
      subjectId: String(formData.get("subjectId") ?? "") || undefined,
      actor: guard.actor,
    });
    revalidate();
    return {
      ok: true,
      message: `この出来事から ${created.length}件 の手続きを起票しました。`,
      createdTitles: created.map((c) => `${c.title}（提出期限 ${c.dueOn}）`),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
