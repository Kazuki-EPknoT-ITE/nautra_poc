import { evaluateWeekly, ymdLocal } from "@/domain/labor-law/evaluate";
import type { CheckLevel } from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";
import { latestByEquipment, openMaintenanceIssues } from "@/lib/maintenance-status";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";
import { resolveApproval } from "@/sync-protocol/events";
import { latestBySupersedes, type ShiftPlanPayload } from "@/sync-protocol/records";
import { getApprovalEvents, getRecordsOfKind, getTimeRecords } from "./store";

/**
 * S-02 船員一覧 / S-03 船員カルテ / S-11 船舶・保守 の参照ビュー用サービス。
 *
 * いずれも受信済みの一次記録から導出するだけで、陸上で新しく値を持たない
 * （導出値をカラムとして持たない。要件定義書 12.2 / ガードレール④）。
 * 船員の基本属性・資格は船員マスタ（`master-service` / `manning-service`）が正本で、
 * ここは**労務と当直・配置・船内記録**だけを組み立てる。
 */

/** 直近7日の労務・当直（船員マスタに載っていない予備船員でも算出できる） */
export interface CrewLaborSnapshot {
  crewMemberId: string;
  /** 直近7日の労働時間 */
  weeklyMinutes: number;
  weeklyLevel: CheckLevel;
  /** 直近7日で記録があるのに未承認の日数 */
  pendingDays: number;
  /** 直近7日で警告・注意だった日数 */
  violationDays: number;
  cautionDays: number;
  /** 本日の当直（陸上が配信した計画） */
  todayWatches: ShiftPlanPayload[];
}

export function buildLaborSnapshot(crewMemberId: string, now = new Date()): CrewLaborSnapshot {
  const today = ymdLocal(now);
  const { days, check, totalMinutes } = evaluateWeekly({
    crewMemberId,
    endDate: today,
    records: getTimeRecords(),
    now,
    ruleSet: DEFAULT_LABOR_RULE_SET,
  });
  const approvals = getApprovalEvents();
  const plans = latestBySupersedes(getRecordsOfKind("shift_plan"));

  let pendingDays = 0;
  let violationDays = 0;
  let cautionDays = 0;
  for (const d of days) {
    if (!d.hasRecords) continue;
    if (d.level === "violation") violationDays += 1;
    else if (d.level === "caution") cautionDays += 1;
    const approval = resolveApproval(
      approvals.filter((a) => a.payload.crewMemberId === crewMemberId && a.payload.date === d.date),
    );
    if (!approval) pendingDays += 1;
  }

  return {
    crewMemberId,
    weeklyMinutes: totalMinutes,
    weeklyLevel: check.level,
    pendingDays,
    violationDays,
    cautionDays,
    todayWatches: plans
      .filter((p) => p.planType === "watch" && p.crewMemberId === crewMemberId && p.date === today)
      .sort((a, b) => (a.from ?? "").localeCompare(b.from ?? "")),
  };
}

/** 複数船員分の労務スナップショット（S-02 一覧で1行ずつ引くための対応表） */
export function buildLaborSnapshots(
  crewMemberIds: string[],
  now = new Date(),
): Map<string, CrewLaborSnapshot> {
  return new Map(crewMemberIds.map((id) => [id, buildLaborSnapshot(id, now)]));
}

export interface CrewKarte {
  labor: CrewLaborSnapshot;
  /** 配置表（場面別の持ち場） */
  stations: ShiftPlanPayload[];
  /** 直近の船内記録（種別・日時・要約） */
  recentRecords: { kind: string; occurredAt: string; summary: string }[];
}

/**
 * S-03 船員カルテの船内記録部分。
 * 予備船員（乗船していない＝船内記録が無い）でも空の集約を返す。
 */
export function buildCrewKarte(crewMemberId: string, now = new Date()): CrewKarte {
  const labor = buildLaborSnapshot(crewMemberId, now);
  const plans = latestBySupersedes(getRecordsOfKind("shift_plan"));

  const recent: { kind: string; occurredAt: string; summary: string }[] = [];
  for (const r of getRecordsOfKind("checklist_result")) {
    if (r.recordedBy !== crewMemberId) continue;
    recent.push({
      kind: "点検表",
      occurredAt: r.occurredAt,
      summary: `${t.checklistTemplate[r.templateId] ?? r.templateId}（${
        r.overall === "pass" ? "合格" : "不合格"
      } / 全${r.items.length}項目）`,
    });
  }
  for (const r of getRecordsOfKind("maintenance_record")) {
    if (r.crewMemberId !== crewMemberId) continue;
    recent.push({
      kind: "点検・保守",
      occurredAt: r.occurredAt,
      summary: `${t.equipment[r.equipment]} / ${t.condition[r.condition]}`,
    });
  }
  for (const r of getRecordsOfKind("voyage_log")) {
    if (r.recordedBy !== crewMemberId) continue;
    recent.push({ kind: "航海日誌", occurredAt: r.occurredAt, summary: t.voyageLogType[r.logType] ?? r.logType });
  }
  for (const r of getRecordsOfKind("drill_record")) {
    if (!r.participants.includes(crewMemberId)) continue;
    recent.push({
      kind: "操練",
      occurredAt: r.occurredAt,
      summary: `${t.drillType[r.drillType] ?? r.drillType} / ${r.durationMinutes}分`,
    });
  }
  for (const r of getRecordsOfKind("alcohol_check")) {
    if (r.crewMemberId !== crewMemberId) continue;
    recent.push({
      kind: "アルコール検知",
      occurredAt: r.occurredAt,
      summary: `${r.valueMgPerL.toFixed(2)} mg/L（${r.result === "pass" ? "適合" : "不適合"}）`,
    });
  }

  return {
    labor,
    stations: plans.filter((p) => p.planType === "station" && p.crewMemberId === crewMemberId),
    recentRecords: recent.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 20),
  };
}

/** S-11 船舶・保守: 機器ごとの最新状態と要対応の一覧（船内の記録から導出） */
export function buildFleetOverview() {
  const maintenance = getRecordsOfKind("maintenance_record");
  const checklists = getRecordsOfKind("checklist_result");
  return {
    latestByEquipment: [...latestByEquipment(maintenance).entries()],
    openIssues: openMaintenanceIssues(maintenance),
    recentChecklists: [...checklists]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 10),
  };
}
