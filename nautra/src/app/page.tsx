import Link from "next/link";
import { PRODUCT_NAME, PRODUCT_NAME_KANA, t } from "@/i18n/ja";
import { AppShell } from "@/ui";

/** 入口。タイトルと2つの入口ボタンのみを置き、説明文は持たない */
const ENTRIES = [
  { href: "/vessel", title: t.vesselApp },
  { href: "/shore", title: t.shoreApp },
];

export default function LandingPage() {
  return (
    <AppShell theme="shore">
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-12">
        <h1 className="text-balance text-4xl font-bold">
          {PRODUCT_NAME}
          <span className="ml-3 text-xl font-normal text-foreground-600">{PRODUCT_NAME_KANA}</span>
        </h1>
        <nav className="grid gap-4 sm:grid-cols-2">
          {ENTRIES.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className="ui-card flex min-h-32 items-center justify-center border border-transparent p-6 text-2xl font-bold transition-colors hover:border-primary"
            >
              {e.title}
            </Link>
          ))}
        </nav>
      </main>
    </AppShell>
  );
}
