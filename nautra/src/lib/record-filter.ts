import { ymdLocal } from "@/domain/labor-law/evaluate";

/**
 * 「過去を見る」の絞り込み（レビュー 0-5 / LOG-03 / INSP-03 / TASKREC-04 / SAFE-03）。
 *
 * 記録画面はどれも「期間」と「キーワード」の同じ2つで絞る。画面ごとに条件を書き分けると
 * 同じ言葉で探しても画面によって結果の出方が変わるので、判定はここに1つだけ置く。
 */
export interface PastFilter {
  /** 開始日（YYYY-MM-DD・その日を含む）。空なら下限なし */
  from: string;
  /** 終了日（YYYY-MM-DD・その日を含む）。空なら上限なし */
  to: string;
  /** キーワード。空白で区切った語を**すべて**含むものだけ残す */
  q: string;
}

export const EMPTY_PAST_FILTER: PastFilter = { from: "", to: "", q: "" };

/** 全角・半角や大文字・小文字の違いで見落とさないように揃える */
export function normalizeForSearch(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

export function isFilterActive(f: PastFilter): boolean {
  return Boolean(f.from || f.to || f.q.trim());
}

export function filterPast<T>(
  items: readonly T[],
  f: PastFilter,
  at: (item: T) => string,
  text: (item: T) => string,
): T[] {
  // 開始と終了を逆に入れても、意図した期間で絞る
  const [from, to] = f.from && f.to && f.from > f.to ? [f.to, f.from] : [f.from, f.to];
  const words = normalizeForSearch(f.q).split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const day = ymdLocal(new Date(at(item)));
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (words.length === 0) return true;
    const hay = normalizeForSearch(text(item));
    return words.every((w) => hay.includes(w));
  });
}
