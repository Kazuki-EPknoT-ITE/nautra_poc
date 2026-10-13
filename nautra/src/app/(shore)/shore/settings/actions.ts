"use server";

import { revalidatePath } from "next/cache";
import type { LaborRuleValues } from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";
import { publishAgreement, RULE_VALUE_KEYS } from "@/server/labor-rules";
import { requireShore } from "@/server/shore-session";
import {
  changeShoreUserRole,
  disableShoreUser,
  inviteShoreUser,
} from "@/server/shore-user-service";
import { recordDeletion } from "@/server/trash-service";

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
  /** 招待コード（メールを送らないので画面に出して手渡す） */
  inviteCode?: string;
}

/**
 * S-15: ユーザーを招待する（デザイン正本 `design/poc_design`）。
 *
 * **アカウントの実体を作る**（`shore_user` を1件追記する）。監査ログに残すだけだと、
 * 招待された人が一覧に出ずサインインもできず、「送ったのに使えない」が区別できない。
 * メール送信経路が無いぶんは**招待コードを画面に返し**、管理者が本人へ渡せるようにする。
 */
export async function inviteUserAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const guard = await requireShore("manage_settings");
  if (!guard.ok) return { ok: false, message: "ユーザーを招待する権限がありません" };

  try {
    const { user, inviteCode } = inviteShoreUser({
      email: String(formData.get("email") ?? ""),
      role: String(formData.get("role") ?? ""),
      name: String(formData.get("name") ?? ""),
      scope: String(formData.get("scope") ?? "all"),
      actor: guard.staff.id,
    });
    revalidatePath("/shore/settings");
    revalidatePath("/shore/login");
    return {
      ok: true,
      message: `${user.email} を招待しました。招待コード ${inviteCode} を本人へ伝えてください（サインイン画面の「新規登録」で使います）。`,
      inviteCode,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * S-15: ロールを変える。**ロールは管理者が決めるもの**で利用者は選べないため、
 * 変更の入口はこの画面だけに置く（12.3 単一経路）。
 */
export async function changeUserRoleAction(
  userId: string,
  role: string,
): Promise<SettingsFormState> {
  const guard = await requireShore("manage_settings");
  if (!guard.ok) return { ok: false, message: "ロールを変更する権限がありません" };
  try {
    const user = changeShoreUserRole(userId, role, guard.staff.id);
    revalidatePath("/shore/settings");
    return {
      ok: true,
      message: `${user.name} のロールを「${t.shoreRole[user.role] ?? user.role}」にしました`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * S-15: ユーザーを無効化する。実体は消さず、サインインだけを止める。
 * 跡は `trash_entry` に残し、**30日以内なら S-18 から戻せる**（復元の入口を1つにする）。
 */
export async function disableUserAction(
  userId: string,
  mode: "disable" | "delete",
): Promise<SettingsFormState> {
  const guard = await requireShore("manage_settings");
  if (!guard.ok) return { ok: false, message: "ユーザーを無効化する権限がありません" };
  try {
    const user = disableShoreUser(userId, guard.staff.id);
    recordDeletion({
      entityKind: "ユーザー",
      entityId: userId,
      entityLabel: `${user.name}（${user.title || t.shoreRole[user.role] || user.role}）`,
      mode,
      action: mode === "delete" ? "アカウントを削除" : "無効化",
      effect: "ログイン不可。承認・書き出しの監査ログは残ります",
      actor: guard.staff.id,
    });
    revalidatePath("/shore/settings");
    revalidatePath("/shore/trash");
    return {
      ok: true,
      message: `${user.name} を${mode === "delete" ? "削除" : "無効化"}しました（30日以内なら「削除・アーカイブ」から戻せます）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
