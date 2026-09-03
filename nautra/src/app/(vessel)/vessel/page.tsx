"use client";

import Link from "next/link";
import { useRoutePrefetch } from "@/lib/use-route-prefetch";
import { useSyncBadge } from "@/lib/vessel-hooks";
import { NoticePanel } from "./_components/notice-panel";
import { Button, CardFooter, CardHeader, GlassCard } from "@/ui";
import { can, type Permission } from "@/domain/authz/roles";
import { t } from "@/i18n/ja";
import { useSessionCrew } from "@/lib/vessel-hooks";

/**
 * 船内ホーム = 機能メニュー。
 * Phase 1 実装機能マップ（要件定義書 2章 / プレゼン資料）の6領域を番号カードで提示する。
 * カードは「番号＋タイトル＋サブ画面ボタン」のみで説明文を持たない（1画面1目的。基本設計書 6.3）。
 * 打刻は「メニュー→打刻→作業種別タップ」の2タップ以内を維持。
 */

interface FeatureLink {
  /** ボタンの文言。カード幅で折り返さない長さ（目安9文字まで）にする */
  label: string;
  href: string;
  /** この導線を表示するために必要な権限（未指定は全ロール） */
  permission?: Permission;
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
    links: [{ label: "打刻", href: "/vessel/punch" }],
  },
  {
    no: "02",
    title: "労務管理記録簿",
    links: [
      { label: "本日の集計", href: "/vessel/ledger" },
      { label: "船内承認", href: "/vessel/approve", permission: "approve_labor" },
    ],
  },
  {
    no: "03",
    title: "航海日誌",
    links: [{ label: "航海日誌", href: "/vessel/logbook" }],
  },
  {
    no: "04",
    title: "当直・シフト管理",
    links: [{ label: "当直・配置表", href: "/vessel/shift" }],
  },
  {
    no: "05",
    title: "船内保守・作業記録",
    links: [
      { label: "作業・待機", href: "/vessel/work" },
      { label: "点検・保守", href: "/vessel/maintenance" },
      { label: "操練・検知", href: "/vessel/safety" },
    ],
  },
  {
    no: "06",
    title: "オフライン蓄積・同期",
    links: [{ label: "同期状態", href: "/vessel/sync" }],
  },
  {
    no: "07",
    title: "安全・健康",
    links: [
      { label: "事故・ヒヤリ", href: "/vessel/incident" },
      { label: "相談・体調", href: "/vessel/wellbeing" },
    ],
  },
];

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <GlassCard
      blurred
      aria-label={`${feature.no} ${feature.title}`}
      className="flex h-full flex-col"
    >
      {/*
        通知はカード内に置かない（タイトルと幅を奪い合って崩れるため、右のお知らせ欄に集約する）。
        番号は見出しの上に置き、タイトルにカード幅をすべて渡す（「労務管理記録簿」等が途中で折れない）。
      */}
      <CardHeader className="flex flex-col items-start gap-0.5 px-5 pb-4 pt-4">
        <span className="tabular-nums text-2xl font-bold leading-none text-foreground-500">
          {feature.no}
        </span>
        <h2 className="text-pretty text-xl font-bold leading-tight">{feature.title}</h2>
      </CardHeader>
      {/*
        導線はどれも同じ重み（機能への入口）なので、見た目を1種類に統一する。
        下寄せ（mt-auto）にすると、行内でボタン数が違うカードどうしで開始位置がずれるため、
        見出しの直下から並べて左右のカードと行を揃える。
      */}
      <CardFooter className="flex flex-col gap-2 px-5 pb-5 pt-0">
        {feature.links.map((link) => (
          <Button
            key={link.href}
            as={Link}
            href={link.href}
            color="primary"
            radius="md"
            className="h-12 w-full text-center text-base font-semibold"
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
  const session = useSessionCrew();

  // サインイン中のロールで使える導線だけを出す（判定は domain/authz。基本設計書 11.2）
  const visible = FEATURES.map((f) => ({
    ...f,
    links: f.links.filter((l) => !l.permission || (session && can(session.role, l.permission))),
  })).filter((f) => f.links.length > 0);

  // メニューを見ている間に各画面を用意しておく（押してから待たせない）
  useRoutePrefetch(visible.flatMap((f) => f.links.map((l) => l.href)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-balance text-2xl font-bold">
          船内メニュー
          {session ? (
            <span className="ml-3 text-base font-normal text-foreground-600">
              {session.name}（{t.role[session.role]}）
            </span>
          ) : null}
        </h1>
        <p className="text-sm text-foreground-600">
          {offlineSim ? "⚡ オフライン運用中" : "● オンライン"}
          {pendingCount > 0 ? `｜未同期 ${pendingCount}件` : ""}
        </p>
      </div>
      {/* 左=機能カード（3列×2行）、右=お知らせ欄。狭い画面ではお知らせが下に回る */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((f) => (
            <FeatureCard key={f.no} feature={f} />
          ))}
        </div>
        <NoticePanel />
      </div>
    </div>
  );
}
