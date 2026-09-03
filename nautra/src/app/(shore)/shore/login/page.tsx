import { redirect } from "next/navigation";
import { t } from "@/i18n/ja";
import { PRODUCT_NAME } from "@/i18n/ja";
import { SHORE_ROLE_PERMISSIONS } from "@/domain/authz/shore-roles";
import { SHORE_STAFF_ACCOUNTS, getShoreSession, setShoreSession } from "@/server/shore-session";
import { writeAuditLog } from "@/server/master-service";
import { Button } from "@/ui";

export const dynamic = "force-dynamic";

/**
 * 陸上アプリのサインイン（要件定義書 10.3）。
 * 担当者を選ぶとロールが決まり、そのロールが持つ権限の画面だけがメニューに出る。
 * サインイン・サインアウトは監査ログに残る（12.6）。
 */
export default async function ShoreLoginPage() {
  const current = await getShoreSession();

  async function signInAction(formData: FormData) {
    "use server";
    const staffId = String(formData.get("staffId") ?? "");
    const staff = SHORE_STAFF_ACCOUNTS.find((s) => s.id === staffId);
    if (!staff) return;
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-balance text-2xl font-bold">{PRODUCT_NAME} 陸上アプリ サインイン</h1>
        <p className="mt-1 text-sm text-foreground-600">
          担当者を選んでください。役職によって使える機能が変わります（要配慮個人情報の閲覧は
          労務管理責任者・管理者に限られます）。
        </p>
      </div>

      {current ? (
        <p className="glass-inset p-3 text-sm">
          いま <span className="font-semibold">{current.name}</span>（{t.shoreRole[current.role]}）
          でサインインしています。別の担当者に切り替える場合は下から選んでください。
        </p>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {SHORE_STAFF_ACCOUNTS.map((s) => (
          <li key={s.id} className="glass-tile flex flex-col gap-3 p-4">
            <div>
              <p className="text-lg font-bold">{s.name}</p>
              <p className="text-sm text-foreground-600">{s.title}</p>
            </div>
            <p className="text-xs text-foreground-500">
              使える機能: {SHORE_ROLE_PERMISSIONS[s.role].length} 件
            </p>
            <form action={signInAction}>
              <input type="hidden" name="staffId" value={s.id} />
              <Button type="submit" color="primary" className="w-full" size="lg">
                この担当者で入る
              </Button>
            </form>
          </li>
        ))}
      </ul>

      <p className="text-xs text-foreground-500">
        PoC の簡略化: 担当者を選ぶだけのサインインです。本番は Supabase Auth（管理者ロールは MFA）と
        RLS によるテナント・行レベルの制御を併用します。権限判定の経路（
        <code>domain/authz/shore-roles.ts</code>）は本番と同じです。
      </p>
    </div>
  );
}
