"use server";

import { revalidatePath } from "next/cache";
import { updateCrewMaster } from "@/server/crew-master-service";
import { hasShorePermission, requireShore } from "@/server/shore-session";
import type { InsuranceEntry, InsuranceKind } from "@/sync-protocol/records";
import { INSURANCE_KINDS } from "@/sync-protocol/records";

export interface CrewMasterFormState {
  ok: boolean;
  message: string;
  /** 保存できた場合の変更点（要配慮項目は項目名だけ） */
  changed: string[];
}

const s = (formData: FormData, key: string) => String(formData.get(key) ?? "");

/**
 * S-04 船員マスタの保存（Server Action）。
 *
 * 画面を隠すだけでは足りないため、**アクション側でも権限を再チェック**する（10.3）。
 * 追記型の配信と監査ログはサービス層（crew-master-service）に委譲し、ここは入出力だけ扱う。
 */
export async function saveCrewMasterAction(
  _prev: CrewMasterFormState,
  formData: FormData,
): Promise<CrewMasterFormState> {
  try {
    const guard = await requireShore("edit_crew_master");
    if (!guard.ok) throw new Error("船員マスタを更新する権限がありません");
    const canEditSensitive = await hasShorePermission("view_sensitive_health");

    const crewMemberId = s(formData, "crewMemberId");
    if (!crewMemberId) throw new Error("対象の船員が特定できません。画面を開き直してください");

    const insurances = INSURANCE_KINDS.map((kind: InsuranceKind) => ({
      kind,
      number: s(formData, `ins.${kind}.number`),
      acquiredOn: s(formData, `ins.${kind}.acquiredOn`),
      lastVerifiedOn: s(formData, `ins.${kind}.lastVerifiedOn`),
      verifyMethod: (s(formData, `ins.${kind}.verifyMethod`) ||
        undefined) as InsuranceEntry["verifyMethod"],
    }));

    const { changes } = updateCrewMaster({
      crewMemberId,
      actor: guard.staff.id,
      canEditSensitive,
      form: {
        name: s(formData, "name"),
        nameKana: s(formData, "nameKana"),
        birthDate: s(formData, "birthDate"),
        seamanBookNo: s(formData, "seamanBookNo"),
        address: s(formData, "address"),
        bloodType: s(formData, "bloodType"),
        phone: s(formData, "phone"),
        position: s(formData, "position"),
        employmentType: s(formData, "employmentType"),
        hiredOn: s(formData, "hiredOn"),
        emergencyContactName: s(formData, "emergencyContactName"),
        emergencyContactRelation: s(formData, "emergencyContactRelation"),
        emergencyContactPhone: s(formData, "emergencyContactPhone"),
        familyNote: s(formData, "familyNote"),
        medicalHistory: canEditSensitive ? s(formData, "medicalHistory") : undefined,
        medication: canEditSensitive ? s(formData, "medication") : undefined,
        insurances,
      },
    });

    revalidatePath(`/shore/crew/${crewMemberId}/edit`);
    revalidatePath(`/shore/crew/${crewMemberId}`);
    revalidatePath("/shore/crew");
    return {
      ok: true,
      message: `保存しました（${changes.length}項目を変更）。前の内容も履歴として残っています。`,
      changed: changes.map((c) => c.label),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), changed: [] };
  }
}
