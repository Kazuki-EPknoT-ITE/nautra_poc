"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useMemo } from "react";
import { DEFAULT_LOCALE, isLocale, translator, type Locale } from "@/i18n";
import { getMeta, setMeta } from "./vessel-db";

/**
 * 船内アプリの表示言語（要件定義書 10.2「多言語UI（外国人船員対応）」）。
 *
 * - 選択は**端末内（IndexedDB の meta）**に保存する。オフラインでも効き、
 *   共用端末では「その端末を使う人の言語」が保たれる（サーバ往復を挟まない）。
 * - `tr(group, key)` は未翻訳キーを日本語へ自動フォールバックする（i18n/index.ts）。
 *   したがって辞書が部分的でも画面が空欄にならない。
 */

export const LOCALE_META_KEY = "locale";

export interface LocaleState {
  locale: Locale;
  setLocale: (next: Locale) => void;
  /** 区分ラベルの引き当て（`tr("workCategory", "cargo")`） */
  tr: (group: string, key: string) => string;
}

export function useLocale(): LocaleState {
  const stored = useLiveQuery(() => getMeta(LOCALE_META_KEY), [], undefined);
  const locale: Locale = isLocale(stored) ? stored : DEFAULT_LOCALE;
  const setLocale = useCallback((next: Locale) => {
    void setMeta(LOCALE_META_KEY, next);
  }, []);
  const tr = useMemo(() => translator(locale), [locale]);
  return { locale, setLocale, tr };
}
