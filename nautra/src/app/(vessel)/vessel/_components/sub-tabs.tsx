"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * 横タブの1つの中を、さらに主題で切り替える段（例: 安全 → 操練・検知 / 事故・ヒヤリ）。
 *
 * 説明文で「◯◯はこちら」と案内せず、切り替えの段そのもので入口を見せる（レビュー 0-1 / 0-2）。
 * 見た目は陸上の主題タブと同じ `.ui-btn-quiet` / `.ui-btn-selected`。
 */
export function SubTabs({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="ui-card flex flex-wrap gap-2 p-2">
      {items.map((x) => {
        const active = pathname.startsWith(x.href);
        return (
          <Link
            key={x.href}
            href={x.href}
            aria-current={active ? "page" : undefined}
            className={cn("ui-btn-quiet min-h-12 flex-1 !px-4 !text-lg", active && "ui-btn-selected")}
          >
            {x.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** 横タブ「安全」の中の切り替え */
export const SAFETY_SUB_TABS = [
  { href: "/vessel/safety", label: "操練・検知" },
  { href: "/vessel/incident", label: "事故・ヒヤリ" },
];
