"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { openMaintenanceIssues } from "@/lib/maintenance-status";
import { useRecords, useShiftPlans, useSyncBadge } from "@/lib/vessel-hooks";
import { Chip, Divider } from "@/ui";

/**
 * 船内ホーム = 機能メニュー。
 * Phase 1 実装機能マップ（要件定義書 2章 / プレゼン資料）の6領域を番号カードで提示し、
 * 各機能のサブ画面への導線をまとめる。
 * 打刻は「メニュー→打刻→作業種別タップ」の2タップ以内を維持（基本設計書 6.3）。
 */

interface FeatureLink {
  label: string;
  href: string;
  primary?: boolean;
}

interface Feature {
  no: string;
  title: string;
  desc: string;
  links: FeatureLink[];
}

const FEATURES: Feature[] = [
  {
    no: "01",
    title: "労働時間・打刻",
    desc: "作業種別を選んで押すだけの打刻、後から打刻（事後入力）、差戻し再入力、共用端末での打刻者選択。",
    links: [
      { label: "打刻する", href: "/vessel/punch", primary: true },
      { label: "履歴・後から打刻", href: "/vessel/history" },
    ],
  },
  {
    no: "02",
    title: "労務管理記録簿",
    desc: "日・週・4週の自動集計、上限・休息の法令チェック（注意＝黄／警告＝赤）、船長の日次承認。第16号の5書式の帳票出力は陸上側で行う。",
    links: [
      { label: "本日の集計", href: "/vessel/ledger", primary: true },
      { label: "船内承認（船長）", href: "/vessel/approve" },
    ],
  },
  {
    no: "03",
    title: "航海日誌・点検",
    desc: "出入港・船位・海象の記録、出港前点検チェックリスト、安全パトロール、アルコール検知記録、操練（訓練）実施記録。",
    links: [
      { label: "航海日誌", href: "/vessel/logbook", primary: true },
      { label: "点検・操練・検知", href: "/vessel/checklist" },
    ],
  },
  {
    no: "04",
    title: "当直・シフト管理",
    desc: "航海当直・機関当直・停泊当直・荷役当直のシフト参照、通常配置表、陸上からの変更通知、計画と実績（打刻）の対比。",
    links: [{ label: "当直シフト・配置表", href: "/vessel/shift", primary: true }],
  },
  {
    no: "05",
    title: "船内保守・作業記録",
    desc: "荷役作業記録、スタンバイ待機時間の記録、燃料補給・消費記録、職務引継記録、機器別の日常点検・保守記録。",
    links: [
      { label: "作業・待機・燃料・引継", href: "/vessel/work", primary: true },
      { label: "日常点検・保守", href: "/vessel/maintenance" },
    ],
  },
  {
    no: "06",
    title: "オフライン蓄積・同期",
    desc: "通信断でも端末内（IndexedDB）に記録を蓄積し、ネット復帰時に自動転送。未同期件数・最終同期日時・隔離件数を常時表示。",
    links: [{ label: "同期状態を確認", href: "/vessel/sync", primary: true }],
  },
];

function FeatureCard({ feature, badge }: { feature: Feature; badge?: string }) {
  return (
    <section
      aria-label={`${feature.no} ${feature.title}`}
      className="flex flex-col gap-3 rounded-large bg-content1 p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <span className="tabular-nums text-3xl font-bold text-foreground-400">{feature.no}</span>
          <h2 className="text-balance text-xl font-bold">{feature.title}</h2>
        </div>
        <Chip
          size="sm"
          variant="flat"
          color={badge ? "danger" : "success"}
          radius="sm"
          className="shrink-0"
        >
          {badge ?? "利用できます"}
        </Chip>
      </div>
      <Divider />
      <p className="text-pretty text-sm leading-relaxed text-foreground-500">{feature.desc}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {feature.links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex min-h-12 flex-1 items-center justify-center rounded-medium px-4 text-center text-base font-semibold",
              link.primary
                ? "bg-primary text-primary-foreground"
                : "border border-foreground-300 text-foreground",
            )}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function VesselMenuPage() {
  const { pendingCount, offlineSim } = useSyncBadge();
  const { unread } = useShiftPlans();
  const maintenance = useRecords("maintenance_record");
  // 機器ごとの最新状態が不良のものだけを数える（保守画面のボードと同じ導出。二重実装しない）
  const openDefects = openMaintenanceIssues(maintenance).filter((m) => m.condition === "defect").length;

  const badges: Record<string, string | undefined> = {
    "04": unread.length > 0 ? `変更通知 ${unread.length}件` : undefined,
    "05": openDefects > 0 ? `不良 ${openDefects}件` : undefined,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-balance text-2xl font-bold">船内メニュー</h1>
        <p className="text-sm text-foreground-500">
          {offlineSim ? "⚡ オフライン運用中（記録は端末に蓄積されます）" : "● オンライン"}
          {pendingCount > 0 ? `｜未同期 ${pendingCount}件` : ""}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <FeatureCard key={f.no} feature={f} badge={badges[f.no]} />
        ))}
      </div>
      <p className="text-xs text-foreground-400">
        Phase 1 実装機能マップ（要件定義書 2章）に基づく機能構成。すべての記録は端末に先に保存され、
        通信回復時に陸上へ同期されます。
      </p>
    </div>
  );
}
