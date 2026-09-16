"use client";

import { useEffect } from "react";

/** ビルドごとに変わる識別子（next.config.mjs の env で埋め込む） */
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

/**
 * Service Worker の登録（要件定義書 10.1 オフラインファースト / 10.4 自動配信）。
 *
 * - 登録は**画面の描画を邪魔しない**よう load 後に行う（船内端末は非力なことがある）
 * - **登録先の URL にビルドIDを付ける**（`/sw.js?v=<ビルドID>`）。ビルドし直すと URL が
 *   変わり、ブラウザが新しい Service Worker として入れ直して古いキャッシュを捨てる。
 *   付けていなかった頃は、何度ビルドしても**直した画面が出ず、古い画面が返り続けた**。
 * - **開発サーバでは登録しないうえ、既にある登録を外してキャッシュも消す**。
 *   Service Worker は一度入ると、あとから `npm run dev` に切り替えても同じ
 *   localhost:3100 を握り続け、古い画面を返す。登録しないだけでは足りない。
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((k) => k.startsWith("nautra-")).map((k) => caches.delete(k)));
        }
      })().catch(() => {
        // 外せなくても開発は続けられる。黙って諦める
      });
      return;
    }

    let cancelled = false;
    const register = () => {
      if (cancelled) return;
      navigator.serviceWorker
        .register(`/sw.js?v=${encodeURIComponent(BUILD_ID)}`, { scope: "/" })
        .catch(() => {
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
