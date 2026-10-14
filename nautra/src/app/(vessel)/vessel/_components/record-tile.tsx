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
  // 押すと記録が始まることを、輪郭とブロンズの「＋」の印で見せる（利用者の指摘 2026-10-14:
  // 札がただの表示に見え、上の切り替えを押して入力を探していた）
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className={cn(
        "ui-card record-tile relative flex gap-3 p-4",
        icon ? "min-h-[160px] flex-col items-center justify-center text-center" : "min-h-20 items-center text-left",
        disabled && "opacity-50",
      )}
    >
      {icon ? <LineIcon name={icon} size={56} className="mb-1 text-primary" /> : null}
      <span className={cn("flex min-w-0 flex-col gap-1", !icon && "flex-1")}>
        <span className={cn("text-balance font-bold leading-tight", icon ? "text-xl" : "text-lg")}>{label}</span>
        {sublabel ? <span className="text-sm text-foreground-600">{sublabel}</span> : null}
      </span>
      <RecordMark className={icon ? "absolute right-2 top-2" : undefined} />
    </button>
  );
}

/** 記録を始める札の印（ブロンズの輪郭の中に「＋」）。機器の札など RecordTile 以外の入口にも付ける */
export function RecordMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("record-mark", className)}>
      <LineIcon name="plus" size={20} />
    </span>
  );
}
