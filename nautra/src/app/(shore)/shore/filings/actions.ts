"use server";

import { revalidatePath } from "next/cache";
import {
  createFilingDraft,
  generateFilingDocuments,
  recordFilingCheck,
  submitFiling,
} from "@/server/filing-service";
import { requireShore } from "@/server/shore-session";
import type { FilingMethod, FilingType } from "@/sync-protocol/records";

export interface FilingFormState {
  ok: boolean;
  message: string;
  /** 直近に作成・更新した届出の ID（画面のスクロール先・印刷リンクに使う） */
  filingId?: string;
}

async function guardFiling(): Promise<{ ok: true; actor: string } | { ok: false; message: string }> {
  const guard = await requireShore("manage_filing");
  if (guard.ok) return { ok: true, actor: guard.staff.id };
  return {
    ok: false,
    message:
      guard.reason === "signed_out"
        ? "サインインし直してください。"
        : "届出を扱う権限がありません。",
  };
}

function revalidate() {
  revalidatePath("/shore/filings");
  revalidatePath("/shore/procedures");
  revalidatePath("/shore/documents");
}

interface TargetInput {
  crewMemberId: string;
  targetVesselId: string;
  duty?: string;
  effectiveOn: string;
}

/** 手順①②: 種別・方式を決め、対象（船員×船舶×効力発生日×職務）をまとめて登録する */
export async function createFilingAction(
  _prev: FilingFormState,
  formData: FormData,
): Promise<FilingFormState> {
  const guard = await guardFiling();
  if (!guard.ok) return { ok: false, message: guard.message };

  try {
    const raw = String(formData.get("targets") ?? "[]");
    const parsed = JSON.parse(raw) as TargetInput[];
    const filing = createFilingDraft({
      filingType: String(formData.get("filingType") ?? "hire") as FilingType,
      method: String(formData.get("method") ?? "paper") as FilingMethod,
      targets: parsed,
      actor: guard.actor,
    });
    revalidate();
    return {
      ok: true,
      filingId: filing.id,
      message: `届出の下書きを作りました（対象 ${filing.targets.length}名）。次に添付要件を確認してください。`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 手順③: 添付要件チェックの実施を記録する（判定そのものは都度算出） */
export async function recordCheckAction(
  _prev: FilingFormState,
  formData: FormData,
): Promise<FilingFormState> {
  const guard = await guardFiling();
  if (!guard.ok) return { ok: false, message: guard.message };

  try {
    const { filing, check } = recordFilingCheck(String(formData.get("filingId") ?? ""), guard.actor);
    revalidate();
    return {
      ok: true,
      filingId: filing.id,
      message:
        check.ngCount > 0
          ? `確認しました。不適合が ${check.ngCount}件 あります。このままでは届出が受理保留になる可能性があります。`
          : check.recheckCount > 0
            ? `確認しました。要再確認が ${check.recheckCount}件 あります（不適合ではありません）。`
            : "確認しました。添付要件はすべて満たしています。",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 手順④: 提出書類を生成する（生成時点のマスタ値を書類に焼き込む） */
export async function generateDocumentsAction(
  _prev: FilingFormState,
  formData: FormData,
): Promise<FilingFormState> {
  const guard = await guardFiling();
  if (!guard.ok) return { ok: false, message: guard.message };

  try {
    const { filing, documents } = generateFilingDocuments(
      String(formData.get("filingId") ?? ""),
      guard.actor,
    );
    revalidate();
    return {
      ok: true,
      filingId: filing.id,
      message: `書類を ${documents.length}件 作りました（${documents.map((d) => d.title).join(" / ")}）。`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 手順⑤: 提出を記録し、船員手帳の記帳情報を残す */
export async function submitFilingAction(
  _prev: FilingFormState,
  formData: FormData,
): Promise<FilingFormState> {
  const guard = await guardFiling();
  if (!guard.ok) return { ok: false, message: guard.message };

  try {
    const filing = submitFiling({
      filingId: String(formData.get("filingId") ?? ""),
      submittedOn: String(formData.get("submittedOn") ?? ""),
      office: String(formData.get("office") ?? ""),
      actor: guard.actor,
    });
    revalidate();
    return {
      ok: true,
      filingId: filing.id,
      message: `提出を記録しました（${filing.office} / ${filing.submittedOn}）。船員手帳の記帳情報も残しました。`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
