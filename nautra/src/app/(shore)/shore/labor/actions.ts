"use server";

import { revalidatePath } from "next/cache";
import {
  commitLedgerImport,
  previewLedgerImport,
  publishLedgerDocument,
  publishManagerApproval,
} from "@/server/ledger-service";
import { publishLeaveRecord } from "@/server/leave-service";
import { requireShore } from "@/server/shore-session";
import type { LeaveKind } from "@/sync-protocol/records";

export interface ApprovalFormState {
  ok: boolean;
  message: string;
}

/**
 * S-06: 労務管理責任者としての承認・差戻し（Server Action）。
 * 対象日をまとめて処理できる（日次一括承認）。
 */
export async function approveDaysAction(
  _prev: ApprovalFormState,
  formData: FormData,
): Promise<ApprovalFormState> {
  const guard = await requireShore("approve_labor_manager");
  if (!guard.ok) return { ok: false, message: "承認する権限がありません" };
  try {
    const crewMemberId = String(formData.get("crewMemberId") ?? "");
    const decision = String(formData.get("decision") ?? "approved") as "approved" | "remanded";
    const dates = formData.getAll("dates").map(String).filter(Boolean);
    const count = publishManagerApproval({
      crewMemberId,
      dates,
      decision,
      reason: String(formData.get("reason") ?? ""),
    });
    revalidatePath("/shore/labor");
    revalidatePath("/shore");
    return {
      ok: true,
      message:
        decision === "approved"
          ? `${count}日分を承認しました（船内の次回同期で反映されます）`
          : `${count}日分を差戻しました（本人が打刻を直せます）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/* ═══════════════ 3.2.4 休日・有給・補償休日の付与／取得 ═══════════════ */

export interface LeaveFormState {
  ok: boolean;
  message: string;
}

/**
 * 休暇の付与・取得を登録する。
 * 3.2.4「休暇日数の付与や編集は**管理者権限のみ**が行える」に従い `edit_leave` を要求する。
 */
export async function publishLeaveAction(
  _prev: LeaveFormState,
  formData: FormData,
): Promise<LeaveFormState> {
  const guard = await requireShore("edit_leave");
  if (!guard.ok) {
    return { ok: false, message: "休日・有給を登録する権限がありません（管理者のみ）" };
  }
  try {
    const action = String(formData.get("leaveAction") ?? "grant") as "grant" | "take";
    const record = publishLeaveRecord({
      crewMemberId: String(formData.get("crewMemberId") ?? ""),
      kind: String(formData.get("kind") ?? "paid_leave") as LeaveKind,
      action,
      date: String(formData.get("date") ?? ""),
      days: Number(formData.get("days") ?? 0),
      expiresOn: String(formData.get("expiresOn") ?? "") || undefined,
      reason: String(formData.get("reason") ?? ""),
      actor: guard.staff.id,
    });
    revalidatePath("/shore/labor");
    revalidatePath("/shore");
    return {
      ok: true,
      message: `${record.date} に ${record.days}日 を${action === "grant" ? "付与" : "取得として登録"}しました`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/* ═══════════════ 3.2.2 Excel マクロ様式（CSV）の取込 ═══════════════ */

export interface ImportPreviewLine {
  line: number;
  label: string;
}

export interface ImportFormState {
  ok: boolean;
  /** preview = 検証しただけ / committed = 取り込んだ */
  phase: "idle" | "preview" | "committed";
  message: string;
  okRows: ImportPreviewLine[];
  ngRows: ImportPreviewLine[];
}

/**
 * `"use server"` のモジュールから公開できるのは async 関数だけなので、
 * 初期状態は**エクスポートせず**、フォーム側で同じ形を持つ（定数を輸出すると SSR が壊れる）。
 */
const IMPORT_INITIAL: ImportFormState = {
  ok: false,
  phase: "idle",
  message: "",
  okRows: [],
  ngRows: [],
};

/**
 * 取込フォームの Server Action。
 * `mode=preview` は検証だけを行い、`mode=commit` で打刻レコードとして追記する。
 * **確認してから取り込む**（いきなり書き込まない）ため2段階にしている。
 */
export async function importLedgerAction(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const guard = await requireShore("approve_labor_manager");
  if (!guard.ok) {
    return { ...IMPORT_INITIAL, message: "記録簿を取り込む権限がありません" };
  }
  const text = String(formData.get("csv") ?? "");
  const mode = String(formData.get("mode") ?? "preview");
  if (!text.trim()) {
    return { ...IMPORT_INITIAL, message: "取り込む内容を貼り付けるか、CSV ファイルを選んでください" };
  }
  try {
    if (mode === "commit") {
      const outcome = commitLedgerImport(text, guard.staff.id);
      revalidatePath("/shore/labor");
      revalidatePath("/shore");
      const parts = [`${outcome.imported}件を取り込みました`];
      if (outcome.duplicated > 0) parts.push(`${outcome.duplicated}件は取込済みのため増えていません`);
      if (outcome.issues > 0) parts.push(`${outcome.issues}行は取り込めませんでした`);
      return {
        ok: true,
        phase: "committed",
        message: parts.join(" / "),
        okRows: [],
        ngRows: outcome.preview.issues.map((i) => ({ line: i.line, label: i.reason })),
      };
    }

    const preview = previewLedgerImport(text);
    return {
      ok: preview.rows.length > 0,
      phase: "preview",
      message:
        preview.rows.length > 0
          ? `取り込める行 ${preview.rows.length}件 / 取り込めない行 ${preview.issues.length}件。内容を確認して取り込んでください`
          : `取り込める行がありません（${preview.issues.length}件の問題）`,
      okRows: preview.rows.map((r) => ({
        line: r.line,
        label: `${r.date} ${preview.crewNames[r.crewMemberId] ?? r.crewMemberId} ${r.start}–${r.end}`,
      })),
      ngRows: preview.issues.map((i) => ({ line: i.line, label: i.reason })),
    };
  } catch (e) {
    return {
      ...IMPORT_INITIAL,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ═══════════════ 3.2.2 記録簿の保管（帳票センターへ） ═══════════════ */

export interface DocumentFormState {
  ok: boolean;
  message: string;
}

/** 表示中の記録簿を帳票として保存し、出力を監査ログに残す（12.6） */
export async function saveLedgerDocumentAction(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const guard = await requireShore("manage_documents");
  if (!guard.ok) return { ok: false, message: "帳票を保存する権限がありません" };
  try {
    const doc = publishLedgerDocument(
      String(formData.get("crewMemberId") ?? ""),
      String(formData.get("month") ?? ""),
      guard.staff.id,
    );
    revalidatePath("/shore/documents");
    return { ok: true, message: `帳票センターに保存しました: ${doc.title}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
