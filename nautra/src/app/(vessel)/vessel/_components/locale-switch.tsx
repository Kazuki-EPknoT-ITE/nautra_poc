"use client";

import { LOCALES } from "@/i18n";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/use-locale";

/**
 * 表示言語の切替（要件定義書 10.2「多言語UI（外国人船員対応）」）。
 *
 * - 選択は端末に保存されるため**オフラインでも効く**（`useLocale` → meta テーブル）。
 * - サインイン前から使える位置（ヘッダ）に置く。外国人船員は最初の画面から言語が要る。
 * - 言語の追加は `LOCALES` に1行足すだけで、このボタンも自動で増える。
 * - 見た目は既存の材質クラス（`glass-inset`）と primary のみで作り、独自の色を持たない。
 */
export function LocaleSwitch() {
  const { locale, setLocale } = useLocale();
  return (
    <div
      role="group"
      aria-label="表示言語 / Display language"
      className="glass-inset flex shrink-0 items-center gap-1 p-1"
    >
      {LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          aria-pressed={locale === l.code}
          onClick={() => setLocale(l.code)}
          className={cn(
            "min-h-9 rounded-medium px-2.5 text-sm font-semibold",
            locale === l.code ? "bg-primary text-primary-foreground" : "text-foreground-600",
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
