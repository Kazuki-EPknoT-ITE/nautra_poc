"use client";

import { cn } from "@/lib/cn";
import { CREW_MEMBERS, type CrewMember } from "@/lib/crew";
import { Avatar } from "@/ui";

/**
 * 打刻者選択（共用端末: 顔写真リストから選択する方式の PoC 表現。基本設計書 11.3）。
 */
export function CrewPicker({
  selected,
  onSelect,
}: {
  selected: CrewMember;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto py-1" role="radiogroup" aria-label="打刻者の選択">
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
              "flex min-w-24 flex-col items-center gap-1 rounded-large border-2 px-3 py-2",
              active ? "border-primary bg-content2" : "border-transparent bg-content1",
            )}
          >
            <Avatar
              name={c.initial}
              color={active ? "primary" : "default"}
              size="lg"
              className="text-xl font-bold"
            />
            <span className="text-sm font-semibold">{c.name.split(" ")[0]}</span>
            <span className="text-xs text-foreground-500">{c.position}</span>
          </button>
        );
      })}
    </div>
  );
}
