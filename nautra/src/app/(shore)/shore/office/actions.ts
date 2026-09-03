"use server";

import { revalidatePath } from "next/cache";
import { parseOptionalNumber } from "@/lib/format";
import {
  confirmPayroll,
  markInvoicePaid,
  publishCharter,
  publishExpense,
  publishSubsidy,
  updateSubsidyStatus,
} from "@/server/office-service";
import { requireShore } from "@/server/shore-session";
import type {
  CharterContractPayload,
  ExpenseKind,
  SubsidyPayload,
} from "@/sync-protocol/masters";

export interface OfficeFormState {
  ok: boolean;
  message: string;
}

const DENIED: OfficeFormState = {
  ok: false,
  message: "傭船・請求・経理を扱う権限がありません（担当者を切り替えてください）",
};

function fail(e: unknown): OfficeFormState {
  return { ok: false, message: e instanceof Error ? e.message : String(e) };
}

/** 3.6.1 傭船契約の登録・更新 */
export async function saveCharterAction(
  _prev: OfficeFormState,
  formData: FormData,
): Promise<OfficeFormState> {
  const guard = await requireShore("manage_office");
  if (!guard.ok) return DENIED;
  try {
    const supersedesId = String(formData.get("supersedesId") ?? "").trim();
    publishCharter(
      {
        targetVesselId: String(formData.get("targetVesselId") ?? ""),
        counterparty: String(formData.get("counterparty") ?? ""),
        contractType: String(
          formData.get("contractType") ?? "time_charter",
        ) as CharterContractPayload["contractType"],
        from: String(formData.get("from") ?? ""),
        to: String(formData.get("to") ?? "") || undefined,
        rate: parseOptionalNumber(String(formData.get("rate") ?? "")),
        rateUnit: String(formData.get("rateUnit") ?? ""),
        status: String(formData.get("status") ?? "active") as CharterContractPayload["status"],
        terms: String(formData.get("terms") ?? ""),
        supersedesId: supersedesId || undefined,
      },
      guard.staff.id,
    );
    revalidatePath("/shore/office");
    return { ok: true, message: supersedesId ? "契約を更新しました" : "契約を登録しました" };
  } catch (e) {
    return fail(e);
  }
}

/** 3.6.1 入金の記録 */
export async function markInvoicePaidAction(
  _prev: OfficeFormState,
  formData: FormData,
): Promise<OfficeFormState> {
  const guard = await requireShore("manage_office");
  if (!guard.ok) return DENIED;
  try {
    markInvoicePaid(
      {
        invoiceId: String(formData.get("invoiceId") ?? ""),
        paidOn: String(formData.get("paidOn") ?? ""),
      },
      guard.staff.id,
    );
    revalidatePath("/shore/office");
    return { ok: true, message: "入金を記録しました" };
  } catch (e) {
    return fail(e);
  }
}

/** 3.6.2 経費の登録 */
export async function saveExpenseAction(
  _prev: OfficeFormState,
  formData: FormData,
): Promise<OfficeFormState> {
  const guard = await requireShore("manage_office");
  if (!guard.ok) return DENIED;
  try {
    publishExpense(
      {
        targetVesselId: String(formData.get("targetVesselId") ?? "") || undefined,
        kind: String(formData.get("kind") ?? "other") as ExpenseKind,
        title: String(formData.get("title") ?? ""),
        amount: Number(formData.get("amount") ?? Number.NaN),
        spentOn: String(formData.get("spentOn") ?? ""),
        supplier: String(formData.get("supplier") ?? ""),
        receiptRef: String(formData.get("receiptRef") ?? ""),
      },
      guard.staff.id,
    );
    revalidatePath("/shore/office");
    return { ok: true, message: "経費を登録しました" };
  } catch (e) {
    return fail(e);
  }
}

/** 3.6.2 給与の確定（確定時の時間外分数を保存する） */
export async function confirmPayrollAction(
  _prev: OfficeFormState,
  formData: FormData,
): Promise<OfficeFormState> {
  const guard = await requireShore("manage_office");
  if (!guard.ok) return DENIED;
  try {
    const published = confirmPayroll(String(formData.get("payrollId") ?? ""), guard.staff.id);
    revalidatePath("/shore/office");
    return {
      ok: true,
      message: `確定しました（時間外 ${published.overtimeMinutes ?? 0}分を確定値として保存）`,
    };
  } catch (e) {
    return fail(e);
  }
}

/** 3.6.3 補助金・行政手続きの登録 */
export async function saveSubsidyAction(
  _prev: OfficeFormState,
  formData: FormData,
): Promise<OfficeFormState> {
  const guard = await requireShore("manage_office");
  if (!guard.ok) return DENIED;
  try {
    publishSubsidy(
      {
        title: String(formData.get("title") ?? ""),
        category: String(formData.get("category") ?? "subsidy") as SubsidyPayload["category"],
        authority: String(formData.get("authority") ?? ""),
        appliedOn: String(formData.get("appliedOn") ?? "") || undefined,
        dueOn: String(formData.get("dueOn") ?? "") || undefined,
        amount: parseOptionalNumber(String(formData.get("amount") ?? "")),
        status: String(formData.get("status") ?? "preparing") as SubsidyPayload["status"],
        body: String(formData.get("body") ?? ""),
      },
      guard.staff.id,
    );
    revalidatePath("/shore/office");
    return { ok: true, message: "手続きを登録しました" };
  } catch (e) {
    return fail(e);
  }
}

/** 3.6.3 補助金・行政手続きの状態を進める */
export async function updateSubsidyStatusAction(
  _prev: OfficeFormState,
  formData: FormData,
): Promise<OfficeFormState> {
  const guard = await requireShore("manage_office");
  if (!guard.ok) return DENIED;
  try {
    updateSubsidyStatus(
      {
        subsidyId: String(formData.get("subsidyId") ?? ""),
        status: String(formData.get("status") ?? "preparing") as SubsidyPayload["status"],
      },
      guard.staff.id,
    );
    revalidatePath("/shore/office");
    return { ok: true, message: "状態を更新しました" };
  } catch (e) {
    return fail(e);
  }
}
