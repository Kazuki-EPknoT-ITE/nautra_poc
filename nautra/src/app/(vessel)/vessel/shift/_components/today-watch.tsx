"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { fmtMinutes } from "@/lib/format";
import type { WatchStatus } from "@/lib/shift-plain";
import { StatusChip } from "@/ui";

/**
 * いまの当直（レビュー ROSTER-02 / photo_7）。打刻の時計と同じ暗い帯で、
 * **いま当直中か・次は何か**と**あとどれだけか**だけを、離れていても読める大きさで出す。
 * 当直中は、当直の何割まで来たかを帯で示す。
 */
export function WatchStatusBand({
  status,
  shiftLabel,
  now,
}: {
  status: WatchStatus;
  shiftLabel: (shiftType?: string) => string;
  now: Date;
}) {
  if (status.state === "on_duty" && status.current) {
    const { plan, start, end } = status.current;
    const total = end.getTime() - start.getTime();
    const done = Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / total));
    return (
      <section aria-label="いまの当直" className="ui-dark flex flex-col gap-4 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="m-0 font-mono text-sm tracking-[0.14em] text-[#99877D]">● 当直中</p>
            <p className="m-0 mt-1 text-4xl font-bold text-white">{shiftLabel(plan.shiftType)}</p>
          </div>
          <div className="flex-none text-right">
            <p className="m-0 font-mono text-5xl font-semibold tabular-nums text-white">あと {fmtMinutes(status.minutesUntilEnd ?? 0)}</p>
            <p className="m-0 mt-1 font-mono text-lg tabular-nums text-[#DFE1E0]">
              {plan.from}–{plan.to}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="relative block h-3 flex-1 overflow-hidden rounded-[2px] bg-white/20" aria-label={`当直の ${Math.round(done * 100)}% まで来ています`}>
            <span className="block h-full bg-primary" style={{ width: `${done * 100}%` }} />
          </span>
          <Link href="/vessel/punch" className="ui-btn-primary min-h-12 px-6 text-base">
            打刻する
          </Link>
        </div>
      </section>
    );
  }
  if (status.state === "upcoming" && status.next) {
    const { plan } = status.next;
    return (
      <section aria-label="いまの当直" className="ui-dark flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div className="min-w-0">
          <p className="m-0 font-mono text-sm tracking-[0.14em] text-[#99877D]">○ 次の当直</p>
          <p className="m-0 mt-1 text-4xl font-bold text-white">{shiftLabel(plan.shiftType)}</p>
        </div>
        <div className="flex-none text-right">
          <p className="m-0 font-mono text-5xl font-semibold tabular-nums text-white">あと {fmtMinutes(status.minutesUntilStart ?? 0)}</p>
          <p className="m-0 mt-1 font-mono text-lg tabular-nums text-[#DFE1E0]">
            {plan.from}–{plan.to}
          </p>
        </div>
      </section>
    );
  }
  return (
    <section aria-label="いまの当直" className="ui-card flex items-center gap-4 px-6 py-5">
      <span aria-hidden="true" className="text-4xl">
        {status.state === "finished" ? "✓" : "－"}
      </span>
      <span className="text-3xl font-bold">{status.state === "finished" ? "本日の当直は終わりました" : "本日の当直はありません"}</span>
    </section>
  );
}

const toMin = (hhmm?: string) => {
  const [h, m] = (hhmm ?? "00:00").split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const dayMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();

export interface TodayWatchRow {
  id: string;
  from?: string;
  to?: string;
  label: string;
  changed: boolean;
  onDuty: boolean;
  started: boolean;
  /** 当直の時間帯に重なった打刻（実績） */
  actual: { startAt: Date; endAt?: Date }[];
}

/**
 * 本日の当直（レビュー ROSTER-03 / photo_8）。1日を1本の帯にし、**予定（枠）と実績（打刻・塗り）を重ねて**
 * 見せる。予定どおり打刻できているかが、文を読まなくても帯の重なりで分かる。
 * 下の行は当直ごとの状態を札1つで示す。
 */
export function TodayWatchBar({ rows, now, dayStart }: { rows: TodayWatchRow[]; now: Date; dayStart: Date }) {
  const nowMin = dayMinutes(now);
  const clip = (d: Date) => Math.max(0, Math.min(1440, Math.round((d.getTime() - dayStart.getTime()) / 60000)));
  return (
    <div className="flex flex-col gap-3">
      <div aria-hidden="true" className="relative ml-0 h-4 font-mono text-xs text-foreground-500">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} className="absolute -translate-x-1/2" style={{ left: `${(h / 24) * 100}%` }}>
            {h}
          </span>
        ))}
      </div>
      <div className="relative h-16 overflow-hidden rounded-small bg-[#EEEEEE]" role="img" aria-label="本日の当直の予定と打刻">
        {[6, 12, 18].map((h) => (
          <span key={h} aria-hidden="true" className="absolute inset-y-0 w-px bg-white" style={{ left: `${(h / 24) * 100}%` }} />
        ))}
        {rows.map((r) => {
          const from = toMin(r.from);
          let to = toMin(r.to);
          if (to <= from) to = 1440;
          return (
            <span
              key={r.id}
              className={cn("absolute top-1.5 h-7 rounded-[3px] border-2", r.onDuty ? "border-primary bg-primary/15" : "border-foreground-500 bg-white/70")}
              style={{ left: `${(from / 1440) * 100}%`, width: `${((to - from) / 1440) * 100}%` }}
            />
          );
        })}
        {rows.flatMap((r) =>
          r.actual.map((a, i) => {
            const s = clip(a.startAt);
            const e = clip(a.endAt ?? now);
            return (
              <span
                key={`${r.id}-${i}`}
                className="absolute bottom-1.5 h-4 rounded-[2px] bg-foreground-800"
                style={{ left: `${(s / 1440) * 100}%`, width: `${(Math.max(e - s, 4) / 1440) * 100}%` }}
              />
            );
          }),
        )}
        <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-danger" style={{ left: `${(nowMin / 1440) * 100}%` }} />
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-foreground-600" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-[2px] border-2 border-foreground-500 bg-white" /> 予定
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-[2px] bg-foreground-800" /> 打刻
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 bg-danger" /> いま
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((r) => {
          const ok = r.actual.length > 0;
          return (
            <li key={r.id} className={cn("ui-inset flex flex-wrap items-center gap-3 px-4 py-3", r.onDuty && "border-2 border-primary")}>
              <span className="font-mono text-2xl font-bold tabular-nums">
                {r.from}–{r.to}
              </span>
              <span className="text-lg">{r.label}</span>
              {r.changed ? <StatusChip level="caution" size="sm" label="変更あり" hint="陸上または船長が予定を変えました" /> : null}
              <span className="ml-auto">
                {ok ? (
                  <StatusChip level="ok" label="打刻あり" hint={false} />
                ) : r.onDuty ? (
                  <StatusChip level="caution" label="打刻がありません" hint="当直中ですが、まだ打刻がありません。打刻の画面で始めてください" />
                ) : r.started ? (
                  <StatusChip level="caution" label="打刻なしで終了" hint="当直の時間に打刻がありませんでした。履歴から後で入力できます" />
                ) : (
                  <StatusChip level="none" label="これから" hint={false} />
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
