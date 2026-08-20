"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { PRODUCT_NAME } from "@/i18n/ja";
import { cn } from "@/lib/cn";
import { DEMO_VESSEL } from "@/lib/crew";
import { useSyncBadge } from "@/lib/vessel-hooks";
import { ensureInitialSync, isOfflineSim, syncNow } from "@/lib/vessel-sync";
import { Chip, ClientOnly } from "@/ui";

const NAV_ITEMS = [
  { href: "/vessel", label: "ホーム" },
  { href: "/vessel/punch", label: "打刻" },
  { href: "/vessel/ledger", label: "記録簿" },
  { href: "/vessel/approve", label: "承認" },
  { href: "/vessel/sync", label: "同期" },
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
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 items-center justify-center text-base font-semibold",
                  active ? "text-primary" : "text-foreground-500",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
