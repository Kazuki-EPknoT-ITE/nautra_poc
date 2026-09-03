"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { Permission } from "@/domain/authz/roles";
import { can } from "@/domain/authz/roles";
import { useSessionCrew } from "@/lib/vessel-hooks";
import { Tab, Tabs } from "@/ui";

/**
 * 機能グループ（01〜06）の見出しとサブ画面タブ。
 * 船内の全画面で「いまどの機能グループにいるか」を同じ位置・同じ書式で示す。
 */
export interface FeatureGroup {
  no: string;
  title: string;
  /** permission を持つタブは、その権限があるロールにだけ表示する（11.2） */
  tabs: { href: string; label: string; permission?: Permission }[];
}

export const FEATURE_GROUPS: Record<string, FeatureGroup> = {
  "01": {
    no: "01",
    title: "労働時間・打刻",
    tabs: [{ href: "/vessel/punch", label: "打刻" }],
  },
  "02": {
    no: "02",
    title: "労務管理記録簿",
    tabs: [
      { href: "/vessel/ledger", label: "本日の集計" },
      { href: "/vessel/approve", label: "船内承認", permission: "approve_labor" },
    ],
  },
  "03": {
    no: "03",
    title: "航海日誌",
    tabs: [{ href: "/vessel/logbook", label: "航海日誌" }],
  },
  "04": {
    no: "04",
    title: "当直・シフト管理",
    tabs: [{ href: "/vessel/shift", label: "当直・配置表" }],
  },
  "05": {
    no: "05",
    title: "船内保守・作業記録",
    // 点検は 03 から移設（機器の保守と内容が重なるため、点検・保守を1画面にまとめる）
    tabs: [
      { href: "/vessel/work", label: "作業・待機" },
      { href: "/vessel/maintenance", label: "点検・保守" },
      { href: "/vessel/safety", label: "操練・検知" },
    ],
  },
  "06": {
    no: "06",
    title: "オフライン蓄積・同期",
    tabs: [{ href: "/vessel/sync", label: "同期状態" }],
  },
  // 3.5.2 事故・インシデント報告 / 3.5.3 健康・ハラスメント相談（V-10）
  "07": {
    no: "07",
    title: "安全・健康",
    tabs: [
      { href: "/vessel/incident", label: "事故・ヒヤリ" },
      { href: "/vessel/wellbeing", label: "相談・体調" },
    ],
  },
};

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
  const session = useSessionCrew();
  const g = FEATURE_GROUPS[group];
  // 権限のないサブ画面は導線ごと出さない（開いても PermissionGate で止まる）
  const tabs = g.tabs.filter((tab) => !tab.permission || (session && can(session.role, tab.permission)));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-balance text-xl font-bold">
          <span className="mr-2 tabular-nums text-foreground-600">{g.no}</span>
          {g.title}
          {subtitle ? (
            <span className="ml-2 text-base font-normal text-foreground-600">─ {subtitle}</span>
          ) : null}
        </h1>
        {right}
      </div>
      {tabs.length > 1 ? (
        <Tabs
          aria-label={`${g.title} のサブメニュー`}
          selectedKey={pathname}
          items={tabs}
          radius="full"
          classNames={{
            tabList: "glass-inset gap-1 p-1",
            tab: "min-h-11 px-4",
            tabContent: "text-sm font-semibold text-foreground-600 group-data-[selected=true]:text-primary-foreground",
            cursor: "bg-primary shadow-none",
          }}
        >
          {(tab) => <Tab key={tab.href} href={tab.href} title={tab.label} />}
        </Tabs>
      ) : null}
    </div>
  );
}
