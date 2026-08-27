import Link from "next/link";
import type { ReactNode } from "react";
import { PRODUCT_NAME } from "@/i18n/ja";
import { AppShell } from "@/ui";

const NAV_LINKS = [
  { href: "/shore", label: "労務ダッシュボード（S-01）" },
  { href: "/shore/shifts", label: "シフト作成（S-10）" },
  { href: "/shore/templates", label: "記録項目の配信" },
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
          <nav aria-label="陸上メニュー" className="flex items-center gap-4 text-sm">
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
