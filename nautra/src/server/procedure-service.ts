import {
  evaluateProcedures,
  type ProcedureState,
  type ProcedureStatus,
} from "@/domain/procedures/deadlines";
import { buildCredentialAlerts, type CredentialAlert } from "@/server/manning-service";
import {
  COMPANY_SCOPE_ID,
  crewNameOf,
  effective,
  listCrewMasters,
  listVessels,
  publishMaster,
  todayLocal,
  vesselNameOf,
  writeAuditLog,
} from "@/server/master-service";
import type { ProcedureGroup, ProcedureTaskPayload } from "@/sync-protocol/records";

/**
 * S-08 手続き・期限管理（要件定義書 6.1 4群マップ / 6.2 インベントリ / 6.5 / 6.6②）。
 *
 * 6.6②「期限は**提出期限**でなく**着手期限**で管理する」。着手期限は
 * `domain/procedures/deadlines.ts` が `dueOn − leadTimeDays` から**導出**し、保持しない（12.3）。
 * このサービスは並べ替え・集計・対象名の解決だけを行い、期限の判定を再実装しない。
 */

export interface ProcedureRow {
  status: ProcedureStatus;
  /** 対象の表示名（船員名・船名・事業者） */
  subjectLabel: string;
}

export interface ProcedureBoard {
  today: string;
  /** 緊急度順（evaluateProcedures が並べ替え済み） */
  rows: ProcedureRow[];
  /** 6.1 の4群ごと。群の中の並びは緊急度順のまま */
  byGroup: { group: ProcedureGroup; rows: ProcedureRow[] }[];
  summary: { overdue: number; dueSoon: number; startDue: number; open: number; done: number };
  /** 6.5「期限管理・アラート（3.1.1）」。証書の期限・鮮度も同じ画面で見る */
  credentialAlerts: CredentialAlert[];
}

const GROUPS: ProcedureGroup[] = ["A", "B", "C", "D"];

export function subjectLabelOf(task: ProcedureTaskPayload): string {
  if (task.subjectType === "company") return "事業者";
  if (!task.subjectId) return task.subjectType === "crew" ? "船員（未指定）" : "船舶（未指定）";
  return task.subjectType === "crew" ? crewNameOf(task.subjectId) : vesselNameOf(task.subjectId);
}

export function buildProcedureBoard(now = new Date()): ProcedureBoard {
  const today = todayLocal(now);
  const statuses = evaluateProcedures(effective("procedure_task"), today);
  const rows: ProcedureRow[] = statuses.map((status) => ({
    status,
    subjectLabel: subjectLabelOf(status.task),
  }));

  const count = (state: ProcedureState) => rows.filter((r) => r.status.state === state).length;
  return {
    today,
    rows,
    byGroup: GROUPS.map((group) => ({
      group,
      rows: rows.filter((r) => r.status.task.group === group),
    })),
    summary: {
      overdue: count("overdue"),
      dueSoon: count("due_soon"),
      startDue: count("start_due"),
      open: rows.filter((r) => !["done", "canceled"].includes(r.status.state)).length,
      done: count("done"),
    },
    credentialAlerts: buildCredentialAlerts(now),
  };
}

/* ═══════════════ タスクの消込 ═══════════════ */

export function completeProcedure(
  taskId: string,
  actor?: string,
  now = new Date(),
): ProcedureTaskPayload {
  const current = effective("procedure_task").find((t) => t.id === taskId);
  if (!current) throw new Error("この手続きは見つかりません（画面を開き直してください）");
  if (current.status === "done") throw new Error("この手続きはすでに完了しています");

  const done = publishMaster(
    "procedure_task",
    {
      group: current.group,
      title: current.title,
      basis: current.basis,
      subjectType: current.subjectType,
      subjectId: current.subjectId,
      dueOn: current.dueOn,
      leadTimeDays: current.leadTimeDays,
      responsible: current.responsible,
      sourceEventId: current.sourceEventId,
      status: "done",
      doneOn: todayLocal(now),
    },
    { vesselId: COMPANY_SCOPE_ID, supersedesId: current.id, actor, now },
  );

  writeAuditLog({
    action: "update",
    entityKind: "procedure_task",
    entityId: done.id,
    before: current.status,
    after: "done",
    actor,
    summary: `手続きを完了にした: ${current.title}`,
    now,
  });
  return done;
}

/* ═══════════════ 新規の起票 ═══════════════ */

export interface CreateProcedureInput {
  group: ProcedureGroup;
  title: string;
  basis?: string;
  subjectType: "crew" | "vessel" | "company";
  subjectId?: string;
  dueOn?: string;
  leadTimeDays?: number;
  actor?: string;
  now?: Date;
}

export function createProcedureTask(input: CreateProcedureInput): ProcedureTaskPayload {
  const now = input.now ?? new Date();
  const title = input.title.trim();
  if (!title) throw new Error("手続きの標題を入力してください");
  if (input.dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn))
    throw new Error("提出期限は日付で入力してください");
  if (input.subjectType !== "company" && !input.subjectId)
    throw new Error("対象の船員・船舶を選んでください");

  const task = publishMaster(
    "procedure_task",
    {
      group: input.group,
      title,
      basis: input.basis?.trim() || undefined,
      subjectType: input.subjectType,
      subjectId: input.subjectType === "company" ? undefined : input.subjectId,
      dueOn: input.dueOn || undefined,
      leadTimeDays: input.leadTimeDays,
      status: "open",
      responsible: input.actor,
    },
    { vesselId: COMPANY_SCOPE_ID, actor: input.actor, now },
  );

  writeAuditLog({
    action: "create",
    entityKind: "procedure_task",
    entityId: task.id,
    after: title,
    actor: input.actor,
    summary: "手続きを起票",
    now,
  });
  return task;
}

/** 起票フォームの選択肢（船員・船舶） */
export function procedureFormOptions() {
  return {
    crew: listCrewMasters().map((c) => ({ id: c.crewMemberId, name: c.name })),
    vessels: listVessels(),
  };
}
