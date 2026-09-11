"use client";

import type { ReactNode } from "react";
import type { Permission } from "@/domain/authz/roles";

/**
 * 機能グループ（01〜07）の見出し。
 *
 * 画面の切り替えは**ヘッダ直下の横タブ**（`vessel-tabs.tsx`）が担うため、ここは
 * 「いまどの機能グループにいるか」を1行で示すだけにする（デザイン正本 `design/poc_design`
 * の船内画面は、画面名をタブで示して本文をすぐ始める）。
 * `right` は画面固有の操作（対象船員の切替など）の置き場所。
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
    tabs: [
      { href: "/vessel/punch", label: "打刻" },
      { href: "/vessel/history", label: "履歴・事後入力" },
    ],
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
  const g = FEATURE_GROUPS[group];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="m-0 flex flex-wrap items-baseline gap-2.5">
        <span className="font-mono text-xs tracking-[0.12em] text-primary">
          {g.no} {g.title}
        </span>
        {subtitle ? <span className="text-xl font-bold text-foreground-900">{subtitle}</span> : null}
      </h1>
      {right}
    </div>
  );
}
