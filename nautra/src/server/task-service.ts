import { todayLocal } from "@/server/master-service";
import { crewNameOf, effective, publishMaster, vesselNameOf, writeAuditLog } from "@/server/master-service";
import { COMPANY_SCOPE_ID } from "@/lib/seed-masters";
import { carryOverFields } from "@/lib/master-fields";
import { trashedEntityIds } from "@/server/trash-service";
import type { WorkTaskPayload, WorkTaskState } from "@/sync-protocol/masters";

/**
 * S-16 作業指示・タスク割当（デザイン正本 `design/poc_design`）。
 *
 * 「誰が何をいつまでにやるか」を陸上・船長が決め、船内が状態を進める。
 * 打刻（一次記録）とは別物で、こちらは付け替え・取り消しができる。ただし
 * **書き換えではなく追記**で表す（supersedesId 付きの新しいレコード）ので、
 * 誰がいつ割り当て直したかは後から追える（12.6）。
 */

export interface TaskRow {
  task: WorkTaskPayload;
  assigneeName: string;
  vesselName: string;
  /** 期限までの日数（過ぎていれば負。未設定は null） */
  daysLeft: number | null;
  overdue: boolean;
}

export const TASK_STATE_LABEL: Record<WorkTaskState, string> = {
  todo: "未着手",
  doing: "着手中",
  done: "完了",
};

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from.slice(0, 10)}T00:00:00`);
  const b = new Date(`${to.slice(0, 10)}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function listTasks(now = new Date()): TaskRow[] {
  const today = todayLocal(now);
  // 取り消された作業は一覧から外す（実体は残す。復元は S-18 から）
  const removed = trashedEntityIds("作業タスク");
  return effective("work_task")
    .filter((t) => !removed.has(t.id))
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"))
    .map((task) => {
      const daysLeft = task.dueAt ? daysBetween(today, task.dueAt) : null;
      return {
        task,
        assigneeName: task.assigneeCrewId ? crewNameOf(task.assigneeCrewId) : "未割当",
        vesselName: vesselNameOf(task.targetVesselId),
        daysLeft,
        overdue: task.state !== "done" && daysLeft !== null && daysLeft < 0,
      };
    });
}

export function listTasksForVessel(vesselId: string, now = new Date()): TaskRow[] {
  return listTasks(now).filter((r) => r.task.targetVesselId === vesselId);
}

/** 船員ごとの未完了件数（デザインの「船員ごとの持ち作業」） */
export function openTaskCountByCrew(now = new Date()): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of listTasks(now)) {
    if (r.task.state === "done" || !r.task.assigneeCrewId) continue;
    map.set(r.task.assigneeCrewId, (map.get(r.task.assigneeCrewId) ?? 0) + 1);
  }
  return map;
}

export interface AssignTaskInput {
  title: string;
  assigneeCrewId?: string;
  targetVesselId: string;
  dueAt?: string;
  cycle?: string;
  actor?: string;
  now?: Date;
}

export function assignTask(input: AssignTaskInput): WorkTaskPayload {
  const title = input.title.trim();
  if (!title) throw new Error("作業の内容を入力してください");
  const task = publishMaster(
    "work_task",
    {
      targetVesselId: input.targetVesselId,
      title,
      assigneeCrewId: input.assigneeCrewId || undefined,
      dueAt: input.dueAt || undefined,
      cycle: input.cycle || undefined,
      state: "todo",
    },
    { vesselId: input.targetVesselId, actor: input.actor, now: input.now },
  );
  writeAuditLog({
    action: "create",
    entityKind: "work_task",
    entityId: task.id,
    actor: input.actor,
    summary: `作業「${title}」を ${task.assigneeCrewId ? crewNameOf(task.assigneeCrewId) : "未割当"} に割り当て`,
    now: input.now,
  });
  return task;
}

/** 状態を1つ進める（未着手 → 着手中 → 完了）。追記で表すので履歴が残る */
export function advanceTask(taskId: string, actor?: string, now = new Date()): WorkTaskPayload {
  const current = effective("work_task").find((t) => t.id === taskId);
  if (!current) throw new Error("この作業は見つかりませんでした（更新済みの可能性があります）");
  const next: WorkTaskState =
    current.state === "todo" ? "doing" : current.state === "doing" ? "done" : "done";
  const updated = publishMaster(
    "work_task",
    // 発行元の列（ID・配信日時・記録者）は引き継がない。引き継ぐと
    // 「いつ・誰が進めたか」が元レコードのもので上書きされる（12.6）
    { ...carryOverFields(current as unknown as Record<string, unknown>), state: next },
    { vesselId: current.targetVesselId, supersedesId: current.id, actor, now },
  );
  writeAuditLog({
    action: "update",
    entityKind: "work_task",
    entityId: updated.id,
    before: TASK_STATE_LABEL[current.state],
    after: TASK_STATE_LABEL[next],
    actor,
    summary: `作業「${current.title}」を${TASK_STATE_LABEL[next]}にした`,
    now,
  });
  return updated;
}

/**
 * 担当を付け替える（ホワイトボードでカードを別の船員の列へ動かしたとき。レビュー ORDER-02）。
 * 状態の進め方と同じく追記で表すので、誰から誰へ付け替えたかが履歴に残る（12.6）。
 */
export function reassignTask(taskId: string, assigneeCrewId: string | undefined, actor?: string, now = new Date()): WorkTaskPayload {
  const current = effective("work_task").find((t) => t.id === taskId);
  if (!current) throw new Error("この作業は見つかりませんでした（更新済みの可能性があります）");
  if ((current.assigneeCrewId ?? undefined) === (assigneeCrewId || undefined)) return current;
  const updated = publishMaster(
    "work_task",
    { ...carryOverFields(current as unknown as Record<string, unknown>), assigneeCrewId: assigneeCrewId || undefined },
    { vesselId: current.targetVesselId, supersedesId: current.id, actor, now },
  );
  const name = (id?: string) => (id ? crewNameOf(id) : "未割当");
  writeAuditLog({
    action: "update",
    entityKind: "work_task",
    entityId: updated.id,
    before: name(current.assigneeCrewId),
    after: name(assigneeCrewId),
    actor,
    summary: `作業「${current.title}」の担当を ${name(current.assigneeCrewId)} → ${name(assigneeCrewId)} に付け替え`,
    now,
  });
  return updated;
}

export { COMPANY_SCOPE_ID };
