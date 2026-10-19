import { cn } from "@/lib/cn";

/**
 * 手順の帯（デザイン正本 `design/poc_design` の S-07 届出ウィザード）。
 *
 * カードの上辺に手順を横一列で並べ、**いまどこにいて、次に何が起きるか**を常に見せる。
 * 番号の丸は「済み＝ブロンズの塗り」「いま＝輪郭」「これから＝薄い塗り」の3態。
 * 進んだ手順に戻れるかどうかは画面の仕事なので、ここは表示だけを担う。
 */
export interface Step {
  no: number;
  title: string;
  /** 補足の一言（任意） */
  note?: string;
}

export function StepBar({
  steps,
  current,
  className,
}: {
  steps: Step[];
  /** いまの手順（1始まり）。0 なら「まだ始まっていない」 */
  current: number;
  className?: string;
}) {
  return (
    <div className={cn("flex border-b border-[var(--ui-hairline-strong)]", className)}>
      {steps.map((s) => {
        const done = s.no < current;
        const active = s.no === current;
        return (
          <div
            key={s.no}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex min-w-0 items-center gap-2.5 border-r border-[var(--ui-hairline)] px-3 py-3.5 last:border-r-0 sm:flex-1 sm:px-4",
              // 狭い画面では、いまの手順だけ名前を出して幅を譲る（ほかは番号だけ。名前は読み上げには残す）
              active ? "flex-1 bg-warning-100" : "flex-none",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 flex-none items-center justify-center rounded-full font-mono text-xs font-semibold",
                done && "bg-primary text-primary-foreground",
                active && "border border-primary text-primary",
                !done && !active && "bg-default-100 text-foreground-400",
              )}
            >
              {done ? "✓" : s.no}
            </span>
            <span className={cn("min-w-0 flex-col items-start gap-0.5", active ? "flex" : "sr-only sm:not-sr-only sm:flex")}>
              <span
                className={cn(
                  "max-w-full truncate text-base font-bold",
                  active || done ? "text-foreground-900" : "text-foreground-500",
                )}
              >
                {s.title}
              </span>
              {s.note ? <span className="truncate text-xs font-normal text-foreground-400">{s.note}</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
