import { en } from "./en";
import { t as ja } from "./ja";

/**
 * 多言語 UI の入口（要件定義書 10.2「多言語UI（外国人船員対応）を拡張可能な設計とする」）。
 *
 * 設計:
 * - 言語の追加は **辞書ファイルを足して LOCALES に登録するだけ**で完了する。
 *   画面側のコードは変更しない（記録種別の追加をレジストリだけで済ませるのと同じ考え方）。
 * - 辞書は **部分的でよい**。未翻訳のキーは日本語（既定言語）へ自動でフォールバックするため、
 *   翻訳の完了を待たずに言語を出せる。
 * - 既存の `t`（日本語）は据え置き。サーバコンポーネントや陸上画面はこれまでどおり使える。
 */

export type Locale = "ja" | "en";

export const DEFAULT_LOCALE: Locale = "ja";

/** 言語の登録簿。追加する言語はここに1行足す */
export const LOCALES: { code: Locale; label: string; dict: unknown }[] = [
  { code: "ja", label: "日本語", dict: ja },
  { code: "en", label: "English", dict: en },
];

export const LOCALE_LABEL: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
};

type Dict = Record<string, unknown>;

/**
 * 語彙の引き当て（`group` は t のキー、`key` はその中のキー）。
 * 例: `translate("en", "workCategory", "cargo")` → "Cargo work"
 *
 * 指定言語に無ければ日本語へ、日本語にも無ければキーそのものを返す
 * （表示が空欄になって意味が失われるより、キーが見えるほうが現場で復旧しやすい）。
 */
export function translate(locale: Locale, group: string, key: string): string {
  const dicts: Dict[] = locale === DEFAULT_LOCALE ? [ja as Dict] : [dictOf(locale), ja as Dict];
  for (const d of dicts) {
    const g = d[group] as Record<string, string> | undefined;
    const v = g?.[key];
    if (typeof v === "string") return v;
  }
  return key;
}

function dictOf(locale: Locale): Dict {
  return (LOCALES.find((l) => l.code === locale)?.dict ?? ja) as Dict;
}

/**
 * 画面向けの引き当て関数を作る。
 * `const tr = translator(locale); tr("workCategory", "cargo")`
 */
export function translator(locale: Locale) {
  return (group: string, key: string) => translate(locale, group, key);
}

/** 同期イベント種別（マスタ系を含む）の表示名 */
export function syncKindLabelFor(locale: Locale, kind: string): string {
  const viaKind = translate(locale, "syncKind", kind);
  if (viaKind !== kind) return viaKind;
  return translate(locale, "syncKindExtra", kind);
}

/** 法令チェック項目の表示名（既存5項目 + 3.2.5 で追加した4項目） */
export function checkLabelFor(locale: Locale, key: string): string {
  const viaCheck = translate(locale, "check", key);
  if (viaCheck !== key) return viaCheck;
  return translate(locale, "checkExtra", key);
}

export function isLocale(v: string | null | undefined): v is Locale {
  return v === "ja" || v === "en";
}
