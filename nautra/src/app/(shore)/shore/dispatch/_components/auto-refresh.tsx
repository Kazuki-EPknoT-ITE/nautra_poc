"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * リアルタイムの表示（レビュー POS-03）。決まった間隔で画面を取り直し、最後に取り直した時刻を出す。
 * 位置の取り込みはサーバ側（position-service のアダプタ）なので、ここは「見直すだけ」。
 */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const [at, setAt] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
      setAt(new Date());
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-sm text-[#DFE1E0]" aria-live="off">
      <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-[#917351]" />
      {seconds}秒ごとに更新 ／ {at.toTimeString().slice(0, 8)}
    </span>
  );
}
