import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * アプリの外枠。HeroUI のテーマクラス（vessel / shore）と、リキッドガラスが屈折する
 * 下地レイヤ（.app-shell）を適用する（基本設計書 6.3）。
 * 背景は globals.css の --app-bg（固定レイヤ）が描画するため bg-background は付けない。
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
