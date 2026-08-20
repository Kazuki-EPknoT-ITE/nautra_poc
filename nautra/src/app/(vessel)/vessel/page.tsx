"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { useSyncBadge } from "@/lib/vessel-hooks";
import { Chip, Divider } from "@/ui";

/**
 * 船内ホーム = 機能メニュー。
 * Phase 1 実装機能マップ（要件定義書 2章 / プレゼン資料）の6領域を番号カードで提示し、
 * 実装済み機能へのサブ導線をまとめる。未実装領域は Phase 1β 予定として明示する。
 * 打刻は「メニュー→打刻→作業種別タップ」の2タップ以内を維持（基本設計書 6.3）。
 */

type FeatureStatus = "available" | "partial" | "planned";

interface FeatureLink {
  label: string;
  href: string;
  primary?: boolean;
}

interface Feature {
  no: string;
  title: string;
  desc: string;
  status: FeatureStatus;
  links?: FeatureLink[];
}

const FEATURES: Feature[] = [
  {
    no: "01",
    title: "労働時間・打刻",
    desc: "作業種別を選んで押すだけの打刻、後から打刻（事後入力）、差戻し再入力、共用端末での打刻者選択。",
    status: "available",
    links: [
      { label: "打刻する", href: "/vessel/punch", primary: true },
      { label: "履歴・後から打刻", href: "/vessel/history" },
    ],
  },
  {
    no: "02",
    title: "労務管理記録簿",
    desc: "日・週・4週の自動集計、上限・休息の法令チェック（注意＝黄／警告＝赤）、船長の日次承認。第16号の5書式の帳票出力は陸上側で対応予定。",
    status: "partial",
    links: [
      { label: "本日の集計", href: "/vessel/ledger", primary: true },
      { label: "船内承認（船長）", href: "/vessel/approve" },
    ],
  },
  {
    no: "03",
    title: "航海日誌・点検",
    desc: "出入港・船位・海象の記録、出港前点検チェックリスト、アルコール検知記録、操練（訓練）実施記録。",
    status: "planned",
  },
  {
    no: "04",
    title: "当直・シフト管理",
    desc: "航海当直・停泊当直・荷役当直のシフト参照と変更通知（シフト作成・配置表編集は陸上アプリ）。",
    status: "planned",
  },
  {
    no: "05",
    title: "船内保守・作業記録",
    desc: "日常点検記録、荷役作業記録、燃料消費記録、引き継ぎ記録、作業報告の電子化。",
    status: "planned",
  },
  {
    no: "06",
    title: "オフライン蓄積・同期",
    desc: "通信断でも端末内（IndexedDB）に記録を蓄積し、ネット復帰時に自動転送。未同期件数・最終同期日時を常時表示。",
    status: "available",
    links: [{ label: "同期状態を確認", href: "/vessel/sync", primary: true }],
  },
];

const STATUS_CHIP: Record<
  FeatureStatus,
  { label: string; color: "success" | "primary" | "default" }
> = {
  available: { label: "利用できます", color: "success" },
  partial: { label: "一部利用できます", color: "primary" },
  planned: { label: "Phase 1β 予定", color: "default" },
};

function FeatureCard({ feature }: { feature: Feature }) {
  const chip = STATUS_CHIP[feature.status];
  const planned = feature.status === "planned";
  return (
    <section
      aria-label={`${feature.no} ${feature.title}`}
      className={cn(
        "flex flex-col gap-3 rounded-large bg-content1 p-5",
        planned && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <span className="tabular-nums text-3xl font-bold text-foreground-400">
            {feature.no}
          </span>
          <h2 className="text-balance text-xl font-bold">{feature.title}</h2>
        </div>
        <Chip size="sm" variant="flat" color={chip.color} radius="sm" className="shrink-0">
          {chip.label}
        </Chip>
      </div>
      <Divider />
      <p className="text-pretty text-sm leading-relaxed text-foreground-500">{feature.desc}</p>
      {feature.links ? (
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {feature.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex min-h-12 flex-1 items-center justify-center rounded-medium px-4 text-base font-semibold",
                link.primary
                  ? "bg-primary text-primary-foreground"
                  : "border border-foreground-300 text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default function VesselMenuPage() {
  const { pendingCount, offlineSim } = useSyncBadge();
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
          <FeatureCard key={f.no} feature={f} />
        ))}
      </div>
      <p className="text-xs text-foreground-400">
        Phase 1 実装機能マップ（要件定義書 2章）に基づく機能構成。番号 03〜05 は Phase 1β で追加予定。
      </p>
    </div>
  );
}
