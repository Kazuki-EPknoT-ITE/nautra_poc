"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { isItemRequired, parseChoiceOptions, type DraftTemplateItem } from "@/lib/record-templates";
import type { TemplateInputType, TemplateItem } from "@/sync-protocol/records";
import { LineIcon } from "@/ui";

/** 入力の種類（押した順に並べる。よく使うものを左に） */
const INPUT_TYPES: { id: TemplateInputType; label: string }[] = [
  { id: "number", label: "数値" },
  { id: "text", label: "文章" },
  { id: "choice", label: "選択肢" },
  { id: "check", label: "良否" },
  { id: "time", label: "時刻" },
];

interface Row {
  /** 画面の中だけの行の識別子（並べ替えても入力中の欄がずれないように） */
  uid: string;
  key?: string;
  label: string;
  inputType: TemplateInputType;
  unit: string;
  optionsText: string;
  required: boolean;
}

let seq = 0;
const blankRow = (): Row => ({ uid: `new-${++seq}`, label: "", inputType: "number", unit: "", optionsText: "", required: false });

function toRow(it: TemplateItem): Row {
  return {
    uid: it.key,
    key: it.key,
    label: it.label,
    inputType: it.inputType,
    unit: it.unit ?? "",
    optionsText: (it.options ?? []).join("、"),
    required: isItemRequired(it),
  };
}

/**
 * 航海日誌の記録項目を、記録の入力画面の中でそのまま足す・直す・外す・並べ替える（利用者の依頼 2026-10-14
 * 「もっと直感的かつ自由に」）。別の画面で記録種別を選び直させず、いま開いている種類の項目を目の前で直す。
 * 変更は「配信する」で1つの新しい版にまとめて送る（過去の記録は当時の版のまま）。
 */
export function TemplateItemsEditor({
  items,
  startWithNewRow,
  typeName,
  onSave,
  onRetire,
  onCancel,
}: {
  items: TemplateItem[];
  /** 「＋ 項目を足す」から開いたときは、空の行を1つ足した状態で始める */
  startWithNewRow: boolean;
  /** 船長・陸上が作った種類なら、その名前（名前の変更・しまうを出す） */
  typeName?: string;
  onSave: (items: DraftTemplateItem[], name?: string) => Promise<void>;
  onRetire?: () => Promise<void>;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => [...items.map(toRow), ...(startWithNewRow ? [blankRow()] : [])]);
  const [name, setName] = useState(typeName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const lastLabel = useRef<HTMLInputElement | null>(null);
  const [focusNew, setFocusNew] = useState(startWithNewRow);

  // 足した行の項目名にすぐ打ち込めるようにする
  useEffect(() => {
    if (focusNew) {
      lastLabel.current?.focus();
      setFocusNew(false);
    }
  }, [focusNew, rows.length]);

  const update = (uid: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await onSave(
        rows.map((r) => ({
          key: r.key,
          label: r.label,
          inputType: r.inputType,
          unit: r.unit,
          options: r.inputType === "choice" ? parseChoiceOptions(r.optionsText) : undefined,
          required: r.required,
        })),
        typeName !== undefined ? name : undefined,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="記録項目の編集" className="flex flex-col gap-3 rounded-[3px] border border-[var(--accent)] p-3">
      {typeName !== undefined ? (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-foreground-600">記録の種類の名前</span>
          <input className="ui-field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      ) : null}

      {rows.length === 0 ? <p className="m-0 text-foreground-600">追加の記録項目はありません</p> : null}

      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((r, i) => (
          <li key={r.uid} className="ui-inset flex flex-col gap-2 p-3">
            <div className="flex items-center gap-2">
              <input
                ref={i === rows.length - 1 ? lastLabel : undefined}
                aria-label={`${i + 1}番目の項目名`}
                placeholder="項目名（例: 燃料残量）"
                className="ui-field min-w-0 flex-1"
                value={r.label}
                onChange={(e) => update(r.uid, { label: e.target.value })}
              />
              <button
                type="button"
                aria-label={`「${r.label || "この項目"}」を上へ`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className="ui-btn-quiet min-h-10 min-w-10 !text-lg disabled:opacity-40"
              >
                <span aria-hidden="true">↑</span>
              </button>
              <button
                type="button"
                aria-label={`「${r.label || "この項目"}」を下へ`}
                disabled={i === rows.length - 1}
                onClick={() => move(i, 1)}
                className="ui-btn-quiet min-h-10 min-w-10 !text-lg disabled:opacity-40"
              >
                <span aria-hidden="true">↓</span>
              </button>
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((x) => x.uid !== r.uid))}
                className="ui-btn-quiet min-h-10 !text-base"
              >
                外す
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div role="radiogroup" aria-label="入力の種類" className="flex flex-wrap gap-1">
                {INPUT_TYPES.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    role="radio"
                    aria-checked={r.inputType === x.id}
                    onClick={() => update(r.uid, { inputType: x.id })}
                    className={cn("ui-btn-quiet min-h-10 !px-3 !text-base", r.inputType === x.id && "ui-btn-selected")}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
              {r.inputType === "number" ? (
                <input
                  aria-label="単位"
                  placeholder="単位（例: kL）"
                  className="ui-field !w-32"
                  value={r.unit}
                  onChange={(e) => update(r.uid, { unit: e.target.value })}
                />
              ) : null}
              {r.inputType !== "check" ? (
                <label className="flex min-h-10 items-center gap-2 text-base">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--accent)]"
                    checked={r.required}
                    onChange={(e) => update(r.uid, { required: e.target.checked })}
                  />
                  必須
                </label>
              ) : null}
            </div>
            {r.inputType === "choice" ? (
              <input
                aria-label="選択肢"
                placeholder="選択肢を「、」で区切って入力（例: 良好、やや不良、不良）"
                className="ui-field"
                value={r.optionsText}
                onChange={(e) => update(r.uid, { optionsText: e.target.value })}
              />
            ) : null}
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => {
          setRows((rs) => [...rs, blankRow()]);
          setFocusNew(true);
        }}
        className="ui-btn-ghost min-h-12 self-start px-4 text-lg"
      >
        <LineIcon name="plus" size={20} />
        項目を足す
      </button>

      {error ? <p className="m-0 text-danger">✕ {error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        {onRetire ? (
          confirmRetire ? (
            <span className="flex flex-wrap items-center gap-2">
              <span>この種類をしまいますか（過去の記録は残ります）</span>
              <button type="button" className="ui-btn-danger min-h-10 px-3" disabled={busy} onClick={() => void onRetire()}>
                しまう
              </button>
              <button type="button" className="ui-btn-quiet min-h-10 !text-base" onClick={() => setConfirmRetire(false)}>
                やめる
              </button>
            </span>
          ) : (
            <button type="button" className="ui-btn-quiet min-h-10 !text-base" onClick={() => setConfirmRetire(true)}>
              この種類をしまう
            </button>
          )
        ) : null}
        <span className="flex-1" />
        <button type="button" className="ui-btn-ghost min-h-12 px-4 text-lg" onClick={onCancel}>
          やめる
        </button>
        <button type="button" className="ui-btn-primary min-h-12 px-4 text-lg" disabled={busy} onClick={() => void save()}>
          項目を配信する
        </button>
      </div>
    </section>
  );
}
