"use client";

import { Card, CardBody, type CardProps } from "@heroui/react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { GLASS_MODAL_CLASSNAMES } from "./modal-style";

/**
 * リキッドガラスの面（packages/ui 相当）。材質は globals.css に定義し、
 * 画面はこのコンポーネント経由でのみ使用する（画面ごとの独自スタイル禁止。基本設計書 6.3）。
 *
 * - GlassCard: 主要なパネル。`blurred` を付けた面だけが背後をぼかす（描画コスト対策）
 * - GlassRow : 一覧行など多数並ぶ面（ぼかしなし）
 * - GlassPanel: セクション見出しを持つ素の div ラッパー（Server Component からも使える）
 */
export function GlassCard({
  className,
  blurred = false,
  ...props
}: CardProps & { blurred?: boolean }) {
  return (
    <Card
      shadow="none"
      {...props}
      className={cn("glass-tile", blurred && "glass-blur", className)}
    />
  );
}

export function GlassRow({ className, ...props }: CardProps) {
  return <Card shadow="none" {...props} className={cn("glass-row", className)} />;
}

export function GlassStat({
  label,
  value,
  unit,
  note,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  tone?: "default" | "danger" | "warning";
  className?: string;
}) {
  return (
    <GlassCard blurred className={className}>
      <CardBody className="gap-1">
        <p className="text-sm text-foreground-500">{label}</p>
        <p
          className={cn(
            "tabular-nums text-3xl font-bold",
            tone === "danger" && "text-danger",
            tone === "warning" && "text-warning",
          )}
        >
          {value}
          {unit ? <span className="ml-1 text-base font-normal">{unit}</span> : null}
        </p>
        {note ? <p className="text-xs text-foreground-400">{note}</p> : null}
      </CardBody>
    </GlassCard>
  );
}

/**
 * モーダルの共通プロパティ。HeroUI のモーダルは既定で body 直下のポータルに描画されるため、
 * テーマクラス（vessel / shore）とガラスの CSS 変数が届かず配色が既定値に戻る。
 * ここでテーマ配下（.app-shell）をポータル先に指定し、材質・配色を画面と揃える。
 */
export function useGlassModalProps() {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | undefined>(undefined);
  useEffect(() => {
    setPortalContainer(document.querySelector<HTMLElement>(".app-shell") ?? undefined);
  }, []);
  return { ...GLASS_MODAL_CLASSNAMES, portalContainer };
}
