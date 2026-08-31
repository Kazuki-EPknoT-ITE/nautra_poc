"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * 点検は 05「船内保守・作業記録」の「点検・保守」（/vessel/maintenance）に統合した。
 * 機器の日常点検・保守と内容が重なるため、同じ画面で続けて記録できるようにしている
 * （操練・アルコール検知は /vessel/safety）。
 * 既存のリンク・ブックマークのために本ルートは残し、統合先へ転送する。
 */
export default function ChecklistRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/vessel/maintenance");
  }, [router]);
  return <p className="text-foreground-600">点検・保守の画面へ移動します…</p>;
}
