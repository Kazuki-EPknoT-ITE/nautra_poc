"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { PRODUCT_NAME } from "@/i18n/ja";
import { DEMO_VESSEL } from "@/lib/crew";
import { useSyncBadge } from "@/lib/vessel-hooks";
import { ensureInitialSync, isOfflineSim, syncNow } from "@/lib/vessel-sync";
import {
  AppShell,
  Button,
  Chip,
  ClientOnly,
  Navbar,
  NavbarBrand,
  NavbarContent,
} from "@/ui";

function SyncHeaderBadges() {
  const { pendingCount, offlineSim } = useSyncBadge();
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Chip size="sm" variant="flat" color={offlineSim ? "warning" : "success"} radius="sm">
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
    <AppShell theme="vessel" className="text-lg">
      <Navbar
        isBlurred={false}
        isBordered={false}
        maxWidth="full"
        height="4.25rem"
        className="glass-bar"
        classNames={{ wrapper: "mx-auto max-w-3xl px-4 gap-3" }}
      >
        <NavbarBrand className="min-w-0 gap-3">
          {isMenu ? null : (
            <Button
              as={Link}
              href="/vessel"
              variant="bordered"
              radius="md"
              className="min-h-11 shrink-0 border-[var(--glass-border-strong)] px-3 text-base font-semibold text-foreground"
              startContent={<span aria-hidden="true">←</span>}
            >
              メニュー
            </Button>
          )}
          <Link href={isMenu ? "/" : "/vessel"} className="flex min-w-0 items-baseline gap-2">
            <span className="text-xl font-bold">{PRODUCT_NAME}</span>
            {/* 船名は幅に余裕があるときだけ表示（狭い画面ではメニューボタンと同期状態を優先） */}
            <span className="hidden truncate text-sm text-foreground-400 sm:inline">
              船内 | {DEMO_VESSEL.name}
            </span>
          </Link>
        </NavbarBrand>
        <NavbarContent justify="end" className="!grow-0 basis-auto">
          <ClientOnly>
            <SyncHeaderBadges />
          </ClientOnly>
        </NavbarContent>
      </Navbar>
      <main className="mx-auto max-w-3xl px-4 pb-12 pt-5">
        <ClientOnly>{children}</ClientOnly>
      </main>
    </AppShell>
  );
}
