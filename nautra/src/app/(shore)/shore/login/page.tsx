import { redirect } from "next/navigation";
import { PRODUCT_NAME, t } from "@/i18n/ja";
import { DEMO_COMPANY } from "@/lib/crew";
import { currentLaborRuleSet } from "@/server/labor-rules";
import { listCrewMasters, listVessels, writeAuditLog } from "@/server/master-service";
import {
  authenticateShore,
  getShoreSession,
  listActiveShoreStaff,
  setShoreSession,
} from "@/server/shore-session";
import {
  activateShoreUser,
  completePasswordReset,
  PASSWORD_RULE_TEXT,
  recordShoreSignIn,
  requestPasswordReset,
  RESET_CODE_MINUTES,
} from "@/server/shore-user-service";
import { SignInPanel } from "./_components/sign-in-panel";

export const dynamic = "force-dynamic";

/**
 * 陸上アプリのサインイン（要件定義書 10.3 / デザイン正本 `design/poc_design`）。
 *
 * 暗い面（`#231F20`）に1枚だけ白いカードを置き、**サインイン / 新規登録 / パスワード再設定**を
 * 同じカードの中でタブとして切り替える。ロールはアカウントに紐づくもので、利用者が
 * 選ぶものではない（担当者を選ぶ方式をやめた）。サインインは監査ログに残る（12.6）。
 *
 * 新規登録・再設定は**本当にアカウントを変える**。メール送信経路が無いぶんは、
 * 招待コードを S-15 の一覧に、再設定コードをこの画面に出して手渡しできるようにしてある
 * （「送った体」で終わらせると、招待された人がいつまでも入れない）。
 */
export default async function ShoreLoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    error?: string;
    message?: string;
    code?: string;
    email?: string;
  }>;
}) {
  const sp = await searchParams;
  const current = await getShoreSession();

  async function signInAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const staff = authenticateShore(email, password);
    if (!staff) {
      redirect(`/shore/login?error=invalid&email=${encodeURIComponent(email)}`);
    }
    await setShoreSession(staff.id);
    recordShoreSignIn(staff.id);
    writeAuditLog({
      action: "sign_in",
      entityKind: "shore_session",
      entityId: staff.id,
      actor: staff.id,
      summary: `${staff.name}（${t.shoreRole[staff.role]}）が陸上アプリにサインイン`,
    });
    redirect("/shore");
  }

  /**
   * 招待コードでの新規登録。**ここで初めてパスワードが決まる**（招待した側は知らない）。
   * ロールは招待した管理者が決めたものを動かさない。
   */
  async function registerAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const inviteCode = String(formData.get("invite") ?? "");
    const password = String(formData.get("password") ?? "");
    const password2 = String(formData.get("password2") ?? "");
    const back = (message: string) =>
      `/shore/login?tab=register&error=${encodeURIComponent(message)}&email=${encodeURIComponent(email)}`;

    if (password !== password2) redirect(back("パスワードが一致しません"));
    let staffId: string;
    try {
      const user = activateShoreUser({
        email,
        inviteCode,
        password,
        name: String(formData.get("name") ?? ""),
      });
      staffId = user.id;
    } catch (e) {
      redirect(back(e instanceof Error ? e.message : String(e)));
    }
    await setShoreSession(staffId);
    recordShoreSignIn(staffId);
    redirect("/shore");
  }

  /**
   * 再設定コードの発行。メール送信経路が無いので、コードを画面に返して本人へ渡す。
   * 「送信した体」で戻すだけだと、忘れた人が永久に入れないまま終わる。
   */
  async function resetRequestAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    // redirect は例外で抜けるので、必ず try の外で呼ぶ（catch に拾わせない）
    let resetCode: string;
    try {
      resetCode = requestPasswordReset(email).resetCode;
    } catch (e) {
      redirect(
        `/shore/login?tab=reset&error=${encodeURIComponent(
          e instanceof Error ? e.message : String(e),
        )}&email=${encodeURIComponent(email)}`,
      );
    }
    redirect(
      `/shore/login?tab=reset&code=${encodeURIComponent(resetCode)}&email=${encodeURIComponent(email)}`,
    );
  }

  /** 再設定コードで新しいパスワードを決め、そのままサインインする */
  async function resetCompleteAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const resetCode = String(formData.get("code") ?? "");
    const password = String(formData.get("password") ?? "");
    const password2 = String(formData.get("password2") ?? "");
    const back = (message: string) =>
      `/shore/login?tab=reset&code=${encodeURIComponent(resetCode)}&error=${encodeURIComponent(
        message,
      )}&email=${encodeURIComponent(email)}`;

    if (password !== password2) redirect(back("パスワードが一致しません"));
    let staffId: string;
    try {
      const user = completePasswordReset({ email, resetCode, password });
      staffId = user.id;
    } catch (e) {
      redirect(back(e instanceof Error ? e.message : String(e)));
    }
    await setShoreSession(staffId);
    recordShoreSignIn(staffId);
    redirect("/shore");
  }

  const fleetCount = listVessels().length;
  const crewCount = listCrewMasters().length;
  const ruleVersion = currentLaborRuleSet().version;
  /** 合言葉を画面に出せるのはデモ用の種だけ（自分でパスワードを決めた人のぶんは出ない） */
  const demoAccounts = listActiveShoreStaff().filter((s) => s.demoPassword);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#231F20] px-6 py-16">
      <div className="grid w-full max-w-[960px] items-center gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <p className="flex items-baseline gap-2.5">
            <span className="text-5xl font-bold tracking-[0.02em] text-white">{PRODUCT_NAME}</span>
          </p>
          <p className="mt-[18px] text-xl leading-loose text-[#DFE1E0]">
            船員の労働時間・配乗・届出をまとめて管理します。
            <br />
            船内の打刻はオフラインでも記録され、通信が戻ると自動で届きます。
          </p>
          <p className="mt-[22px] text-sm leading-loose text-[#666666]">
            {DEMO_COMPANY} ／ 船舶{fleetCount}隻 ／ 船員{crewCount}名
            <br />
            ルール版 {ruleVersion}
          </p>
          {current ? (
            <p className="mt-5 text-sm text-[#99877D]">
              いま {current.name}（{current.title}）でサインインしています。
              別のアカウントで入り直すと切り替わります。
            </p>
          ) : null}
        </div>

        <SignInPanel
          tab={sp.tab === "register" || sp.tab === "reset" ? sp.tab : "login"}
          error={sp.error ?? null}
          resetCode={sp.code ?? null}
          resetMinutes={RESET_CODE_MINUTES}
          passwordRule={PASSWORD_RULE_TEXT}
          email={sp.email ?? demoAccounts[0]?.email ?? ""}
          demoAccounts={demoAccounts.map((s) => ({
            email: s.email,
            name: s.name,
            title: s.title,
            password: s.demoPassword ?? "",
          }))}
          signInAction={signInAction}
          registerAction={registerAction}
          resetRequestAction={resetRequestAction}
          resetCompleteAction={resetCompleteAction}
        />
      </div>
    </div>
  );
}
