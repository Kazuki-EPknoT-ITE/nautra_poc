"use client";

import { Chip } from "@heroui/react";
import type { CheckLevel } from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";

/**
 * 2段階アラート表示（要件定義書 3.2.5「上限接近＝注意（黄）/ 超過＝警告（赤）」）。
 *
 * DESIGN.md はモノクロームを基本とし、有彩色は `#e7000b`（エラー）だけを許す。
 * ここはその**唯一の意図的な例外**で、法令が求める状態表示のために色を使う。
 * ただし範囲は最小限にとどめる:
 *
 * - **適合(ok) は無彩色**（DESIGN.md「Badge — Soft」そのまま）。
 *   色が付くのは「見なければならないとき」だけにし、画面が信号だらけになるのを防ぐ。
 * - 注意(caution) は琥珀、警告(violation) は Ember（エラー色）。
 * - **色だけに依存させない**。記号（✓ / ⚠ / ✕）と文言を必ず併記する
 *   （色覚特性・直射日光下・白黒印刷でも読めるようにするため）。
 */
const LEVEL_STYLE: Record<
  CheckLevel | "none",
  { color: "success" | "warning" | "danger" | "default"; icon: string }
> = {
  ok: { color: "success", icon: "✓" }, // success はテーマ側で無彩色に割り当ててある
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
    <Chip color={style.color} size={size} variant="flat" radius="full">
      <span aria-hidden="true">{style.icon}</span> {label ?? t.level[level]}
    </Chip>
  );
}
