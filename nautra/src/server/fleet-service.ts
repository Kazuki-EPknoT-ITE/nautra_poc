import { evaluateCredentials, type CredentialStatus } from "@/domain/crew/freshness";
import {
  evaluateDockPlan,
  evaluateEnvironmentFreshness,
  evaluateMaintenancePlans,
  evaluatePartStocks,
  nextOrderStatus,
  type DockPlanStatus,
  type MaintenancePlanStatus,
  type PartStockStatus,
} from "@/lib/fleet-plain";
import { latestByEquipment, openMaintenanceIssues } from "@/lib/maintenance-status";
import { carryOverFields } from "@/lib/master-fields";
import { DEFAULT_CREDENTIAL_RULE_SET } from "@/rules/credential-rules";
import type { DockPlanPayload, PartStockPayload, VesselMasterPayload } from "@/sync-protocol/masters";
import type { ChecklistResultPayload, MaintenanceRecordPayload } from "@/sync-protocol/records";
import {
  credentialsOf,
  effective,
  publishMaster,
  todayLocal,
  vesselMasterOf,
  writeAuditLog,
} from "./master-service";

/**
 * S-11 船舶・保守・検査（要件定義書 3.4.1 / 3.4.2 / 3.5.3）。
 *
 * 画面は「集約された1隻分の姿」だけを受け取り、判定・並び順を持たない。
 * 判定は `src/lib/fleet-plain.ts`（純関数）と `src/domain/crew/freshness.ts`（証書の期限・鮮度）が行い、
 * ここは**ストアからの読み出しと組み立て**、および追記型の配信に専念する。
 */

export interface FleetBoard {
  vesselId: string;
  master: VesselMasterPayload | undefined;
  /** 3.5.3 船内環境の確認日の鮮度（求人の的確表示は最新性を求めるため） */
  environment: ReturnType<typeof evaluateEnvironmentFreshness>;
  /** 3.4.2 検査証書の期限・鮮度（不適合と要再確認を描き分けるための判定つき） */
  credentials: CredentialStatus[];
  /** 3.4.1 定期保守計画（次回予定日は導出値。超過を先頭に） */
  plans: MaintenancePlanStatus[];
  /** 3.4.1 部品・消耗品の在庫（不足を先頭に） */
  stocks: PartStockStatus[];
  /** 3.4.2 入渠・検査（予定の近い順） */
  docks: DockPlanStatus[];
  /** 船内から届いた保守記録の機器別最新状態 */
  latestByEquipment: [string, MaintenanceRecordPayload][];
  openIssues: MaintenanceRecordPayload[];
  recentChecklists: ChecklistResultPayload[];
  /** 判定に使った証書ルールの版（画面に表示して根拠を示す） */
  credentialRuleVersion: string;
  today: string;
}

/** 1隻分の船舶・保守・検査の姿を組み立てる */
export function buildFleetBoard(vesselId: string, now = new Date()): FleetBoard {
  const today = todayLocal(now);
  const master = vesselMasterOf(vesselId);

  const maintenanceRecords = effective("maintenance_record").filter((r) => r.vesselId === vesselId);
  const checklists = effective("checklist_result").filter((c) => c.vesselId === vesselId);

  const plans = evaluateMaintenancePlans(
    effective("maintenance_plan").filter((p) => p.targetVesselId === vesselId && p.active !== false),
    today,
    maintenanceRecords,
  );
  const stocks = evaluatePartStocks(
    effective("part_stock").filter((s) => s.targetVesselId === vesselId),
  );
  const docks = effective("dock_plan")
    .filter((d) => d.targetVesselId === vesselId)
    .map((d) => evaluateDockPlan(d, today))
    .sort((a, b) => {
      // 未完了を先に、その中で予定の近い順
      const ad = a.dock.status === "done" ? 1 : 0;
      const bd = b.dock.status === "done" ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return a.dock.plannedFrom.localeCompare(b.dock.plannedFrom);
    });

  return {
    vesselId,
    master,
    environment: evaluateEnvironmentFreshness(master?.environmentVerifiedOn, today),
    credentials: evaluateCredentials(
      credentialsOf("vessel", vesselId),
      today,
      DEFAULT_CREDENTIAL_RULE_SET,
    ),
    plans,
    stocks,
    docks,
    latestByEquipment: [...latestByEquipment(maintenanceRecords).entries()],
    openIssues: openMaintenanceIssues(maintenanceRecords),
    recentChecklists: [...checklists]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 10),
    credentialRuleVersion: DEFAULT_CREDENTIAL_RULE_SET.version,
    today,
  };
}

/* ═══════════════ 3.4.1 部品・消耗品の発注 ═══════════════ */

function partStockById(id: string): PartStockPayload {
  const row = effective("part_stock").find((s) => s.id === id);
  if (!row) throw new Error("この在庫は既に更新されています。画面を開き直してください");
  return row;
}

/**
 * 発注を1段階進める（手配なし → 手配依頼中 → 発注済）。
 * 数量は変えない。訂正は supersedesId 付きの新規レコードとして追記する（12.3）。
 */
export function advancePartOrder(stockId: string, actor?: string, now = new Date()): PartStockPayload {
  const row = partStockById(stockId);
  const next = nextOrderStatus(row.orderStatus);
  if (!next) throw new Error("この部品は入荷済みです。入荷の登録で数量を足してください");
  const published = publishMaster(
    "part_stock",
    {
      ...carryOverFields(row),
      orderStatus: next,
      orderedOn: next === "ordered" ? todayLocal(now) : row.orderedOn,
    },
    { supersedesId: row.id, vesselId: row.vesselId, actor, now },
  );
  writeAuditLog({
    action: "update",
    entityKind: "part_stock",
    entityId: published.id,
    before: `発注状態: ${row.orderStatus ?? "none"}`,
    after: `発注状態: ${next}`,
    actor,
    summary: `${row.partName} の発注を進めた`,
    now,
  });
  return published;
}

/** 入荷を登録する（数量を加算し、発注状態を入荷済にする） */
export function receiveParts(
  stockId: string,
  quantity: number,
  actor?: string,
  now = new Date(),
): PartStockPayload {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("入荷した数量を1以上で入力してください");
  }
  const row = partStockById(stockId);
  const published = publishMaster(
    "part_stock",
    {
      ...carryOverFields(row),
      quantity: row.quantity + quantity,
      orderStatus: "delivered",
    },
    { supersedesId: row.id, vesselId: row.vesselId, actor, now },
  );
  writeAuditLog({
    action: "update",
    entityKind: "part_stock",
    entityId: published.id,
    before: `在庫: ${row.quantity}`,
    after: `在庫: ${published.quantity}`,
    actor,
    summary: `${row.partName} を ${quantity} 入荷`,
    now,
  });
  return published;
}

/* ═══════════════ 3.4.2 入渠の準備タスク・指摘事項 ═══════════════ */

function dockById(id: string): DockPlanPayload {
  const row = effective("dock_plan").find((d) => d.id === id);
  if (!row) throw new Error("この入渠の予定は既に更新されています。画面を開き直してください");
  return row;
}

/** 入渠前の準備タスクを消し込む（チェックの付け外し） */
export function setPrepTaskDone(
  dockId: string,
  taskKey: string,
  done: boolean,
  actor?: string,
  now = new Date(),
): DockPlanPayload {
  const row = dockById(dockId);
  const tasks = row.prepTasks ?? [];
  if (!tasks.some((p) => p.key === taskKey)) throw new Error("その準備タスクが見つかりません");
  const next = tasks.map((p) => (p.key === taskKey ? { ...p, done } : p));
  const published = publishMaster(
    "dock_plan",
    { ...carryOverFields(row), prepTasks: next },
    { supersedesId: row.id, vesselId: row.vesselId, actor, now },
  );
  writeAuditLog({
    action: "update",
    entityKind: "dock_plan",
    entityId: published.id,
    before: `準備 ${tasks.filter((p) => p.done).length}/${tasks.length}件`,
    after: `準備 ${next.filter((p) => p.done).length}/${next.length}件`,
    actor,
    summary: `${row.title} の準備タスクを更新`,
    now,
  });
  return published;
}

export interface FindingInput {
  dockId: string;
  /** 既存の指摘を更新するときはそのキー。空なら新規追加 */
  key?: string;
  content: string;
  dueOn?: string;
  status: "open" | "in_progress" | "closed";
  action?: string;
}

/** 検査の指摘事項を追加・更新する */
export function upsertFinding(
  input: FindingInput,
  actor?: string,
  now = new Date(),
): DockPlanPayload {
  const row = dockById(input.dockId);
  const findings = row.findings ?? [];
  const content = input.content.trim();
  if (!content) throw new Error("指摘の内容を入力してください");

  const key = input.key?.trim() || `f-${Date.now().toString(36)}`;
  const entry = {
    key,
    content,
    dueOn: input.dueOn?.trim() || undefined,
    status: input.status,
    action: input.action?.trim() || undefined,
  };
  const exists = findings.some((f) => f.key === key);
  const next = exists ? findings.map((f) => (f.key === key ? { ...f, ...entry } : f)) : [...findings, entry];

  const published = publishMaster(
    "dock_plan",
    { ...carryOverFields(row), findings: next },
    { supersedesId: row.id, vesselId: row.vesselId, actor, now },
  );
  writeAuditLog({
    action: "update",
    entityKind: "dock_plan",
    entityId: published.id,
    before: `指摘 ${findings.length}件`,
    after: `指摘 ${next.length}件`,
    actor,
    summary: exists ? `${row.title} の指摘を更新` : `${row.title} に指摘を追加`,
    now,
  });
  return published;
}
