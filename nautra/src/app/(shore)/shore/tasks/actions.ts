"use server";

import { revalidatePath } from "next/cache";
import { advanceTask, assignTask, reassignTask } from "@/server/task-service";
import { recordDeletion } from "@/server/trash-service";
import { effective } from "@/server/master-service";
import { requireShore } from "@/server/shore-session";

/**
 * S-16 作業指示の操作（割り当て・状態を進める・取り消し）。
 * 権限は `manage_manning`（配乗・当直と同じ「人の配置を決める」役割）。
 */

/**
 * 作業の取り消し。実体は消さず「削除した」跡を残す（S-18 から30日以内は復元できる）。
 *
 * `mode` は扱いの区別で、記録の残りかたは変わらない（どちらも追記）。
 * 利用者の意図——「いったん一覧から外す」のか「消す」のか——を跡に残すために持つ。
 */
export async function deleteTaskAction(
  taskId: string,
  mode: "archive" | "delete",
): Promise<{ ok: boolean; message: string }> {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) return { ok: false, message: "作業を取り消す権限がありません" };
  const task = effective("work_task").find((t) => t.id === taskId);
  if (!task) return { ok: false, message: "この作業は見つかりませんでした" };

  recordDeletion({
    entityKind: "作業タスク",
    entityId: task.id,
    entityLabel: `${task.title}（${task.cycle ?? "臨時"}）`,
    mode,
    action: mode === "delete" ? "タスクを削除" : "タスクを一覧から外した",
    effect:
      task.state === "todo"
        ? "完了報告のない未着手タスクでした"
        : "着手済みの記録は作業記録として残ります",
    actor: guard.staff.id,
  });
  revalidatePath("/shore/tasks");
  revalidatePath("/shore/trash");
  return {
    ok: true,
    message: `${task.title} を${mode === "delete" ? "削除" : "一覧から外"}しました（30日以内なら削除・アーカイブから戻せます）`,
  };
}

/* ═══════════════ ホワイトボード・カレンダーからの操作（レビュー ORDER-02 / ORDER-04） ═══════════════ */

export interface TaskBoardResult {
  ok: boolean;
  message: string;
}

async function boardActor(): Promise<string> {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) throw new Error("作業を割り当てる権限がありません");
  return guard.staff.id;
}

/** 列（船員）の「＋」から作業を作って割り当てる */
export async function createTaskOnBoardAction(input: {
  title: string;
  targetVesselId: string;
  assigneeCrewId?: string;
  dueAt?: string;
}): Promise<TaskBoardResult> {
  try {
    const t = assignTask({ ...input, actor: await boardActor() });
    revalidatePath("/shore/tasks");
    return { ok: true, message: `「${t.title}」を割り当てました` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** カードを別の船員の列（または未割当）へ動かして付け替える */
export async function reassignTaskAction(taskId: string, assigneeCrewId: string | null): Promise<TaskBoardResult> {
  try {
    const t = reassignTask(taskId, assigneeCrewId ?? undefined, await boardActor());
    revalidatePath("/shore/tasks");
    return { ok: true, message: `「${t.title}」の担当を付け替えました` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 状態を1つ進める（カードを押した欄から） */
export async function advanceTaskOnBoardAction(taskId: string): Promise<TaskBoardResult> {
  try {
    const t = advanceTask(taskId, await boardActor());
    revalidatePath("/shore/tasks");
    return { ok: true, message: `「${t.title}」を進めました` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
