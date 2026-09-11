"use client";

import { Card, type CardProps } from "@heroui/react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { MODAL_CLASSNAMES } from "./modal-style";

/**
 * 面（packages/ui 相当）。材質は globals.css に定義し、画面はこのコンポーネント経由でのみ
 * 使用する（画面ごとの独自スタイル禁止。基本設計書 6.3 / デザイン正本 `design/poc_design`）。
 *
 * - SurfaceCard: 主要なパネル。白の紙面 + 淡いヘアライン（4px）。**影は持たせない**
 * - SurfaceRow : 一覧行など多数並ぶ面（3px）
 * - StatBlock  : 大きな数値の表示。カードの装飾に頼らず**型の対比だけ**で数値を主役にする
 */
export function SurfaceCard({ className, ...props }: CardProps) {
  return <Card shadow="none" {...props} className={cn("ui-card", className)} />;
}

export function SurfaceRow({ className, ...props }: CardProps) {
  return <Card shadow="none" {...props} className={cn("ui-row", className)} />;
}

/**
 * 数値の塊（デザインの S-01 統計カード）。
 *
 * ラベルは 12px の灰色、値は 34px の等幅で置く。**枠線と数値の色は、値が 0 を超えた
 * ときだけ**注意（ブロンズ）／警告（レンガ）に変わる。常に赤い数字が並ぶと本当に
 * 赤くなったときに気づけないため、「0 件のときは色を付けない」を構造で守る。
 *
 * `href` を渡すと、その統計が示す画面への入口になる（デザインでは全カードが押せる）。
 */
export function StatBlock({
  label,
  value,
  unit,
  note,
  tone = "none",
  href,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  tone?: "none" | "caution" | "violation";
  href?: string;
  className?: string;
}) {
  /** 0 や「—」のときは色を付けない（注意・警告が意味を失わないようにする） */
  const lit = tone !== "none" && typeof value === "number" && value > 0;
  const body = (
    <>
      <p className="m-0 min-h-9 text-sm leading-normal text-foreground-500">{label}</p>
      <p
        className={cn(
          "mt-2 font-mono text-5xl font-semibold tabular-nums",
          lit && tone === "violation" && "text-danger",
          lit && tone === "caution" && "text-warning-700",
          !lit && "text-foreground-900",
        )}
      >
        {value}
        {unit ? <span className="ml-[3px] text-lg font-normal text-foreground-400">{unit}</span> : null}
      </p>
      {note ? <p className="mt-2.5 text-xs text-primary">{note}</p> : null}
    </>
  );
  const shell = cn(
    "ui-card block w-full px-[18px] pb-[18px] pt-4 text-left",
    lit && tone === "violation" && "border-danger",
    lit && tone === "caution" && "border-primary",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={cn(shell, "transition-colors hover:bg-content2")}>
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
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
