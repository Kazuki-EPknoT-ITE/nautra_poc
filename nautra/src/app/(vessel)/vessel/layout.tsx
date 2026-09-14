"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { PRODUCT_NAME, t } from "@/i18n/ja";
import { cn } from "@/lib/cn";
import { DEMO_VESSEL } from "@/lib/crew";
import { useRoutePrefetch } from "@/lib/use-route-prefetch";
import { useSessionCrew, useSyncBadge } from "@/lib/vessel-hooks";
import { signOut, signOutIfIdle, touchSession } from "@/lib/vessel-session";
import { useLiveSync } from "@/lib/vessel-live";
import { ensureInitialSync, isOfflineSim, syncNow } from "@/lib/vessel-sync";
import { AppShell, AppSwitchLink, ClientOnly } from "@/ui";
import { Spinner } from "@/ui/heroui";
import { LocaleSwitch } from "./_components/locale-switch";
import { VesselTabs, VESSEL_TAB_HREFS } from "./_components/vessel-tabs";

/**
 * 接続状態と未送信件数（デザインのヘッダ右）。
 * 未送信が 0 のときは色を付けない。常に色が付いていると、溜まったときに気づけない。
 */
function SyncHeaderBadges() {
  const { pendingCount, offlineSim } = useSyncBadge();
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-small px-3 py-1.5 text-base font-semibold",
          offlineSim ? "bg-warning-100 text-warning-700" : "bg-default-100 text-foreground-700",
        )}
      >
        {offlineSim ? "⚡ オフライン" : "● オンライン"}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-small px-3 py-1.5 text-base tabular-nums",
          pendingCount > 0 ? "bg-warning-100 text-warning-700" : "bg-default-100 text-foreground-700",
        )}
      >
        未同期 {pendingCount}件
      </span>
    </div>
  );
}

/** サインイン中の船員とロール、サインアウト（共用端末のため常時表示する） */
function SessionChip() {
  const session = useSessionCrew();
  if (!session) return null;
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <span className="inline-flex items-center gap-2 rounded-small border border-[var(--ui-hairline-strong)] px-3 py-1.5 text-lg text-foreground-700">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[2px] border border-[var(--ui-hairline-strong)] bg-[#DFE1E0] text-base font-bold text-foreground-700">
          {session.name.slice(0, 1)}
        </span>
        {session.name} <span className="text-foreground-500">{t.role[session.role]}</span>
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        className="ui-btn-ghost min-h-11 border-[#333333] text-lg text-foreground-800"
      >
        サインアウト
      </button>
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
 *
 * 画面遷移はデザイン正本 `design/poc_design` に合わせ、**ヘッダ直下の横タブ**で行う
 * （メニュー画面を経由しない。打刻は起動直後の1タップで始められる）。
 */
export default function VesselLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/vessel/login";

  // 陸上の変更を待たずに反映する通知経路（届かない環境では下の定期同期で追いつく）
  useLiveSync();

  // タブはどこからでも押せるため、隣の画面をまとめて先読みしておく
  useRoutePrefetch(isLogin ? [] : VESSEL_TAB_HREFS.filter((h) => h !== pathname));

  useEffect(() => {
    void ensureInitialSync();
    const timer = setInterval(async () => {
      if (!(await isOfflineSim())) void syncNow();
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <AppShell theme="vessel" className="flex flex-col text-lg">
      <header className="ui-bar flex flex-none flex-wrap items-center justify-between gap-4 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/vessel" className="flex min-w-0 items-baseline gap-3">
            {/* デザイン実測: 製品名 19px / 船名 15px */}
            <span className="text-[19px] font-bold leading-tight text-foreground-900">{PRODUCT_NAME}</span>
            <span className="truncate text-base text-foreground-700">{DEMO_VESSEL.name}</span>
          </Link>
        </div>
        <div className="flex items-center gap-2.5">
          <ClientOnly>
            {/* 言語はサインイン前から切り替えられる（端末に保存。10.2） */}
            <LocaleSwitch />
            <SessionChip />
            <SyncHeaderBadges />
          </ClientOnly>
          {/* 陸上アプリへ（デザイン正本の goShore）。本番は別の機械なので端に置く */}
          <AppSwitchLink to="shore" />
        </div>
      </header>

      <ClientOnly>{isLogin ? null : <VesselTabs />}</ClientOnly>

      <main className="flex-1 px-5 pb-8 pt-[18px]">
        <ClientOnly>
          <SessionGate isLogin={isLogin}>{children}</SessionGate>
        </ClientOnly>
      </main>
    </AppShell>
  );
}
