import Link from "next/link";
import { PRODUCT_NAME, PRODUCT_NAME_KANA, t } from "@/i18n/ja";
import { DEMO_VESSEL } from "@/lib/crew";
import { AppShell } from "@/ui";

const ENTRIES = [
  {
    href: "/vessel",
    title: t.vesselApp,
    desc: `${DEMO_VESSEL.name} — 機能メニュー（01 打刻 / 02 記録簿・承認 / 03 航海日誌・点検 / 04 シフト / 05 作業・保守 / 06 オフライン同期）`,
  },
  {
    href: "/shore",
    title: t.shoreApp,
    desc: "労務ダッシュボード — 法令遵守アラート集計・承認状況・同期受信状況・シフト配信",
  },
];

export default function LandingPage() {
  return (
    <AppShell theme="shore">
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-12">
        <header className="flex flex-col gap-2">
          <h1 className="text-balance text-4xl font-bold">
            {PRODUCT_NAME}
            <span className="ml-3 text-xl font-normal text-foreground-500">{PRODUCT_NAME_KANA}</span>
          </h1>
          <p className="text-pretty text-foreground-500">{t.appSubtitle}</p>
        </header>
        <nav className="grid gap-4 sm:grid-cols-2">
          {ENTRIES.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className="glass-tile glass-blur flex flex-col gap-1 border border-transparent p-6 transition-colors hover:border-primary"
            >
              <span className="text-2xl font-bold">{e.title}</span>
              <span className="text-pretty text-foreground-500">{e.desc}</span>
            </Link>
          ))}
        </nav>
        <p className="text-pretty text-sm text-foreground-400">
          PoC: Phase 1 船内機能 01〜06（打刻→集計→2段階アラート→船内承認→航海日誌・点検→シフト→
          作業・保守→オフライン同期）を検証する。
        </p>
      </main>
    </AppShell>
  );
}
