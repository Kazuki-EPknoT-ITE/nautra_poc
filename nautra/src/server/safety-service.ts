import { carryOverFields } from "@/lib/master-fields";
import {
  buildIncidentReportDraft,
  buildRiskMatrix,
  nearMissByMonth,
  recentMonths,
  sortByOpenFirst,
  sortIncidents,
  voyageLogsForIncident,
  type MonthlyCount,
  type RiskCell,
} from "@/lib/safety-plain";
import type {
  GeneratedDocumentPayload,
  IncidentReportPayload,
  SmsDocKind,
  SmsDocumentPayload,
} from "@/sync-protocol/masters";
import {
  COMPANY_SCOPE_ID,
  crewNameOf,
  effective,
  publishMaster,
  todayLocal,
  vesselNameOf,
  writeAuditLog,
} from "./master-service";

/**
 * 安全管理・事故報告（要件定義書 3.5.1 SMS / 3.5.2 事故・インシデント / 6.5 報告書ドラフト）。
 *
 * 集計・並び順・文面の組み立ては `src/lib/safety-plain.ts`（純関数）が行い、
 * ここはストアの読み出しと追記型の配信に専念する。
 */

/**
 * 付近船舶等への通報日時（3.5.2 コンテナ海中転落）。
 * `incident_report` は passthrough スキーマで未知フィールドを往復保全するため
 * （基本設計書 8.6）、通報日時はこの追加項目として保持する。
 */
export type IncidentWithNotice = IncidentReportPayload & { notifiedNearbyShipsAt?: string };

export function notifiedAtOf(incident: IncidentReportPayload): string | undefined {
  const value = (incident as IncidentWithNotice).notifiedNearbyShipsAt;
  return typeof value === "string" && value ? value : undefined;
}

export interface SafetyBoard {
  /** 3.5.1 安全方針・重点施策 */
  policies: SmsDocumentPayload[];
  /** 3.5.1 リスクアセスメント（マトリクス表示用の 5×5 と元データ） */
  risks: SmsDocumentPayload[];
  riskMatrix: RiskCell[][];
  /** 3.5.1 不適合・是正措置（未完了を先頭に） */
  nonconformities: SmsDocumentPayload[];
  /** 3.5.1 内部監査 */
  audits: SmsDocumentPayload[];
  /** 3.5.2 事故・インシデント（未対応・調査中を先頭に） */
  incidents: IncidentReportPayload[];
  /** ヒヤリハットの月別件数（重点施策の達成状況） */
  nearMiss: MonthlyCount[];
  nearMissTarget: number;
  /** 生成済みの報告書ドラフト */
  drafts: GeneratedDocumentPayload[];
  today: string;
}

/** 重点施策「ヒヤリハット報告の月2件以上」に対応する目標値（安全方針の運用値。法令の閾値ではない） */
export const NEAR_MISS_TARGET_PER_MONTH = 2;

export function buildSafetyBoard(now = new Date()): SafetyBoard {
  const sms = effective("sms_document");
  const incidents = effective("incident_report");
  const byKind = (kind: SmsDocKind) => sms.filter((d) => d.kind === kind);
  const risks = byKind("risk_assessment");

  return {
    policies: byKind("policy").sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    risks: sortByOpenFirst(risks),
    riskMatrix: buildRiskMatrix(risks),
    nonconformities: sortByOpenFirst(byKind("nonconformity")),
    audits: byKind("internal_audit").sort((a, b) =>
      (b.auditedOn ?? b.occurredAt).localeCompare(a.auditedOn ?? a.occurredAt),
    ),
    incidents: sortIncidents(incidents),
    nearMiss: nearMissByMonth(incidents, recentMonths(now, 6), NEAR_MISS_TARGET_PER_MONTH),
    nearMissTarget: NEAR_MISS_TARGET_PER_MONTH,
    drafts: effective("generated_document")
      .filter((d) => d.kind === "other" && d.title.includes("海難等の報告書"))
      .sort((a, b) => b.generatedOn.localeCompare(a.generatedOn)),
    today: todayLocal(now),
  };
}

export function incidentById(id: string): IncidentReportPayload | undefined {
  return effective("incident_report").find((i) => i.id === id);
}

/* ═══════════════ 3.5.1 SMS 文書の登録 ═══════════════ */

export interface SmsDocumentInput {
  kind: SmsDocKind;
  title: string;
  body?: string;
  severity?: number;
  likelihood?: number;
  correctiveAction?: string;
  dueOn?: string;
  status?: "open" | "in_progress" | "closed";
  responsible?: string;
  auditedOn?: string;
  auditor?: string;
  /** 既存の文書を訂正・更新するとき */
  supersedesId?: string;
}

/** SMS 文書（方針・リスクアセスメント・不適合・内部監査）を1件配信する */
export function publishSmsDocument(
  input: SmsDocumentInput,
  actor?: string,
  now = new Date(),
): SmsDocumentPayload {
  const title = input.title.trim();
  if (!title) throw new Error("標題を入力してください");
  if (input.kind === "risk_assessment") {
    const inRange = (v: number | undefined) => v !== undefined && v >= 1 && v <= 5;
    if (!inRange(input.severity) || !inRange(input.likelihood)) {
      throw new Error("リスクアセスメントは影響度・発生度を1〜5で選んでください");
    }
  }

  const published = publishMaster(
    "sms_document",
    {
      kind: input.kind,
      title,
      body: input.body?.trim() || undefined,
      severity: input.severity,
      likelihood: input.likelihood,
      correctiveAction: input.correctiveAction?.trim() || undefined,
      dueOn: input.dueOn?.trim() || undefined,
      status: input.status ?? "open",
      responsible: input.responsible?.trim() || undefined,
      auditedOn: input.auditedOn?.trim() || undefined,
      auditor: input.auditor?.trim() || undefined,
    },
    { supersedesId: input.supersedesId, vesselId: COMPANY_SCOPE_ID, actor, now },
  );
  writeAuditLog({
    action: input.supersedesId ? "update" : "create",
    entityKind: "sms_document",
    entityId: published.id,
    after: `${input.kind}: ${title}`,
    actor,
    summary: input.supersedesId ? "安全管理の文書を更新" : "安全管理の文書を登録",
    now,
  });
  return published;
}

/** 不適合・監査所見の状態と是正内容を更新する（追記型の訂正） */
export function updateSmsStatus(
  documentId: string,
  patch: { status?: "open" | "in_progress" | "closed"; correctiveAction?: string; dueOn?: string },
  actor?: string,
  now = new Date(),
): SmsDocumentPayload {
  const row = effective("sms_document").find((d) => d.id === documentId);
  if (!row) throw new Error("この文書は既に更新されています。画面を開き直してください");
  const published = publishMaster(
    "sms_document",
    {
      ...carryOverFields(row),
      /** 文書の日付は原本のまま（対応状況を直しただけで作成日が動かないようにする） */
      occurredAt: row.occurredAt,
      status: patch.status ?? row.status,
      correctiveAction: patch.correctiveAction?.trim() || row.correctiveAction,
      dueOn: patch.dueOn?.trim() || row.dueOn,
    },
    { supersedesId: row.id, vesselId: COMPANY_SCOPE_ID, actor, now },
  );
  writeAuditLog({
    action: "update",
    entityKind: "sms_document",
    entityId: published.id,
    before: `状態: ${row.status ?? "open"}`,
    after: `状態: ${published.status ?? "open"}`,
    actor,
    summary: `${row.title} の対応状況を更新`,
    now,
  });
  return published;
}

/* ═══════════════ 3.5.2 事故・インシデントへの追記（陸上から） ═══════════════ */

export interface IncidentUpdateInput {
  incidentId: string;
  cause?: string;
  preventiveAction?: string;
  status?: "open" | "investigating" | "closed";
  reportedToAuthority?: boolean;
  authorityReportedOn?: string;
  notifiedNearbyShips?: boolean;
  notifiedNearbyShipsAt?: string;
}

/**
 * 事故報告に原因分析・再発防止策を追記する（origin は both のため陸上から追記できる）。
 * 船内の一次記録は書き換えず、supersedesId 付きの新しいレコードで表す（12.3 / 10.4）。
 */
export function appendIncidentAnalysis(
  input: IncidentUpdateInput,
  actor?: string,
  now = new Date(),
): IncidentReportPayload {
  const row = incidentById(input.incidentId);
  if (!row) throw new Error("この事故報告は既に更新されています。画面を開き直してください");

  const published = publishMaster(
    "incident_report",
    {
      ...carryOverFields(row),
      /**
       * 事故は occurredAt が「発生日時」そのもの（業務データ）で、recordedBy は
       * 船内で最初に報告した人。陸上が追記しても**この2つは動かさない**。
       * 「誰がいつ追記したか」は publishedAt / publishedBy と監査ログに残る。
       */
      occurredAt: row.occurredAt,
      recordedBy: row.recordedBy,
      cause: input.cause?.trim() || row.cause,
      preventiveAction: input.preventiveAction?.trim() || row.preventiveAction,
      status: input.status ?? row.status,
      reportedToAuthority: input.reportedToAuthority ?? row.reportedToAuthority,
      authorityReportedOn: input.authorityReportedOn?.trim() || row.authorityReportedOn,
      notifiedNearbyShips: input.notifiedNearbyShips ?? row.notifiedNearbyShips,
      notifiedNearbyShipsAt: input.notifiedNearbyShipsAt?.trim() || notifiedAtOf(row),
    },
    { supersedesId: row.id, vesselId: row.vesselId, actor, now },
  );
  writeAuditLog({
    action: "update",
    entityKind: "incident_report",
    entityId: published.id,
    before: `状態: ${row.status}`,
    after: `状態: ${published.status}`,
    actor,
    summary: `${row.title} に陸上から追記`,
    now,
  });
  return published;
}

/* ═══════════════ 6.5 航海日誌からの報告書ドラフト生成 ═══════════════ */

export interface DraftResult {
  document: GeneratedDocumentPayload;
  body: string;
  quotedLogs: number;
}

/**
 * 事故報告から「海難等の報告書」のドラフトを作り、生成物として保存する。
 *
 * 引用元は事故に紐づく航海日誌（`voyageLogId`）と発生当日の記載。
 * 生成時点のスナップショットを snapshot に持たせ、以後マスタが更新されても
 * 提出物の中身は変わらないようにする（12.3）。
 */
export function generateIncidentReportDraft(
  incidentId: string,
  actor?: string,
  now = new Date(),
): DraftResult {
  const incident = incidentById(incidentId);
  if (!incident) throw new Error("事故報告が見つかりません。画面を開き直してください");

  const logs = voyageLogsForIncident(incident, effective("voyage_log"));
  const generatedOn = todayLocal(now);
  const vesselName = vesselNameOf(incident.vesselId);
  const body = buildIncidentReportDraft({
    incident,
    vesselName,
    voyageLogs: logs,
    nameOf: crewNameOf,
    generatedOn,
  });

  const document = publishMaster(
    "generated_document",
    {
      kind: "other",
      title: `海難等の報告書（ドラフト）: ${incident.title}`,
      subjectLabel: `${vesselName} / ${generatedOn}`,
      format: "html",
      generatedOn,
      snapshot: { incidentId: incident.id, body, quotedVoyageLogIds: logs.map((l) => l.id) },
    },
    { vesselId: COMPANY_SCOPE_ID, actor, now },
  );
  writeAuditLog({
    action: "export",
    entityKind: "generated_document",
    entityId: document.id,
    after: document.title,
    actor,
    summary: `事故報告と航海日誌${logs.length}件から報告書ドラフトを生成`,
    now,
  });
  return { document, body, quotedLogs: logs.length };
}

/** 生成済みドラフトの本文（snapshot に保存した文面をそのまま返す） */
export function draftBodyOf(document: GeneratedDocumentPayload): string | null {
  const snapshot = document.snapshot as { body?: unknown } | undefined;
  return typeof snapshot?.body === "string" ? snapshot.body : null;
}
