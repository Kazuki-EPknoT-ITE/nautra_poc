"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type DragEvent, type ReactNode } from "react";
import type { CheckLevel } from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";
import { cn } from "@/lib/cn";
import { fmtDateLabel, fmtMinutes } from "@/lib/format";
import type { ShiftType } from "@/sync-protocol/records";
import { CrewPhoto, StatusChip } from "@/ui";
import { changeCalendarShiftAction, clearWatchAction, createCalendarShiftAction } from "../actions";

/** サーバの ShiftCalendar をそのまま受け取る（直列化できる形） */
export interface CalendarView {
  vesselId: string;
  vesselName: string;
  start: string;
  days: string[];
  today: string;
  crews: {
    crewMemberId: string;
    name: string;
    position: string;
    photo?: string;
    photoDataUrl?: string;
    weekMinutes: number;
    twoWeekMinutes: number;
    diffFromAverage: number;
  }[];
  plans: {
    id: string;
    crewMemberId: string;
    crewName: string;
    date: string;
    from: string;
    to: string;
    shiftType: ShiftType | null;
    startMin: number;
    endMin: number;
    overnight: boolean;
    changed: boolean;
    changeNote?: string;
    publishedAt: string;
    publishedByName: string;
    level: CheckLevel;
    conflict: boolean;
  }[];
  warnings: { crewMemberId: string; crewName: string; date: string; label: string; level: CheckLevel; text: string }[];
}

/** 1時間あたりの高さ（px）。24時間で 624px。刻みを変えても高さは変えず、線と置ける位置だけを変える */
const HOUR_PX = 26;
const STEPS = [1, 2, 4] as const;
const EDITABLE_TYPES: ShiftType[] = ["navigation_watch", "engine_watch", "port_watch", "cargo_watch"];

const hhmm = (min: number) => {
  if (min === 1440) return "24:00";
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const toMin = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
/** 当直の長さ（分）。日をまたぐ当直は翌日までの長さ */
const durationOf = (from: string, to: string) => {
  const s = toMin(from);
  const e = to === "24:00" ? 1440 : toMin(to);
  return e > s ? e - s : e + 1440 - s;
};

type Selection =
  | { kind: "none" }
  | { kind: "plan"; planId: string }
  | { kind: "create"; date: string; startMin: number; crewMemberId?: string };

/**
 * 当直の配置表（カレンダー）。レビュー SHIFT-03 / SHIFT-06 / SHIFT-07。
 *
 * - 左の船員をカレンダーの枠へ**ドラッグして置く**と、その枠の長さ（刻み）で当直を作って配信する
 * - 置いたブロックを**ドラッグで別の日・時刻へ移す**と、変更として配信する（日をまたいでも長さは保つ）
 * - **ブロックを押すと**内容（誰・いつ・種別・配信者・変更理由）が右に出て、その場で変更・取り外しができる
 * - **空いた枠を押すと**、その時刻から当直を作る欄が右に出る（続けて何日分も作れる）
 * - 刻みは1時間が既定で、2時間・4時間に切り替えられる（置ける位置と線が変わる）
 * - 労務チェック（⚠ / ✕）・今週の当直時間・直近2週間の配分は、この1枚の中に出す（SHIFT-06）
 */
export function ShiftCalendar({
  cal,
  vessels,
  step,
  exportSlot,
}: {
  cal: CalendarView;
  vessels: { id: string; name: string }[];
  step: number;
  exportSlot?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sel, setSel] = useState<Selection>({ kind: "none" });
  const [flash, setFlash] = useState<{ ok: boolean; message: string } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const stepMin = step * 60;

  const href = (o: { vessel?: string; start?: string; step?: number }) =>
    `/shore/shifts?vessel=${o.vessel ?? cal.vesselId}&start=${o.start ?? cal.start}&step=${o.step ?? step}`;
  const shiftStart = (deltaDays: number) => {
    const d = new Date(`${cal.start}T00:00:00`);
    d.setDate(d.getDate() + deltaDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  /**
   * 日ごとに、重なる当直だけを横に並べる（列の割り当て）。重なりのまとまりごとに幅を決めるので、
   * 誰とも重ならない当直は列いっぱいの幅で読める。
   */
  const laidOut = useMemo(() => {
    type Placed = { plan: CalendarView["plans"][number]; lane: number; lanes: number };
    const out = new Map<string, Placed[]>();
    for (const day of cal.days) {
      const items = cal.plans.filter((p) => p.date === day).sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
      const placed: Placed[] = [];
      let group: Placed[] = [];
      let laneEnds: number[] = [];
      let groupEnd = -1;
      const close = () => {
        for (const g of group) g.lanes = Math.max(1, laneEnds.length);
        group = [];
        laneEnds = [];
      };
      for (const plan of items) {
        if (plan.startMin >= groupEnd) close();
        let lane = laneEnds.findIndex((end) => end <= plan.startMin);
        if (lane < 0) {
          lane = laneEnds.length;
          laneEnds.push(plan.endMin);
        } else laneEnds[lane] = plan.endMin;
        const item = { plan, lane, lanes: 1 };
        group.push(item);
        placed.push(item);
        groupEnd = Math.max(groupEnd, plan.endMin);
      }
      close();
      out.set(day, placed);
    }
    return out;
  }, [cal.days, cal.plans]);

  const maxTwoWeek = Math.max(1, ...cal.crews.map((c) => c.twoWeekMinutes));
  const selectedPlan = sel.kind === "plan" ? cal.plans.find((p) => p.id === sel.planId) : undefined;

  function run(action: () => Promise<{ ok: boolean; message: string }>, after?: () => void) {
    setFlash(null);
    startTransition(async () => {
      const res = await action();
      setFlash(res);
      if (res.ok) {
        after?.();
        router.refresh();
      }
    });
  }

  /** 落とした位置（列の中の y）から、刻みに合わせた開始時刻（分）を出す */
  const snapMin = (e: DragEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height - 1, e.clientY - rect.top));
    const min = (y / HOUR_PX) * 60;
    return Math.floor(min / stepMin) * stepMin;
  };

  function onDrop(e: DragEvent<HTMLDivElement>, date: string) {
    e.preventDefault();
    setHover(null);
    const startMin = snapMin(e);
    const crewId = e.dataTransfer.getData("text/x-crew");
    const planId = e.dataTransfer.getData("text/x-plan");
    if (crewId) {
      run(() =>
        createCalendarShiftAction({
          crewMemberId: crewId,
          date,
          from: hhmm(startMin),
          to: hhmm(Math.min(1440, startMin + stepMin)),
          shiftType: "navigation_watch",
        }),
      );
    } else if (planId) {
      const p = cal.plans.find((x) => x.id === planId);
      if (!p) return;
      const dur = durationOf(p.from, p.to);
      const end = startMin + dur;
      run(() =>
        changeCalendarShiftAction(planId, {
          date,
          from: hhmm(startMin),
          to: end === 1440 ? "24:00" : hhmm(end),
          shiftType: p.shiftType ?? "navigation_watch",
        }),
      );
    }
  }

  const hours = Array.from({ length: 24 / step }, (_, i) => i * step);

  return (
    <section aria-label="当直の配置表" className="flex flex-col gap-3">
      {/* 上段: 船・週・刻み・書き出し */}
      <div className="ui-card flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="船">
          {vessels.map((v) => (
            <Link key={v.id} href={href({ vessel: v.id })} className={cn("ui-btn-quiet", v.id === cal.vesselId && "ui-btn-selected")}>
              {v.name}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="週">
          <Link href={href({ start: shiftStart(-7) })} className="ui-btn-quiet" aria-label="前の週">
            ◀
          </Link>
          <span className="min-w-[150px] text-center font-mono text-base tabular-nums text-foreground-800">
            {fmtDateLabel(cal.days[0]!)}〜{fmtDateLabel(cal.days[6]!)}
          </span>
          <Link href={href({ start: shiftStart(7) })} className="ui-btn-quiet" aria-label="次の週">
            ▶
          </Link>
          <Link href={`/shore/shifts?vessel=${cal.vesselId}&step=${step}`} className="ui-btn-quiet">
            今週
          </Link>
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="刻み">
          <span className="text-sm text-foreground-500">刻み</span>
          {STEPS.map((s) => (
            <Link key={s} href={href({ step: s })} aria-current={s === step ? "true" : undefined} className={cn("ui-btn-quiet", s === step && "ui-btn-selected")}>
              {s}時間
            </Link>
          ))}
        </div>
        <span className="ml-auto" />
        {pending ? <span className="text-sm text-primary">配信中…</span> : null}
        {exportSlot}
      </div>

      {flash ? (
        <p role="status" className={cn("ui-card m-0 px-4 py-2.5 text-base", flash.ok ? "text-foreground-800" : "text-danger")}>
          {flash.ok ? "✓" : "✕"} {flash.message}
        </p>
      ) : null}

      <div className="grid items-start gap-3 xl:grid-cols-[190px_minmax(0,1fr)_260px]">
        {/* 左: 船員（ドラッグして置く）。今週・直近2週間の当直時間で配分の偏りを見る */}
        <div className="ui-card flex flex-col gap-2 p-3" aria-label="船員">
          <p className="m-0 text-sm font-bold text-foreground-700">船員（枠へドラッグ）</p>
          {cal.crews.length === 0 ? <p className="m-0 text-sm text-foreground-500">乗っている船員がいません</p> : null}
          {cal.crews.map((c) => (
            <div
              key={c.crewMemberId}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/x-crew", c.crewMemberId)}
              className="ui-row flex cursor-grab items-center gap-2 p-2 active:cursor-grabbing"
              title={`${c.name}: 直近2週間 ${fmtMinutes(c.twoWeekMinutes)}（平均との差 ${c.diffFromAverage >= 0 ? "+" : ""}${fmtMinutes(Math.abs(c.diffFromAverage))}）`}
            >
              <CrewPhoto name={c.name} initial={c.photo} src={c.photoDataUrl} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold text-foreground-900">{c.name}</span>
                <span className="block font-mono text-xs tabular-nums text-foreground-600">今週 {fmtMinutes(c.weekMinutes)}</span>
                <span className="mt-1 block h-[5px] overflow-hidden rounded-[3px] bg-[#DFE1E0]" aria-hidden="true">
                  <span className="block h-full bg-foreground-700" style={{ width: `${Math.round((c.twoWeekMinutes / maxTwoWeek) * 100)}%` }} />
                </span>
              </span>
            </div>
          ))}
          <p className="m-0 text-xs text-foreground-500">棒は直近2週間の当直時間</p>
        </div>

        {/* 中: カレンダー */}
        <div className="ui-card overflow-x-auto p-2">
          <div className="grid min-w-[700px]" style={{ gridTemplateColumns: "44px repeat(7, minmax(0, 1fr))" }}>
            <span />
            {cal.days.map((d) => (
              <span
                key={d}
                className={cn(
                  "border-b border-[var(--ui-hairline-strong)] py-1.5 text-center font-mono text-sm tabular-nums",
                  d === cal.today ? "font-bold text-primary" : "text-foreground-700",
                )}
              >
                {fmtDateLabel(d)}
              </span>
            ))}
            {/* 時刻の目盛り */}
            <div className="relative" style={{ height: HOUR_PX * 24 }}>
              {hours.map((h) => (
                <span key={h} className="absolute right-1.5 -translate-y-1/2 font-mono text-xs text-foreground-500" style={{ top: h * HOUR_PX }}>
                  {String(h).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {cal.days.map((day) => (
              <div
                key={day}
                role="group"
                aria-label={`${fmtDateLabel(day)} の当直`}
                className={cn("relative border-l border-[var(--ui-hairline)]", hover === day && "bg-warning-100/60")}
                style={{
                  height: HOUR_PX * 24,
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX * step - 1}px, var(--ui-hairline) ${HOUR_PX * step - 1}px, var(--ui-hairline) ${HOUR_PX * step}px)`,
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setHover(day);
                }}
                onDragLeave={() => setHover(null)}
                onDrop={(e) => onDrop(e, day)}
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                  setSel({ kind: "create", date: day, startMin: snapMin(e) });
                }}
              >
                {(laidOut.get(day) ?? []).map(({ plan: p, lane, lanes }) => (
                  <button
                    key={p.id}
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/x-plan", p.id)}
                    onClick={() => setSel({ kind: "plan", planId: p.id })}
                    aria-label={`${p.crewName} ${p.from}–${p.to}${p.level !== "ok" ? "（基準を外れる日）" : ""}`}
                    className={cn(
                      "absolute overflow-hidden rounded-[3px] border px-1 py-0.5 text-left text-xs leading-tight",
                      p.level === "violation"
                        ? "border-danger bg-danger-100 text-danger"
                        : p.level === "caution"
                          ? "border-primary bg-warning-100 text-warning-700"
                          : "border-[var(--ui-hairline-strong)] bg-content1 text-foreground-800",
                      sel.kind === "plan" && sel.planId === p.id && "ring-2 ring-primary",
                    )}
                    style={{
                      top: (p.startMin / 60) * HOUR_PX,
                      height: Math.max(16, ((p.endMin - p.startMin) / 60) * HOUR_PX - 2),
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                    }}
                  >
                    <span className="block truncate font-bold">
                      {p.conflict ? "⚡ " : ""}
                      {p.level === "violation" ? "✕ " : p.level === "caution" ? "⚠ " : ""}
                      {p.crewName}
                    </span>
                    <span className="block truncate font-mono">
                      {p.from}–{p.to}
                      {p.overnight ? " →翌" : ""}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* 右: 押した当直の内容・変更 ／ 空いた枠からの作成 ／ 何も選んでいないときは労務チェック */}
        <div className="flex flex-col gap-3">
          {selectedPlan ? (
            <PlanPanel
              key={selectedPlan.id}
              plan={selectedPlan}
              days={cal.days}
              pending={pending}
              onClose={() => setSel({ kind: "none" })}
              onChange={(change) => run(() => changeCalendarShiftAction(selectedPlan.id, change), () => setSel({ kind: "none" }))}
              onRemove={() =>
                run(
                  () => clearWatchAction(selectedPlan.id, `${fmtDateLabel(selectedPlan.date)} ${selectedPlan.crewName} ${selectedPlan.from}–${selectedPlan.to}`),
                  () => setSel({ kind: "none" }),
                )
              }
              warnings={cal.warnings.filter((w) => w.crewMemberId === selectedPlan.crewMemberId && w.date === selectedPlan.date)}
            />
          ) : sel.kind === "create" ? (
            <CreatePanel
              key={`${sel.date}-${sel.startMin}`}
              date={sel.date}
              startMin={sel.startMin}
              stepMin={stepMin}
              crews={cal.crews}
              pending={pending}
              onClose={() => setSel({ kind: "none" })}
              onCreate={(input) => run(() => createCalendarShiftAction(input), () => setSel({ kind: "none" }))}
            />
          ) : (
            <section aria-label="労務チェック" className="ui-card flex flex-col gap-2 p-3">
              <p className="m-0 text-base font-bold text-foreground-900">
                労務チェック <span className="font-mono text-sm font-normal text-foreground-500">{cal.warnings.length}件</span>
              </p>
              {cal.warnings.length === 0 ? (
                <p className="m-0 text-sm text-foreground-600">✓ この週の当直はどの船員も基準内です</p>
              ) : (
                <ul className="m-0 flex max-h-[520px] list-none flex-col gap-1.5 overflow-y-auto p-0">
                  {cal.warnings.map((w, i) => (
                    <li key={i} className="ui-inset flex flex-col gap-1 p-2 text-sm">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StatusChip level={w.level} size="sm" hint={w.text} />
                        <span className="font-bold">{w.crewName}</span>
                        <span className="font-mono text-foreground-600">{fmtDateLabel(w.date)}</span>
                      </span>
                      <span className="text-foreground-700">
                        {w.label}: {w.text}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="m-0 text-xs text-foreground-500">ブロックを押すと内容と変更、空いた枠を押すと作成</p>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}

function TypeButtons({ value, onChange }: { value: ShiftType; onChange: (v: ShiftType) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="当直の種別">
      {EDITABLE_TYPES.map((k) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)} className={cn("ui-btn-quiet", value === k && "ui-btn-selected")}>
          {t.shiftType[k]}
        </button>
      ))}
    </div>
  );
}

function PlanPanel({
  plan,
  days,
  pending,
  warnings,
  onClose,
  onChange,
  onRemove,
}: {
  plan: CalendarView["plans"][number];
  days: string[];
  pending: boolean;
  warnings: CalendarView["warnings"];
  onClose: () => void;
  onChange: (c: { date?: string; from: string; to: string; shiftType: ShiftType; note?: string }) => void;
  onRemove: () => void;
}) {
  const [shiftType, setShiftType] = useState<ShiftType>(plan.shiftType && plan.shiftType !== "off" ? plan.shiftType : "navigation_watch");
  const [date, setDate] = useState(plan.date);
  const [from, setFrom] = useState(plan.from);
  const [to, setTo] = useState(plan.to === "24:00" ? "00:00" : plan.to);
  const [note, setNote] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <section aria-label="当直の内容" className="ui-card flex flex-col gap-3 border-primary p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="m-0 text-lg font-bold text-foreground-900">{plan.crewName}</p>
          <p className="m-0 font-mono text-sm tabular-nums text-foreground-700">
            {fmtDateLabel(plan.date)} {plan.from}–{plan.to}
            {plan.overnight ? "（翌日まで）" : ""}
          </p>
        </div>
        <button type="button" onClick={onClose} className="ui-btn-quiet h-8 w-8 !p-0" aria-label="閉じる">
          ✕
        </button>
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-foreground-500">種別</dt>
        <dd className="m-0">{plan.shiftType ? t.shiftType[plan.shiftType] : "—"}</dd>
        <dt className="text-foreground-500">配信</dt>
        <dd className="m-0 font-mono">{plan.publishedByName}</dd>
        {plan.changed ? (
          <>
            <dt className="text-foreground-500">変更</dt>
            <dd className="m-0">{plan.changeNote ?? "変更あり"}</dd>
          </>
        ) : null}
      </dl>
      {plan.conflict ? (
        <p className="m-0 rounded-small bg-danger-100 px-2 py-1.5 text-sm text-danger">
          ⚡ 競合（要確認）: 陸上と船長が同じ当直を別々に変えています。どちらかを外して1つにしてください
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-sm">
              <StatusChip level={w.level} size="sm" hint={w.text} />
              <span>{w.text}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-[var(--ui-hairline)] pt-3">
        <p className="m-0 text-sm font-bold text-foreground-700">変更して配信</p>
        <TypeButtons value={shiftType} onChange={setShiftType} />
        <div className="flex flex-wrap items-center gap-1.5">
          <select aria-label="日" value={date} onChange={(e) => setDate(e.target.value)} className="ui-field !w-auto !py-1.5 font-mono">
            {(days.includes(plan.date) ? days : [plan.date, ...days]).map((d) => (
              <option key={d} value={d}>
                {fmtDateLabel(d)}
              </option>
            ))}
          </select>
          <input aria-label="開始" type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="ui-field !w-auto !py-1.5 font-mono" />
          <span>–</span>
          <input aria-label="終了" type="time" value={to} onChange={(e) => setTo(e.target.value)} className="ui-field !w-auto !py-1.5 font-mono" />
        </div>
        <input aria-label="変更の理由" placeholder="変更の理由（船内に届きます）" value={note} onChange={(e) => setNote(e.target.value)} className="ui-field !py-1.5" />
        <button
          type="button"
          className="ui-btn-primary h-10"
          disabled={pending || !from || !to}
          onClick={() => onChange({ date: date !== plan.date ? date : undefined, from, to: to === "00:00" ? "24:00" : to, shiftType, note })}
        >
          変更して配信
        </button>
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--ui-hairline)] pt-3">
        {confirmRemove ? (
          <>
            <span className="text-sm text-danger">外しますか？（30日以内なら戻せます）</span>
            <button type="button" className="ui-btn-danger h-9" disabled={pending} onClick={onRemove}>
              外す
            </button>
          </>
        ) : (
          <button type="button" className="ui-btn-ghost h-9 text-danger" onClick={() => setConfirmRemove(true)}>
            この当直を外す
          </button>
        )}
      </div>
    </section>
  );
}

function CreatePanel({
  date,
  startMin,
  stepMin,
  crews,
  pending,
  onClose,
  onCreate,
}: {
  date: string;
  startMin: number;
  stepMin: number;
  crews: CalendarView["crews"];
  pending: boolean;
  onClose: () => void;
  onCreate: (input: { crewMemberId: string; date: string; from: string; to: string; shiftType: ShiftType; toDate?: string; note?: string }) => void;
}) {
  const [crewMemberId, setCrew] = useState(crews[0]?.crewMemberId ?? "");
  const [shiftType, setShiftType] = useState<ShiftType>("navigation_watch");
  const [from, setFrom] = useState(hhmm(startMin));
  const end = Math.min(1440, startMin + stepMin);
  const [to, setTo] = useState(end === 1440 ? "00:00" : hhmm(end));
  const [toDate, setToDate] = useState("");
  return (
    <section aria-label="当直を作る" className="ui-card flex flex-col gap-3 border-primary p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="m-0 text-lg font-bold text-foreground-900">当直シフトを作って配信</p>
        <button type="button" onClick={onClose} className="ui-btn-quiet h-8 w-8 !p-0" aria-label="閉じる">
          ✕
        </button>
      </div>
      <p className="m-0 font-mono text-sm text-foreground-700">{fmtDateLabel(date)}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="船員">
        {crews.map((c) => (
          <button key={c.crewMemberId} type="button" aria-pressed={crewMemberId === c.crewMemberId} onClick={() => setCrew(c.crewMemberId)} className={cn("ui-btn-quiet", crewMemberId === c.crewMemberId && "ui-btn-selected")}>
            {c.name}
          </button>
        ))}
      </div>
      <TypeButtons value={shiftType} onChange={setShiftType} />
      <div className="flex flex-wrap items-center gap-1.5">
        <input aria-label="開始" type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="ui-field !w-auto !py-1.5 font-mono" />
        <span>–</span>
        <input aria-label="終了" type="time" value={to} onChange={(e) => setTo(e.target.value)} className="ui-field !w-auto !py-1.5 font-mono" />
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-foreground-600">続けて作る（最終日）</span>
        <input type="date" value={toDate} min={date} onChange={(e) => setToDate(e.target.value)} className="ui-field !w-auto !py-1.5 font-mono" />
      </label>
      <button
        type="button"
        className="ui-btn-primary h-10"
        disabled={pending || !crewMemberId}
        onClick={() => onCreate({ crewMemberId, date, from, to: to === "00:00" ? "24:00" : to, shiftType, toDate: toDate || undefined })}
      >
        作って配信
      </button>
    </section>
  );
}
