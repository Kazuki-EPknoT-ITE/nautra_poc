"use server";

import { revalidatePath } from "next/cache";
import {
  publishBulkPermit,
  publishCrewRegister,
  publishDrillRecordDoc,
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

/**
 * 海員名簿の出力（要件定義書 9章 / 6.2 B群）。
 * 名簿は入力せず、乗下船の記録から組み立てる（常時最新に自動維持）。
 */
export async function createCrewRegisterAction(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const guard = await requireShore("manage_documents");
  if (!guard.ok) return DENIED;
  try {
    const published = publishCrewRegister(
      String(formData.get("vesselId") ?? ""),
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

/**
 * 一括届出許可申請書・電子届出登録申請書（要件定義書 3.8.3 申請方法B / 6.6③）。
 * 蓄積済みの届出実績と労務管理の体制を疎明材料として添える。
 */
export async function createBulkPermitAction(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const guard = await requireShore("manage_documents");
  if (!guard.ok) return DENIED;
  try {
    const office = String(formData.get("office") ?? "").trim();
    if (!office) return { ok: false, message: "提出先の運輸局を入力してください" };
    const published = publishBulkPermit(
      office,
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

/** 操練（訓練）実施記録の出力（要件定義書 9章 / 3.3.2 / 3.9） */
export async function createDrillRecordDocAction(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const guard = await requireShore("manage_documents");
  if (!guard.ok) return DENIED;
  try {
    const from = String(formData.get("from") ?? "");
    const to = String(formData.get("to") ?? "");
    if (!from || !to) return { ok: false, message: "期間を入力してください" };
    if (from > to) return { ok: false, message: "開始日が終了日より後になっています" };
    const published = publishDrillRecordDoc(
      from,
      to,
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
