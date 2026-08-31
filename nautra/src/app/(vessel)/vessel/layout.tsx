"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { PRODUCT_NAME, t } from "@/i18n/ja";
import { DEMO_VESSEL } from "@/lib/crew";
import { useRoutePrefetch } from "@/lib/use-route-prefetch";
import { useSessionCrew, useSyncBadge } from "@/lib/vessel-hooks";
import { signOut } from "@/lib/vessel-session";
import { useLiveSync } from "@/lib/vessel-live";
import { ensureInitialSync, isOfflineSim, syncNow } from "@/lib/vessel-sync";
import {
  AppShell,
  Button,
  Chip,
  ClientOnly,
  Navbar,
  NavbarBrand,
  NavbarContent,
  Spinner,
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

/** サインイン中の船員とロール、サインアウト（共用端末のため常時表示する） */
function SessionChip() {
  const session = useSessionCrew();
  if (!session) return null;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Chip size="sm" variant="bordered" radius="sm" className="border-[var(--glass-border-strong)]">
        {session.name}（{t.role[session.role]}）
      </Chip>
      <Button
        size="sm"
        variant="bordered"
        radius="md"
        className="min-h-10 border-[var(--glass-border-strong)] text-foreground"
        onPress={() => void signOut()}
      >
        サインアウト
      </Button>
    </div>
  );
}

/** 未サインインならサインイン画面へ誘導する（記録の作成者を必ず特定するため） */
function SessionGate({ isLogin, children }: { isLogin: boolean; children: ReactNode }) {
  const session = useSessionCrew();
  const router = useRouter();

  useEffect(() => {
    if (session === null && !isLogin) router.replace("/vessel/login");
  }, [session, isLogin, router]);

  if (session === undefined) {
    return (
      <div className="flex min-h-40 items-center justify-center gap-3 text-foreground-600">
        <Spinner size="sm" /> 読み込み中…
      </div>
    );
  }
  if (session === null && !isLogin) {
    return <p className="text-foreground-600">サインイン画面へ移動します…</p>;
  }
  return <>{children}</>;
}

/**
 * (vessel) ルートグループのレイアウト（船内テーマ）。
 * 船内画面は Client Component + IndexedDB で完結し、SSR データ取得に依存しない
 * （ガードレール①）。定期同期（PoC: 60秒。既定運用は15分）を行う。
 *
 * サインイン必須（基本設計書 11.3）。未サインインは /vessel/login へ誘導し、
 * サインインしたロールに応じて各画面の表示・操作範囲が変わる（11.2）。
 * 画面遷移は「機能メニュー（/vessel）を起点に各機能へ入り、ヘッダのメニューボタンで戻る」方式。
 */
export default function VesselLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMenu = pathname === "/vessel";
  const isLogin = pathname === "/vessel/login";

  // 陸上の変更を待たずに反映する通知経路（届かない環境では下の定期同期で追いつく）
  useLiveSync();

  // どの画面からもメニューへ戻れるため、戻り先は常に先読みしておく
  useRoutePrefetch(isMenu ? [] : ["/vessel"]);

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
        classNames={{ wrapper: "mx-auto max-w-5xl px-4 gap-3" }}
      >
        <NavbarBrand className="min-w-0 gap-3">
          {isMenu || isLogin ? null : (
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
            {/* 船名は幅に余裕があるときだけ表示（狭い画面では操作と状態表示を優先） */}
            <span className="hidden truncate text-sm text-foreground-600 lg:inline">
              船内 | {DEMO_VESSEL.name}
            </span>
          </Link>
        </NavbarBrand>
        <NavbarContent justify="end" className="!grow-0 basis-auto gap-3">
          <ClientOnly>
            <SessionChip />
            <SyncHeaderBadges />
          </ClientOnly>
        </NavbarContent>
      </Navbar>
      <main className="mx-auto max-w-5xl px-4 pb-12 pt-5">
        <ClientOnly>
          <SessionGate isLogin={isLogin}>{children}</SessionGate>
        </ClientOnly>
      </main>
    </AppShell>
  );
}
