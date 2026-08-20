"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * IndexedDB 等ブラウザ専用 API に依存する画面の SSR/ハイドレーション不整合を防ぐラッパー。
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <>{fallback}</>;
  return <>{children}</>;
}
