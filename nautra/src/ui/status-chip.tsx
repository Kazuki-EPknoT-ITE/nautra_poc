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

/**
 * 札にマウスを載せたときに出す説明（レビュー LABOR-05 / 0-6）。
 * 呼び出し側が理由を知っているときは `hint` で具体的な文を渡す。渡さないときも、
 * 注意・警告の札には**何を意味するか**だけは必ず出す（説明の無い赤札を残さない）。
 */
const DEFAULT_HINT: Partial<Record<CheckLevel | "none", string>> = {
  caution: "注意: 上限や期限に近づいています。早めに確認してください。",
  violation: "警告: 基準を満たしていません。すぐに確認・対応が必要です。",
};

export function StatusChip({
  level,
  size = "md",
  label,
  hint,
  className,
}: {
  level: CheckLevel | "none";
  /** `sm` は表の行内など、周囲の文字に合わせて一段落とすときだけ使う */
  size?: "sm" | "md" | "lg";
  label?: string;
  /** ホバーで出す説明。省略すると注意・警告だけ既定の説明を出す。`false` で出さない */
  hint?: string | false;
  className?: string;
}) {
  const tip = hint === false ? null : (hint ?? DEFAULT_HINT[level] ?? null);
  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-small font-semibold",
        size === "sm" ? "px-1.5 py-px text-xs" : size === "lg" ? "px-2.5 py-1 text-base" : "px-2 py-[3px] text-xs",
        LEVEL_CLASS[level],
        tip && "cursor-help",
        className,
      )}
    >
      <span aria-hidden="true">{ICON[level]}</span>
      {label ?? t.level[level]}
      {tip ? <span className="sr-only">（{tip}）</span> : null}
    </span>
  );
  if (!tip) return chip;
  // 吹き出しは札の下に出す（表の先頭行でも見出しに隠れないように）。札はリンクの中にも置かれるので
  // フォーカスを持たせない（入れ子の操作要素にしない）。読み上げには札の中の sr-only の文で届ける
  return (
    <span data-tip="" className="group/tip relative inline-flex">
      {chip}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-full z-40 mt-1.5 hidden w-max max-w-[320px] whitespace-normal rounded-small bg-[#231F20] px-3 py-2 text-left text-sm font-normal leading-normal text-white group-hover/tip:block"
      >
        {tip}
      </span>
    </span>
  );
}
