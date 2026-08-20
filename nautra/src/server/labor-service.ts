import { addDays, evaluateDaily, evaluateWeekly, ymdLocal } from "@/domain/labor-law/evaluate";
import type { CheckLevel, DailyLaborSummary, LaborCheck } from "@/domain/labor-law/types";
import { CREW_MEMBERS, type CrewMember } from "@/lib/crew";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";
import { resolveApproval, type ApprovalPayload } from "@/sync-protocol/events";
import { getApprovalEvents, getSyncStats, getTimeRecords } from "./store";

/**
 * 陸上ダッシュボード用のドメインサービス（apps/web/server/labor 相当）。
 * 判定は packages/domain の純関数へ委譲し、閾値は rule_sets から注入する。
 */

export interface CrewDashboardRow {
  crew: CrewMember;
  days: DailyLaborSummary[]; // 直近7日（古い順）
  weekly: LaborCheck;
  weeklyTotalMinutes: number;
  approvalByDate: Record<string, ApprovalPayload | null>;
  pendingDates: string[]; // 記録があるのに承認未了の日
}

export interface ShoreDashboard {
  generatedAt: string;
  today: string;
  appliedRuleVersion: string;
  rows: CrewDashboardRow[];
  totals: {
    violationDays: number;
    cautionDays: number;
    pendingApprovals: number;
    remandedDays: number;
  };
  sync: ReturnType<typeof getSyncStats>;
  levelByCrewToday: Record<string, CheckLevel>;
}

export function buildShoreDashboard(now = new Date()): ShoreDashboard {
  const today = ymdLocal(now);
  const records = getTimeRecords();
  const approvals = getApprovalEvents();
  const ruleSet = DEFAULT_LABOR_RULE_SET;

  const rows: CrewDashboardRow[] = [];
  let violationDays = 0;
  let cautionDays = 0;
  let pendingApprovals = 0;
  let remandedDays = 0;
  const levelByCrewToday: Record<string, CheckLevel> = {};

  for (const crew of CREW_MEMBERS) {
    const { days, check: weekly, totalMinutes } = evaluateWeekly({
      crewMemberId: crew.id,
      endDate: today,
      records,
      now,
      ruleSet,
    });

    const approvalByDate: Record<string, ApprovalPayload | null> = {};
    const pendingDates: string[] = [];
    for (const d of days) {
      const dayApprovals = approvals.filter(
        (a) => a.payload.crewMemberId === crew.id && a.payload.date === d.date,
      );
      const resolved = resolveApproval(dayApprovals);
      approvalByDate[d.date] = resolved;
      if (d.hasRecords) {
        if (d.level === "violation") violationDays += 1;
        else if (d.level === "caution") cautionDays += 1;
        if (!resolved) {
          pendingDates.push(d.date);
          pendingApprovals += 1;
        } else if (resolved.decision === "remanded") {
          remandedDays += 1;
        }
      }
    }

    const todaySummary = evaluateDaily({ crewMemberId: crew.id, date: today, records, now, ruleSet });
    levelByCrewToday[crew.id] = todaySummary.hasRecords ? todaySummary.level : "ok";

    rows.push({
      crew,
      days,
      weekly,
      weeklyTotalMinutes: totalMinutes,
      approvalByDate,
      pendingDates,
    });
  }

  return {
    generatedAt: now.toISOString(),
    today,
    appliedRuleVersion: ruleSet.version,
    rows,
    totals: { violationDays, cautionDays, pendingApprovals, remandedDays },
    sync: getSyncStats(),
    levelByCrewToday,
  };
}

export { addDays };
