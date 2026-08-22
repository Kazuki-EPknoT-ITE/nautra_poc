"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 機能グループ（01〜06）の見出しとサブ画面タブ。
 * 船内の全画面で「いまどの機能グループにいるか」を同じ位置・同じ書式で示す。
 */
export interface FeatureGroup {
  no: string;
  title: string;
  tabs: { href: string; label: string }[];
}

export const FEATURE_GROUPS: Record<string, FeatureGroup> = {
  "01": {
    no: "01",
    title: "労働時間・打刻",
    tabs: [
      { href: "/vessel/punch", label: "打刻" },
      { href: "/vessel/history", label: "履歴・後から打刻" },
    ],
  },
  "02": {
    no: "02",
    title: "労務管理記録簿",
    tabs: [
      { href: "/vessel/ledger", label: "本日の集計" },
      { href: "/vessel/approve", label: "船内承認（船長）" },
    ],
  },
  "03": {
    no: "03",
    title: "航海日誌・点検",
    tabs: [
      { href: "/vessel/logbook", label: "航海日誌" },
      { href: "/vessel/checklist", label: "点検・操練・検知" },
    ],
  },
  "04": {
    no: "04",
    title: "当直・シフト管理",
    tabs: [{ href: "/vessel/shift", label: "当直シフト・配置表" }],
  },
  "05": {
    no: "05",
    title: "船内保守・作業記録",
    tabs: [
      { href: "/vessel/work", label: "作業・待機・燃料・引継" },
      { href: "/vessel/maintenance", label: "日常点検・保守" },
    ],
  },
  "06": {
    no: "06",
    title: "オフライン蓄積・同期",
    tabs: [{ href: "/vessel/sync", label: "同期状態" }],
  },
};

/** パスから所属グループ番号を引く（下部ナビのアクティブ判定にも使う） */
export function groupForPath(pathname: string): string | null {
  for (const g of Object.values(FEATURE_GROUPS)) {
    if (g.tabs.some((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))) return g.no;
  }
  return null;
}

export function GroupHeader({
  group,
  subtitle,
  right,
}: {
  group: keyof typeof FEATURE_GROUPS;
  subtitle?: string;
  right?: ReactNode;
}) {
  const pathname = usePathname();
  const g = FEATURE_GROUPS[group];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-balance text-xl font-bold">
          <span className="mr-2 tabular-nums text-foreground-400">{g.no}</span>
          {g.title}
          {subtitle ? <span className="ml-2 text-base font-normal text-foreground-500">─ {subtitle}</span> : null}
        </h1>
        {right}
      </div>
      {g.tabs.length > 1 ? (
        <nav aria-label={`${g.title} のサブメニュー`} className="flex gap-2 overflow-x-auto">
          {g.tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-foreground-300 text-foreground-600",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
