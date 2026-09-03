import type { CheckLevel } from "@/domain/labor-law/types";
import type { EmbarkationPayload } from "@/sync-protocol/masters";
import { addDaysYmd, daysBetween } from "./freshness";

/**
 * 乗船履歴の集計と、海技免状の更新要件の充足判定（純関数）。
 *
 * 要件定義書 6.2 C群「海技免状の更新」:
 *   「要件：指定医の身体検査（申請前3か月以内）＋**乗船履歴（5年内1年以上 等）**または更新講習。
 *    失効すると失効再交付講習が必要に」
 *   アプリでの効率化: 「**乗船履歴要件の自動判定（アプリの乗船記録から履歴充足を計算）**」
 *
 * 乗下船イベント（`embarkation`）から在船日数を積み上げる。
 * 履歴が足りなければ「更新講習の受講」という代替経路があるため、
 * **足りない＝更新できない**ではなく「どちらの経路で更新するか」を示す判定にしている。
 *
 * 閾値は引数（`SeaServiceRuleValues`）で注入し、ここに法令定数を持たない（ガードレール③）。
 */

export interface SeaServiceRuleValues {
  /** 履歴を数える遡り期間（日）。例: 5年 = 1825日 */
  lookbackDays: number;
  /** 必要な乗船日数。例: 1年 = 365日 */
  requiredDays: number;
  /** この割合を下回ったら「不足しそう」と注意する */
  cautionRatio: number;
}

/** PoC 既定値（船舶職員及び小型船舶操縦者法の更新要件。⚠ 根拠は人間レビュー必須領域） */
export const DEFAULT_SEA_SERVICE_RULES: SeaServiceRuleValues = {
  lookbackDays: 365 * 5,
  requiredDays: 365,
  cautionRatio: 0.9,
};

/** 在船していた期間（乗船 → 下船。下船が無ければ基準日まで） */
export interface SeaServicePeriod {
  vesselId: string;
  from: string;
  /** null = 現在も乗船中 */
  to: string | null;
  days: number;
}

export interface SeaServiceSummary {
  crewMemberId: string;
  /** 集計の対象期間 */
  from: string;
  to: string;
  periods: SeaServicePeriod[];
  /** 対象期間内の在船日数の合計 */
  totalDays: number;
  requiredDays: number;
  /** 要件を満たしているか */
  meetsRequirement: boolean;
  /** あと何日の乗船が要るか（満たしていれば 0） */
  shortfallDays: number;
  level: CheckLevel;
  /** 利用者向けの一文 */
  message: string;
}

/**
 * 乗下船イベントから在船期間を組み立てる。
 *
 * - **実績（status: "actual"）のみ**を数える。予定は履歴ではない（計画/実績の分離）
 * - 乗船に対応する下船が無ければ「現在も乗船中」として基準日まで数える
 * - 下船に対応する乗船が無い場合は無視する（片方だけの記録で履歴を作らない）
 */
export function buildSeaServicePeriods(
  embarkations: EmbarkationPayload[],
  today: string,
): SeaServicePeriod[] {
  const actual = embarkations
    .filter((e) => e.status === "actual")
    .sort((a, b) => (a.date === b.date ? a.eventType.localeCompare(b.eventType) : a.date.localeCompare(b.date)));

  const periods: SeaServicePeriod[] = [];
  // 船ごとに乗船中の開始日を保持する（複数船を跨いだ記録でも取り違えない）
  const open = new Map<string, string>();

  for (const e of actual) {
    if (e.eventType === "on") {
      // 同じ船で乗船が続いた場合は、先の乗船を新しい乗船日で閉じる（記録の取りこぼしに備える）
      const prev = open.get(e.targetVesselId);
      if (prev) periods.push(makePeriod(e.targetVesselId, prev, e.date));
      open.set(e.targetVesselId, e.date);
    } else {
      const start = open.get(e.targetVesselId);
      if (!start) continue; // 対応する乗船が無い下船は無視
      periods.push(makePeriod(e.targetVesselId, start, e.date));
      open.delete(e.targetVesselId);
    }
  }
  for (const [vesselId, start] of open) periods.push(makePeriod(vesselId, start, null, today));
  return periods.sort((a, b) => a.from.localeCompare(b.from));
}

function makePeriod(vesselId: string, from: string, to: string | null, today?: string): SeaServicePeriod {
  const end = to ?? today!;
  return { vesselId, from, to, days: Math.max(0, daysBetween(from, end)) };
}

/**
 * 免状更新の乗船履歴要件を判定する。
 * 遡り期間に重なる分だけを数える（期間の一部が窓の外なら、重なった日数だけ算入する）。
 */
export function evaluateSeaService(params: {
  crewMemberId: string;
  embarkations: EmbarkationPayload[];
  today: string;
  rules?: SeaServiceRuleValues;
}): SeaServiceSummary {
  const { crewMemberId, embarkations, today } = params;
  const rules = params.rules ?? DEFAULT_SEA_SERVICE_RULES;
  const windowFrom = addDaysYmd(today, -rules.lookbackDays);

  const all = buildSeaServicePeriods(embarkations, today);
  const periods: SeaServicePeriod[] = [];
  let totalDays = 0;
  for (const p of all) {
    const from = p.from > windowFrom ? p.from : windowFrom;
    const to = p.to ?? today;
    if (to <= windowFrom) continue; // 窓より前に終わった期間は数えない
    const days = Math.max(0, daysBetween(from, to));
    if (days === 0) continue;
    periods.push({ ...p, from, days });
    totalDays += days;
  }

  const meets = totalDays >= rules.requiredDays;
  const shortfallDays = meets ? 0 : rules.requiredDays - totalDays;
  const level: CheckLevel = meets
    ? "ok"
    : totalDays >= rules.requiredDays * rules.cautionRatio
      ? "caution"
      : "violation";

  const years = Math.round(rules.lookbackDays / 365);
  const message = meets
    ? `直近${years}年で ${totalDays}日 乗っています。乗船履歴での更新ができます。`
    : `直近${years}年の乗船は ${totalDays}日 で、あと ${shortfallDays}日 足りません。` +
      `このままなら更新講習を受けて更新することになります。`;

  return {
    crewMemberId,
    from: windowFrom,
    to: today,
    periods,
    totalDays,
    requiredDays: rules.requiredDays,
    meetsRequirement: meets,
    shortfallDays,
    level,
    message,
  };
}
