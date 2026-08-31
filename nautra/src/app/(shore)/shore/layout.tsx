import Link from "next/link";
import type { ReactNode } from "react";
import { PRODUCT_NAME } from "@/i18n/ja";
import { AppShell } from "@/ui";

/** 陸上の画面（括弧内は基本設計書 6.2 の画面ID） */
const NAV_LINKS = [
  { href: "/shore", label: "ダッシュボード" },
  { href: "/shore/labor", label: "労務管理・記録簿" },
  { href: "/shore/crew", label: "船員" },
  { href: "/shore/shifts", label: "シフト・配置表" },
  { href: "/shore/fleet", label: "船舶・保守" },
  { href: "/shore/templates", label: "記録項目の配信" },
  { href: "/shore/notices", label: "お知らせ・速報" },
  { href: "/shore/settings", label: "設定・権限" },
];

/**
 * (shore) ルートグループのレイアウト（陸上テーマ: 情報密度優先）。
 * 陸上画面は Server Components を活用する（基本設計書 2.3）。
 * ヘッダは船内と同じリキッドガラスのバー（材質は globals.css に集約）。
 */
export default function ShoreLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell theme="shore">
      <header className="glass-bar sticky top-0 z-30 px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-lg font-bold">{PRODUCT_NAME}</span>
            <span className="text-sm text-foreground-500">陸上</span>
          </Link>
          <nav aria-label="陸上メニュー" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-primary underline-offset-2 hover:underline"
              >
                {l.label}
              </Link>
            ))}
            <Link href="/vessel" className="text-foreground-500 underline-offset-2 hover:underline">
              船内アプリへ
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </AppShell>
  );
}
