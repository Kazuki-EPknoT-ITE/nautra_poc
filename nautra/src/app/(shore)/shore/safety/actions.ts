"use server";

import { revalidatePath } from "next/cache";
import { parseOptionalNumber } from "@/lib/format";
import {
  appendIncidentAnalysis,
  generateIncidentReportDraft,
  publishSmsDocument,
  updateSmsStatus,
} from "@/server/safety-service";
import { requireShore } from "@/server/shore-session";
import type { SmsDocKind } from "@/sync-protocol/masters";

/**
 * 安全管理・事故報告の書き込み（Server Action）。
 *
 * 画面自体は全ロールが見られる（`view_dashboard`）が、**記入は `manage_fleet` を要求する**。
 * 画面を隠すだけでは不十分なため、この中でも権限を再チェックする（10.3）。
 */

export interface SafetyFormState {
  ok: boolean;
  message: string;
  /** 生成した報告書ドラフトの本文（生成直後にその場で確認できるようにする） */
  draft?: string;
}

async function actorId(): Promise<string> {
  const guard = await requireShore("manage_fleet");
  if (!guard.ok) {
    throw new Error(
      guard.reason === "signed_out"
        ? "サインインしてください"
        : "記入する権限がありません（この画面は見るだけになります。運航管理の担当者に依頼してください）",
    );
  }
  return guard.staff.id;
}

/** SMS 文書（方針・リスクアセスメント・不適合・内部監査）を登録する */
export async function publishSmsDocumentAction(
  _prev: SafetyFormState,
  formData: FormData,
): Promise<SafetyFormState> {
  try {
    const actor = await actorId();
    const published = publishSmsDocument(
      {
        kind: String(formData.get("kind") ?? "policy") as SmsDocKind,
        title: String(formData.get("title") ?? ""),
        body: String(formData.get("body") ?? ""),
        severity: parseOptionalNumber(String(formData.get("severity") ?? "")),
        likelihood: parseOptionalNumber(String(formData.get("likelihood") ?? "")),
        correctiveAction: String(formData.get("correctiveAction") ?? ""),
        dueOn: String(formData.get("dueOn") ?? ""),
        status: String(formData.get("status") ?? "open") as "open" | "in_progress" | "closed",
        responsible: String(formData.get("responsible") ?? ""),
        auditedOn: String(formData.get("auditedOn") ?? ""),
        auditor: String(formData.get("auditor") ?? ""),
      },
      actor,
    );
    revalidatePath("/shore/safety");
    return { ok: true, message: `登録しました: ${published.title}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 不適合・監査所見の対応状況を更新する */
export async function updateSmsStatusAction(
  _prev: SafetyFormState,
  formData: FormData,
): Promise<SafetyFormState> {
  try {
    const actor = await actorId();
    const published = updateSmsStatus(
      String(formData.get("documentId") ?? ""),
      {
        status: String(formData.get("status") ?? "open") as "open" | "in_progress" | "closed",
        correctiveAction: String(formData.get("correctiveAction") ?? ""),
        dueOn: String(formData.get("dueOn") ?? ""),
      },
      actor,
    );
    revalidatePath("/shore/safety");
    return { ok: true, message: `更新しました: ${published.title}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 事故報告に原因分析・再発防止策・通報の記録を追記する */
export async function appendIncidentAction(
  _prev: SafetyFormState,
  formData: FormData,
): Promise<SafetyFormState> {
  try {
    const actor = await actorId();
    const published = appendIncidentAnalysis(
      {
        incidentId: String(formData.get("incidentId") ?? ""),
        cause: String(formData.get("cause") ?? ""),
        preventiveAction: String(formData.get("preventiveAction") ?? ""),
        status: String(formData.get("status") ?? "open") as "open" | "investigating" | "closed",
        reportedToAuthority: formData.get("reportedToAuthority") === "on",
        authorityReportedOn: String(formData.get("authorityReportedOn") ?? ""),
        notifiedNearbyShips: formData.get("notifiedNearbyShips") === "on",
        notifiedNearbyShipsAt: String(formData.get("notifiedNearbyShipsAt") ?? ""),
      },
      actor,
    );
    revalidatePath("/shore/safety");
    return { ok: true, message: `追記しました: ${published.title}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 事故報告と航海日誌から、行政機関への報告書ドラフトを作って保存する（6.5） */
export async function generateDraftAction(incidentId: string): Promise<SafetyFormState> {
  try {
    const actor = await actorId();
    const result = generateIncidentReportDraft(incidentId, actor);
    revalidatePath("/shore/safety");
    return {
      ok: true,
      message: `ドラフトを作りました（航海日誌 ${result.quotedLogs}件を引用）`,
      draft: result.body,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
