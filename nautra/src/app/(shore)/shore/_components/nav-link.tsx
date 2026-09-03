"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * サイドバーの1項目。
 *
 * 現在地は**色ではなく明度の反転**（黒塗り）で示す（DESIGN.md: 有彩色を意味に使わない）。
 * `aria-current` を併記し、色が見えない環境でも現在地が伝わるようにする。
 */
export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  // ダッシュボードは完全一致。それ以外は配下の画面（/shore/crew/[id] 等）も現在地とみなす
  const active = href === "/shore" ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-medium px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary font-medium text-primary-foreground"
          : "text-foreground-700 hover:bg-default-200",
      )}
    >
      {label}
    </Link>
  );
}
