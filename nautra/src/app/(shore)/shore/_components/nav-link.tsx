"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * サイドバーの1項目（デザイン正本 `design/poc_design` のサイドバー）。
 *
 * 暗い面（`#231F20`）の上に置くため、待機中は `#CCCCCC` の文字だけ。現在地は
 * **ブロンズの塗り**（`#917351`）で示す。`aria-current` を併記し、色が見えない環境でも
 * 現在地が伝わるようにする。
 */
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
  // ダッシュボードは完全一致。それ以外は配下の画面（/shore/crew/[id] 等）も現在地とみなす
  const active =
    (href === "/shore" ? pathname === href : pathname.startsWith(href)) ||
    (alsoActiveOn ?? []).some((p) => pathname.startsWith(p));

  return (
    <Link
      href={href}
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
