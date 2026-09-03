/*
 * Service Worker（要件定義書 10.1 オフラインファースト / 10.4 可用性・保守）。
 *
 * 目的:
 * - **アプリ本体（シェル）を通信断でも起動できるようにする**。
 *   打刻・記録のデータは IndexedDB に持っているが、画面を読み込む HTML/JS が
 *   取れないと船内で何もできない。ここがオフラインファーストの最後の穴だった。
 * - 10.4「アプリ更新は事業者側の作業なしで自動配信されること」に対応するため、
 *   新しい版を見つけたら **skipWaiting + clients.claim** で即座に入れ替える。
 *
 * 方針（意図的にライブラリを使わない）:
 * - Workbox/Serwist を入れず、素の Service Worker で書く。
 *   船内端末は低速回線のことがあり、配信物は小さいほどよい。
 *   キャッシュ戦略も「シェルは cache-first / API は network-first」の2つだけで足りる。
 * - **同期 API（/api/v1/sync/*）は絶対にキャッシュしない**。
 *   古い Pull 応答を返すと、端末のレプリカが巻き戻り、カーソル方式の同期が壊れる。
 * - POST（Push）は素通しする。オフライン時の再送は端末の outbox が担っており、
 *   Service Worker 側で二重に再送すると冪等キーはあっても順序が乱れる。
 */

const VERSION = "nautra-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const PAGE_CACHE = `${VERSION}-pages`;

/** 起動に最低限必要なもの。画面ごとの JS は実際の遷移時に貯める */
const PRECACHE_URLS = ["/", "/vessel", "/vessel/login", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // 1つでも失敗すると install ごと失敗するため、個別に握りつぶす
      await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
      // 新しい版を待たせない（10.4 自動配信）
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** 同期経路は素通し（キャッシュすると同期カーソルが壊れる） */
function isSyncRequest(url) {
  return url.pathname.startsWith("/api/v1/sync/");
}

/** ビルド成果物（内容ハッシュ付き）は不変なので cache-first でよい */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // Push（POST）は素通し
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isSyncRequest(url)) return; // SSE・Pull・Push には触らない

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    // 画面遷移: つながっていれば最新を取り、駄目なら貯めてあるものを返す
    event.respondWith(networkFirstPage(request));
    return;
  }

  event.respondWith(cacheFirst(request, PAGE_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    // 取れないものは 504 を返す（画面側でオフライン表示に落ちる）
    return new Response("offline", { status: 504, statusText: "offline" });
  }
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match(request)) ?? (await caches.match("/vessel"));
    if (hit) return hit;
    return new Response(
      "<!doctype html><meta charset=utf-8><body style=\"font-family:system-ui;padding:2rem\">" +
        "<h1>オフラインです</h1><p>この画面はまだ端末に保存されていません。" +
        "一度つながったときに開いた画面は、通信が切れても開けます。</p>",
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}
