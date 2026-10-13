"use client";

import { useState } from "react";
import { startOfLocalDay, ymdLocal } from "@/domain/labor-law/evaluate";
import { cn } from "@/lib/cn";
import { LineIcon } from "@/ui";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** その日に何があるか（点で示す）。remand = まだ直していない差戻しがある */
export type DayMark = "records" | "remand";

const addDays = (ymd: string, days: number) => {
  const d = startOfLocalDay(ymd);
  d.setDate(d.getDate() + days);
  return ymdLocal(d);
};
const longLabel = (ymd: string) => {
  const d = startOfLocalDay(ymd);
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
};
const markLabel = (m?: DayMark) => (m === "remand" ? "・差戻しあり" : m === "records" ? "・打刻あり" : "");

/**
 * 日付の選び方（一般的なカレンダーアプリの形）。いちばん上に選んだ日を大きく出し（今日・昨日などの言い換えは付けない）、
 * 下に**その週の7日の帯**（‹ › で週を送る）、「カレンダー」で**月の暦**を開く。
 * 打刻がある日は点、まだ直していない差戻しがある日はレンガの点で示す（文字を読まずに探せるように）。
 * 未来の日は選べない。
 */
export function DateNavigator({
  value,
  today,
  onChange,
  marks,
}: {
  value: string;
  today: string;
  onChange: (ymd: string) => void;
  marks: Map<string, DayMark>;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [month, setMonth] = useState(() => value.slice(0, 7)); // 暦に出す月（YYYY-MM）

  const select = (ymd: string) => {
    if (ymd > today) return;
    onChange(ymd);
    setMonth(ymd.slice(0, 7));
  };

  const weekStart = addDays(value, -startOfLocalDay(value).getDay());
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <section aria-label="日付を選ぶ" className="ui-card flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 text-3xl font-bold text-foreground-900" aria-live="polite">
          {longLabel(value)}
        </p>
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => select(today)}
            disabled={value === today}
            className="ui-btn-ghost min-h-[48px] px-5 text-lg disabled:opacity-40"
          >
            今日
          </button>
          <button
            type="button"
            onClick={() => {
              setMonth(value.slice(0, 7));
              setCalendarOpen((o) => !o);
            }}
            aria-expanded={calendarOpen}
            className={cn("ui-btn-ghost min-h-[48px] px-4 text-lg", calendarOpen && "ui-btn-selected")}
          >
            <LineIcon name="calendar" size={22} />
            カレンダー
          </button>
        </span>
      </div>

      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => select(addDays(value, -7))}
          aria-label="前の週"
          className="ui-btn-quiet min-h-[72px] w-9 flex-none !text-3xl sm:w-12"
        >
          <Chevron dir="left" />
        </button>
        <div role="group" aria-label="この週の日付" className="grid min-w-0 flex-1 grid-cols-7 gap-1 sm:gap-1.5">
          {week.map((d) => (
            <DayCell key={d} ymd={d} today={today} selected={d === value} mark={marks.get(d)} onSelect={select} size="lg" />
          ))}
        </div>
        <button
          type="button"
          onClick={() => select(addDays(value, 7) > today ? today : addDays(value, 7))}
          disabled={weekStart >= addDays(today, -startOfLocalDay(today).getDay())}
          aria-label="次の週"
          className="ui-btn-quiet min-h-[72px] w-9 flex-none !text-3xl disabled:opacity-30 sm:w-12"
        >
          <Chevron dir="right" />
        </button>
      </div>

      {calendarOpen ? (
        <MonthCalendar
          month={month}
          setMonth={setMonth}
          value={value}
          today={today}
          marks={marks}
          onSelect={(d) => {
            select(d);
            setCalendarOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

function DayCell({
  ymd,
  today,
  selected,
  mark,
  onSelect,
  size,
}: {
  ymd: string;
  today: string;
  selected: boolean;
  mark?: DayMark;
  onSelect: (ymd: string) => void;
  size: "lg" | "sm";
}) {
  const d = startOfLocalDay(ymd);
  const future = ymd > today;
  const isToday = ymd === today;
  return (
    <button
      type="button"
      onClick={() => onSelect(ymd)}
      disabled={future}
      aria-pressed={selected}
      aria-label={`${longLabel(ymd)}${isToday ? "・今日" : ""}${markLabel(mark)}`}
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-small border-2",
        size === "lg" ? "min-h-[72px] py-1.5" : "min-h-[52px] py-1",
        selected
          ? "border-primary bg-primary text-white"
          : isToday
            ? "border-primary bg-content1 text-foreground-900"
            : "border-transparent bg-content1 text-foreground-800 hover:bg-default-100",
        future && "cursor-default opacity-30",
      )}
    >
      {size === "lg" ? (
        <span className={cn("text-base font-bold", selected ? "text-white" : "text-foreground-500")}>{WEEKDAYS[d.getDay()]}</span>
      ) : null}
      <span className={cn("font-mono font-bold tabular-nums leading-none", size === "lg" ? "text-xl sm:text-3xl" : "text-xl")}>{d.getDate()}</span>
      <span
        aria-hidden="true"
        className={cn(
          "block h-1.5 w-1.5 rounded-full",
          !mark && "invisible",
          mark === "remand" ? "bg-danger" : selected ? "bg-white" : "bg-foreground-500",
        )}
      />
    </button>
  );
}

function MonthCalendar({
  month,
  setMonth,
  value,
  today,
  marks,
  onSelect,
}: {
  month: string;
  setMonth: (m: string) => void;
  value: string;
  today: string;
  marks: Map<string, DayMark>;
  onSelect: (ymd: string) => void;
}) {
  const first = `${month}-01`;
  const start = addDays(first, -startOfLocalDay(first).getDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const [y, m] = month.split("-").map(Number);
  const shiftMonth = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(ymdLocal(d).slice(0, 7));
  };
  const isLatest = month >= today.slice(0, 7);
  return (
    <div role="dialog" aria-label="月のカレンダー" className="ui-inset flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="前の月" className="ui-btn-quiet min-h-[44px] w-12 !text-2xl">
          <Chevron dir="left" />
        </button>
        <span className="font-mono text-xl font-bold tabular-nums">
          {y}年{m}月
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          disabled={isLatest}
          aria-label="次の月"
          className="ui-btn-quiet min-h-[44px] w-12 !text-2xl disabled:opacity-30"
        >
          <Chevron dir="right" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm font-bold text-foreground-500" aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) =>
          d.slice(0, 7) === month ? (
            <DayCell key={d} ymd={d} today={today} selected={d === value} mark={marks.get(d)} onSelect={onSelect} size="sm" />
          ) : (
            <span key={d} aria-hidden="true" />
          ),
        )}
      </div>
    </div>
  );
}

/** 前後へ送る矢印（文字の ‹ › は細くて押す所に見えないので、太い線で描く） */
function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={26} height={26} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}
