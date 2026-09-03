import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { canShore, type ShorePermission } from "@/domain/authz/shore-roles";
import { PRODUCT_NAME, t } from "@/i18n/ja";
import { clearShoreSession, getShoreSession } from "@/server/shore-session";
import { writeAuditLog } from "@/server/master-service";
import { AppShell, Button } from "@/ui";

/**
 * 陸上の画面（括弧内は基本設計書 6.2 の画面ID）。
 * `permission` はそのロールが権限を持つときだけメニューに出す（10.3）。
 * 権限判定は `domain/authz/shore-roles.ts` の表が唯一の情報源で、ここはその結果を使うだけ。
 */
const NAV_LINKS: { href: string; label: string; permission?: ShorePermission }[] = [
  { href: "/shore", label: "ダッシュボード", permission: "view_dashboard" },
  { href: "/shore/labor", label: "労務・記録簿", permission: "view_dashboard" },
  { href: "/shore/crew", label: "船員", permission: "view_crew" },
  { href: "/shore/manning", label: "配乗計画", permission: "manage_manning" },
  { href: "/shore/filings", label: "届出", permission: "manage_filing" },
  { href: "/shore/procedures", label: "手続き・期限", permission: "manage_procedures" },
  { href: "/shore/training", label: "訓練", permission: "manage_training" },
  { href: "/shore/shifts", label: "シフト・配置表", permission: "manage_manning" },
  { href: "/shore/fleet", label: "船舶・保守", permission: "manage_fleet" },
  { href: "/shore/dispatch", label: "配船・位置", permission: "manage_dispatch" },
  { href: "/shore/safety", label: "安全・事故", permission: "view_dashboard" },
  { href: "/shore/wellbeing", label: "健康・相談", permission: "view_wellbeing" },
  { href: "/shore/evaluations", label: "人事考課", permission: "view_evaluation" },
  { href: "/shore/office", label: "傭船・経理", permission: "manage_office" },
  { href: "/shore/documents", label: "帳票", permission: "manage_documents" },
  { href: "/shore/templates", label: "記録項目の配信", permission: "view_dashboard" },
  { href: "/shore/notices", label: "お知らせ・速報", permission: "view_dashboard" },
  { href: "/shore/settings", label: "設定・権限", permission: "manage_settings" },
];

/**
 * (shore) ルートグループのレイアウト（陸上テーマ: 情報密度優先）。
 * 陸上画面は Server Components を活用する（基本設計書 2.3）。
 * ヘッダは船内と同じリキッドガラスのバー（材質は globals.css に集約）。
 */
export default async function ShoreLayout({ children }: { children: ReactNode }) {
  const staff = await getShoreSession();

  async function signOutAction() {
    "use server";
    const s = await getShoreSession();
    if (s) {
      writeAuditLog({
        action: "sign_out",
        entityKind: "shore_session",
        entityId: s.id,
        actor: s.id,
        summary: `${s.name} が陸上アプリからサインアウト`,
      });
    }
    await clearShoreSession();
    redirect("/shore/login");
  }

  const links = staff
    ? NAV_LINKS.filter((l) => !l.permission || canShore(staff.role, l.permission))
    : [];

  return (
    <AppShell theme="shore">
      <header className="glass-bar sticky top-0 z-30 px-6 py-3">
        <div className="mx-auto flex max-w-6xl flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-bold">{PRODUCT_NAME}</span>
              <span className="text-sm text-foreground-500">陸上</span>
            </Link>
            <div className="flex items-center gap-3 text-sm">
              {staff ? (
                <>
                  <span className="text-foreground-600">
                    {staff.name}
                    <span className="ml-1 text-foreground-500">（{t.shoreRole[staff.role]}）</span>
                  </span>
                  <form action={signOutAction}>
                    <Button type="submit" size="sm" variant="bordered">
                      サインアウト
                    </Button>
                  </form>
                </>
              ) : (
                <Link href="/shore/login" className="text-primary underline-offset-2 hover:underline">
                  サインイン
                </Link>
              )}
              <Link href="/vessel" className="text-foreground-500 underline-offset-2 hover:underline">
                船内アプリへ
              </Link>
            </div>
          </div>
          {links.length > 0 ? (
            <nav
              aria-label="陸上メニュー"
              className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
            >
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </AppShell>
  );
}
