import { evaluateWeekly, ymdLocal } from "@/domain/labor-law/evaluate";
import type { CheckLevel } from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";
import { latestByEquipment, openMaintenanceIssues } from "@/lib/maintenance-status";
import { CREW_MEMBERS, type CrewMember } from "@/lib/crew";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";
import { resolveApproval } from "@/sync-protocol/events";
import { latestBySupersedes, type ShiftPlanPayload } from "@/sync-protocol/records";
import { getApprovalEvents, getRecordsOfKind, getTimeRecords } from "./store";

/**
 * S-02 船員一覧 / S-03 船員カルテ / S-11 船舶・保守 の参照ビュー用サービス。
 *
 * いずれも受信済みの一次記録から導出するだけで、陸上で新しく値を持たない
 * （導出値をカラムとして持たない。要件定義書 12.2 / ガードレール④）。
 * 船員マスタの編集（S-04）は PoC 未実装のため、マスタは定数を参照する。
 */

export interface CrewOverviewRow {
  crew: CrewMember;
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

export function buildCrewOverview(now = new Date()): CrewOverviewRow[] {
  const today = ymdLocal(now);
  const records = getTimeRecords();
  const approvals = getApprovalEvents();
  const plans = latestBySupersedes(getRecordsOfKind("shift_plan"));

  return CREW_MEMBERS.map((crew) => {
    const { days, check, totalMinutes } = evaluateWeekly({
      crewMemberId: crew.id,
      endDate: today,
      records,
      now,
      ruleSet: DEFAULT_LABOR_RULE_SET,
    });
    let pendingDays = 0;
    let violationDays = 0;
    let cautionDays = 0;
    for (const d of days) {
      if (!d.hasRecords) continue;
      if (d.level === "violation") violationDays += 1;
      else if (d.level === "caution") cautionDays += 1;
      const approval = resolveApproval(
        approvals.filter((a) => a.payload.crewMemberId === crew.id && a.payload.date === d.date),
      );
      if (!approval) pendingDays += 1;
    }
    return {
      crew,
      weeklyMinutes: totalMinutes,
      weeklyLevel: check.level,
      pendingDays,
      violationDays,
      cautionDays,
      todayWatches: plans
        .filter((p) => p.planType === "watch" && p.crewMemberId === crew.id && p.date === today)
        .sort((a, b) => (a.from ?? "").localeCompare(b.from ?? "")),
    };
  });
}

export interface CrewKarte {
  row: CrewOverviewRow;
  /** 配置表（場面別の持ち場） */
  stations: ShiftPlanPayload[];
  /** 直近の船内記録（種別・日時・要約） */
  recentRecords: { kind: string; occurredAt: string; summary: string }[];
}

/** S-03 船員カルテ: 一人分の情報を1ページに集約する（参照のみ） */
export function buildCrewKarte(crewMemberId: string, now = new Date()): CrewKarte | null {
  const row = buildCrewOverview(now).find((r) => r.crew.id === crewMemberId);
  if (!row) return null;
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
    row,
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
