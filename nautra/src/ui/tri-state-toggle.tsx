"use client";

import { Button } from "@heroui/react";
import { cn } from "@/lib/cn";

/**
 * 点検チェックリストの項目判定トグル（良 / 不良 / 該当なし）。
 * 手袋操作を想定し各ボタン高さ 48px 以上。色だけに依存せずアイコン文字を併記（基本設計書 6.3）。
 */
export type TriState = "ok" | "ng" | "na";

const OPTIONS: { value: TriState; label: string; icon: string; color: "success" | "danger" | "default" }[] = [
  { value: "ok", label: "良", icon: "✓", color: "success" },
  { value: "ng", label: "不良", icon: "✕", color: "danger" },
  { value: "na", label: "該当なし", icon: "–", color: "default" },
];

export function TriStateToggle({
  value,
  onChange,
  ariaLabel,
}: {
  value: TriState | null;
  onChange: (v: TriState) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-1">
      {OPTIONS.map((o) => {
        const active = value === o.value;
        return (
          <Button
            key={o.value}
            role="radio"
            aria-checked={active}
            size="sm"
            radius="sm"
            color={active ? o.color : "default"}
            variant={active ? "solid" : "bordered"}
            onPress={() => onChange(o.value)}
            className={cn("min-h-12 min-w-16 px-2 text-sm font-semibold", !active && "border-foreground-300")}
          >
            <span aria-hidden="true">{o.icon}</span> {o.label}
          </Button>
        );
      })}
    </div>
  );
}
