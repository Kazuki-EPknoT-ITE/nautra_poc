"use client";

import { useMemo } from "react";
import { addDays } from "@/domain/labor-law/evaluate";
import { t } from "@/i18n/ja";
import { cn } from "@/lib/cn";
import { CREW_MEMBERS } from "@/lib/crew";
import { fmtDateLabel } from "@/lib/format";
import type { ShiftPlanPayload } from "@/sync-protocol/records";

/**
 * 全船員の週間当直表（船長のみ）。
 * 他船員の当直を読む処理をこのコンポーネントに閉じ、権限がなければ描画しない
 * （本番では API の権限ガードと RLS でサーバから返さない。基本設計書 11.2）。
 */
export function CrewWatchTable({
  watches,
  today,
  changedIds,
  selfId,
}: {
  watches: ShiftPlanPayload[];
  today: string;
  changedIds: Set<string>;
  selfId: string;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i - 1)), [today]);
  const table = useMemo(() => {
    const map = new Map<string, ShiftPlanPayload[]>();
    for (const w of watches) {
      if (!w.date) continue;
      const key = `${w.crewMemberId}|${w.date}`;
      map.set(key, [...(map.get(key) ?? []), w]);
    }
    for (const arr of map.values()) arr.sort((a, b) => (a.from ?? "").localeCompare(b.from ?? ""));
    return map;
  }, [watches]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-[var(--glass-border)] text-left text-foreground-600">
            <th className="px-3 py-2 font-medium">船員</th>
            {days.map((d) => (
              <th
                key={d}
                className={cn("px-2 py-2 text-center font-medium tabular-nums", d === today && "bg-content2")}
              >
                {fmtDateLabel(d)}
                {d === today ? "（本日）" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CREW_MEMBERS.map((c) => (
            <tr
              key={c.id}
              className={cn("border-b border-[var(--glass-border)] last:border-b-0", c.id === selfId && "bg-content2/60")}
            >
              <td className="px-3 py-2">
                <p className="font-semibold">
                  {c.name}
                  {c.id === selfId ? <span className="ml-1 text-xs text-foreground-600">（あなた）</span> : null}
                </p>
                <p className="text-xs text-foreground-600">{c.position}</p>
              </td>
              {days.map((d) => {
                const cell = table.get(`${c.id}|${d}`) ?? [];
                return (
                  <td key={d} className={cn("px-2 py-2 align-top", d === today && "bg-content2/40")}>
                    <div className="flex flex-col gap-1">
                      {cell.length === 0 ? (
                        <span className="text-foreground-300">–</span>
                      ) : (
                        cell.map((p) => (
                          <span
                            key={p.id}
                            className={cn(
                              "glass-inset rounded-small px-1.5 py-0.5 text-xs tabular-nums",
                              changedIds.has(p.id) && "ring-1 ring-warning",
                            )}
                          >
                            {p.shiftType ? t.shiftType[p.shiftType].replace("当直", "") : ""} {p.from}–{p.to}
                            {changedIds.has(p.id) ? " ✎" : ""}
                          </span>
                        ))
                      )}
                    </div>
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
