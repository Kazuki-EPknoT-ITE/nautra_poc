"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * 絞り込みの入力欄（デザイン正本 `design/poc_design` の `search*`）。
 *
 * デザインはどの一覧にも同じ形の欄を置く: **左に ⌕、右に ✕**、高さ 34px、細いヘアライン。
 * 入れた文字を1タップで消せることが要点で、消すたびにキーを連打させない。
 *
 * 値の持ち先は呼び出し側が決める:
 * - 画面内で絞るだけなら `value` / `onChange`（制御）
 * - URL に持たせるなら `<form>` の中に置いて `defaultValue` と `name` を渡す（非制御）
 */
export function SearchField({
  name,
  value,
  defaultValue,
  onChange,
  onClear,
  placeholder = "氏名・職名でしぼる",
  className,
  ariaLabel,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const controlled = value !== undefined;
  const hasQuery = controlled ? value.length > 0 : undefined;

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <span aria-hidden="true" className="pointer-events-none absolute left-2.5 text-base text-foreground-400">
        ⌕
      </span>
      <input
        ref={ref}
        type="search"
        name={name}
        aria-label={ariaLabel ?? placeholder}
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => onChange?.(e.target.value)}
        className="h-[34px] w-full rounded-small border border-[var(--ui-hairline-strong)] bg-content1 px-8 text-sm text-foreground-800 [&::-webkit-search-cancel-button]:hidden"
      />
      {hasQuery === undefined || hasQuery ? (
        <button
          type="button"
          aria-label="入力を消す"
          onClick={() => {
            if (ref.current) ref.current.value = "";
            onChange?.("");
            onClear?.();
            ref.current?.focus();
          }}
          className={cn(
            "absolute right-[7px] flex h-5 w-5 items-center justify-center rounded-full bg-default-100 text-xs leading-none text-foreground-700",
            hasQuery === undefined && "peer-placeholder-shown:hidden",
          )}
        >
          ✕
        </button>
      ) : null}
    </span>
  );
}
