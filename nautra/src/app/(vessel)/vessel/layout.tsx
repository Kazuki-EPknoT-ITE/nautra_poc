"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { PRODUCT_NAME } from "@/i18n/ja";
import { cn } from "@/lib/cn";
import { DEMO_VESSEL } from "@/lib/crew";
import { useShiftPlans, useSyncBadge } from "@/lib/vessel-hooks";
import { ensureInitialSync, isOfflineSim, syncNow } from "@/lib/vessel-sync";
import { Chip, ClientOnly } from "@/ui";
import { groupForPath } from "./_components/group-header";

/** 下部ナビ = 機能メニュー（01〜06）と同じ並び。どの画面からも各機能へ1タップ */
const NAV_ITEMS: { href: string; no: string; label: string; group: string | null }[] = [
  { href: "/vessel", no: "", label: "ホーム", group: null },
  { href: "/vessel/punch", no: "01", label: "打刻", group: "01" },
  { href: "/vessel/ledger", no: "02", label: "記録簿", group: "02" },
  { href: "/vessel/logbook", no: "03", label: "日誌・点検", group: "03" },
  { href: "/vessel/shift", no: "04", label: "シフト", group: "04" },
  { href: "/vessel/work", no: "05", label: "作業記録", group: "05" },
  { href: "/vessel/sync", no: "06", label: "同期", group: "06" },
];

function SyncHeaderBadges() {
  const { pendingCount, offlineSim } = useSyncBadge();
  return (
    <div className="flex items-center gap-2">
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

function BottomNav({ pathname }: { pathname: string }) {
  const { unread } = useShiftPlans();
  const activeGroup = groupForPath(pathname);
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-7">
      {NAV_ITEMS.map((item) => {
        const active = item.group ? activeGroup === item.group : pathname === item.href;
        const badge = item.group === "04" ? unread.length : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-16 flex-col items-center justify-center gap-0.5 px-1",
              active ? "text-primary" : "text-foreground-500",
            )}
          >
            {item.no ? (
              <span className="tabular-nums text-[11px] font-bold leading-none opacity-80">{item.no}</span>
            ) : (
              <span aria-hidden="true" className="text-[11px] leading-none">
                ⌂
              </span>
            )}
            <span className="text-xs font-semibold leading-tight sm:text-sm">{item.label}</span>
            {badge > 0 ? (
              <span
                aria-label={`シフト変更通知 ${badge}件`}
                className="absolute right-1 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white"
              >
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * (vessel) ルートグループのレイアウト（船内テーマ: 大文字・高コントラスト）。
 * 船内画面は Client Component + IndexedDB で完結し、SSR データ取得に依存しない
 * （ガードレール①）。定期同期（PoC: 60秒。既定運用は15分）を行う。
 */
export default function VesselLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

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
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-xl font-bold">{PRODUCT_NAME}</span>
            <span className="text-sm text-foreground-500">船内 | {DEMO_VESSEL.name}</span>
          </Link>
          <ClientOnly>
            <SyncHeaderBadges />
          </ClientOnly>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-4">
        <ClientOnly>{children}</ClientOnly>
      </main>
      <nav
        aria-label="船内メニュー"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-content3 bg-content1 pb-[env(safe-area-inset-bottom)]"
      >
        <ClientOnly>
          <BottomNav pathname={pathname} />
        </ClientOnly>
      </nav>
    </div>
  );
}
