"use client";

import { Card, CardBody, type CardProps } from "@heroui/react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { MODAL_CLASSNAMES } from "./modal-style";

/**
 * 面（packages/ui 相当）。材質は globals.css に定義し、画面はこのコンポーネント経由でのみ
 * 使用する（画面ごとの独自スタイル禁止。基本設計書 6.3 / DESIGN.md）。
 *
 * - SurfaceCard: 主要なパネル。白の紙面 + ヘアライン + ごく浅い影（DESIGN.md「Card」）
 * - SurfaceRow : 一覧行など多数並ぶ面。紙面より一段落とし、主役のカードと競合させない
 * - StatBlock  : 大きな数値の表示（DESIGN.md「Stat Block」）。カードの装飾に頼らず
 *                **型の対比だけ**で数値を主役にする
 */
export function SurfaceCard({ className, ...props }: CardProps) {
  return <Card shadow="none" {...props} className={cn("ui-card", className)} />;
}

export function SurfaceRow({ className, ...props }: CardProps) {
  return <Card shadow="none" {...props} className={cn("ui-row", className)} />;
}

/**
 * 数値の塊（DESIGN.md「Stat Block」）。
 * ラベルは小さく灰色、値は大きく詰めた字間で置く。
 * 色が付くのは法令の2段階アラート（注意・警告）のときだけで、通常は無彩色。
 */
export function StatBlock({
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
    <SurfaceCard className={className}>
      <CardBody className="gap-1">
        <p className="text-xs uppercase text-foreground-500">{label}</p>
        <p
          className={cn(
            "tabular-nums text-3xl font-semibold",
            tone === "danger" && "text-danger",
            tone === "warning" && "text-warning-700",
          )}
        >
          {value}
          {unit ? <span className="ml-1 text-base font-normal text-foreground-500">{unit}</span> : null}
        </p>
        {note ? <p className="text-sm text-foreground-500">{note}</p> : null}
      </CardBody>
    </SurfaceCard>
  );
}

/**
 * モーダルの共通プロパティ。HeroUI のモーダルは既定で body 直下のポータルに描画されるため、
 * テーマクラス（vessel / shore）と CSS 変数が届かず配色が既定値に戻る。
 * ここでテーマ配下（.app-shell）をポータル先に指定し、材質・配色を画面と揃える。
 */
export function useModalProps() {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | undefined>(undefined);
  useEffect(() => {
    setPortalContainer(document.querySelector<HTMLElement>(".app-shell") ?? undefined);
  }, []);
  return { ...MODAL_CLASSNAMES, portalContainer };
}
