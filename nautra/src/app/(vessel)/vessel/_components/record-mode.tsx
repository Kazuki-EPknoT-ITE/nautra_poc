"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { EMPTY_PAST_FILTER, filterPast, isFilterActive, type PastFilter } from "@/lib/record-filter";
import { SearchField } from "@/ui";

/**
 * 記録画面の「記録する ／ 過去を見る」の切り替え（レビュー 0-4 / LOG-02 / INSP-02 / TASKREC-03 / SAFE-02）。
 *
 * 記録の入口と過去の一覧を1枚に縦に並べると、記録のたびに一覧ぶんスクロールさせることになる
 * （0-3）。目的が違う2つをタブで分け、開いた直後はいつも「記録する」にする。
 */
export type RecordMode = "record" | "past";

export function RecordModeTabs({
  mode,
  onChange,
  recordLabel,
  pastLabel,
}: {
  mode: RecordMode;
  onChange: (m: RecordMode) => void;
  recordLabel: string;
  pastLabel: string;
}) {
  const items: { id: RecordMode; label: string; icon: string }[] = [
    { id: "record", label: recordLabel, icon: "＋" },
    { id: "past", label: pastLabel, icon: "☰" },
  ];
  return (
    <div role="tablist" aria-label="記録と過去の切り替え" className="ui-card flex gap-2 p-2">
      {items.map((x) => {
        const active = mode === x.id;
        return (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(x.id)}
            className={cn("ui-btn-quiet min-h-14 flex-1 !px-4 !text-xl", active && "ui-btn-selected")}
          >
            <span aria-hidden="true">{x.icon}</span>
            {x.label}
          </button>
        );
      })}
    </div>
  );
}

/** 期間とキーワードで過去の記録を絞る欄。結果の件数を並べて出す */
export function PastFilterBar({
  value,
  onChange,
  count,
  placeholder,
}: {
  value: PastFilter;
  onChange: (f: PastFilter) => void;
  count: number;
  placeholder: string;
}) {
  return (
    <div role="search" className="ui-card flex flex-wrap items-center gap-3 p-3">
      <label className="flex items-center gap-2 text-base text-foreground-700">
        <span className="font-bold">期間</span>
        <input
          type="date"
          aria-label="いつから"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          className="ui-field !w-auto !py-2 tabular-nums"
        />
        <span aria-hidden="true">〜</span>
        <input
          type="date"
          aria-label="いつまで"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          className="ui-field !w-auto !py-2 tabular-nums"
        />
      </label>
      <SearchField
        value={value.q}
        onChange={(q) => onChange({ ...value, q })}
        placeholder={placeholder}
        ariaLabel="キーワード"
        className="min-w-[220px] flex-1"
      />
      <span className="font-mono text-base tabular-nums text-foreground-700" aria-live="polite">
        {count}件
      </span>
      {isFilterActive(value) ? (
        <button type="button" className="ui-btn-quiet min-h-10 !text-base" onClick={() => onChange(EMPTY_PAST_FILTER)}>
          ✕ 条件を消す
        </button>
      ) : null}
    </div>
  );
}

/**
 * 絞り込みと「もっと見る」をまとめた状態。一覧を全件出さない約束（CLAUDE.md レイアウト節）を
 * 絞り込みのあとに掛ける（絞った結果が 30 件を超えたときだけ「もっと見る」が出る）。
 */
export function usePastList<T>(
  items: readonly T[],
  at: (item: T) => string,
  text: (item: T) => string,
  step = 30,
) {
  const [filter, setFilter] = useState<PastFilter>(EMPTY_PAST_FILTER);
  const [limit, setLimit] = useState(step);
  // 条件を変えたら先頭から数え直す
  useEffect(() => setLimit(step), [filter, step]);
  // at / text は呼び出し側で毎回作られるので、依存に入れず items と条件だけで計算し直す
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const matched = useMemo(() => filterPast(items, filter, at, text), [items, filter]);
  return {
    filter,
    setFilter,
    matched,
    shown: matched.slice(0, limit),
    hasMore: matched.length > limit,
    showMore: () => setLimit((l) => l + step),
  };
}

export function ShowMoreButton({ onPress }: { onPress: () => void }) {
  return (
    <button type="button" className="ui-btn-ghost min-h-12 self-center px-6 text-lg" onClick={onPress}>
      もっと見る
    </button>
  );
}

/** 絞り込みの結果が0件のとき（記録そのものが無いときと言い分ける） */
export function PastEmpty({ filtered }: { filtered: boolean }) {
  return (
    <p className="ui-card m-0 px-5 py-6 text-lg text-foreground-500">
      {filtered ? "条件に合う記録はありません" : "まだ記録がありません"}
    </p>
  );
}
