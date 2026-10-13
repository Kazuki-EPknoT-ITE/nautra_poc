"use client";

import { cn } from "@/lib/cn";
import { fmtDateLabel } from "@/lib/format";
import type { ShiftPlanPayload } from "@/sync-protocol/records";

/**
 * 今週の当直を「1日 = 24時間の帯」で並べる（レビュー ROSTER-02: 文字の一覧ではなく形で見せる）。
 * 帯の位置で何時ごろか、長さで何時間かが分かる。時刻と種別は帯の中にも書く（形だけに頼らない）。
 * 日をまたぐ当直（22:00–02:00 など）は、その日の 24時までとして描き、時刻の文字はそのまま出す。
 */
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function WeekTimeline({
  days,
  today,
  nowMinutes,
  changedIds,
  label,
}: {
  days: { date: string; plans: ShiftPlanPayload[] }[];
  today: string;
  /** いまの時刻（0:00 からの分）。本日の帯に縦線で示す */
  nowMinutes: number;
  changedIds: Set<string>;
  label: (p: ShiftPlanPayload) => string;
}) {
  return (
    <div className="flex flex-col gap-1.5" role="list" aria-label="今週の当直">
      {/* 目盛り */}
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="w-32 shrink-0" />
        <span className="relative h-4 flex-1 font-mono text-xs text-foreground-500">
          {[0, 6, 12, 18, 24].map((h) => (
            <span key={h} className="absolute -translate-x-1/2" style={{ left: `${(h / 24) * 100}%` }}>
              {h}
            </span>
          ))}
        </span>
      </div>
      {days.map(({ date, plans }) => {
        const isToday = date === today;
        return (
          <div key={date} role="listitem" className={cn("flex items-center gap-3 rounded-small px-1 py-1", isToday && "ui-inset")}>
            <span className={cn("w-32 shrink-0 tabular-nums", isToday ? "text-lg font-bold" : "text-base text-foreground-700")}>
              {fmtDateLabel(date)}
              {isToday ? " 今日" : ""}
            </span>
            <span className="relative h-11 flex-1 overflow-hidden rounded-small bg-[#EEEEEE]">
              {/* 6時間ごとの薄い線 */}
              {[6, 12, 18].map((h) => (
                <span key={h} aria-hidden="true" className="absolute inset-y-0 w-px bg-white" style={{ left: `${(h / 24) * 100}%` }} />
              ))}
              {plans.length === 0 ? (
                <span className="absolute inset-0 flex items-center px-3 text-sm text-foreground-500">当直なし</span>
              ) : null}
              {plans.map((p) => {
                const from = toMin(p.from ?? "00:00");
                let to = toMin(p.to ?? "00:00");
                if (to <= from) to = 24 * 60; // 日をまたぐ当直はその日の終わりまで
                const changed = changedIds.has(p.id);
                return (
                  <span
                    key={p.id}
                    title={`${label(p)} ${p.from}–${p.to}${changed ? "（変更あり）" : ""}`}
                    className={cn(
                      "absolute inset-y-1 flex min-w-0 items-center overflow-hidden whitespace-nowrap rounded-[3px] px-1.5 text-xs font-semibold",
                      isToday ? "bg-primary text-primary-foreground" : "bg-foreground-700 text-white",
                      changed && "ring-2 ring-warning",
                    )}
                    style={{ left: `${(from / 1440) * 100}%`, width: `${((to - from) / 1440) * 100}%` }}
                  >
                    {changed ? "✎ " : ""}
                    {p.from}–{p.to} {label(p)}
                  </span>
                );
              })}
              {isToday ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 w-0.5 bg-danger"
                  style={{ left: `${(nowMinutes / 1440) * 100}%` }}
                />
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 船内の配置を1枚の表に（レビュー ROSTER-03）。縦に船員、横に場面（出入港・荷役・非常）。
 * 場面ごとに3つの表を縦に並べていたのをやめ、同じ人の持ち場を横に読めるようにする。
 */
export function StationMatrix({
  stations,
  scenarios,
  scenarioLabel,
  crewName,
  selfId,
  changedIds,
}: {
  stations: ShiftPlanPayload[];
  scenarios: readonly string[];
  scenarioLabel: (sc: string) => string;
  crewName: (id: string) => string;
  selfId: string;
  changedIds: Set<string>;
}) {
  const crewIds = [...new Set(stations.map((s) => s.crewMemberId))];
  // 自分の行をいちばん上に
  crewIds.sort((a, b) => (a === selfId ? -1 : b === selfId ? 1 : 0));
  if (crewIds.length === 0) return <p className="m-0 text-foreground-600">配置の登録がありません</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-left">
        <thead>
          <tr className="border-b-2 border-[var(--ui-hairline-strong)]">
            <th className="w-40 px-3 py-2 text-sm font-semibold text-foreground-500">船員</th>
            {scenarios.map((sc) => (
              <th key={sc} className="px-3 py-2 text-base font-bold text-foreground-900">
                {scenarioLabel(sc)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {crewIds.map((id) => (
            <tr key={id} className={cn("border-b border-[var(--ui-hairline)] align-top", id === selfId && "bg-warning-100")}>
              <th scope="row" className="px-3 py-2.5 text-base font-bold">
                {crewName(id)}
                {id === selfId ? <span className="block text-xs font-normal text-foreground-600">あなた</span> : null}
              </th>
              {scenarios.map((sc) => {
                const s = stations.find((x) => x.crewMemberId === id && x.scenario === sc);
                return (
                  <td key={sc} className="px-3 py-2.5" title={s?.duty ?? undefined}>
                    {s ? (
                      <>
                        <span className="block text-lg font-bold">
                          {changedIds.has(s.id) ? <span className="mr-1 text-warning-700">✎</span> : null}
                          {s.station}
                        </span>
                        {s.duty ? <span className="block truncate text-sm text-foreground-600">{s.duty}</span> : null}
                      </>
                    ) : (
                      <span className="text-foreground-400">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
