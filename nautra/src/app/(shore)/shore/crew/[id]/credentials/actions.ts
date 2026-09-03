"use server";

import { revalidatePath } from "next/cache";
import { createCredential, verifyCredentialOriginal } from "@/server/crew-master-service";
import { requireShore } from "@/server/shore-session";
import type { CredentialCategory, CredentialVerifyMethod } from "@/sync-protocol/records";

export interface CredentialFormState {
  ok: boolean;
  message: string;
}

const s = (formData: FormData, key: string) => String(formData.get(key) ?? "");

function revalidateCrew(crewMemberId: string) {
  revalidatePath(`/shore/crew/${crewMemberId}/credentials`);
  revalidatePath(`/shore/crew/${crewMemberId}`);
  revalidatePath("/shore/crew");
}

/**
 * 12.4 鮮度管理の解消操作。
 * 最終確認日を今日に更新した新しいレコードを配信する（原本は残す）。
 */
export async function verifyCredentialAction(
  _prev: CredentialFormState,
  formData: FormData,
): Promise<CredentialFormState> {
  try {
    const guard = await requireShore("edit_crew_master");
    if (!guard.ok) throw new Error("資格・証書を更新する権限がありません");
    const credentialId = s(formData, "credentialId");
    if (!credentialId) throw new Error("対象の証書が特定できません。画面を開き直してください");

    const published = verifyCredentialOriginal({
      credentialId,
      actor: guard.staff.id,
      verifyMethod: (s(formData, "verifyMethod") || "original") as CredentialVerifyMethod,
    });
    revalidateCrew(s(formData, "crewMemberId") || published.subjectId);
    return {
      ok: true,
      message: `確認しました: ${published.name}（最終確認日を ${published.lastVerifiedOn} に更新）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 証書を新しく登録する（3.1.3 / 3.9） */
export async function createCredentialAction(
  _prev: CredentialFormState,
  formData: FormData,
): Promise<CredentialFormState> {
  try {
    const guard = await requireShore("edit_crew_master");
    if (!guard.ok) throw new Error("資格・証書を登録する権限がありません");
    const crewMemberId = s(formData, "crewMemberId");
    if (!crewMemberId) throw new Error("対象の船員が特定できません。画面を開き直してください");

    const published = createCredential({
      crewMemberId,
      actor: guard.staff.id,
      form: {
        category: s(formData, "category") as CredentialCategory,
        name: s(formData, "name"),
        grade: s(formData, "grade"),
        number: s(formData, "number"),
        issuedOn: s(formData, "issuedOn"),
        expiresOn: s(formData, "expiresOn"),
        issuer: s(formData, "issuer"),
        lastVerifiedOn: s(formData, "lastVerifiedOn"),
        verifyMethod: (s(formData, "verifyMethod") || undefined) as
          | CredentialVerifyMethod
          | undefined,
        attachmentName: s(formData, "attachmentName"),
      },
    });
    revalidateCrew(crewMemberId);
    return { ok: true, message: `登録しました: ${published.name}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
