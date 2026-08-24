"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { openMaintenanceIssues } from "@/lib/maintenance-status";
import { useRecords, useShiftPlans, useSyncBadge } from "@/lib/vessel-hooks";
import { Button, CardFooter, CardHeader, Chip, GlassCard } from "@/ui";

/**
 * 船内ホーム = 機能メニュー。
 * Phase 1 実装機能マップ（要件定義書 2章 / プレゼン資料）の6領域を番号カードで提示する。
 * カードは「番号＋タイトル＋サブ画面ボタン」のみで説明文を持たない（1画面1目的。基本設計書 6.3）。
 * 打刻は「メニュー→打刻→作業種別タップ」の2タップ以内を維持。
 */

interface FeatureLink {
  label: string;
  href: string;
  primary?: boolean;
}

interface Feature {
  no: string;
  title: string;
  links: FeatureLink[];
}

const FEATURES: Feature[] = [
  {
    no: "01",
    title: "労働時間・打刻",
    links: [
      { label: "打刻する", href: "/vessel/punch", primary: true },
      { label: "履歴・後から打刻", href: "/vessel/history" },
    ],
  },
  {
    no: "02",
    title: "労務管理記録簿",
    links: [
      { label: "本日の集計", href: "/vessel/ledger", primary: true },
      { label: "船内承認（船長）", href: "/vessel/approve" },
    ],
  },
  {
    no: "03",
    title: "航海日誌・点検",
    links: [
      { label: "航海日誌", href: "/vessel/logbook", primary: true },
      { label: "点検・操練・検知", href: "/vessel/checklist" },
    ],
  },
  {
    no: "04",
    title: "当直・シフト管理",
    links: [{ label: "当直シフト・配置表", href: "/vessel/shift", primary: true }],
  },
  {
    no: "05",
    title: "船内保守・作業記録",
    links: [
      { label: "作業・待機・燃料・引継", href: "/vessel/work", primary: true },
      { label: "日常点検・保守", href: "/vessel/maintenance" },
    ],
  },
  {
    no: "06",
    title: "オフライン蓄積・同期",
    links: [{ label: "同期状態を確認", href: "/vessel/sync", primary: true }],
  },
];

function FeatureCard({ feature, badge }: { feature: Feature; badge?: string }) {
  return (
    <GlassCard
      blurred
      aria-label={`${feature.no} ${feature.title}`}
      className="flex h-full flex-col"
    >
      <CardHeader className="flex items-start justify-between gap-2 px-5 pb-4 pt-5">
        <div className="flex items-baseline gap-3">
          <span className="tabular-nums text-3xl font-bold text-foreground-500">{feature.no}</span>
          <h2 className="text-balance text-xl font-bold">{feature.title}</h2>
        </div>
        {/* 通知がある機能だけバッジを出す（常時表示の状態文は置かない） */}
        {badge ? (
          <Chip size="sm" variant="flat" color="danger" radius="sm" className="shrink-0">
            {badge}
          </Chip>
        ) : null}
      </CardHeader>
      <CardFooter className="mt-auto flex flex-wrap gap-2 px-5 pb-5 pt-0">
        {feature.links.map((link) => (
          <Button
            key={link.href}
            as={Link}
            href={link.href}
            color={link.primary ? "primary" : "default"}
            variant={link.primary ? "solid" : "bordered"}
            radius="md"
            className={cn(
              // 長いラベルは折り返して収める（クリップさせない）
              "h-auto min-h-12 flex-1 whitespace-normal py-2 text-center text-base font-semibold leading-tight",
              !link.primary && "border-[var(--glass-border-strong)] text-foreground",
            )}
          >
            {link.label}
          </Button>
        ))}
      </CardFooter>
    </GlassCard>
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
        <p className="text-sm text-foreground-600">
          {offlineSim ? "⚡ オフライン運用中" : "● オンライン"}
          {pendingCount > 0 ? `｜未同期 ${pendingCount}件` : ""}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <FeatureCard key={f.no} feature={f} badge={badges[f.no]} />
        ))}
      </div>
    </div>
  );
}
