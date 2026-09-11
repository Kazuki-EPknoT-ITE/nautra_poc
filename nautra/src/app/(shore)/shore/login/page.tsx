import { redirect } from "next/navigation";
import { PRODUCT_NAME, t } from "@/i18n/ja";
import { DEMO_COMPANY } from "@/lib/crew";
import { currentLaborRuleSet } from "@/server/labor-rules";
import { listCrewMasters, listVessels, writeAuditLog } from "@/server/master-service";
import {
  authenticateShore,
  getShoreSession,
  setShoreSession,
  SHORE_STAFF_ACCOUNTS,
} from "@/server/shore-session";
import { SignInPanel } from "./_components/sign-in-panel";

export const dynamic = "force-dynamic";

/**
 * 陸上アプリのサインイン（要件定義書 10.3 / デザイン正本 `design/poc_design`）。
 *
 * 暗い面（`#231F20`）に1枚だけ白いカードを置き、**サインイン / 新規登録 / パスワード再設定**を
 * 同じカードの中でタブとして切り替える。ロールはアカウントに紐づくもので、利用者が
 * 選ぶものではない（担当者を選ぶ方式をやめた）。サインインは監査ログに残る（12.6）。
 */
export default async function ShoreLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string; sent?: string; email?: string }>;
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
   * 招待コードでの登録。PoC は既存の招待済みアカウントを有効化した体で扱い、
   * そのままサインインさせる（本番は Supabase Auth のサインアップに置き換える）。
   */
  async function registerAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const staff = SHORE_STAFF_ACCOUNTS.find((s) => s.email.toLowerCase() === email);
    if (!staff) {
      redirect(`/shore/login?tab=register&error=unknown_invite`);
    }
    await setShoreSession(staff.id);
    writeAuditLog({
      action: "sign_in",
      entityKind: "shore_session",
      entityId: staff.id,
      actor: staff.id,
      summary: `${staff.name} が招待から登録して陸上アプリにサインイン`,
    });
    redirect("/shore");
  }

  /** 再設定リンクの送信。PoC は送信した体で戻すだけ（メール送信経路は未接続） */
  async function resetAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    redirect(`/shore/login?sent=1&email=${encodeURIComponent(email)}`);
  }

  const fleetCount = listVessels().length;
  const crewCount = listCrewMasters().length;
  const ruleVersion = currentLaborRuleSet().version;

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
          sent={sp.sent === "1"}
          email={sp.email ?? SHORE_STAFF_ACCOUNTS[0]!.email}
          demoAccounts={SHORE_STAFF_ACCOUNTS.filter((s) => !s.invitePending).map((s) => ({
            email: s.email,
            name: s.name,
            title: s.title,
            password: s.demoPassword,
          }))}
          signInAction={signInAction}
          registerAction={registerAction}
          resetAction={resetAction}
        />
      </div>
    </div>
  );
}
