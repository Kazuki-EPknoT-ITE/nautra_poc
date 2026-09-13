"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * サイドバーの1項目（デザイン正本 `design/poc_design` のサイドバー）。
 *
 * 暗い面（`#231F20`）の上に置くため、待機中は `#CCCCCC` の文字だけ。現在地は
 * **ブロンズの塗り**（`#917351`）で示す。`aria-current` を併記し、色が見えない環境でも
 * 現在地が伝わるようにする。
 *
 * **本番では自動の先読みを切る**（`prefetch={false}`）。陸上の画面は毎回サーバで組み立てる
 * （`force-dynamic`）ので、既定のままだとサイドバーに並ぶ 20 本すべてが画面を開くたびに
 * 先読みされ、**20 回ぶんのサーバ描画と同時接続**が走る。押したい画面の取得がその後ろに
 * 並ばされて、実測で最初の遷移が 3 秒かかっていた。
 * 代わりに**狙いを定めた時点**（ポインタを載せた・キーボードで focus した）で1本だけ
 * 先読みする。人は押す前に必ずそこを通るので、体感は変わらないまま要求が 20 → 1 になる。
 *
 * **開発サーバでは逆に自動の先読みを残す。** `next dev` は画面ごとにその場でコンパイルする
 * ため、先読みがそのまま**コンパイルの前倒し**になる（押してから 2〜10 秒待つのを隠せる）。
 * 開発サーバは自分ひとりしか使わないので、20 本ぶんの描画が走っても困らない。
 * 本番ビルドでは事前にコンパイル済みなので、この前倒しには意味がなく害だけが残る。
 */
const EAGER_PREFETCH = process.env.NODE_ENV === "development";
export function NavLink({
  href,
  label,
  /** 現在地とみなす追加のパス（例: 船員一覧とカルテ） */
  alsoActiveOn,
}: {
  href: string;
  label: string;
  alsoActiveOn?: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const warmed = useRef(false);
  // ダッシュボードは完全一致。それ以外は配下の画面（/shore/crew/[id] 等）も現在地とみなす
  const active =
    (href === "/shore" ? pathname === href : pathname.startsWith(href)) ||
    (alsoActiveOn ?? []).some((p) => pathname.startsWith(p));

  /** 同じ項目を何度もなぞっても要求は1回だけにする */
  function warm() {
    if (EAGER_PREFETCH || warmed.current || active) return;
    warmed.current = true;
    router.prefetch(href);
  }

  return (
    <Link
      href={href}
      prefetch={EAGER_PREFETCH ? undefined : false}
      onMouseEnter={warm}
      onFocus={warm}
      onTouchStart={warm}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-1 rounded-small px-2 py-[9px] text-left text-base transition-colors",
        active
          ? "bg-primary font-medium text-primary-foreground"
          : "text-[#CCCCCC] hover:bg-[#333333] hover:text-white",
      )}
    >
      {label}
    </Link>
  );
}
