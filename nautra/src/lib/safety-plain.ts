import type { CheckLevel } from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";
import type { IncidentReportPayload, SmsDocumentPayload } from "@/sync-protocol/masters";
import type { VoyageLogPayload } from "@/sync-protocol/records";

/**
 * 安全管理・事故報告の導出と言い換え（純関数。UI・DB 非依存）。
 * 要件定義書 3.5.1（SMS）・3.5.2（事故・インシデント）・6.5（航海日誌からの報告書ドラフト生成）。
 *
 * 集計・並び順・文言をここに集約し、画面には持たせない。
 */

/* ═══════════════ 3.5.1 リスクアセスメント（影響度 × 発生度） ═══════════════ */

/** マトリクスの目盛（1〜5）。SMS のリスクアセスメント記録が持つ値域に合わせる */
export const RISK_SCALE = [1, 2, 3, 4, 5] as const;

/**
 * リスクの重みづけ（影響度 × 発生度）の見せ方の目安。
 * 事業者が自社の安全管理規程で決める運用値であり、法令の閾値ではない。
 * 本番は SMS のルールとして版管理し、ここは既定値として扱う。
 */
export const RISK_HIGH_SCORE = 15;
export const RISK_MEDIUM_SCORE = 8;

export function riskLevelOf(
  severity: number | undefined,
  likelihood: number | undefined,
  highScore: number = RISK_HIGH_SCORE,
  mediumScore: number = RISK_MEDIUM_SCORE,
): CheckLevel | "none" {
  if (severity === undefined || likelihood === undefined) return "none";
  const score = severity * likelihood;
  if (score >= highScore) return "violation";
  if (score >= mediumScore) return "caution";
  return "ok";
}

export interface RiskCell {
  severity: number;
  likelihood: number;
  documents: SmsDocumentPayload[];
  level: CheckLevel | "none";
}

/** 5×5 のマトリクス（影響度 × 発生度）に件数を配る */
export function buildRiskMatrix(documents: SmsDocumentPayload[]): RiskCell[][] {
  return RISK_SCALE.map((severity) =>
    RISK_SCALE.map((likelihood) => ({
      severity,
      likelihood,
      documents: documents.filter((d) => d.severity === severity && d.likelihood === likelihood),
      level: riskLevelOf(severity, likelihood),
    })),
  );
}

/* ═══════════════ 3.5.1 不適合・是正措置 ═══════════════ */

/** 未完了（未対応・対応中）を先頭に、期限の近い順に並べる */
export function sortByOpenFirst<T extends { status?: "open" | "in_progress" | "closed"; dueOn?: string }>(
  rows: T[],
): T[] {
  const order = { open: 0, in_progress: 1, closed: 2 } as const;
  return [...rows].sort((a, b) => {
    const ao = order[a.status ?? "open"];
    const bo = order[b.status ?? "open"];
    if (ao !== bo) return ao - bo;
    return (a.dueOn ?? "9999-12-31").localeCompare(b.dueOn ?? "9999-12-31");
  });
}

/* ═══════════════ 3.5.2 事故・インシデント ═══════════════ */

/** 未対応・調査中を先頭に、新しい順に並べる */
export function sortIncidents(rows: IncidentReportPayload[]): IncidentReportPayload[] {
  const order = { open: 0, investigating: 1, closed: 2 } as const;
  return [...rows].sort((a, b) => {
    const ao = order[a.status ?? "open"];
    const bo = order[b.status ?? "open"];
    if (ao !== bo) return ao - bo;
    return b.occurredAt.localeCompare(a.occurredAt);
  });
}

export interface MonthlyCount {
  /** YYYY-MM */
  month: string;
  count: number;
  /** 重点施策の目標を満たしているか */
  meetsTarget: boolean;
}

/**
 * ヒヤリハットの月別件数。
 * 目標件数は安全方針・重点施策（sms_document の policy）で決める運用値であり、
 * 法令の閾値ではないため引数で受ける（既定はデモの重点施策と同じ月2件）。
 */
export function nearMissByMonth(
  incidents: IncidentReportPayload[],
  months: string[],
  targetPerMonth = 2,
): MonthlyCount[] {
  return months.map((month) => {
    const count = incidents.filter(
      (i) => i.kind === "near_miss" && toMonth(i.occurredAt) === month,
    ).length;
    return { month, count, meetsTarget: count >= targetPerMonth };
  });
}

/** ISO 日時 → ローカルの YYYY-MM */
export function toMonth(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 直近 n か月（古い順）の YYYY-MM 一覧 */
export function recentMonths(now: Date, n = 6): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/* ═══════════════ 6.5 航海日誌からの報告書ドラフト生成 ═══════════════ */

export interface IncidentDraftInput {
  incident: IncidentReportPayload;
  vesselName: string;
  /** 引用する航海日誌（関連付けられたもの＋発生当日の記載） */
  voyageLogs: VoyageLogPayload[];
  /** 記録者・作成者の表示名を解決する */
  nameOf: (id: string) => string;
  generatedOn: string;
}

function fmtStamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}時${p(d.getMinutes())}分`;
}

/** 航海日誌1件を報告書に引用できる1行にする */
export function quoteVoyageLog(log: VoyageLogPayload, nameOf: (id: string) => string): string {
  const bits: string[] = [
    `${fmtStamp(log.occurredAt)}　${t.voyageLogType[log.logType] ?? log.logType}`,
  ];
  if (log.port) bits.push(`港: ${log.port}`);
  if (log.position) bits.push(`船位: ${log.position}`);
  if (log.courseDeg !== undefined) bits.push(`針路: ${log.courseDeg}度`);
  if (log.speedKnots !== undefined) bits.push(`速力: ${log.speedKnots}ノット`);
  if (log.weather) bits.push(`天候: ${log.weather}`);
  if (log.wind) bits.push(`風: ${log.wind}`);
  if (log.seaState) bits.push(`海況: ${log.seaState}`);
  if (log.visibility) bits.push(`視程: ${log.visibility}`);
  if (log.remarks) bits.push(`記事: ${log.remarks}`);
  bits.push(`記入: ${nameOf(log.recordedBy)}`);
  return bits.join(" / ");
}

/**
 * 行政機関への報告書（海難等の報告・死傷病報告）のドラフト本文を組み立てる。
 *
 * 6.5「航海日誌からの報告書ドラフト生成」に対応する。
 * **提出物は生成時点のスナップショットとして保存**し（12.3）、以後マスタが更新されても
 * 書き換えない。この関数は文面を作るだけで、保存は呼び出し側（safety-service）が行う。
 */
export function buildIncidentReportDraft(input: IncidentDraftInput): string {
  const { incident: i, vesselName, voyageLogs, nameOf, generatedOn } = input;
  const lines: string[] = [];

  lines.push("海難等の報告書（ドラフト）");
  lines.push("");
  lines.push(`1. 船舶　　　　${vesselName}`);
  lines.push(`2. 事象の区分　${t.incidentKind[i.kind] ?? i.kind}`);
  lines.push(`3. 標題　　　　${i.title}`);
  lines.push(`4. 発生日時　　${fmtStamp(i.occurredAt)}`);
  lines.push(`5. 発生場所　　${i.location ?? "（未記入）"}`);
  lines.push("");
  lines.push("6. 発生の状況");
  lines.push(`　${i.description}`);
  lines.push("");
  lines.push("7. 人身・物件の被害");
  lines.push(`　負傷者等: ${i.injured ?? "なし"}`);
  lines.push(`　物件の損傷: ${i.damage ?? "なし"}`);
  lines.push("");
  lines.push("8. 原因の分析");
  lines.push(`　${i.cause ?? "（調査中。判明しだい追記する）"}`);
  lines.push("");
  lines.push("9. 再発防止のための措置");
  lines.push(`　${i.preventiveAction ?? "（検討中。決定しだい追記する）"}`);
  lines.push("");
  lines.push("10. 通報・報告の状況");
  lines.push(`　付近船舶等への通報: ${i.notifiedNearbyShips ? "実施済み" : "該当なし・未実施"}`);
  if (i.notifiedNearbyShips && i.note) lines.push(`　通報の記録: ${i.note}`);
  lines.push(
    `　行政機関への報告: ${
      i.reportedToAuthority
        ? `報告済み（${i.authorityReportedOn ?? "報告日は未記入"}）`
        : "未報告（本書により報告する）"
    }`,
  );
  lines.push("");
  lines.push("11. 航海日誌の記載（引用）");
  if (voyageLogs.length === 0) {
    lines.push("　当日の航海日誌に該当する記載はありません。");
  } else {
    for (const log of voyageLogs) lines.push(`　・${quoteVoyageLog(log, nameOf)}`);
  }
  lines.push("");
  lines.push(`12. 報告者　　　${nameOf(i.recordedBy)}`);
  lines.push(`13. 作成日　　　${generatedOn}`);
  lines.push("");
  lines.push(
    "※ このドラフトは船内の一次記録（事故報告・航海日誌）から自動で組み立てたものです。" +
      "提出前に管轄の運輸局・海事事務所の様式と記載事項を必ず確認してください。",
  );
  return lines.join("\n");
}

/**
 * ドラフトの引用対象になる航海日誌を選ぶ。
 * 事故に関連付けられた1件と、発生当日の記載をまとめる（重複は除く）。
 */
export function voyageLogsForIncident(
  incident: IncidentReportPayload,
  logs: VoyageLogPayload[],
): VoyageLogPayload[] {
  const day = new Date(incident.occurredAt);
  const sameDay = (iso: string) => {
    const d = new Date(iso);
    return (
      d.getFullYear() === day.getFullYear() &&
      d.getMonth() === day.getMonth() &&
      d.getDate() === day.getDate()
    );
  };
  const picked = new Map<string, VoyageLogPayload>();
  for (const log of logs) {
    if (log.vesselId !== incident.vesselId) continue;
    if (log.id === incident.voyageLogId || sameDay(log.occurredAt)) picked.set(log.id, log);
  }
  return [...picked.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}
