import type {
  CheckLevel,
  DailyLaborSummary,
  LaborCheck,
  LaborRuleSet,
  RestPeriod,
  TimeRecord,
  WorkCategory,
  WorkInterval,
} from "./types";
import { buildIntervals, mergeRanges, overlapMinutes } from "./intervals";

/** ローカル日付の YYYY-MM-DD */
export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" をローカル 00:00 の Date に */
export function startOfLocalDay(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function addDays(ymd: string, days: number): string {
  const d = startOfLocalDay(ymd);
  d.setDate(d.getDate() + days);
  return ymdLocal(d);
}

/** 上限系チェック: 超過=警告 / 接近(比率以上)=注意 */
function levelForMax(actual: number, limit: number, cautionRatio: number): CheckLevel {
  if (actual > limit) return "violation";
  if (actual >= limit * cautionRatio) return "caution";
  return "ok";
}

/** 下限系チェック: 不足=警告 / 下限付近(limit/比率 未満)=注意 */
function levelForMin(actual: number, limit: number, cautionRatio: number): CheckLevel {
  if (actual < limit) return "violation";
  if (actual < limit / cautionRatio) return "caution";
  return "ok";
}

export function worstLevel(levels: CheckLevel[]): CheckLevel {
  if (levels.includes("violation")) return "violation";
  if (levels.includes("caution")) return "caution";
  return "ok";
}

/**
 * 指定ローカル日における日次労働・休息の集計と法令判定。
 * 閾値は ruleSet から注入され、この関数は内部に法令定数を持たない（ガードレール⑪）。
 * 進行中区間（終了打刻なし）は now までを労働として扱う。
 *
 * 休息の数え方（PoC 規約）:
 * - 休息合計は暦日 24h 内の労働区間の補集合（経過時間ベース）
 * - 分割回数・最長休息は「日を跨いで連続する休息ブロック」を連結したうえで、
 *   ブロックの開始時刻が属する日にカウントする（当直2交代 04-08/16-20 のような
 *   標準パターンで夜間休息が2分割に誤計上されることを防ぐ）
 * - 進行中の日は、残り時間を休息と見なした場合の見込みで判定し、早期の誤警告を避ける
 *   （見込みでも基準に届かない場合のみ警告する）
 */
export function evaluateDaily(params: {
  crewMemberId: string;
  date: string;
  records: TimeRecord[];
  now: Date;
  ruleSet: LaborRuleSet;
}): DailyLaborSummary {
  const { crewMemberId, date, records, now, ruleSet } = params;
  const rules = ruleSet.values;
  const dayStart = startOfLocalDay(date);
  const dayEnd = startOfLocalDay(addDays(date, 1));
  const effectiveEnd = new Date(Math.min(dayEnd.getTime(), Math.max(now.getTime(), dayStart.getTime())));

  const crewRecords = records.filter((r) => r.crewMemberId === crewMemberId);
  const intervals = buildIntervals(crewRecords);

  // その日に重なる区間へクリップ
  type Clipped = { start: Date; end: Date; category: WorkCategory; open: boolean };
  const clipped: Clipped[] = [];
  let hasOpenInterval = false;
  for (const iv of intervals) {
    const end = iv.endAt ?? now;
    if (iv.endAt === null) hasOpenInterval = true;
    // 重なりはミリ秒で判定する。分に丸めて 0 分になる短い区間（1分未満の打刻ペア）でも
    // その日の記録として残し、集計・承認の対象から消えないようにする（記録の非破壊）。
    const overlapMs =
      Math.min(end.getTime(), dayEnd.getTime()) - Math.max(iv.startAt.getTime(), dayStart.getTime());
    if (overlapMs <= 0) continue;
    clipped.push({
      start: new Date(Math.max(iv.startAt.getTime(), dayStart.getTime())),
      end: new Date(Math.min(end.getTime(), dayEnd.getTime())),
      category: iv.workCategory,
      open: iv.endAt === null,
    });
  }
  clipped.sort((a, b) => a.start.getTime() - b.start.getTime());

  // 種別ごとの内訳（並列作業があるため、内訳の合計は労働時間合計を超えうる）
  const workedByCategory: Partial<Record<WorkCategory, number>> = {};
  for (const c of clipped) {
    const m = Math.round((c.end.getTime() - c.start.getTime()) / 60000);
    workedByCategory[c.category] = (workedByCategory[c.category] ?? 0) + m;
  }

  // 労働時間の合計は区間の**和集合**で求める。
  // 並列打刻（当直しながら荷役監督など）でも同時刻を二重に数えない。
  const merged = mergeRanges(clipped);
  const workedMinutes = merged.reduce(
    (sum, m) => sum + Math.round((m.end.getTime() - m.start.getTime()) / 60000),
    0,
  );

  // 休息時間 = 暦日内で労働区間に覆われていない時間帯（now までを対象）
  const restPeriods: RestPeriod[] = [];
  let cursor = dayStart;
  for (const m of merged) {
    if (m.start.getTime() > cursor.getTime()) {
      const minutes = Math.round((m.start.getTime() - cursor.getTime()) / 60000);
      if (minutes > 0)
        restPeriods.push({ startAt: cursor.toISOString(), endAt: m.start.toISOString(), minutes });
    }
    if (m.end.getTime() > cursor.getTime()) cursor = m.end;
  }
  if (effectiveEnd.getTime() > cursor.getTime()) {
    const minutes = Math.round((effectiveEnd.getTime() - cursor.getTime()) / 60000);
    if (minutes > 0)
      restPeriods.push({ startAt: cursor.toISOString(), endAt: effectiveEnd.toISOString(), minutes });
  }
  const restTotalMinutes = restPeriods.reduce((a, p) => a + p.minutes, 0);

  // 日跨ぎ連結の休息ブロック（全期間の労働区間の補集合）。
  // 分割回数・最長休息は、ブロック開始時刻が本日に属するものでカウントする。
  const dayCompleted = now.getTime() >= dayEnd.getTime();
  const mergedAll = mergeRanges(intervals.map((iv) => ({ start: iv.startAt, end: iv.endAt ?? now })));
  const restBlocks: { start: Date; end: Date | null }[] = [];
  if (mergedAll.length > 0) {
    // 記録開始前（最初の労働区間より前）の時間帯は「データ範囲外」とし、
    // 休息ブロックとして数えない（履歴の途中から記録を始めた日の誤警告を防ぐ）
    for (let i = 1; i < mergedAll.length; i++) {
      if (mergedAll[i].start.getTime() > mergedAll[i - 1].end.getTime()) {
        restBlocks.push({ start: mergedAll[i - 1].end, end: mergedAll[i].start });
      }
    }
    restBlocks.push({ start: mergedAll[mergedAll.length - 1].end, end: null }); // 進行中の休息
  }
  const dayRestBlocks = restBlocks.filter(
    (b) =>
      b.start.getTime() >= dayStart.getTime() && b.start.getTime() < effectiveEnd.getTime(),
  );
  const splitCount = dayRestBlocks.length;
  const longestMinutes = dayRestBlocks.reduce((max, b) => {
    const end = b.end ?? now; // 進行中の休息は now までの実績
    return Math.max(max, Math.round((end.getTime() - b.start.getTime()) / 60000));
  }, 0);
  // 進行中の日は「残りをすべて休息に充てた場合」の見込みで下限チェックする
  const remainingMinutes = dayCompleted
    ? 0
    : Math.max(0, Math.round((dayEnd.getTime() - effectiveEnd.getTime()) / 60000));

  const hasRecords = clipped.length > 0;
  const checks: LaborCheck[] = [];
  if (hasRecords) {
    checks.push({
      key: "daily_max",
      level: levelForMax(workedMinutes, rules.dailyMaxMinutes, rules.cautionRatio),
      actual: workedMinutes,
      limit: rules.dailyMaxMinutes,
    });
    checks.push({
      key: "rest_total",
      level: levelForMin(
        restTotalMinutes + remainingMinutes,
        rules.restMinDailyMinutes,
        rules.cautionRatio,
      ),
      actual: restTotalMinutes,
      limit: rules.restMinDailyMinutes,
    });
    checks.push({
      key: "rest_split",
      level: splitCount > rules.restSplitMax ? "violation" : "ok",
      actual: splitCount,
      limit: rules.restSplitMax,
    });
    checks.push({
      key: "rest_longest",
      // 最長休息は日末まで確定しないため、確定日のみ判定する（進行中の日は参考表示）
      level: dayCompleted
        ? levelForMin(longestMinutes, rules.restLongestMinMinutes, rules.cautionRatio)
        : "ok",
      actual: longestMinutes,
      limit: rules.restLongestMinMinutes,
    });
  }

  return {
    crewMemberId,
    date,
    workedMinutes,
    workedByCategory,
    restPeriods,
    restTotalMinutes,
    checks,
    level: worstLevel(checks.map((c) => c.level)),
    appliedRuleVersion: ruleSet.version,
    hasOpenInterval,
    hasRecords,
  };
}

/**
 * 連続1週間（endDate を含む直近7暦日）の労働時間合計と上限判定。
 * 「あらゆる連続1週間」の判定は、対象期間の各日を終端とするローリング窓で行う。
 */
export function evaluateWeekly(params: {
  crewMemberId: string;
  endDate: string;
  records: TimeRecord[];
  now: Date;
  ruleSet: LaborRuleSet;
}): { check: LaborCheck; totalMinutes: number; days: DailyLaborSummary[] } {
  const { crewMemberId, endDate, records, now, ruleSet } = params;
  const days: DailyLaborSummary[] = [];
  for (let i = 6; i >= 0; i--) {
    days.push(
      evaluateDaily({ crewMemberId, date: addDays(endDate, -i), records, now, ruleSet }),
    );
  }
  const totalMinutes = days.reduce((a, d) => a + d.workedMinutes, 0);
  const check: LaborCheck = {
    key: "weekly_max",
    level: levelForMax(totalMinutes, ruleSet.values.weeklyMaxMinutes, ruleSet.values.cautionRatio),
    actual: totalMinutes,
    limit: ruleSet.values.weeklyMaxMinutes,
  };
  return { check, totalMinutes, days };
}

/** 直近 n 日の労働時間合計（4週合計の参考表示用。上限判定は基準労働期間の確定後） */
export function totalWorkedMinutes(params: {
  crewMemberId: string;
  endDate: string;
  days: number;
  records: TimeRecord[];
  now: Date;
  ruleSet: LaborRuleSet;
}): number {
  const { crewMemberId, endDate, days, records, now, ruleSet } = params;
  let total = 0;
  for (let i = 0; i < days; i++) {
    total += evaluateDaily({
      crewMemberId,
      date: addDays(endDate, -i),
      records,
      now,
      ruleSet,
    }).workedMinutes;
  }
  return total;
}

export { buildIntervals };
export type { WorkInterval };
