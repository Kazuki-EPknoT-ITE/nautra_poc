import { addDaysYmd, daysBetween } from "@/domain/crew/freshness";
import type { CheckLevel } from "@/domain/labor-law/types";
import type { DockPlanPayload, MaintenancePlanPayload, PartStockPayload } from "@/sync-protocol/masters";
import type { MaintenanceRecordPayload } from "@/sync-protocol/records";

/**
 * S-11 船舶・保守・検査の導出と言い換え（純関数。UI・DB 非依存）。
 *
 * 要件定義書 3.4.1 / 3.4.2 と 12.3「導出値を保持しない」に対応する。
 * 次回予定日・経過超過・発注要否・準備タスクの進捗は**いずれも保存せず**、
 * 計画（周期・前回実施日）と実績から都度算出する。
 * 判定に使う周期は計画レコード自身が持つ運用値であり、法令閾値ではない（ガードレール③）。
 *
 * 文言はここに集約し、画面に言い換えロジックを散らさない
 * （labor-plain.ts / shift-plain.ts と同じ方針）。
 */

/* ═══════════════ 3.4.1 定期保守計画 ═══════════════ */

export interface MaintenancePlanStatus {
  plan: MaintenancePlanPayload;
  /** 次回予定日（= 前回実施日 + 周期）。前回実施日が無ければ null。**保存しない導出値** */
  nextDueOn: string | null;
  /** 次回予定日までの日数（負なら超過日数） */
  daysToDue: number | null;
  /** 周期に対する経過日数 */
  daysSinceDone: number | null;
  level: CheckLevel;
  /** 利用者向けの一文（日常語） */
  message: string;
  /** 計画に対応する直近の実績（機器が一致する保守・修繕の記録） */
  lastRecord: MaintenanceRecordPayload | null;
}

/**
 * 「まもなく」と見なす日数。運用上の見せ方の目安であり法令の閾値ではないため、
 * 呼び出し側から差し替えられるよう既定値つきの引数にしている。
 */
export const MAINTENANCE_SOON_DAYS = 14;

/** 計画1件の状態（次回予定日と経過超過）を判定する */
export function evaluateMaintenancePlan(
  plan: MaintenancePlanPayload,
  today: string,
  records: MaintenanceRecordPayload[] = [],
  soonDays: number = MAINTENANCE_SOON_DAYS,
): MaintenancePlanStatus {
  const lastRecord =
    [...records]
      .filter((r) => r.equipment === plan.equipment && r.recordType !== "daily_inspection")
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0] ?? null;

  if (!plan.lastDoneOn) {
    return {
      plan,
      nextDueOn: null,
      daysToDue: null,
      daysSinceDone: null,
      level: "caution",
      message: "前回の実施日が登録されていないため、次回の予定を出せません",
      lastRecord,
    };
  }

  const nextDueOn = addDaysYmd(plan.lastDoneOn, plan.intervalDays);
  const daysToDue = daysBetween(today, nextDueOn);
  const daysSinceDone = daysBetween(plan.lastDoneOn, today);

  let level: CheckLevel = "ok";
  let message: string;
  if (daysToDue < 0) {
    level = "violation";
    message = `予定日を ${Math.abs(daysToDue)}日 過ぎています（前回から ${daysSinceDone}日 / 周期 ${plan.intervalDays}日）`;
  } else if (daysToDue <= soonDays) {
    level = "caution";
    message = `あと ${daysToDue}日 で予定日です（周期 ${plan.intervalDays}日）`;
  } else {
    message = `次回まで あと ${daysToDue}日 あります（周期 ${plan.intervalDays}日）`;
  }
  return { plan, nextDueOn, daysToDue, daysSinceDone, level, message, lastRecord };
}

/** 計画一覧の判定（超過 → まもなく → 余裕あり の順に並べる） */
export function evaluateMaintenancePlans(
  plans: MaintenancePlanPayload[],
  today: string,
  records: MaintenanceRecordPayload[] = [],
  soonDays: number = MAINTENANCE_SOON_DAYS,
): MaintenancePlanStatus[] {
  const order: Record<CheckLevel, number> = { violation: 0, caution: 1, ok: 2 };
  return plans
    .map((p) => evaluateMaintenancePlan(p, today, records, soonDays))
    .sort((a, b) => {
      if (order[a.level] !== order[b.level]) return order[a.level] - order[b.level];
      return (a.daysToDue ?? 99999) - (b.daysToDue ?? 99999);
    });
}

/* ═══════════════ 3.4.1 部品・消耗品の在庫 ═══════════════ */

export interface PartStockStatus {
  stock: PartStockPayload;
  /** 発注点を下回っているか（発注点が未設定なら false） */
  belowReorder: boolean;
  /** 在庫ゼロ */
  outOfStock: boolean;
  level: CheckLevel;
  message: string;
}

/** 在庫1件の状態（発注要否）を判定する */
export function evaluatePartStock(stock: PartStockPayload): PartStockStatus {
  const min = stock.minQuantity;
  const outOfStock = stock.quantity <= 0;
  const belowReorder = min !== undefined && stock.quantity < min;
  const ordering = stock.orderStatus === "requested" || stock.orderStatus === "ordered";

  let level: CheckLevel = "ok";
  let message: string;
  if (outOfStock) {
    level = ordering ? "caution" : "violation";
    message = ordering
      ? "在庫がありません（手配中です。入荷までは使えません）"
      : "在庫がありません。すぐに手配してください";
  } else if (belowReorder) {
    level = "caution";
    message = ordering
      ? `残り ${stock.quantity}${stock.unit ?? ""}（発注点 ${min}）。手配中です`
      : `残り ${stock.quantity}${stock.unit ?? ""} で発注点 ${min} を下回りました。手配してください`;
  } else {
    message =
      min === undefined
        ? `在庫 ${stock.quantity}${stock.unit ?? ""}（発注点は未設定）`
        : `在庫 ${stock.quantity}${stock.unit ?? ""}（発注点 ${min}）。足りています`;
  }
  return { stock, belowReorder, outOfStock, level, message };
}

/** 在庫一覧の判定（不足しているものを先頭に出す。同じ度合いなら在庫ゼロを先に） */
export function evaluatePartStocks(stocks: PartStockPayload[]): PartStockStatus[] {
  const order: Record<CheckLevel, number> = { violation: 0, caution: 1, ok: 2 };
  const rank = (s: PartStockStatus) => (s.outOfStock ? 0 : s.belowReorder ? 1 : 2);
  return stocks
    .map(evaluatePartStock)
    .sort((a, b) => {
      if (order[a.level] !== order[b.level]) return order[a.level] - order[b.level];
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return a.stock.partName.localeCompare(b.stock.partName);
    });
}

/** 発注状態の次の一手（手配なし → 手配依頼中 → 発注済 → 入荷済） */
export function nextOrderStatus(
  current: PartStockPayload["orderStatus"],
): NonNullable<PartStockPayload["orderStatus"]> | null {
  switch (current ?? "none") {
    case "none":
      return "requested";
    case "requested":
      return "ordered";
    case "ordered":
      return "delivered";
    default:
      return null;
  }
}

/* ═══════════════ 3.4.2 入渠・検査対応 ═══════════════ */

export interface DockPlanStatus {
  dock: DockPlanPayload;
  /** 入渠開始までの日数（負なら経過） */
  daysToStart: number | null;
  /** 準備タスクの進捗 */
  prepDone: number;
  prepTotal: number;
  /** 未対応・対応中の指摘件数 */
  openFindings: number;
  level: CheckLevel;
  message: string;
}

/** 入渠1件の状態（準備の進み具合と指摘の残り）を判定する */
export function evaluateDockPlan(dock: DockPlanPayload, today: string): DockPlanStatus {
  const daysToStart = dock.plannedFrom ? daysBetween(today, dock.plannedFrom) : null;
  const prepTotal = dock.prepTasks?.length ?? 0;
  const prepDone = dock.prepTasks?.filter((p) => p.done).length ?? 0;
  const openFindings = dock.findings?.filter((f) => f.status !== "closed").length ?? 0;

  let level: CheckLevel = "ok";
  const parts: string[] = [];
  if (dock.status !== "done" && daysToStart !== null) {
    if (daysToStart < 0) {
      parts.push(`入渠の予定日を ${Math.abs(daysToStart)}日 過ぎています`);
      level = "violation";
    } else {
      parts.push(`入渠まで あと ${daysToStart}日`);
      if (prepTotal > 0 && prepDone < prepTotal) level = "caution";
    }
  }
  if (prepTotal > 0) parts.push(`準備 ${prepDone}/${prepTotal}件 完了`);
  if (openFindings > 0) {
    parts.push(`指摘 ${openFindings}件 が残っています`);
    if (level !== "violation") level = "caution";
  }
  if (parts.length === 0) parts.push("完了しています");
  return {
    dock,
    daysToStart,
    prepDone,
    prepTotal,
    openFindings,
    level,
    message: parts.join("。"),
  };
}

/** 指摘事項1件の期限判定（期限切れ・まもなく） */
export function findingLevel(
  finding: NonNullable<DockPlanPayload["findings"]>[number],
  today: string,
  soonDays: number = MAINTENANCE_SOON_DAYS,
): { level: CheckLevel; message: string } {
  if (finding.status === "closed") return { level: "ok", message: "対応が終わっています" };
  if (!finding.dueOn) return { level: "caution", message: "期限が決まっていません" };
  const days = daysBetween(today, finding.dueOn);
  if (days < 0) return { level: "violation", message: `期限を ${Math.abs(days)}日 過ぎています` };
  if (days <= soonDays) return { level: "caution", message: `あと ${days}日 で期限です` };
  return { level: "caution", message: `期限まで あと ${days}日 あります` };
}

/* ═══════════════ 3.5.3 船内環境の確認日（求人の的確表示） ═══════════════ */

/**
 * 船内環境（Wi-Fi・居室・設備）の確認日の鮮度。
 *
 * 船員職業安定法の改正により求人情報は**最新性の維持**が義務づけられたため、
 * 古い確認日のまま求人票に転記しないよう注意を出す。
 * 既定は 12.4 の鮮度既定値（180日）に揃える。
 */
export const ENVIRONMENT_FRESHNESS_DAYS = 180;

export function evaluateEnvironmentFreshness(
  verifiedOn: string | undefined,
  today: string,
  thresholdDays: number = ENVIRONMENT_FRESHNESS_DAYS,
): { level: CheckLevel; message: string; daysSince: number | null } {
  if (!verifiedOn) {
    return {
      level: "caution",
      message: "確認した日が記録されていません。求人票に使う前に船内の状況を確認してください",
      daysSince: null,
    };
  }
  const daysSince = daysBetween(verifiedOn, today);
  if (daysSince > thresholdDays) {
    return {
      level: "caution",
      message: `確認から ${daysSince}日 経ちました。求人票に使う前に確認してください`,
      daysSince,
    };
  }
  return { level: "ok", message: `${daysSince}日前に確認しています`, daysSince };
}
