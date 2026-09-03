import type {
  CheckLevel,
  DailyLaborSummary,
  LaborCheck,
  LaborCheckKey,
  LaborRuleSet,
  LaborRuleValues,
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
  type Clipped = {
    start: Date;
    end: Date;
    category: WorkCategory;
    open: boolean;
    exceptional: boolean;
  };
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
      exceptional: Boolean(iv.exceptionKind),
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

  /**
   * 上限算定の対象時間（3.2.5⑥ 安全臨時労働・緊急作業の別枠管理）。
   * 別枠の区間は**記録簿には実績として残しつつ、上限判定からは外す**。
   * 通常作業と時間帯が重なる部分は通常作業として数えるため、
   * 「別枠を除いた区間の和集合」で求める（除外による過小計上を防ぐ）。
   */
  const countableWorkedMinutes = mergeRanges(clipped.filter((c) => !c.exceptional)).reduce(
    (sum, m) => sum + Math.round((m.end.getTime() - m.start.getTime()) / 60000),
    0,
  );
  const exceptionalMinutes = workedMinutes - countableWorkedMinutes;

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
      // 上限判定は別枠（安全臨時労働・緊急作業）を除いた時間で行う（3.2.5⑥）
      level: levelForMax(countableWorkedMinutes, rules.dailyMaxMinutes, rules.cautionRatio),
      actual: countableWorkedMinutes,
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
    countableWorkedMinutes,
    exceptionalMinutes,
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
  // 上限判定は別枠（安全臨時労働・緊急作業）を除いた時間で行う（3.2.5⑥）
  const totalMinutes = days.reduce((a, d) => a + d.countableWorkedMinutes, 0);
  const check: LaborCheck = {
    key: "weekly_max",
    level: levelForMax(totalMinutes, ruleSet.values.weeklyMaxMinutes, ruleSet.values.cautionRatio),
    actual: totalMinutes,
    limit: ruleSet.values.weeklyMaxMinutes,
  };
  return { check, totalMinutes, days };
}

/**
 * 週1日以上の休日付与のチェック（要件定義書 3.2.5⑤）。
 *
 * 休日 = その暦日に労働記録が1件も無い日、または休日として付与された日（leaveDates）。
 * 「あらゆる連続1週間」で1日以上の休日があることを確認する。
 * 休日の実体（付与・取得）は leave_record が持ち、ここには日付集合として注入する
 * （ドメインは DB を知らない。ガードレール①）。
 */
export function evaluateRestDays(params: {
  crewMemberId: string;
  endDate: string;
  records: TimeRecord[];
  /** 休日として付与・取得された日（YYYY-MM-DD） */
  leaveDates?: Set<string>;
  now: Date;
  ruleSet: LaborRuleSet;
}): { check: LaborCheck; restDates: string[]; days: DailyLaborSummary[] } {
  const { crewMemberId, endDate, records, leaveDates, now, ruleSet } = params;
  const days: DailyLaborSummary[] = [];
  for (let i = 6; i >= 0; i--) {
    days.push(evaluateDaily({ crewMemberId, date: addDays(endDate, -i), records, now, ruleSet }));
  }
  const restDates = days
    .filter((d) => !d.hasRecords || leaveDates?.has(d.date))
    .map((d) => d.date);
  const required = ruleSet.values.restDaysPerWeek;
  const check: LaborCheck = {
    key: "rest_day",
    // 休日は「不足＝警告」。1日も無ければ違反、必要日数ちょうどは適合
    level: restDates.length < required ? "violation" : "ok",
    actual: restDates.length,
    limit: required,
  };
  return { check, restDates, days };
}

/** 期間集計の結果（4週・基準労働期間・月次で共用） */
export interface PeriodLaborSummary {
  crewMemberId: string;
  from: string;
  to: string;
  days: DailyLaborSummary[];
  /** 実績の労働時間合計（別枠を含む。記録簿・給与連携で使う） */
  workedMinutes: number;
  /** 上限算定の対象時間（別枠を除く） */
  countableWorkedMinutes: number;
  exceptionalMinutes: number;
  /** 労働記録のあった日数 */
  workedDays: number;
  /** 休日（記録なし or 付与）の日数 */
  restDays: number;
  /** 所定労働時間を超えた分の合計（時間外。給与連携の基礎） */
  overtimeMinutes: number;
  /** 週平均の労働時間（分）。基準労働期間の 40h/週 判定に用いる */
  weeklyAverageMinutes: number;
  checks: LaborCheck[];
  level: CheckLevel;
  appliedRuleVersion: string;
}

/**
 * 任意期間の集計と上限判定（要件定義書 3.2.1 自動集計 / 3.2.5③）。
 * 4週間・基準労働期間・月単位のいずれもこの関数で求める（集計ロジックを重複させない）。
 *
 * 判定する項目:
 * - four_week_max      : 28日窓の労働時間上限
 * - reference_period   : 基準労働期間の週平均40時間（3.2.4）
 * - monthly_overtime   : 1月の時間外労働上限（労使協定）
 * - rest_day           : 期間内の休日日数（週あたり必要数 × 週数）
 */
export function evaluatePeriod(params: {
  crewMemberId: string;
  /** 期間の開始日（含む） */
  from: string;
  /** 期間の終了日（含む） */
  to: string;
  records: TimeRecord[];
  leaveDates?: Set<string>;
  now: Date;
  ruleSet: LaborRuleSet;
  /** 判定に含めるチェック。省略時は期間長から自動選択 */
  include?: LaborCheckKey[];
}): PeriodLaborSummary {
  const { crewMemberId, from, to, records, leaveDates, now, ruleSet } = params;
  const rules = ruleSet.values;

  const days: DailyLaborSummary[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days.push({ ...evaluateDaily({ crewMemberId, date: d, records, now, ruleSet }) });
    if (days.length > 400) break; // 安全弁（不正な期間指定でも停止する）
  }
  const dayCount = days.length;

  const workedMinutes = days.reduce((a, d) => a + d.workedMinutes, 0);
  const countableWorkedMinutes = days.reduce((a, d) => a + d.countableWorkedMinutes, 0);
  const exceptionalMinutes = workedMinutes - countableWorkedMinutes;
  const workedDays = days.filter((d) => d.hasRecords).length;
  const restDays = days.filter((d) => !d.hasRecords || leaveDates?.has(d.date)).length;
  const overtimeMinutes = days.reduce(
    (a, d) => a + Math.max(0, d.countableWorkedMinutes - rules.dailyStandardMinutes),
    0,
  );
  const weeks = dayCount / 7;
  const weeklyAverageMinutes = weeks > 0 ? Math.round(countableWorkedMinutes / weeks) : 0;

  const include =
    params.include ??
    ([
      dayCount >= 28 ? "four_week_max" : null,
      dayCount >= 28 ? "reference_period" : null,
      "monthly_overtime",
      "rest_day",
    ].filter(Boolean) as LaborCheckKey[]);

  const checks: LaborCheck[] = [];
  if (include.includes("four_week_max")) {
    // 28日ぶんに正規化して比較する（月末月初で日数が変わっても基準を揃える）
    const normalized = dayCount === 28 ? countableWorkedMinutes : Math.round((countableWorkedMinutes / dayCount) * 28);
    checks.push({
      key: "four_week_max",
      level: levelForMax(normalized, rules.fourWeekMaxMinutes, rules.cautionRatio),
      actual: normalized,
      limit: rules.fourWeekMaxMinutes,
    });
  }
  if (include.includes("reference_period")) {
    checks.push({
      key: "reference_period",
      level: levelForMax(
        weeklyAverageMinutes,
        rules.referenceWeeklyAverageMinutes,
        rules.cautionRatio,
      ),
      actual: weeklyAverageMinutes,
      limit: rules.referenceWeeklyAverageMinutes,
    });
  }
  if (include.includes("monthly_overtime")) {
    checks.push({
      key: "monthly_overtime",
      level: levelForMax(overtimeMinutes, rules.monthlyOvertimeMaxMinutes, rules.cautionRatio),
      actual: overtimeMinutes,
      limit: rules.monthlyOvertimeMaxMinutes,
    });
  }
  if (include.includes("rest_day")) {
    const required = Math.floor(weeks) * rules.restDaysPerWeek;
    checks.push({
      key: "rest_day",
      level: restDays < required ? "violation" : "ok",
      actual: restDays,
      limit: required,
    });
  }

  return {
    crewMemberId,
    from,
    to,
    days,
    workedMinutes,
    countableWorkedMinutes,
    exceptionalMinutes,
    workedDays,
    restDays,
    overtimeMinutes,
    weeklyAverageMinutes,
    checks,
    level: worstLevel(checks.map((c) => c.level)),
    appliedRuleVersion: ruleSet.version,
  };
}

/** YYYY-MM の月初・月末（ローカル日） */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const last = new Date(y, m, 0).getDate();
  return { from, to: `${month}-${String(last).padStart(2, "0")}` };
}

/**
 * 労使協定・船舶マスタによるルールの上書き（要件定義書 6.5「協定内容→アラート閾値への自動反映」）。
 * 上書き後は版識別子を派生させ、判定結果に「どの協定版で判定したか」が残るようにする。
 */
export function applyRuleOverrides(
  ruleSet: LaborRuleSet,
  overrides: Partial<LaborRuleValues> | undefined,
  sourceLabel?: string,
): LaborRuleSet {
  if (!overrides || Object.keys(overrides).length === 0) return ruleSet;
  const values = { ...ruleSet.values };
  for (const [k, v] of Object.entries(overrides)) {
    if (typeof v === "number") (values as unknown as Record<string, number>)[k] = v;
  }
  return {
    ...ruleSet,
    id: `${ruleSet.id}+override`,
    version: sourceLabel ? `${ruleSet.version}+${sourceLabel}` : `${ruleSet.version}+override`,
    source: `${ruleSet.source} / 労使協定・船舶設定による上書き`,
    values,
  };
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
