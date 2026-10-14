"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { isItemRequired, parseChoiceOptions, type DraftTemplateItem } from "@/lib/record-templates";
import type { TemplateInputType, TemplateItem } from "@/sync-protocol/records";
import { LineIcon } from "@/ui";

/**
 * 答え方（よく使うものを左に）。仕組みの言葉（数値・文章・選択肢・良否）ではなく、
 * 記録する人が何をするかで書く（利用者の指摘 2026-10-14「UI の文字が分かりにくい」）
 */
const INPUT_TYPES: { id: TemplateInputType; label: string }[] = [
  { id: "number", label: "数字を入れる" },
  { id: "text", label: "文字を入れる" },
  { id: "choice", label: "選んで答える" },
  { id: "check", label: "良・不良で答える" },
  { id: "time", label: "時刻を入れる" },
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

/** 入力欄の見出し（見える文字で置く。placeholder を見出しの代わりにしない） */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-bold text-foreground-700">{children}</span>;
}

/** 入力例（欄の下に置く。打ち始めても消えないように placeholder にしない） */
function FieldHint({ children }: { children: React.ReactNode }) {
  return <span className="text-sm text-foreground-600">{children}</span>;
}

/**
 * 航海日誌の「記録する項目」を、記録の入力画面の中でそのまま増やす・直す・外す・並べ替える（利用者の依頼 2026-10-14
 * 「もっと直感的かつ自由に」）。別の画面で種類を選び直させず、いま開いている種類の項目を目の前で直す。
 * 変更は「この内容で保存する」で1つの新しい版にまとめて全員の端末へ送る（過去の記録は当時の版のまま）。
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
  /** 「＋ 記録する項目を増やす」から開いたときは、空の行を1つ足した状態で始める */
  startWithNewRow: boolean;
  /** 船長・陸上が作った種類なら、その名前（名前の変更・使わなくするを出す） */
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

  // 増やした行の項目名にすぐ打ち込めるようにする
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
    <section aria-label="記録する項目の編集" className="flex flex-col gap-3 rounded-[3px] border border-[var(--accent)] p-3">
      <h3 className="m-0 text-lg font-bold">記録する項目を編集しています</h3>

      {typeName !== undefined ? (
        <label className="flex flex-col gap-1">
          <FieldLabel>種類の名前</FieldLabel>
          <input className="ui-field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      ) : null}

      {rows.length === 0 ? <p className="m-0 text-foreground-600">まだ項目がありません</p> : null}

      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((r, i) => {
          const isNew = !r.key;
          const hintId = `${r.uid}-hint`;
          return (
            <li key={r.uid} aria-label={`${i + 1}つ目の項目`} className="ui-inset flex flex-col gap-3 p-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
                  <FieldLabel>{i + 1}つ目の項目名</FieldLabel>
                  <input
                    ref={i === rows.length - 1 ? lastLabel : undefined}
                    className="ui-field"
                    value={r.label}
                    aria-describedby={isNew ? hintId : undefined}
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
                  onClick={() => setRows((rs) => rs.filter((x) => x.uid !== r.uid))}
                  className="ui-btn-quiet min-h-11 !text-base"
                >
                  この項目を外す
                </button>
              </div>
              {isNew ? <FieldHint><span id={hintId}>例: 燃料残量、バラスト水量、水先人の乗船時刻</span></FieldHint> : null}

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

      <button
        type="button"
        onClick={() => {
          setRows((rs) => [...rs, blankRow()]);
          setFocusNew(true);
        }}
        className="ui-btn-ghost min-h-12 self-start px-4 text-lg"
      >
        <LineIcon name="plus" size={20} />
        項目をもう1つ増やす
      </button>

      {error ? (
        <p role="alert" className="m-0 text-danger">
          ✕ {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {onRetire ? (
          confirmRetire ? (
            <span className="flex flex-wrap items-center gap-2">
              <span>「{typeName}」を使わなくしますか（これまでの記録は残ります）</span>
              <button type="button" className="ui-btn-danger min-h-11 px-3" disabled={busy} onClick={() => void onRetire()}>
                使わなくする
              </button>
              <button type="button" className="ui-btn-quiet min-h-11 !text-base" onClick={() => setConfirmRetire(false)}>
                やめる
              </button>
            </span>
          ) : (
            <button type="button" className="ui-btn-quiet min-h-11 !text-base" onClick={() => setConfirmRetire(true)}>
              この種類を使わなくする
            </button>
          )
        ) : null}
        <span className="flex-1" />
        <button type="button" className="ui-btn-ghost min-h-12 px-4 text-lg" onClick={onCancel}>
          編集をやめる
        </button>
        <button type="button" className="ui-btn-primary min-h-12 px-4 text-lg" disabled={busy} onClick={() => void save()}>
          この内容で保存する
        </button>
      </div>
    </section>
  );
}
