"use server";

import { revalidatePath } from "next/cache";
import type { LaborRuleValues } from "@/domain/labor-law/types";
import { publishAgreement, RULE_VALUE_KEYS } from "@/server/labor-rules";
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
