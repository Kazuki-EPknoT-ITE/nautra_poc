import type { CheckLevel } from "@/domain/labor-law/types";
import { addDaysYmd, daysBetween } from "@/domain/crew/freshness";
import type { ProcedureGroup, ProcedureTaskPayload } from "@/sync-protocol/masters";

/**
 * 手続きの期限判定（要件定義書 6.2 手続きインベントリ / 6.6② 着手期限で管理）。
 *
 * 6.6② の原則:
 *   「期限は**提出期限**でなく**着手期限**で管理する。免状更新は講習・身体検査の段取りが
 *    要るため満了日アラートでは遅い。各手続きの準備リードタイムを持たせた逆算リマインドを標準とする。」
 *
 * したがって発報の基準は `dueOn - leadTimeDays`（着手期限）であり、
 * 着手期限そのものはレコードに保持しない**導出値**である（12.3）。
 */

export type ProcedureState =
  /** まだ着手時期でない */
  | "scheduled"
  /** 着手時期に入った（準備を始める） */
  | "start_due"
  /** 提出期限が迫っている */
  | "due_soon"
  /** 提出期限を過ぎた */
  | "overdue"
  /** 完了 */
  | "done"
  /** 取り消し */
  | "canceled"
  /** 期限の定めがない */
  | "no_due";

export interface ProcedureStatus {
  task: ProcedureTaskPayload;
  state: ProcedureState;
  /** 着手期限（YYYY-MM-DD）。dueOn が無ければ null */
  startOn: string | null;
  daysToStart: number | null;
  daysToDue: number | null;
  level: CheckLevel;
  message: string;
}

export interface ProcedureRuleValues {
  /** 提出期限まで何日を切ったら「期限が近い」とするか */
  dueSoonDays: number;
  /** leadTimeDays が未設定の手続きの既定リードタイム */
  defaultLeadTimeDays: number;
}

export const DEFAULT_PROCEDURE_RULES: ProcedureRuleValues = {
  dueSoonDays: 7,
  defaultLeadTimeDays: 14,
};

/** 着手期限を求める（6.6②）。導出値なので保持しない */
export function startDeadlineOf(
  dueOn: string | undefined,
  leadTimeDays: number | undefined,
  rules: ProcedureRuleValues = DEFAULT_PROCEDURE_RULES,
): string | null {
  if (!dueOn) return null;
  return addDaysYmd(dueOn, -(leadTimeDays ?? rules.defaultLeadTimeDays));
}

export function evaluateProcedure(
  task: ProcedureTaskPayload,
  today: string,
  rules: ProcedureRuleValues = DEFAULT_PROCEDURE_RULES,
): ProcedureStatus {
  if (task.status === "done")
    return {
      task,
      state: "done",
      startOn: null,
      daysToStart: null,
      daysToDue: null,
      level: "ok",
      message: task.doneOn ? `${task.doneOn} に完了` : "完了",
    };
  if (task.status === "canceled")
    return {
      task,
      state: "canceled",
      startOn: null,
      daysToStart: null,
      daysToDue: null,
      level: "ok",
      message: "取り消し",
    };
  if (!task.dueOn)
    return {
      task,
      state: "no_due",
      startOn: null,
      daysToStart: null,
      daysToDue: null,
      level: "ok",
      message: "期限の定めなし",
    };

  const daysToDue = daysBetween(today, task.dueOn);
  const startOn = startDeadlineOf(task.dueOn, task.leadTimeDays, rules);
  const daysToStart = startOn ? daysBetween(today, startOn) : null;

  let state: ProcedureState;
  let level: CheckLevel;
  let message: string;
  if (daysToDue < 0) {
    state = "overdue";
    level = "violation";
    message = `提出期限を ${Math.abs(daysToDue)}日 過ぎています`;
  } else if (daysToDue <= rules.dueSoonDays) {
    state = "due_soon";
    level = "violation";
    message = `提出期限まで あと ${daysToDue}日`;
  } else if (daysToStart !== null && daysToStart <= 0) {
    state = "start_due";
    level = "caution";
    message = `準備を始める時期です（提出期限まで あと ${daysToDue}日）`;
  } else {
    state = "scheduled";
    level = "ok";
    message =
      daysToStart !== null
        ? `準備開始まで あと ${daysToStart}日（提出期限まで ${daysToDue}日）`
        : `提出期限まで あと ${daysToDue}日`;
  }
  return { task, state, startOn, daysToStart, daysToDue, level, message };
}

export function evaluateProcedures(
  tasks: ProcedureTaskPayload[],
  today: string,
  rules: ProcedureRuleValues = DEFAULT_PROCEDURE_RULES,
): ProcedureStatus[] {
  const order: Record<ProcedureState, number> = {
    overdue: 0,
    due_soon: 1,
    start_due: 2,
    scheduled: 3,
    no_due: 4,
    done: 5,
    canceled: 6,
  };
  return tasks
    .map((t) => evaluateProcedure(t, today, rules))
    .sort((a, b) => {
      if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
      return (a.daysToDue ?? 99999) - (b.daysToDue ?? 99999);
    });
}

/** 6.1 の手続き4群（A: 事業関連 / B: 乗下船の都度 / C: 周期・期限管理 / D: 突発・随時） */
export const PROCEDURE_GROUP_LABEL: Record<ProcedureGroup, string> = {
  A: "A群: 事業関連（年次・変更時）",
  B: "B群: 乗下船の都度発生",
  C: "C群: 周期・期限管理型",
  D: "D群: 突発・随時",
};
