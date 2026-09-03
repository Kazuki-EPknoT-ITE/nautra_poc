"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { PRODUCT_NAME, t } from "@/i18n/ja";
import { DEMO_VESSEL } from "@/lib/crew";
import { useRoutePrefetch } from "@/lib/use-route-prefetch";
import { useSessionCrew, useSyncBadge } from "@/lib/vessel-hooks";
import { signOut, signOutIfIdle, touchSession } from "@/lib/vessel-session";
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
import { LocaleSwitch } from "./_components/locale-switch";

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
      <Chip size="sm" variant="bordered" radius="sm" className="border-[var(--ui-hairline-strong)]">
        {session.name}（{t.role[session.role]}）
      </Chip>
      <Button
        size="sm"
        variant="bordered"
        radius="md"
        className="min-h-10 border-[var(--ui-hairline-strong)] text-foreground"
        onPress={() => void signOut()}
      >
        サインアウト
      </Button>
    </div>
  );
}

/**
 * 放置による自動サインアウト（レビュー書の懸念事項「毎度ログアウトしないと別のユーザーに
 * 情報が見られてしまう」への対応）。
 *
 * - 操作があったら最終操作時刻を記録し、離れている間に閾値を超えたらサインアウトする
 * - 判定は**時刻の比較**で行う。タブが背面だと `setInterval` は間引かれるため、
 *   経過時間をカウンタで数えると当てにならない（復帰時に一度で判定する）
 * - 記録・未送信の打刻は消さない（サインアウトしても IndexedDB に残る）
 */
function useIdleSignOut(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    const check = () => {
      void signOutIfIdle().then((signedOut) => {
        if (signedOut && alive && typeof window !== "undefined") {
          // 理由を伝えるため、サインイン画面に印をつけて戻す
          window.location.replace("/vessel/login?reason=idle");
        }
      });
    };
    const touch = () => void touchSession();

    // 実際に人が触った合図だけを拾う（描画や同期では延命しない）
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
    for (const ev of events) window.addEventListener(ev, touch, { passive: true });
    // 画面に戻ってきたときに、離れていた間の経過をまとめて判定する
    document.addEventListener("visibilitychange", check);

    touch();
    const timer = setInterval(check, 60_000);
    return () => {
      alive = false;
      for (const ev of events) window.removeEventListener(ev, touch);
      document.removeEventListener("visibilitychange", check);
      clearInterval(timer);
    };
  }, [enabled]);
}

/** 未サインインならサインイン画面へ誘導する（記録の作成者を必ず特定するため） */
function SessionGate({ isLogin, children }: { isLogin: boolean; children: ReactNode }) {
  const session = useSessionCrew();
  const router = useRouter();

  useIdleSignOut(Boolean(session) && !isLogin);

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
        className="ui-bar"
        classNames={{ wrapper: "mx-auto max-w-5xl px-4 gap-3" }}
      >
        <NavbarBrand className="min-w-0 gap-3">
          {isMenu || isLogin ? null : (
            <Button
              as={Link}
              href="/vessel"
              variant="bordered"
              radius="md"
              className="min-h-11 shrink-0 border-[var(--ui-hairline-strong)] px-3 text-base font-semibold text-foreground"
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
            {/* 言語はサインイン前から切り替えられる（端末に保存。10.2） */}
            <LocaleSwitch />
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
