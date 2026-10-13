"use client";

import { cn } from "@/lib/cn";
import { LineIcon, type LineIconName } from "@/ui";

/**
 * 記録の入口タイル（航海日誌・点検・操練・検知で共用）。
 * 出港/入港/出港前点検/安全パトロールなど、同じ「記録を始める」操作は
 * 見た目を揃える（種別ごとに色を変えない。基本設計書 6.3 / デザイン節）。
 * 打刻の作業タイルと同じ紙面・同じ高さにして、船内アプリ全体で操作感を統一する。
 */
export function RecordTile({
  label,
  sublabel,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  sublabel?: string;
  /** 絵を添えると、絵を主役にした大きなタイルになる（レビュー TASKREC-02: 文字を読まずに選べる） */
  icon?: LineIconName;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className={cn(
        "ui-card flex flex-col justify-center gap-1 border-2 border-transparent p-4",
        icon ? "min-h-[160px] items-center text-center" : "min-h-20 items-start text-left",
        disabled && "opacity-50",
      )}
    >
      {icon ? <LineIcon name={icon} size={56} className="mb-1 text-primary" /> : null}
      <span className={cn("font-bold leading-tight", icon ? "text-xl" : "text-lg")}>{label}</span>
      {sublabel ? <span className="text-sm text-foreground-600">{sublabel}</span> : null}
    </button>
  );
}
