"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { isItemRequired, parseChoiceOptions, type DraftTemplateItem } from "@/lib/record-templates";
import type { TemplateInputType, TemplateItem } from "@/sync-protocol/records";

/**
 * 答え方（よく使うものを左に）。仕組みの言葉（数値・文章・選択肢・良否）ではなく、
 * 記録する人が何をするかで書く（利用者の指摘 2026-10-14「UI の文字が分かりにくい」）
 */
export const INPUT_TYPES: { id: TemplateInputType; label: string }[] = [
  { id: "number", label: "数字を入れる" },
  { id: "text", label: "文字を入れる" },
  { id: "choice", label: "選んで答える" },
  { id: "check", label: "良・不良で答える" },
  { id: "time", label: "時刻を入れる" },
];

/** 編集中の1行（画面の中だけの形） */
export interface Row {
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
export const blankRow = (patch: Partial<Row> = {}): Row => ({
  uid: `new-${++seq}`,
  label: "",
  inputType: "text",
  unit: "",
  optionsText: "",
  required: false,
  ...patch,
});

export function toRow(it: TemplateItem): Row {
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

export function rowsToDrafts(rows: Row[]): DraftTemplateItem[] {
  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    inputType: r.inputType,
    unit: r.unit,
    options: r.inputType === "choice" ? parseChoiceOptions(r.optionsText) : undefined,
    required: r.required,
  }));
}

/** 見え方を確かめる画面で使う、行から組み立てた仮の項目 */
export function rowsToPreviewItems(rows: Row[]): TemplateItem[] {
  return rows
    .filter((r) => r.label.trim())
    .map((r) => ({
      key: r.uid,
      label: r.label.trim(),
      group: "",
      inputType: r.inputType,
      unit: r.inputType === "number" ? r.unit.trim() || undefined : undefined,
      options: r.inputType === "choice" ? parseChoiceOptions(r.optionsText) : undefined,
      required: r.inputType === "check" ? undefined : r.required,
    }));
}

/** 入力欄の見出し（見える文字で置く。placeholder を見出しの代わりにしない） */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-bold text-foreground-700">{children}</span>;
}

/** 入力例（欄の下に置く。打ち始めても消えないように placeholder にしない） */
export function FieldHint({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <span id={id} className="text-sm text-foreground-600">
      {children}
    </span>
  );
}

/**
 * 記録する項目の行を並べて編集する（名前・答え方・単位・選べる答え・必須・並べ替え・外す）。
 * 状態は呼び出し側（`LogTypeDesigner`）が持ち、ここは描くだけにする。
 */
export function ItemRowsEditor({
  rows,
  onChange,
  focusUid,
}: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  /** 増やしたばかりの行。項目名の欄にすぐ打ち込めるようにする */
  focusUid?: string;
}) {
  const focusRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    focusRef.current?.focus();
  }, [focusUid]);

  const update = (uid: string, patch: Partial<Row>) => onChange(rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((r, i) => {
        const hintId = `${r.uid}-hint`;
        return (
          <li key={r.uid} aria-label={`${i + 1}つ目の項目`} className="ui-inset flex flex-col gap-3 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
                <FieldLabel>{i + 1}つ目の項目名</FieldLabel>
                <input
                  ref={r.uid === focusUid ? focusRef : undefined}
                  className="ui-field"
                  value={r.label}
                  aria-describedby={!r.key && !r.label ? hintId : undefined}
                  onChange={(e) => update(r.uid, { label: e.target.value })}
                />
              </label>
              <button
                type="button"
                aria-label={`「${r.label || "この項目"}」を上へ移す`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className="ui-btn-quiet min-h-11 min-w-11 !text-lg disabled:opacity-40"
              >
                <span aria-hidden="true">↑</span>
              </button>
              <button
                type="button"
                aria-label={`「${r.label || "この項目"}」を下へ移す`}
                disabled={i === rows.length - 1}
                onClick={() => move(i, 1)}
                className="ui-btn-quiet min-h-11 min-w-11 !text-lg disabled:opacity-40"
              >
                <span aria-hidden="true">↓</span>
              </button>
              <button
                type="button"
                onClick={() => onChange(rows.filter((x) => x.uid !== r.uid))}
                className="ui-btn-quiet min-h-11 !text-base"
              >
                この項目を外す
              </button>
            </div>
            {/* 例は白紙の行にだけ出す（よく使う項目から増やした行に別の例が出ると紛らわしい） */}
            {!r.key && !r.label ? <FieldHint id={hintId}>例: 燃料残量、バラスト水量、水先人の乗船時刻</FieldHint> : null}

            <div className="flex flex-col gap-1">
              <FieldLabel>答え方</FieldLabel>
              <div role="radiogroup" aria-label={`${i + 1}つ目の項目の答え方`} className="flex flex-wrap gap-1">
                {INPUT_TYPES.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    role="radio"
                    aria-checked={r.inputType === x.id}
                    onClick={() => update(r.uid, { inputType: x.id })}
                    className={cn("ui-btn-quiet min-h-11 !px-3 !text-base", r.inputType === x.id && "ui-btn-selected")}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
            </div>

            {r.inputType === "number" ? (
              <label className="flex flex-col gap-1">
                <FieldLabel>単位（なければ空欄）</FieldLabel>
                <input className="ui-field !w-40" value={r.unit} onChange={(e) => update(r.uid, { unit: e.target.value })} />
                <FieldHint>例: kL、t、hPa</FieldHint>
              </label>
            ) : null}

            {r.inputType === "choice" ? (
              <label className="flex flex-col gap-1">
                <FieldLabel>選べる答え</FieldLabel>
                <input className="ui-field" value={r.optionsText} onChange={(e) => update(r.uid, { optionsText: e.target.value })} />
                <FieldHint>「、」で区切って2つ以上入れます。例: 満載、半載、空船</FieldHint>
              </label>
            ) : null}

            {r.inputType !== "check" ? (
              <label className="flex min-h-11 items-center gap-2 text-base">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--accent)]"
                  checked={r.required}
                  onChange={(e) => update(r.uid, { required: e.target.checked })}
                />
                空欄では記録できないようにする（必須）
              </label>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
