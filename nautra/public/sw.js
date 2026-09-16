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
 * **つながっているときは必ず最新を返す**（ここを誤ると、直した画面がいつまでも出ない）:
 * - 版は登録時の `?v=<ビルドID>` から取る。ビルドするたびに URL が変わるので
 *   ブラウザが新しい Service Worker として入れ直し、**古い版のキャッシュを捨てる**。
 *   以前は版を `"nautra-v1"` の固定値にしていたため、何度ビルドし直しても
 *   古いキャッシュが残り続けた。
 * - キャッシュから先に返してよいのは **内容ハッシュ付きのビルド成果物だけ**
 *   （`/_next/static/`。中身が変われば名前も変わるので古いものを返しようがない）。
 *   画面・画面内遷移のデータ（RSC）・その他はすべて **network-first** で、
 *   取れなかったとき（通信断）にだけ保存しておいたものを返す。
 *   以前は画面内遷移のデータを cache-first にしており、一度開いた画面は
 *   **二度とサーバに聞きに行かなかった**。
 *
 * 方針（意図的にライブラリを使わない）:
 * - Workbox/Serwist を入れず、素の Service Worker で書く（船内端末は低速回線のことがあり、
 *   配信物は小さいほどよい）。
 * - **同期 API（/api/v1/sync/*）は絶対にキャッシュしない**。
 *   古い Pull 応答を返すと、端末のレプリカが巻き戻り、カーソル方式の同期が壊れる。
 * - POST（Push）は素通しする。オフライン時の再送は端末の outbox が担っており、
 *   Service Worker 側で二重に再送すると冪等キーはあっても順序が乱れる。
 */

const BUILD = new URL(self.location.href).searchParams.get("v") || "dev";
const VERSION = `nautra-${BUILD}`;
const SHELL_CACHE = `${VERSION}-shell`;
const PAGE_CACHE = `${VERSION}-pages`;

/** 通信断でも起動に最低限必要なもの。画面ごとの JS は実際の遷移時に貯める */
const PRECACHE_URLS = ["/", "/vessel", "/vessel/login", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGE_CACHE);
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
      // この版以外のキャッシュはすべて捨てる（古い画面を返さないため）
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(`${VERSION}-`)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

/** 同期経路は素通し（キャッシュすると同期カーソルが壊れる） */
function isSyncRequest(url) {
  return url.pathname.startsWith("/api/v1/sync/");
}

/**
 * 内容ハッシュ付きのビルド成果物だけは不変なので cache-first でよい。
 *
 * **名前にハッシュが入っていることを確かめる**のが要点。開発サーバの JS は
 * `/_next/static/chunks/app/layout.js` のように**毎回同じ名前**で、中身だけが変わる。
 * それを「不変」と見なしてキャッシュから返すと、**直したのに古い画面が出続ける**
 * （実際に、何日も前の画面が返り続ける事故が起きた）。
 */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/") && /[0-9a-f]{8,}/.test(url.pathname);
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

  // 画面・画面内遷移のデータ（RSC）・その他: つながっていれば必ず最新を取る
  event.respondWith(networkFirst(request, request.mode === "navigate"));
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

async function networkFirst(request, isNavigation) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(request);
    if (hit) return hit;
    if (!isNavigation) {
      return new Response("offline", { status: 504, statusText: "offline" });
    }
    const home = await cache.match("/vessel");
    if (home) return home;
    return new Response(
      "<!doctype html><meta charset=utf-8><body style=\"font-family:system-ui;padding:2rem\">" +
        "<h1>オフラインです</h1><p>この画面はまだ端末に保存されていません。" +
        "一度つながったときに開いた画面は、通信が切れても開けます。</p>",
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}
