import Link from "next/link";
import type { ReactNode } from "react";
import { PRODUCT_NAME } from "@/i18n/ja";

/**
 * (shore) ルートグループのレイアウト（陸上テーマ: 情報密度優先）。
 * 陸上画面は Server Components を活用する（基本設計書 2.3）。
 */
export default function ShoreLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shore bg-background text-foreground min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-default-200 bg-content1 px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-lg font-bold">{PRODUCT_NAME}</span>
            <span className="text-sm text-foreground-500">陸上 | 労務ダッシュボード</span>
          </Link>
          <Link href="/vessel" className="text-sm text-primary underline-offset-2 hover:underline">
            船内アプリへ
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </div>
  );
}
