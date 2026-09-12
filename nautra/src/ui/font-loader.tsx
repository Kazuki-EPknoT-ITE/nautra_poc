"use client";

import { useEffect } from "react";

/** 和文フォントの取得を始めるまでの待ち（ms）。最初の1〜2回の遷移を邪魔しない長さ */
const DELAY_MS = 1200;
const HREF = "/fonts/noto-sans-jp/index.css";

/**
 * 和文フォント（Noto Sans JP）を**画面が落ち着いてから**読み込む。
 *
 * 和文は `unicode-range` で 124 個に分割されていて、1画面ぶんの漢字を出すだけで
 * 40 前後のファイルを取りにいく。これを最初から走らせると、HTTP/1.1 の同時接続数
 * （6本）を font が埋めてしまい、**次の画面の取得が待たされる**——実測で最初の遷移が
 * 2.7秒かかっていたのがこれ。
 *
 * 待ってから読むと、その間は端末の和文書体で表示される（`font-display: swap`）。
 * 読めない時間は生まれず、書体が差し替わるだけ。**外部へは通信しない**
 * （実体は `public/fonts/` に同梱。要件定義書 10.1 オフラインファースト）。
 *
 * 一度読み込めば woff2 はブラウザのキャッシュに残るので、2回目からは待ちもない。
 */
export function FontLoader() {
  useEffect(() => {
    if (document.querySelector(`link[href="${HREF}"]`)) return;

    const load = () => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = HREF;
      document.head.appendChild(link);
    };

    // 画面の表示と最初の操作が終わるのを待つ。`requestIdleCallback` が無い環境でも動く
    let idle: number | undefined;
    const timer = window.setTimeout(() => {
      const ric = window.requestIdleCallback;
      if (ric) idle = ric(load, { timeout: 2000 });
      else load();
    }, DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
    };
  }, []);

  return null;
}
