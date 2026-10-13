"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Eyebrow } from "./section";

/**
 * 画面の上に重ねる問い合わせ（デザイン正本 `design/poc_design` の
 * `genericOpen` / `deleteDialogOpen` / `genericFlashOpen`）。
 *
 * HeroUI の Modal ではなく素の要素で組む。デザインの寸法（幅 520/560px・角 6px・
 * 影 `0 24px 60px`・暗幕 45〜50%）をそのまま持たせるためで、材質は `.ui-modal` に閉じる。
 *
 * どのダイアログも **Esc で閉じ、開いている間は背面を触らせない**。破壊的な操作
 * （削除・差戻し）は「やめる」を左に置き、確認を1つ通さないと主ボタンを押せない。
 */
function Overlay({
  onClose,
  children,
  labelledBy,
  z = "z-[80]",
}: {
  onClose: () => void;
  children: ReactNode;
  labelledBy: string;
  z?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className={cn("fixed inset-0 flex items-center justify-center bg-[rgba(10,10,10,0.45)] p-10", z)}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="ui-modal w-full overflow-hidden outline-none"
        style={{ maxWidth: 560 }}
      >
        {children}
      </div>
    </div>
  );
}

/** 確認（デザインの「操作の確認」）。取り返しのつく操作に使う */
export function ConfirmDialog({
  open,
  eyebrow = "操作の確認",
  title,
  body,
  primaryLabel,
  cancelLabel = "やめる",
  tone = "primary",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  eyebrow?: string;
  title: ReactNode;
  body?: ReactNode;
  primaryLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const id = useId();
  if (!open) return null;
  return (
    <Overlay onClose={onCancel} labelledBy={id} z="z-[90]">
      <div className="border-b border-[var(--ui-hairline)] px-6 pb-4 pt-5">
        <Eyebrow tone={tone === "danger" ? "alert" : "accent"}>{eyebrow}</Eyebrow>
        <h2 id={id} className="mt-2 text-2xl font-bold leading-snug text-foreground-900">
          {title}
        </h2>
        {body ? <div className="mt-2.5 text-base leading-relaxed text-foreground-700">{body}</div> : null}
      </div>
      <div className="flex gap-3 px-6 pb-5 pt-4">
        <button type="button" onClick={onCancel} className="ui-btn-ghost min-h-[46px] flex-[0_0_150px]">
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={cn("min-h-[46px] flex-1", tone === "danger" ? "ui-btn-danger" : "ui-btn-primary")}
        >
          {primaryLabel}
        </button>
      </div>
    </Overlay>
  );
}

/**
 * 削除・無効化（デザインの `deleteDialogOpen`）。
 *
 * 要件定義書 12 の「一次記録は消えない」を、利用者に**先に**見せるためのダイアログ。
 * 何が外れ、何が残るかを列挙し、チェックを1つ通すまで実行ボタンを押せなくする。
 * 既定は「無効化・アーカイブ」で、完全削除は選び直さないと届かない位置に置く。
 */
export function DeleteDialog({
  open,
  kind,
  name,
  modes,
  mode,
  onModeChange,
  effects,
  runLabel,
  onCancel,
  onRun,
}: {
  open: boolean;
  kind: string;
  name: ReactNode;
  modes: { value: string; label: string }[];
  mode: string;
  onModeChange: (v: string) => void;
  effects: ReactNode[];
  runLabel: string;
  onCancel: () => void;
  onRun: () => void;
}) {
  const id = useId();
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (!open) setConfirmed(false);
  }, [open]);
  if (!open) return null;
  return (
    <Overlay onClose={onCancel} labelledBy={id}>
      <div className="border-b border-[var(--ui-hairline)] px-6 pb-4 pt-5">
        <Eyebrow tone="alert">{kind} の削除・無効化</Eyebrow>
        <h2 id={id} className="mt-2 text-3xl font-bold leading-snug text-foreground-900">
          {name}
        </h2>
      </div>
      <div className="flex flex-col gap-3.5 px-6 py-[18px]">
        <div>
          <p className="mb-[7px] text-sm text-foreground-500">処理のしかた</p>
          <div className="flex gap-2.5">
            {modes.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => onModeChange(m.value)}
                aria-pressed={mode === m.value}
                className={cn("ui-btn-ghost flex-1", mode === m.value && "ui-btn-selected")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-[7px] text-sm text-foreground-500">影響するもの</p>
          <div className="ui-inset flex flex-col gap-[7px] px-3.5 py-3">
            {effects.map((e, i) => (
              <p key={i} className="m-0 text-base leading-relaxed text-foreground-700">
                ・{e}
              </p>
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-left">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="h-[18px] w-[18px] accent-[color:var(--alert)]"
          />
          <span className="text-base leading-relaxed text-foreground-800">
            影響を確認しました。30日以内は「削除・アーカイブ」から復元できます
          </span>
        </label>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="ui-btn-ghost min-h-12 flex-[0_0_160px]">
            やめる
          </button>
          <button
            type="button"
            onClick={onRun}
            disabled={!confirmed}
            className="ui-btn-danger min-h-12 flex-1 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {runLabel}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/**
 * 実行結果の一言（デザインの `genericFlashOpen`）。画面下中央に暗い帯で出し、数秒で消える。
 * 記録そのものは画面に反映済みなので、ここは「何が起きたか」を伝えるだけにする。
 */
export function FlashToast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, 4000);
    return () => clearTimeout(id);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="ui-dark fixed bottom-7 left-1/2 z-[95] max-w-[640px] -translate-x-1/2 px-5 py-3.5 shadow-modal"
    >
      <p className="m-0 text-lg leading-relaxed text-white">{message}</p>
    </div>
  );
}
