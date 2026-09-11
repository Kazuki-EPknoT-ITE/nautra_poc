"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CREW_MEMBERS, type CrewMember } from "@/lib/crew";

/**
 * 船内サインインの見た目（デザイン正本 `design/poc_design` の `showSignIn`）。
 *
 * 左に「1. ユーザーを選択」、右に「2. PIN（4桁）」を並べ、**一度も画面をめくらずに**
 * サインインが終わるようにする。共用端末は立ったまま手袋で触ることが多く、
 * 押す場所が縦に流れると取り違えが起きるため。
 *
 * 顔写真の枠は 48×58 の四角で、写真が入るまでは頭文字と `PHOTO` の印を出す
 * （空欄にすると「壊れている」と読まれる）。
 */
export function CrewPickerGrid({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (c: CrewMember) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="船員の選択">
      {CREW_MEMBERS.map((c) => {
        const active = selectedId === c.id;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(c)}
            className={cn(
              "flex flex-col items-center justify-center gap-1.5 rounded-small border px-3 py-3.5 transition-colors",
              active
                ? "border-primary bg-warning-100"
                : "border-[var(--ui-hairline)] bg-content1 hover:bg-content2",
            )}
          >
            <span className="flex h-[58px] w-12 flex-col items-center justify-center gap-0.5 border border-[var(--ui-hairline-strong)] bg-[#DFE1E0]">
              <span className="text-2xl font-bold leading-none text-foreground-700">{c.initial}</span>
              <span className="font-mono text-[8px] leading-none tracking-[0.06em] text-foreground-400">
                PHOTO
              </span>
            </span>
            <span className="text-lg font-bold text-foreground-900">
              {active ? <span aria-hidden="true">✓ </span> : null}
              {c.name}
            </span>
            <span className="text-sm text-foreground-500">{c.position}</span>
          </button>
        );
      })}
    </div>
  );
}

/** サインイン画面の白いカード（見出し 16px 太字 + 本文） */
export function LoginCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ui-card px-[18px] py-4", className)}>
      <h2 className="m-0 mb-3 text-xl font-bold text-foreground-900">{title}</h2>
      {children}
    </div>
  );
}

/** PIN の入力済み表示。桁ごとに「●」を点け、残り桁数が一目で分かるようにする */
export function PinDots({ filled, length }: { filled: number; length: number }) {
  return (
    <div className="flex items-center justify-center gap-3" aria-label="入力済みの桁数" aria-live="polite">
      {Array.from({ length }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-small border text-2xl",
            i < filled
              ? "border-primary bg-primary text-primary-foreground"
              : "border-[var(--ui-hairline-strong)] bg-content1 text-transparent",
          )}
        >
          ●
        </span>
      ))}
    </div>
  );
}
