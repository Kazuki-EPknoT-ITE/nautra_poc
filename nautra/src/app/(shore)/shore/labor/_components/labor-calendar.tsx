import Link from "next/link";
import type { CheckLevel } from "@/domain/labor-law/types";
import { cn } from "@/lib/cn";

export interface CalendarDay {
  date: string;
  hasRecords: boolean;
  level: CheckLevel;
  /** 注意・警告の理由（ホバーで出す。LABOR-05） */
  hint?: string;
  /** 修正案が本人の確認待ち（LABOR-06） */
  pending: boolean;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const MARK: Record<CheckLevel, { icon: string; cls: string }> = {
  ok: { icon: "✓", cls: "text-foreground-500" },
  caution: { icon: "⚠", cls: "bg-warning-100 text-warning-700" },
  violation: { icon: "✕", cls: "bg-danger-100 text-danger" },
};

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * 集計期間をカレンダーで選ぶ（レビュー LABOR-03）。
 *
 * 月は ◀ ▶ で送り、日ごとの判定を記号（✓ / ⚠ / ✕）で並べる。日を押すとタイムチャートのその日へ、
 * 注意・警告の日は理由をホバーで出す（LABOR-05）。ボタンを月の数だけ並べるより、
 * 「どの日に問題があるか」と期間の選択が同じ場所で済む。
 */
export function LaborCalendar({
  crewMemberId,
  month,
  oldest,
  newest,
  today,
  days,
}: {
  crewMemberId: string;
  month: string;
  /** 送れる範囲（これより前・後へは送らない） */
  oldest: string;
  newest: string;
  today: string;
  days: CalendarDay[];
}) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y!, m! - 1, 1);
  const daysInMonth = new Date(y!, m!, 0).getDate();
  const lead = first.getDay();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const href = (mo: string) => `/shore/labor?crew=${crewMemberId}&month=${mo}`;

  return (
    <div className="flex flex-col gap-2" aria-label="集計期間のカレンダー">
      <div className="flex items-center gap-2">
        {prev >= oldest ? (
          <Link href={href(prev)} className="ui-btn-quiet h-8 w-8 !p-0" aria-label="前の月">
            ◀
          </Link>
        ) : (
          <span className="h-8 w-8" />
        )}
        <span className="min-w-[110px] text-center font-mono text-lg font-bold tabular-nums text-foreground-900">
          {y}年{m}月
        </span>
        {next <= newest ? (
          <Link href={href(next)} className="ui-btn-quiet h-8 w-8 !p-0" aria-label="次の月">
            ▶
          </Link>
        ) : (
          <span className="h-8 w-8" />
        )}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w, i) => (
          <span
            key={w}
            className={cn("text-xs font-semibold", i === 0 || i === 6 ? "text-foreground-500" : "text-foreground-600")}
          >
            {w}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`blank-${i}`} />;
          const d = byDate.get(date);
          const future = date > today;
          const mark = d?.hasRecords ? MARK[d.level] : null;
          const body = (
            <>
              <span className="font-mono text-sm tabular-nums">{Number(date.slice(8))}</span>
              <span aria-hidden="true" className={cn("text-xs leading-none", mark ? "" : "opacity-0")}>
                {mark?.icon ?? "・"}
              </span>
            </>
          );
          const cls = cn(
            "group/tip relative flex h-11 flex-col items-center justify-center gap-0.5 rounded-small border",
            date === today ? "border-primary" : "border-[var(--ui-hairline)]",
            mark?.cls,
            future && "opacity-40",
          );
          if (future || !d?.hasRecords) {
            return (
              <span key={date} className={cls}>
                {body}
              </span>
            );
          }
          const label = `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日 ${
            d.level === "ok" ? "基準内" : d.level === "caution" ? "注意" : "警告"
          }${d.pending ? "（修正の確認待ち）" : ""}`;
          return (
            <Link
              key={date}
              href={`/shore/labor?crew=${crewMemberId}&month=${month}&tab=chart#d-${date}`}
              aria-label={d.hint ? `${label}: ${d.hint}` : label}
              className={cn(cls, "hover:border-foreground-700")}
            >
              {body}
              {d.pending ? (
                <span aria-hidden="true" className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
              ) : null}
              {d.hint ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-full z-40 mt-1.5 hidden w-max max-w-[300px] whitespace-normal rounded-small bg-[#231F20] px-3 py-2 text-left text-sm font-normal leading-normal text-white group-hover/tip:block"
                >
                  {d.hint}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
