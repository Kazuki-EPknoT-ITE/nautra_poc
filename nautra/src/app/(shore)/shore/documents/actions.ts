"use server";

import { revalidatePath } from "next/cache";
import {
  publishOperationReport,
  publishOpinionStatement,
  recordSubmission,
} from "@/server/document-service";
import { requireShore } from "@/server/shore-session";
import { t } from "@/i18n/ja";

export interface DocumentFormState {
  ok: boolean;
  message: string;
}

const DENIED: DocumentFormState = {
  ok: false,
  message: "帳票を扱う権限がありません（担当者を切り替えてください）",
};

/** 提出記録（提出日・提出先）の登録。追記なので提出済みの内容は書き換わらない（12.3） */
export async function recordSubmissionAction(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const guard = await requireShore("manage_documents");
  if (!guard.ok) return DENIED;
  try {
    recordSubmission(
      {
        documentId: String(formData.get("documentId") ?? ""),
        submittedOn: String(formData.get("submittedOn") ?? ""),
        submittedTo: String(formData.get("submittedTo") ?? ""),
      },
      guard.staff.id,
    );
    revalidatePath("/shore/documents");
    return { ok: true, message: "提出を記録しました" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 3.6.4 意見陳述書（オペレーター宛）を作る。待機時間・労働時間の実績を自動で添付する */
export async function createOpinionStatementAction(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const guard = await requireShore("manage_documents");
  if (!guard.ok) return DENIED;
  try {
    const published = publishOpinionStatement(
      {
        counterparty: String(formData.get("counterparty") ?? ""),
        periodFrom: String(formData.get("periodFrom") ?? ""),
        periodTo: String(formData.get("periodTo") ?? ""),
        request: String(formData.get("request") ?? ""),
      },
      guard.staff.id,
      `${guard.staff.name}（${t.shoreRole[guard.staff.role]}）`,
    );
    revalidatePath("/shore/documents");
    return {
      ok: true,
      message: `作成しました: ${published.title}（一覧の「印刷する」から出力できます）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 3.3.3 / 3.6.4 運航実績レポート・月次報告書を作る */
export async function createOperationReportAction(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const guard = await requireShore("manage_documents");
  if (!guard.ok) return DENIED;
  try {
    const published = publishOperationReport(
      String(formData.get("month") ?? ""),
      guard.staff.id,
      `${guard.staff.name}（${t.shoreRole[guard.staff.role]}）`,
    );
    revalidatePath("/shore/documents");
    return {
      ok: true,
      message: `作成しました: ${published.title}（一覧の「印刷する」から出力できます）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
