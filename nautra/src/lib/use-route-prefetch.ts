"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 次に開く可能性が高い画面を、いま見ている間に先読みしておく。
 *
 * 画面を押してから待たされるのは「押した後に用意を始める」ためで、
 * メニューを見ている数秒のうちに用意しておけば、押した瞬間に開ける。
 * 一度に走らせると回線・CPU を奪い合うため、少しずつずらして要求する。
 * 開発サーバでは先読みがそのまま画面のコンパイルを進めるので効果が大きい。
 */
export function useRoutePrefetch(hrefs: string[], staggerMs = 150): void {
  const router = useRouter();
  // 配列は毎回新しい参照になるため、中身で比較する
  const key = hrefs.join("|");

  useEffect(() => {
    const list = key ? key.split("|") : [];
    if (list.length === 0) return;
    let i = 0;
    const timer = setInterval(() => {
      if (i >= list.length) {
        clearInterval(timer);
        return;
      }
      router.prefetch(list[i]);
      i += 1;
    }, staggerMs);
    return () => clearInterval(timer);
  }, [key, staggerMs, router]);
}
