"use client";

import { Chip } from "@heroui/react";
import type { CheckLevel } from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";

/**
 * 2段階アラート表示（注意=黄 / 警告=赤）。
 * 色だけに依存せず、アイコン文字と文言を併記する（基本設計書 6.3）。
 */
const LEVEL_STYLE: Record<
  CheckLevel | "none",
  { color: "success" | "warning" | "danger" | "default"; icon: string }
> = {
  ok: { color: "success", icon: "✓" },
  caution: { color: "warning", icon: "⚠" },
  violation: { color: "danger", icon: "✕" },
  none: { color: "default", icon: "–" },
};

export function StatusChip({
  level,
  size = "md",
  label,
}: {
  level: CheckLevel | "none";
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  const style = LEVEL_STYLE[level];
  return (
    <Chip color={style.color} size={size} variant="flat" radius="sm">
      <span aria-hidden="true">{style.icon}</span> {label ?? t.level[level]}
    </Chip>
  );
}
