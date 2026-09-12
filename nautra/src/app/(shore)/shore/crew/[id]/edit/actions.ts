"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCrewMaster, retireCrewMaster, updateCrewMaster } from "@/server/crew-master-service";
import { crewMasterOf } from "@/server/master-service";
import { recordDeletion } from "@/server/trash-service";
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
        photoDataUrl: s(formData, "photoDataUrl"),
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

/**
 * S-04 船員の新規登録（Server Action）。
 *
 * 編集と**同じフォーム・同じ検証**を通す（12.3「更新の導線は1つ」を新規にも適用する）。
 * 登録後は続けて資格・証書を入れられるよう、そのままカルテへ送る。
 */
export async function createCrewMasterAction(
  _prev: CrewMasterFormState,
  formData: FormData,
): Promise<CrewMasterFormState> {
  let created = "";
  try {
    const guard = await requireShore("edit_crew_master");
    if (!guard.ok) throw new Error("船員を登録する権限がありません");
    const canEditSensitive = await hasShorePermission("view_sensitive_health");

    const insurances = INSURANCE_KINDS.map((kind: InsuranceKind) => ({
      kind,
      number: s(formData, `ins.${kind}.number`),
      acquiredOn: s(formData, `ins.${kind}.acquiredOn`),
      lastVerifiedOn: s(formData, `ins.${kind}.lastVerifiedOn`),
      verifyMethod: (s(formData, `ins.${kind}.verifyMethod`) ||
        undefined) as InsuranceEntry["verifyMethod"],
    }));

    const { crewMemberId } = createCrewMaster({
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
        photoDataUrl: s(formData, "photoDataUrl"),
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

    revalidatePath("/shore/crew");
    revalidatePath("/shore/manning");
    created = crewMemberId;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), changed: [] };
  }

  // redirect は内部で例外を投げるため try の外で呼ぶ（catch に飲まれないようにする）
  redirect(`/shore/crew/${created}/credentials`);
}

/**
 * S-04 船員の無効化（退職・登録抹消）。
 *
 * マスタは追記型なので「消す」操作は無い。`retiredOn` を入れた新しい版を配信し、
 * あわせて S-18 の一覧に跡を残す（30日以内は戻せる）。打刻・日次レコードは
 * 改変できないため必ず残り、消えるのは配乗・当直・未完了タスクからの紐付けだけ。
 */
export async function retireCrewAction(
  crewMemberId: string,
  mode: "archive" | "delete",
): Promise<{ ok: boolean; message: string }> {
  const guard = await requireShore("edit_crew_master");
  if (!guard.ok) return { ok: false, message: "船員マスタを更新する権限がありません" };

  const current = crewMasterOf(crewMemberId);
  if (!current) return { ok: false, message: "この船員のマスタが見つかりません" };
  if (current.retiredOn) return { ok: false, message: `${current.name} はすでに無効化されています` };

  try {
    retireCrewMaster({ crewMemberId, actor: guard.staff.id });
    recordDeletion({
      entityKind: "船員",
      entityId: crewMemberId,
      entityLabel: `${current.name}（${current.position ?? "—"}）`,
      mode,
      action: mode === "delete" ? "登録を削除" : "退職として無効化",
      effect: "打刻・労務記録は保存期間5年のため残ります",
      actor: guard.staff.id,
    });
    revalidatePath("/shore/crew");
    revalidatePath(`/shore/crew/${crewMemberId}`);
    revalidatePath("/shore/manning");
    revalidatePath("/shore/trash");
    return {
      ok: true,
      message: `${current.name} を無効化しました（30日以内なら削除・アーカイブから戻せます）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
