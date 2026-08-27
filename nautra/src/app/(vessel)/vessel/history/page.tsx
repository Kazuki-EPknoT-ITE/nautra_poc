"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * 打刻履歴は 01 打刻画面（/vessel/punch）に統合した。
 * 既存のリンク・ブックマークのために本ルートは残し、打刻画面へ転送する。
 */
export default function HistoryRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/vessel/punch");
  }, [router]);
  return <p className="text-foreground-600">打刻画面へ移動します…</p>;
}
