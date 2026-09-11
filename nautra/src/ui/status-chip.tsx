import type { CheckLevel } from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";
import { cn } from "@/lib/cn";

/**
 * 状態の札（デザイン正本 `design/poc_design` の `CHIP` / `ICON`）。
 *
 * 要件定義書 3.2.5「上限接近＝注意 / 超過＝警告」の2段階アラートを、デザインの4状態に
 * そのまま対応させる。色の決まりは次のとおり:
 *
 * - **適合(ok) は無彩色**（`#E8E8E8` の下地に `#333333`）。色が付くのは
 *   「見なければならないとき」だけにし、画面が信号だらけになるのを防ぐ。
 * - **注意(caution) はブロンズ**（`#EFE9E1` / `#6F5638`）。デザインのアクセント系。
 * - **警告(violation) はレンガ**（`#F2E2DF` / `#9B2A1E`）。赤は法令違反のために空けておく。
 * - **色だけに依存させない**。記号（✓ / ⚠ / ✕ / –）と文言を必ず併記する
 *   （色覚特性・直射日光下・白黒印刷でも読めるようにするため）。
 *
 * 実体は `<span>`。HeroUI の `Chip` は `<div>` を描くため `<p>` の中に置けなかったが、
 * この札はインライン要素なので文中にも置ける（ガードレール11の制約を構造ごと解消した）。
 */
const LEVEL_CLASS: Record<CheckLevel | "none", string> = {
  ok: "bg-default-100 text-foreground-700",
  caution: "bg-warning-100 text-warning-700",
  violation: "bg-danger-100 text-danger",
  none: "bg-transparent text-foreground-400",
};

const ICON: Record<CheckLevel | "none", string> = {
  ok: "✓",
  caution: "⚠",
  violation: "✕",
  none: "–",
};

export function StatusChip({
  level,
  size = "md",
  label,
  className,
}: {
  level: CheckLevel | "none";
  /** `sm` は表の行内など、周囲の文字に合わせて一段落とすときだけ使う */
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-small font-semibold",
        size === "sm" ? "px-1.5 py-px text-xs" : "px-2 py-[3px] text-xs",
        LEVEL_CLASS[level],
        className,
      )}
    >
      <span aria-hidden="true">{ICON[level]}</span>
      {label ?? t.level[level]}
    </span>
  );
}
