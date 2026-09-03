/**
 * packages/domain/labor-law 相当（基本設計書 4.1）。
 * UI・DB に依存しない純 TypeScript のみを置く。法令閾値は内部に持たず、
 * LaborRuleSet として引数で受け取る（ガードレール⑪ / 基本設計書 5.3(6)）。
 */

/** 作業種別（国交省ガイドライン準拠。要件定義書 3.2） */
export type WorkCategory =
  | "navigation_watch"
  | "cargo"
  | "standby"
  | "maintenance"
  | "other";

export const WORK_CATEGORIES: WorkCategory[] = [
  "navigation_watch",
  "cargo",
  "standby",
  "maintenance",
  "other",
];

export type PunchAction = "start" | "end";

export type EntryType = "realtime" | "after" | "resubmit";

/**
 * 打刻レコード（time_records 相当。追記専用・一次記録）。
 * UPDATE/DELETE は行わない。訂正は差戻しによる新規レコード（supersedesId）で表現する
 * （要件定義書 3.2.1 / 12.5、基本設計書 5.1）。
 */
export interface TimeRecord {
  /** 端末採番 ULID（時系列ソート可能） */
  id: string;
  tenantId: string;
  vesselId: string;
  crewMemberId: string;
  workCategory: WorkCategory;
  action: PunchAction;
  /** 打刻時刻（端末時刻・ISO 8601） */
  occurredAt: string;
  entryType: EntryType;
  /** 差戻し訂正時に無効化する対象レコードID（元レコードは物理保持） */
  supersedesId?: string;
  /** 打刻者（共用端末では選択方式。基本設計書 11.3） */
  recordedBy: string;
  deviceId: string;
  note?: string;
  /**
   * 安全臨時労働・緊急作業の別枠管理（要件定義書 3.2.5⑥）。
   * 指定された区間は**労働時間としては記録しつつ、上限算定から除外**する。
   * 記録簿には実績として残るため、除外の事実と理由が後から検証できる。
   */
  exceptionKind?: ExceptionalWorkKind;
}

/** 上限算定から除外する労働の区分（3.2.5⑥） */
export type ExceptionalWorkKind = "safety_emergency" | "drill";

export const EXCEPTIONAL_WORK_KINDS: ExceptionalWorkKind[] = ["safety_emergency", "drill"];

/** 打刻ペアから構成した作業区間 */
export interface WorkInterval {
  crewMemberId: string;
  workCategory: WorkCategory;
  startAt: Date;
  /** null = 進行中（終了打刻なし） */
  endAt: Date | null;
  startRecordId: string;
  endRecordId?: string;
  /** 開始打刻に付いていた別枠区分（上限算定から除外する） */
  exceptionKind?: ExceptionalWorkKind;
}

/**
 * rule_values 相当の法令・協定閾値。
 * 値は rule_sets（版管理）から供給され、判定関数は引数として受け取る。
 */
export interface LaborRuleValues {
  /** 1日の労働時間上限（分）。例: 14h = 840 */
  dailyMaxMinutes: number;
  /** あらゆる連続1週間の労働時間上限（分）。例: 72h = 4320 */
  weeklyMaxMinutes: number;
  /** 1日あたり休息時間の最低合計（分）。例: 10h = 600 */
  restMinDailyMinutes: number;
  /** 分割時の最長休息の最低長（分）。例: 6h = 360 */
  restLongestMinMinutes: number;
  /** 休息時間の分割回数上限。例: 2 */
  restSplitMax: number;
  /** 上限接近＝注意（黄）とみなす比率。例: 0.9 */
  cautionRatio: number;
  /**
   * 週あたりに与える休日の最低日数（要件定義書 3.2.5⑤「休日付与（週1日以上）」）。
   * 休日 = その暦日に労働記録が無い日、または休日として付与された日。
   */
  restDaysPerWeek: number;
  /**
   * 基準労働期間の日数（航行区域等により1月〜1年。要件定義書 3.2.4）。
   * 船舶マスタの referencePeriodDays で上書きできる。
   */
  referencePeriodDays: number;
  /** 基準労働期間における週平均の労働時間上限（分）。例: 40h = 2400 */
  referenceWeeklyAverageMinutes: number;
  /** 4週間の労働時間上限（分）。基準労働期間より短い窓での監視に用いる */
  fourWeekMaxMinutes: number;
  /** 1月あたりの時間外労働の上限（分）。労使協定により変動する */
  monthlyOvertimeMaxMinutes: number;
  /** 1日の所定労働時間（分）。時間外の算定基準。例: 8h = 480 */
  dailyStandardMinutes: number;
}

/** rule_sets 相当（有効期間つき版管理。基本設計書 5.3(6)） */
export interface LaborRuleSet {
  id: string;
  version: string;
  /** 根拠法令・協定の識別 */
  source: string;
  effectiveFrom: string;
  values: LaborRuleValues;
}

/** 2段階アラート: 注意（黄）/ 警告（赤）（要件定義書 3.2.5） */
export type CheckLevel = "ok" | "caution" | "violation";

export type LaborCheckKey =
  | "daily_max"
  | "weekly_max"
  | "rest_total"
  | "rest_split"
  | "rest_longest"
  /** 週1日以上の休日付与（3.2.5⑤） */
  | "rest_day"
  /** 4週間の労働時間上限（3.2.5③） */
  | "four_week_max"
  /** 基準労働期間の週平均40時間（3.2.4 / 3.2.5③） */
  | "reference_period"
  /** 1月の時間外労働上限（労使協定。3.2.5③） */
  | "monthly_overtime";

export interface LaborCheck {
  key: LaborCheckKey;
  level: CheckLevel;
  /** 実績値（分。rest_split のみ回数） */
  actual: number;
  /** 閾値（分。rest_split のみ回数） */
  limit: number;
}

export interface RestPeriod {
  startAt: string;
  endAt: string;
  minutes: number;
}

/** 日次集計（labor_daily_summaries 相当の導出値。正は打刻レコード） */
export interface DailyLaborSummary {
  crewMemberId: string;
  /** YYYY-MM-DD（ローカル日） */
  date: string;
  /** 労働時間の合計（別枠の安全臨時労働・緊急作業を含む実績。記録簿に載る値） */
  workedMinutes: number;
  /** 上限算定の対象となる労働時間（別枠を除いた値。3.2.5⑥） */
  countableWorkedMinutes: number;
  /** 上限算定から除外した労働時間（安全臨時労働・緊急作業） */
  exceptionalMinutes: number;
  workedByCategory: Partial<Record<WorkCategory, number>>;
  restPeriods: RestPeriod[];
  restTotalMinutes: number;
  checks: LaborCheck[];
  /** checks の最悪値 */
  level: CheckLevel;
  /** 判定に適用したルール版（基本設計書 5.3(6): applied_rule_version） */
  appliedRuleVersion: string;
  /** 終了打刻のない進行中区間があるか */
  hasOpenInterval: boolean;
  /** その日に有効な打刻レコードが1件でもあるか */
  hasRecords: boolean;
}
