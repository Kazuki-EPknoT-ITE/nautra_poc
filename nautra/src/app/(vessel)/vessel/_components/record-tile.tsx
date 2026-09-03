"use client";

import { cn } from "@/lib/cn";

/**
 * 記録の入口タイル（航海日誌・点検・操練・検知で共用）。
 * 出港/入港/出港前点検/安全パトロールなど、同じ「記録を始める」操作は
 * 見た目を揃える（種別ごとに色を変えない。基本設計書 6.3 / デザイン節）。
 * 打刻の作業タイルと同じ紙面・同じ高さにして、船内アプリ全体で操作感を統一する。
 */
export function RecordTile({
  label,
  sublabel,
  onPress,
  disabled = false,
}: {
  label: string;
  sublabel?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className={cn(
        "ui-card flex min-h-20 flex-col items-start justify-center gap-1 border-2 border-transparent p-4 text-left",
        disabled && "opacity-50",
      )}
    >
      <span className="text-lg font-bold leading-tight">{label}</span>
      {sublabel ? <span className="text-sm text-foreground-600">{sublabel}</span> : null}
    </button>
  );
}
