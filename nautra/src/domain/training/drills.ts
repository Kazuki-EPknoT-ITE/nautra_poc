import { addDaysYmd, daysBetween } from "@/domain/crew/freshness";
import type { CheckLevel } from "@/domain/labor-law/types";
import type { DrillRuleSet } from "@/rules/drill-rules";
import { DRILL_TYPES, type DrillRecordPayload, type DrillType } from "@/sync-protocol/records";

/**
 * 船内操練の次回期日判定（要件定義書 3.9 主要機能③ / 9章「操練（訓練）実施記録」）。
 *
 * 種別ごとに**最終実施日**と**経過日数**を出し、ルールセットの実施間隔から次回期日を導く。
 * 次回期日・経過日数はいずれも**導出値**であり、レコードには保持しない（12.3）。
 *
 * 閾値（実施間隔・注意日数）はこの関数の内部に持たず、`DrillRuleSet` を引数で受け取る
 * （ガードレール③）。判定結果には適用した版を載せ、画面がそのまま表示できるようにする。
 */

export type DrillState =
  /** 期日まで余裕がある */
  | "ok"
  /** 期日が近い（注意） */
  | "due_soon"
  /** 期日を過ぎた */
  | "overdue"
  /** 一度も実施していない */
  | "never";

export interface DrillStatus {
  drillType: DrillType;
  /** 最終実施日 YYYY-MM-DD（未実施は null） */
  lastDoneOn: string | null;
  /** 最終実施からの経過日数（未実施は null） */
  daysSinceLast: number | null;
  /** 次回期日 YYYY-MM-DD（未実施は null） */
  nextDueOn: string | null;
  /** 次回期日までの日数（負なら超過。未実施は null） */
  daysToNextDue: number | null;
  /** 適用した実施間隔（日） */
  intervalDays: number;
  state: DrillState;
  level: CheckLevel;
  /** 利用者向けの一文（法令用語ではなく日常語） */
  message: string;
  /** 直近の実施記録（実施者・参加人数を画面に出すため） */
  lastRecord?: DrillRecordPayload;
  /** 判定に適用したルール版（基本設計書 5.3(6)） */
  appliedRuleSetId: string;
  appliedRuleVersion: string;
}

/** ISO 日時 → ローカル日 YYYY-MM-DD（記録は occurredAt の ISO で届く） */
function ymdOf(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 操練の種別ごとに次回期日を判定する。
 * 記録が1件も無い種別も**必ず1行返す**（「まだ一度も実施していない」ことこそ知らせたい情報）。
 */
export function evaluateDrills(
  records: DrillRecordPayload[],
  today: string,
  ruleSet: DrillRuleSet,
): DrillStatus[] {
  const latest = new Map<DrillType, DrillRecordPayload>();
  for (const r of records) {
    const current = latest.get(r.drillType);
    if (!current || r.occurredAt > current.occurredAt) latest.set(r.drillType, r);
  }

  const statuses = DRILL_TYPES.map((drillType) =>
    evaluateDrill(drillType, latest.get(drillType), today, ruleSet),
  );

  const order: Record<DrillState, number> = { overdue: 0, never: 1, due_soon: 2, ok: 3 };
  return statuses.sort((a, b) => {
    if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
    return (a.daysToNextDue ?? 99999) - (b.daysToNextDue ?? 99999);
  });
}

/** 1種別分の判定 */
export function evaluateDrill(
  drillType: DrillType,
  lastRecord: DrillRecordPayload | undefined,
  today: string,
  ruleSet: DrillRuleSet,
): DrillStatus {
  const intervalDays = ruleSet.values.intervalDaysByType[drillType];
  const applied = {
    intervalDays,
    appliedRuleSetId: ruleSet.id,
    appliedRuleVersion: ruleSet.version,
  };

  if (!lastRecord) {
    return {
      drillType,
      lastDoneOn: null,
      daysSinceLast: null,
      nextDueOn: null,
      daysToNextDue: null,
      state: "never",
      level: ruleSet.values.treatNeverDoneAsOverdue ? "violation" : "caution",
      message: `まだ一度も実施していません（${intervalDays}日ごとに行います）`,
      ...applied,
    };
  }

  const lastDoneOn = ymdOf(lastRecord.occurredAt);
  const daysSinceLast = daysBetween(lastDoneOn, today);
  const nextDueOn = addDaysYmd(lastDoneOn, intervalDays);
  const daysToNextDue = daysBetween(today, nextDueOn);

  let state: DrillState;
  let level: CheckLevel;
  let message: string;
  if (daysToNextDue < 0) {
    state = "overdue";
    level = "violation";
    message = `次回の期日を ${Math.abs(daysToNextDue)}日 過ぎています（最後の実施から ${daysSinceLast}日）`;
  } else if (daysToNextDue <= ruleSet.values.cautionDays) {
    state = "due_soon";
    level = "caution";
    message = `あと ${daysToNextDue}日 で次回の期日です（最後の実施から ${daysSinceLast}日）`;
  } else {
    state = "ok";
    level = "ok";
    message = `最後の実施から ${daysSinceLast}日。次回は ${nextDueOn} までに行います`;
  }

  return {
    drillType,
    lastDoneOn,
    daysSinceLast,
    nextDueOn,
    daysToNextDue,
    state,
    level,
    message,
    lastRecord,
    ...applied,
  };
}
