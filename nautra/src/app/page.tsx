import Link from "next/link";
import { PRODUCT_NAME, PRODUCT_NAME_KANA, t } from "@/i18n/ja";
import { DEMO_VESSEL } from "@/lib/crew";

export default function LandingPage() {
  return (
    <div className="shore text-foreground bg-background min-h-dvh">
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-12">
        <header className="flex flex-col gap-2">
          <h1 className="text-balance text-4xl font-bold">
            {PRODUCT_NAME}
            <span className="ml-3 text-xl font-normal text-foreground-500">{PRODUCT_NAME_KANA}</span>
          </h1>
          <p className="text-pretty text-foreground-500">{t.appSubtitle}</p>
        </header>
        <nav className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/vessel"
            className="flex flex-col gap-1 rounded-large border border-default-200 bg-content1 p-6 shadow-small transition-colors hover:border-primary"
          >
            <span className="text-2xl font-bold">{t.vesselApp}</span>
            <span className="text-foreground-500">
              {DEMO_VESSEL.name} — 機能メニュー（01 打刻 / 02 記録簿・承認 / 06 オフライン同期 ほか）
            </span>
          </Link>
          <Link
            href="/shore"
            className="flex flex-col gap-1 rounded-large border border-default-200 bg-content1 p-6 shadow-small transition-colors hover:border-primary"
          >
            <span className="text-2xl font-bold">{t.shoreApp}</span>
            <span className="text-foreground-500">
              労務ダッシュボード — 法令遵守アラート集計・承認状況・同期受信状況
            </span>
          </Link>
        </nav>
        <p className="text-sm text-foreground-400">
          PoC: Phase 1 コア（P0）のうち 打刻→集計→2段階アラート→船内承認→オフライン同期 を検証する。
        </p>
      </main>
    </div>
  );
}
