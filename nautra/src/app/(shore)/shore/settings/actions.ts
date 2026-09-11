"use server";

import { revalidatePath } from "next/cache";
import type { LaborRuleValues } from "@/domain/labor-law/types";
import { publishAgreement, RULE_VALUE_KEYS } from "@/server/labor-rules";
import { writeAuditLog } from "@/server/master-service";
import { requireShore } from "@/server/shore-session";

export interface AgreementFormState {
  ok: boolean;
  message: string;
}

/**
 * S-15: 労使協定・就業規則の新しい版を登録する（6.5「協定・規則の版管理」）。
 *
 * 入力された上書き値はそのまま判定閾値になる（6.5「協定内容→アラート閾値への自動反映」）。
 * 閾値の変更は判定結果の意味を変えるため、監査ログに残す（12.6。サービス側で実施）。
 */
export async function publishAgreementAction(
  _prev: AgreementFormState,
  formData: FormData,
): Promise<AgreementFormState> {
  const guard = await requireShore("manage_settings");
  if (!guard.ok) return { ok: false, message: "設定を変更する権限がありません" };
  try {
    const overrideValues: Partial<LaborRuleValues> = {};
    for (const key of RULE_VALUE_KEYS) {
      const raw = String(formData.get(`override_${key}`) ?? "").trim();
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`上書きの値が不正です（${key}）`);
      // 時間で入力させ、分に直して保持する（rule_values の単位は分）
      overrideValues[key] = key.endsWith("Minutes") ? Math.round(n * 60) : n;
    }

    const published = publishAgreement({
      kind: String(formData.get("kind") ?? "labor_agreement") as "labor_agreement" | "work_rules",
      title: String(formData.get("title") ?? ""),
      version: String(formData.get("version") ?? ""),
      filedOn: String(formData.get("filedOn") ?? "") || undefined,
      effectiveFrom: String(formData.get("effectiveFrom") ?? ""),
      effectiveTo: String(formData.get("effectiveTo") ?? "") || undefined,
      overrideValues,
      body: String(formData.get("body") ?? ""),
      actor: guard.staff.id,
      supersedesId: String(formData.get("supersedesId") ?? "") || undefined,
    });

    revalidatePath("/shore/settings");
    revalidatePath("/shore/labor");
    revalidatePath("/shore");
    return {
      ok: true,
      message: `登録しました: ${published.title} 版${published.version}（${published.effectiveFrom} から判定に反映されます）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export interface SettingsFormState {
  ok: boolean;
  message: string;
}

/**
 * S-15: ユーザーを招待する（デザイン正本 `design/poc_design`）。
 *
 * 招待そのものは**監査ログだけ**に積む。PoC はアカウントの実体をコード上の定数で
 * 持っているため（`SHORE_STAFF_ACCOUNTS`）、ここで新しい行を生やすと「再起動で消える
 * ユーザー」ができてしまい、かえって誤解を招くため。本番は Supabase Auth の招待に置き換える。
 */
export async function inviteUserAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const guard = await requireShore("manage_settings");
  if (!guard.ok) return { ok: false, message: "ユーザーを招待する権限がありません" };

  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const scope = String(formData.get("scope") ?? "all");
  if (!email.includes("@")) return { ok: false, message: "メールアドレスを入力してください" };

  writeAuditLog({
    action: "create",
    entityKind: "shore_user_invite",
    entityId: email,
    actor: guard.staff.id,
    after: `${role} / ${scope === "all" ? "すべての船" : scope}`,
    summary: `${email} を ${role} として招待`,
  });
  revalidatePath("/shore/settings");

  return {
    ok: true,
    message: `${email} に招待を記録しました（PoC はメールを送らず、監査ログに残すところまでです）。`,
  };
}
