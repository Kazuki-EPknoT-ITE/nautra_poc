"use client";

import { useEffect } from "react";

/**
 * Service Worker の登録（要件定義書 10.1 オフラインファースト / 10.4 自動配信）。
 *
 * - 登録は**画面の描画を邪魔しない**よう load 後に行う（船内端末は非力なことがある）
 * - 新しい版を見つけたら `sw.js` 側の skipWaiting で即座に入れ替わる。
 *   入れ替わったら次の遷移から新版になるため、利用者に更新作業を求めない
 * - 開発サーバでは登録しない（HMR とキャッシュが干渉して原因の切り分けが難しくなる）
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    const register = () => {
      if (cancelled) return;
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // 登録できなくてもアプリは動く（IndexedDB の記録は残る）。黙って諦める
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
