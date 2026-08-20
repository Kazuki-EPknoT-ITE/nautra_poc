"use client";

import { HeroUIProvider } from "@heroui/react";
import type { ReactNode } from "react";

/** アプリ全体の UI プロバイダ（packages/ui 相当。HeroUI 直接 import は src/ui 配下のみ許可） */
export function UIProvider({ children }: { children: ReactNode }) {
  return <HeroUIProvider locale="ja-JP">{children}</HeroUIProvider>;
}
