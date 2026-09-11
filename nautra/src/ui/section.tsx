import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 区画（デザイン正本 `design/poc_design` の `<section style="background:#FFFFFF;border:1px solid
 * #E8E8E8;border-radius:4px">`）。
 *
 * デザインは画面を「白いカードの積み重ね」で組み立てる。見出しは 14px の太字、右肩に
 * 11px の補足か操作を置き、本文との間は**濃いヘアライン**（`#CCCCCC`）で切る。
 * 画面側がこの寸法を書き分けないよう、ここに1つだけ定義する（基本設計書 6.3）。
 */
export function Section({
  title,
  note,
  actions,
  children,
  className,
  bodyClassName,
  /** 見出しと本文のあいだの区切り線。表を直に置くときだけ true（デザインの実測） */
  divided = true,
}: {
  title?: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  divided?: boolean;
}) {
  return (
    <section className={cn("ui-card", className)}>
      {title || note || actions ? (
        <div
          className={cn(
            "flex flex-wrap items-baseline justify-between gap-3 px-[18px] pb-3 pt-4",
            divided && "border-b border-[var(--ui-hairline-strong)]",
          )}
        >
          <h2 className="m-0 text-lg font-bold text-foreground-900">
            {title}
            {note ? (
              <span className="ml-2.5 text-sm font-normal text-foreground-500">{note}</span>
            ) : null}
          </h2>
          {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
        </div>
      ) : null}
      {children ? <div className={cn("px-[18px] py-4", bodyClassName)}>{children}</div> : null}
    </section>
  );
}

/**
 * 符牒（デザインの `font-family:'IBM Plex Mono';font-size:11px;letter-spacing:0.1em;color:#917351`）。
 * モーダルの種別表示や、群の見出しに使う。
 */
export function Eyebrow({
  children,
  tone = "accent",
  className,
}: {
  children: ReactNode;
  tone?: "accent" | "alert" | "muted";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "m-0 font-mono text-xs tracking-[0.1em]",
        tone === "accent" && "text-primary",
        tone === "alert" && "text-danger",
        tone === "muted" && "text-foreground-500",
        className,
      )}
    >
      {children}
    </p>
  );
}
