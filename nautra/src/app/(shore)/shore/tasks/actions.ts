"use server";

import { revalidatePath } from "next/cache";
import { advanceTask, assignTask } from "@/server/task-service";
import { recordDeletion } from "@/server/trash-service";
import { effective } from "@/server/master-service";
import { requireShore } from "@/server/shore-session";

/**
 * S-16 作業指示の操作（割り当て・状態を進める・取り消し）。
 * 権限は `manage_manning`（配乗・当直と同じ「人の配置を決める」役割）。
 */

export async function assignTaskAction(formData: FormData) {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) return;
  assignTask({
    title: String(formData.get("title") ?? ""),
    assigneeCrewId: String(formData.get("assigneeCrewId") ?? "") || undefined,
    targetVesselId: String(formData.get("targetVesselId") ?? ""),
    dueAt: String(formData.get("dueAt") ?? "") || undefined,
    cycle: String(formData.get("cycle") ?? "") || undefined,
    actor: guard.staff.id,
  });
  revalidatePath("/shore/tasks");
}

export async function advanceTaskAction(formData: FormData) {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) return;
  advanceTask(String(formData.get("taskId") ?? ""), guard.staff.id);
  revalidatePath("/shore/tasks");
}

/**
 * 作業の取り消し。実体は消さず「削除した」跡を残す（S-18 から30日以内は復元できる）。
 * 取り消し済みの作業は `state` を完了にしたうえで一覧から外す。
 */
export async function deleteTaskAction(formData: FormData) {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) return;
  const taskId = String(formData.get("taskId") ?? "");
  const task = effective("work_task").find((t) => t.id === taskId);
  if (!task) return;
  recordDeletion({
    entityKind: "作業タスク",
    entityId: task.id,
    entityLabel: `${task.title}（${task.cycle ?? "臨時"}）`,
    mode: "delete",
    action: "タスクを削除",
    effect:
      task.state === "todo"
        ? "完了報告のない未着手タスクでした"
        : "着手済みの記録は作業記録として残ります",
    actor: guard.staff.id,
  });
  revalidatePath("/shore/tasks");
  revalidatePath("/shore/trash");
}
