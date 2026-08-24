"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { PRODUCT_NAME } from "@/i18n/ja";
import { DEMO_VESSEL } from "@/lib/crew";
import { useSyncBadge } from "@/lib/vessel-hooks";
import { ensureInitialSync, isOfflineSim, syncNow } from "@/lib/vessel-sync";
import { Chip, ClientOnly } from "@/ui";

function SyncHeaderBadges() {
  const { pendingCount, offlineSim } = useSyncBadge();
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Chip
        size="sm"
        variant="flat"
        color={offlineSim ? "warning" : "success"}
        radius="sm"
      >
        {offlineSim ? "⚡ オフライン" : "● オンライン"}
      </Chip>
      <Chip
        size="sm"
        variant="flat"
        color={pendingCount > 0 ? "warning" : "default"}
        radius="sm"
        className="tabular-nums"
      >
        未同期 {pendingCount}件
      </Chip>
    </div>
  );
}

/**
 * (vessel) ルートグループのレイアウト（船内テーマ: 大文字・高コントラスト）。
 * 船内画面は Client Component + IndexedDB で完結し、SSR データ取得に依存しない
 * （ガードレール①）。定期同期（PoC: 60秒。既定運用は15分）を行う。
 *
 * 画面遷移は「機能メニュー（/vessel）を起点に各機能へ入り、ヘッダのメニューボタンで戻る」
 * 方式とし、常時表示の下部ナビは持たない（作業画面の表示領域を優先。基本設計書 6.3）。
 */
export default function VesselLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMenu = pathname === "/vessel";

  useEffect(() => {
    void ensureInitialSync();
    const timer = setInterval(async () => {
      if (!(await isOfflineSim())) void syncNow();
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="vessel bg-background text-foreground min-h-dvh text-lg">
      <header className="sticky top-0 z-30 border-b border-content3 bg-background/95 px-4 py-3 backdrop-blur-none">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {isMenu ? null : (
              <Link
                href="/vessel"
                className="flex min-h-11 shrink-0 items-center rounded-medium border border-foreground-300 px-3 text-base font-semibold"
              >
                <span aria-hidden="true" className="mr-1">
                  ←
                </span>
                メニュー
              </Link>
            )}
            <Link href={isMenu ? "/" : "/vessel"} className="flex min-w-0 items-baseline gap-2">
              <span className="text-xl font-bold">{PRODUCT_NAME}</span>
              {/* 船名は幅に余裕があるときだけ表示（狭い画面ではメニューボタンと同期状態を優先） */}
              <span className="hidden truncate text-sm text-foreground-500 sm:inline">
                船内 | {DEMO_VESSEL.name}
              </span>
            </Link>
          </div>
          <ClientOnly>
            <SyncHeaderBadges />
          </ClientOnly>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-12 pt-4">
        <ClientOnly>{children}</ClientOnly>
      </main>
    </div>
  );
}
