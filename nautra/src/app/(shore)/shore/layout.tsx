import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { canShore, type ShorePermission } from "@/domain/authz/shore-roles";
import { PRODUCT_NAME, t } from "@/i18n/ja";
import { clearShoreSession, getShoreSession } from "@/server/shore-session";
import { writeAuditLog } from "@/server/master-service";
import { AppShell, Button } from "@/ui";
import { NavLink } from "./_components/nav-link";

/**
 * 陸上の画面（括弧内は基本設計書 6.2 の画面ID）。
 * `permission` はそのロールが権限を持つときだけメニューに出す（10.3）。
 * 権限判定は `domain/authz/shore-roles.ts` の表が唯一の情報源で、ここはその結果を使うだけ。
 *
 * **意味のまとまりで区切る**。18項目を一列に並べると探す作業になるため、
 * 「人」「手続き」「船」「事務」「設定」の5群にした（群の見出しは操作できない小見出し）。
 */
const NAV_GROUPS: {
  title: string;
  links: { href: string; label: string; permission?: ShorePermission }[];
}[] = [
  {
    title: "全体",
    links: [
      { href: "/shore", label: "ダッシュボード", permission: "view_dashboard" },
      { href: "/shore/labor", label: "労務・記録簿", permission: "view_dashboard" },
    ],
  },
  {
    title: "人",
    links: [
      { href: "/shore/crew", label: "船員", permission: "view_crew" },
      { href: "/shore/manning", label: "配乗計画", permission: "manage_manning" },
      { href: "/shore/shifts", label: "シフト・配置表", permission: "manage_manning" },
      { href: "/shore/training", label: "訓練", permission: "manage_training" },
      { href: "/shore/evaluations", label: "人事考課", permission: "view_evaluation" },
      { href: "/shore/wellbeing", label: "健康・相談", permission: "view_wellbeing" },
    ],
  },
  {
    title: "手続き",
    links: [
      { href: "/shore/filings", label: "届出", permission: "manage_filing" },
      { href: "/shore/procedures", label: "手続き・期限", permission: "manage_procedures" },
      { href: "/shore/documents", label: "帳票", permission: "manage_documents" },
    ],
  },
  {
    title: "船",
    links: [
      { href: "/shore/fleet", label: "船舶・保守", permission: "manage_fleet" },
      { href: "/shore/dispatch", label: "配船・位置", permission: "manage_dispatch" },
      { href: "/shore/safety", label: "安全・事故", permission: "view_dashboard" },
    ],
  },
  {
    title: "事務・設定",
    links: [
      { href: "/shore/office", label: "傭船・経理", permission: "manage_office" },
      { href: "/shore/templates", label: "記録項目の配信", permission: "view_dashboard" },
      { href: "/shore/notices", label: "お知らせ・速報", permission: "view_dashboard" },
      { href: "/shore/settings", label: "設定・権限", permission: "manage_settings" },
    ],
  },
];

/**
 * (shore) ルートグループのレイアウト（陸上テーマ: 情報密度優先）。
 * 陸上画面は Server Components を活用する（基本設計書 2.3）。
 *
 * ナビゲーションは **左のサイドバー**（DESIGN.md「Sidebar Surface」）。
 * Canvas から一段明るい面（#fafafa）に置くことで、区切り線を引かずに別の層として読ませる。
 * 画面が18本あるため、横一列だと折り返して探しにくくなるのを避ける狙いもある。
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

  const groups = staff
    ? NAV_GROUPS.map((g) => ({
        ...g,
        links: g.links.filter((l) => !l.permission || canShore(staff.role, l.permission)),
      })).filter((g) => g.links.length > 0)
    : [];

  return (
    <AppShell theme="shore">
      <div className="flex min-h-dvh">
        {groups.length > 0 ? (
          <aside
            aria-label="陸上メニュー"
            className="ui-sidebar sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto px-3 py-4 lg:flex"
          >
            <Link href="/" className="mb-4 flex items-baseline gap-2 px-3">
              <span className="text-lg font-semibold">{PRODUCT_NAME}</span>
              <span className="text-xs uppercase text-foreground-500">陸上</span>
            </Link>
            <nav className="flex flex-1 flex-col gap-4">
              {groups.map((g) => (
                <div key={g.title} className="flex flex-col gap-0.5">
                  <p className="px-3 pb-1 text-xs uppercase text-foreground-500">{g.title}</p>
                  {g.links.map((l) => (
                    <NavLink key={l.href} href={l.href} label={l.label} />
                  ))}
                </div>
              ))}
            </nav>
            <Link
              href="/vessel"
              className="mt-4 rounded-medium px-3 py-2 text-sm text-foreground-500 hover:bg-default-200"
            >
              船内アプリへ →
            </Link>
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="ui-bar sticky top-0 z-30 px-6 py-3">
            <div className="flex items-center justify-between gap-4">
              {/* 狭い画面ではサイドバーを畳むため、ここに製品名を出す */}
              <Link href="/" className="flex items-baseline gap-2 lg:hidden">
                <span className="text-lg font-semibold">{PRODUCT_NAME}</span>
                <span className="text-xs uppercase text-foreground-500">陸上</span>
              </Link>
              <div className="hidden lg:block" />
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
                  <Link
                    href="/shore/login"
                    className="text-foreground underline-offset-2 hover:underline"
                  >
                    サインイン
                  </Link>
                )}
              </div>
            </div>
            {/* 狭い画面ではサイドバーの代わりに横並びのメニューを出す */}
            {groups.length > 0 ? (
              <nav
                aria-label="陸上メニュー（狭い画面）"
                className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm lg:hidden"
              >
                {groups.flatMap((g) => g.links).map((l) => (
                  <Link key={l.href} href={l.href} className="text-foreground-700 hover:underline">
                    {l.label}
                  </Link>
                ))}
              </nav>
            ) : null}
          </header>
          <main className="mx-auto w-full max-w-page px-6 py-8">{children}</main>
        </div>
      </div>
    </AppShell>
  );
}
