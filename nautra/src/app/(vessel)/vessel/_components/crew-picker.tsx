"use client";

import { cn } from "@/lib/cn";
import { CREW_MEMBERS, type CrewMember } from "@/lib/crew";
import { Avatar, ScrollShadow } from "@/ui";

/**
 * 打刻者選択（共用端末: 顔写真リストから選択する方式の PoC 表現。基本設計書 11.3）。
 * 選択中はガラス面を明るくし、枠線とチェック記号で「色だけに依存しない」表示にする（6.3）。
 */
export function CrewPicker({
  selected,
  onSelect,
}: {
  selected: CrewMember;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollShadow orientation="horizontal" hideScrollBar className="w-full">
      <div className="flex gap-2 py-1" role="radiogroup" aria-label="打刻者の選択">
        {CREW_MEMBERS.map((c) => {
          const active = c.id === selected.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(c.id)}
              className={cn(
                "glass-tile flex min-w-24 shrink-0 flex-col items-center gap-1 px-3 py-2",
                active
                  ? "border-2 border-primary bg-primary/10"
                  : "border-[var(--glass-border)]",
              )}
            >
              <Avatar
                name={c.initial}
                color={active ? "primary" : "default"}
                size="lg"
                className="text-xl font-bold"
              />
              <span className="text-sm font-semibold">
                {active ? <span aria-hidden="true">✓ </span> : null}
                {c.name.split(" ")[0]}
              </span>
              <span className="text-xs text-foreground-400">{c.position}</span>
            </button>
          );
        })}
      </div>
    </ScrollShadow>
  );
}
