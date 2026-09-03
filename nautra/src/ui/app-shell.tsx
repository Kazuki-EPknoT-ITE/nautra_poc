import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * アプリの外枠。HeroUI のテーマクラス（vessel / shore）と、DESIGN.md の Canvas（#f5f5f5）を
 * 適用する（基本設計書 6.3）。
 *
 * 背景はグラデーションを持たない単色（DESIGN.md の Don't「グラデーション・色の付いた影・
 * アクセント塗りを使わない」）。層はこの Canvas の上に Surface Alt / Paper を重ねて作る。
 */
export function AppShell({
  theme,
  children,
  className,
}: {
  theme: "vessel" | "shore";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("app-shell text-foreground min-h-dvh", theme, className)}>{children}</div>
  );
}
