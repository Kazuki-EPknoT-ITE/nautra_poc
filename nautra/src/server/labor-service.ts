import { evaluateProcedures } from "@/domain/procedures/deadlines";
import { addDays, evaluateDaily, evaluateWeekly, ymdLocal } from "@/domain/labor-law/evaluate";
import type { CheckLevel, DailyLaborSummary, LaborCheck } from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";
import { CREW_MEMBERS, type CrewMember } from "@/lib/crew";
import { resolveApproval, type ApprovalPayload } from "@/sync-protocol/events";
import { currentLaborRuleSet } from "./labor-rules";
import { expiringLeaveAlerts } from "./leave-service";
import { buildCredentialAlerts, buildManningBoard } from "./manning-service";
import { effective, todayLocal } from "./master-service";
import { getApprovalEvents, getEventCountsByKind, getSyncStats, getTimeRecords } from "./store";

/**
 * 陸上ダッシュボード用のドメインサービス（apps/web/server/labor 相当）。
 * 判定は packages/domain の純関数へ委譲し、閾値は rule_sets（＋労使協定）から注入する。
 */

export interface CrewDashboardRow {
  crew: CrewMember;
  days: DailyLaborSummary[]; // 直近7日（古い順）
  weekly: LaborCheck;
  weeklyTotalMinutes: number;
  approvalByDate: Record<string, ApprovalPayload | null>;
  pendingDates: string[]; // 記録があるのに承認未了の日
}

/**
 * S-01「期限接近一覧」の1行（基本設計書 6.2）。
 * 証書の期限（12.4）と手続きの着手期限（6.6②）を**同じ並び**で見せ、
 * 「次に何をすべきか」を1か所で判断できるようにする。
 */
export interface DeadlineItem {
  key: string;
  kind: "credential" | "procedure" | "leave";
  level: CheckLevel;
  /** 何の期限か */
  title: string;
  /** 誰・どの船のことか */
  subject: string;
  /** 日常語の一文 */
  message: string;
  /** 期限までの日数（過ぎていれば負） */
  days: number | null;
  href: string;
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
    /** 配乗できない船員の数（証書・保険・労務のブロック条件。3.1.2） */
    manningBlocked: number;
    /** 期限が迫っている件数（証書＋手続き） */
    deadlineUrgent: number;
  };
  /** 期限接近一覧（緊急度順） */
  deadlines: DeadlineItem[];
  sync: ReturnType<typeof getSyncStats>;
  /** 受信イベント種別ごとの件数（船内記録の受信状況） */
  countsByKind: Record<string, number>;
  levelByCrewToday: Record<string, CheckLevel>;
}

const LEVEL_ORDER: Record<CheckLevel, number> = { violation: 0, caution: 1, ok: 2 };

/**
 * 証書・手続き・休暇の時効を1つの並びにした期限接近一覧。
 * 判定はそれぞれのドメイン純関数（`evaluateCredentials` / `evaluateProcedures`）が済ませており、
 * ここは**並べ替えと行き先の解決**だけを行う（判定を二重に書かない）。
 */
export function buildDeadlineBoard(now = new Date()): DeadlineItem[] {
  const today = todayLocal(now);
  const items: DeadlineItem[] = [];

  for (const alert of buildCredentialAlerts(now)) {
    // 証書名に区分がすでに含まれていることが多いため、重複するときは名前だけを出す
    const category = t.credentialCategory[alert.status.credential.category] ?? "";
    const name = alert.status.credential.name;
    items.push({
      key: `cred-${alert.status.credential.id}`,
      kind: "credential",
      level: alert.status.level,
      title: !category || name.includes(category) ? name : `${category}（${name}）`,
      subject: alert.subjectName,
      message: alert.status.message,
      days: alert.status.daysToExpiry,
      href:
        alert.subjectType === "crew" ? `/shore/crew/${alert.subjectId}` : `/shore/fleet`,
    });
  }

  for (const status of evaluateProcedures(effective("procedure_task"), today)) {
    if (status.level === "ok") continue;
    items.push({
      key: `proc-${status.task.id}`,
      kind: "procedure",
      level: status.level,
      title: status.task.title,
      subject: t.procedureGroup[status.task.group] ?? status.task.group,
      message: status.message,
      days: status.daysToDue,
      href: "/shore/procedures",
    });
  }

  for (const alert of expiringLeaveAlerts(now)) {
    items.push({
      key: `leave-${alert.grant.record.id}`,
      kind: "leave",
      level: "caution",
      title: `${t.leaveKind[alert.grant.record.kind] ?? ""}の時効`,
      subject: alert.crewName,
      message: `あと ${alert.grant.daysToExpiry}日 で ${alert.grant.record.days}日分が使えなくなります`,
      days: alert.grant.daysToExpiry,
      href: "/shore/labor",
    });
  }

  return items.sort((a, b) => {
    if (LEVEL_ORDER[a.level] !== LEVEL_ORDER[b.level])
      return LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
    return (a.days ?? 99999) - (b.days ?? 99999);
  });
}

export function buildShoreDashboard(now = new Date()): ShoreDashboard {
  const today = ymdLocal(now);
  const records = getTimeRecords();
  const approvals = getApprovalEvents();
  // 労使協定を反映した判定基準（6.5）。既定値を直接使わない
  const ruleSet = currentLaborRuleSet(now);

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

  const deadlines = buildDeadlineBoard(now);
  const manningBlocked = buildManningBoard(now).filter(
    (r) => r.eligibility.status === "blocked",
  ).length;

  return {
    generatedAt: now.toISOString(),
    today,
    appliedRuleVersion: ruleSet.version,
    rows,
    totals: {
      violationDays,
      cautionDays,
      pendingApprovals,
      remandedDays,
      manningBlocked,
      deadlineUrgent: deadlines.filter((d) => d.level === "violation").length,
    },
    deadlines,
    sync: getSyncStats(),
    countsByKind: getEventCountsByKind(),
    levelByCrewToday,
  };
}

export { addDays };
