"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CREW_MEMBERS, type CrewMember } from "@/lib/crew";
import { useCrewPhotos } from "@/lib/vessel-hooks";
import { CrewPhoto } from "@/ui";

/**
 * 船内サインインの見た目（デザイン正本 `design/poc_design` の `showSignIn`）。
 *
 * 左に「1. ユーザーを選択」、右に「PIN（4桁）を入力」を並べ、**一度も画面をめくらずに**
 * サインインが終わるようにする。共用端末は立ったまま手袋で触ることが多く、
 * 押す場所が縦に流れると取り違えが起きるため。
 *
 * 寸法・配色はデザインの実測に合わせてある（船員カードは 132px 角丸3px・枠 2px、
 * 選択中はブロンズの枠に淡い下地。顔写真の枠は 48×58 で角を立てる）。
 */
export function CrewPickerGrid({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (c: CrewMember) => void;
}) {
  // 配信済みの顔写真があれば使う（無ければ頭文字と PHOTO の印）
  const photos = useCrewPhotos();

  return (
    <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="船員の選択">
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
              "flex min-h-[132px] flex-col items-center justify-center gap-1.5 rounded-small border-2 px-2.5 py-3.5 transition-colors",
              active
                ? "border-primary bg-[color:var(--accent-bg-soft)]"
                : "border-[var(--ui-hairline)] bg-content1 hover:bg-content2",
            )}
          >
            <CrewPhoto name={c.name} initial={c.initial} src={photos.get(c.id)} size="login" />
            <span className="text-base font-bold text-foreground-900">
              {active ? <span aria-hidden="true">✓ </span> : null}
              {c.name}
            </span>
            <span className="text-xs text-foreground-500">{c.position}</span>
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

/**
 * PIN の入力枠（50×58 の桝を4つ）。
 *
 * 入った桁は **● を出す**だけで、下地は白のまま。**次に入る桝の枠だけ**をブロンズにして
 * 「いまここ」を示す。桝そのものを塗ると、入力済みと現在地の区別が付かなくなるため。
 * 間違えたときは4つとも警告の下地（`#F2E2DF`）に変え、押し間違いに気付けるようにする。
 */
export function PinDots({
  filled,
  length,
  error,
  active,
}: {
  filled: number;
  length: number;
  /** PIN が違ったとき */
  error?: boolean;
  /** 船員が選ばれていて入力できる状態か */
  active?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-center gap-3"
      aria-label="入力済みの桁数"
      aria-live="polite"
    >
      {Array.from({ length }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "flex h-[58px] w-[50px] items-center justify-center rounded-small border text-[22px] leading-none",
            error
              ? "border-danger bg-danger-100 text-danger"
              : i === filled && active
                ? "border-primary bg-content1 text-foreground-800"
                : "border-[var(--ui-hairline-strong)] bg-content1 text-foreground-800",
          )}
        >
          {i < filled ? "●" : ""}
        </span>
      ))}
    </div>
  );
}
