"use client";

import { Button } from "@heroui/react";
import { cn } from "@/lib/cn";

/**
 * 打刻ボタン（V-01）。片手・手袋操作を想定し高さ 64px 以上・大文字（基本設計書 6.3）。
 */
export function PunchButton({
  label,
  sublabel,
  onPress,
  active = false,
  danger = false,
  disabled = false,
}: {
  label: string;
  sublabel?: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      onPress={onPress}
      isDisabled={disabled}
      color={danger ? "danger" : active ? "primary" : "default"}
      variant={danger || active ? "solid" : "bordered"}
      radius="lg"
      className={cn(
        "min-h-16 h-auto w-full py-3 text-xl font-bold",
        // 未選択は白の紙面 + ヘアラインの輪郭（DESIGN.md「Outline Button」）。
        // 作業中との違いは色相ではなく**明度の反転**で示す（黒塗り ⇔ 白地）
        !active && !danger && "bg-content1 border-[var(--ui-hairline)] text-foreground",
      )}
    >
      <span className="flex flex-col items-center gap-0.5">
        <span>{label}</span>
        {sublabel ? <span className="text-sm font-normal opacity-80">{sublabel}</span> : null}
      </span>
    </Button>
  );
}
