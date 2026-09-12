"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type DragEvent } from "react";
import type { CheckLevel } from "@/domain/labor-law/types";
import { cn } from "@/lib/cn";
import { fmtDateLabel } from "@/lib/format";
import { CrewPhoto, DeleteDialog, FlashToast, SearchField, StatusChip } from "@/ui";
import { assignWatchAction, clearWatchAction } from "../actions";

export interface BoardSlot {
  key: string;
  label: string;
}

export interface BoardCrewView {
  crewMemberId: string;
  name: string;
  position: string;
  photo?: string;
  /** 顔写真（縮小済みの data URL） */
  photoDataUrl?: string;
  assignedCount: number;
}

export interface BoardCellView {
  slotKey: string;
  date: string;
  planId: string | null;
  crewName: string | null;
  changed: boolean;
}

/**
 * S-10 当直シフトのボード（デザイン正本 `design/poc_design`）。
 *
 * 左の乗組員カードを **週×時間帯の枡**へドラッグして当直を組む。4時間の枡に固定して
 * いるのは、船の当直がその形で回るからで、形のまま置ければ「誰がいつ寝られるか」まで
 * 一目で分かる。変則的な時間は下のフォームから引き続き作れる。
 *
 * 落とした瞬間に**配信**される（下書きを溜めない）。取り消せることのほうが大事なので、
 * 枡の × は削除ではなく「外した」記録を残し、30日以内は S-18 から戻せる。
 */
export function ShiftBoard({
  vesselName,
  vessels,
  activeVesselId,
  days,
  today,
  slots,
  crews,
  cells,
  filled,
  total,
  warnings,
  appliedRuleVersion,
}: {
  vesselName: string;
  vessels: { id: string; name: string }[];
  activeVesselId: string;
  days: string[];
  today: string;
  slots: BoardSlot[];
  crews: BoardCrewView[];
  cells: BoardCellView[];
  filled: number;
  total: number;
  warnings: { crewName: string; date: string; label: string; level: CheckLevel }[];
  appliedRuleVersion: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState<BoardCrewView | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const cellAt = (slotKey: string, date: string) =>
    cells.find((c) => c.slotKey === slotKey && c.date === date);

  function drop(slotKey: string, date: string) {
    return (e: DragEvent) => {
      e.preventDefault();
      setHover(null);
      const crew = dragging;
      setDragging(null);
      if (!crew) return;
      startTransition(async () => {
        const res = await assignWatchAction(crew.crewMemberId, date, slotKey);
        setFlash(res.message);
        if (res.ok) router.refresh();
      });
    };
  }

  /** 外す対象。問いかけで確認してから配信する */
  const [removing, setRemoving] = useState<{ planId: string; label: string } | null>(null);
  const [removeMode, setRemoveMode] = useState("archive");

  function clear(planId: string, label: string) {
    startTransition(async () => {
      const res = await clearWatchAction(planId, label);
      setFlash(res.message);
      if (res.ok) router.refresh();
    });
  }

  const visibleCrews = query
    ? crews.filter((c) => (c.name + c.position).includes(query))
    : crews;

  return (
    <>
      <section className="ui-card flex flex-wrap items-center gap-4 px-5 py-4">
        <div className="min-w-[320px] flex-1">
          <h2 className="m-0 text-xl font-bold text-foreground-900">
            当直シフト作成 ／ {vesselName}・{fmtDateLabel(days[0] ?? "")}の週
          </h2>
          <p className="m-0 mt-1.5 text-sm text-foreground-500">
            左の乗組員カードを表の枡へドラッグして割り当てます。枡の × で外せます（30日以内は戻せます）
          </p>
        </div>
        <div className="flex items-center gap-2">
          {vessels.map((v) => (
            <Link
              key={v.id}
              href={`/shore/shifts?vessel=${v.id}`}
              aria-current={v.id === activeVesselId ? "true" : undefined}
              className={cn("ui-btn-quiet", v.id === activeVesselId && "ui-btn-selected")}
            >
              {v.name}
            </Link>
          ))}
        </div>
        <span className="font-mono text-sm text-foreground-500">
          {filled} / {total} 枡
        </span>
        {pending ? <span className="text-sm text-primary">配信中…</span> : null}
        <Link href="/shore/exports?set=shift" className="ui-btn-ghost h-[38px]">
          CSVで書き出す
        </Link>
      </section>

      <section className="grid items-start gap-3.5 xl:grid-cols-[264px_minmax(0,1fr)]">
        <div className="ui-card">
          <div className="border-b border-[var(--ui-hairline-strong)] px-4 py-3">
            <p className="m-0 font-mono text-2xs text-foreground-500">CREW / 乗組員</p>
            <p className="m-0 mt-1 text-xs text-foreground-400">カードを枡へドラッグ</p>
          </div>
          <div className="flex flex-col gap-2.5 p-3">
            <SearchField value={query} onChange={setQuery} className="w-full" />
            {visibleCrews.map((c) => (
              <div
                key={c.crewMemberId}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "copy";
                  e.dataTransfer.setData("text/plain", c.crewMemberId);
                  setDragging(c);
                }}
                onDragEnd={() => setDragging(null)}
                className="flex cursor-grab items-center gap-2.5 rounded-small border border-[var(--ui-hairline)] bg-content1 p-2.5 active:cursor-grabbing"
              >
                <span aria-hidden="true" className="font-mono text-base tracking-[-2px] text-foreground-400">
                  ⋮⋮
                </span>
                <CrewPhoto name={c.name} initial={c.photo} src={c.photoDataUrl} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold text-foreground-900">{c.name}</span>
                  <span className="block text-xs text-foreground-500">{c.position}</span>
                  <span className="mt-0.5 block font-mono text-xs text-primary">
                    この週 {c.assignedCount}本
                  </span>
                </span>
              </div>
            ))}
            {visibleCrews.length === 0 ? (
              <p className="m-0 text-sm text-foreground-500">配乗されている船員がいません。</p>
            ) : null}
          </div>
        </div>

        <div className="ui-card overflow-hidden">
          <div className="grid grid-cols-[80px_repeat(7,minmax(0,1fr))] border-b border-[var(--ui-hairline-strong)] bg-content2">
            <span className="px-3 py-2.5 text-xs text-foreground-400">時間帯</span>
            {days.map((d) => (
              <span
                key={d}
                className={cn(
                  "border-l border-[var(--ui-hairline)] px-2 py-2.5 text-xs",
                  d === today ? "font-bold text-primary" : "text-foreground-400",
                )}
              >
                {fmtDateLabel(d)}
                {d === today ? "（本日）" : ""}
              </span>
            ))}
          </div>
          {slots.map((slot) => (
            <div
              key={slot.key}
              className="grid grid-cols-[80px_repeat(7,minmax(0,1fr))] border-b border-[var(--ui-hairline)] last:border-b-0"
            >
              <span className="flex items-center bg-content2 px-3 py-3 font-mono text-sm text-foreground-800">
                {slot.label}
              </span>
              {days.map((d) => {
                const cell = cellAt(slot.key, d);
                const key = `${slot.key}|${d}`;
                return (
                  <div
                    key={key}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setHover(key);
                    }}
                    onDragLeave={() => setHover(null)}
                    onDrop={drop(slot.key, d)}
                    className={cn(
                      "relative flex min-h-[46px] items-center justify-center border-l border-[var(--ui-hairline)] px-2 py-2 text-sm",
                      hover === key && "bg-warning-100",
                      cell?.planId ? "bg-content1 font-medium text-foreground-900" : "text-foreground-300",
                      cell?.changed && "ring-1 ring-inset ring-primary",
                    )}
                  >
                    <span className="truncate">{cell?.crewName ?? "—"}</span>
                    {cell?.planId ? (
                      <button
                        type="button"
                        aria-label={`${fmtDateLabel(d)} ${slot.label} の割り当てを外す`}
                        onClick={() =>
                          setRemoving({
                            planId: cell.planId!,
                            label: `${vesselName} ${d} ${slot.label} ${cell.crewName ?? ""}`,
                          })
                        }
                        className="absolute right-1 top-1 h-[18px] w-[18px] rounded-[2px] border border-[var(--ui-hairline-strong)] bg-content1 text-xs leading-none text-foreground-500"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="ui-card">
        <div className="flex items-baseline justify-between gap-3 border-b border-[var(--ui-hairline-strong)] px-[18px] py-3.5">
          <h2 className="m-0 text-lg font-bold text-foreground-900">労務チェック（割当と同時に判定）</h2>
          <p className="m-0 text-xs text-foreground-400">
            適用ルール版 {appliedRuleVersion || "—"}
          </p>
        </div>
        {warnings.length === 0 ? (
          <p className="m-0 px-[18px] py-4 text-base text-foreground-500">
            いまの割り当てでは、日14h・週72h・休息の基準を外れる日はありません。
          </p>
        ) : (
          warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-[var(--ui-hairline)] px-[18px] py-3 last:border-b-0"
            >
              <StatusChip level={w.level} size="sm" />
              <span className="flex-1 text-base leading-relaxed text-foreground-700">
                {w.crewName} ／ {fmtDateLabel(w.date)} — {w.label}
              </span>
            </div>
          ))
        )}
      </section>

      <DeleteDialog
        open={removing !== null}
        kind="当直シフト"
        name={removing?.label ?? ""}
        modes={[
          { value: "archive", label: "配信を取り消す（推奨）" },
          { value: "delete", label: "削除する" },
        ]}
        mode={removeMode}
        onModeChange={setRemoveMode}
        effects={[
          "この枡の当直が外れ、船内の当直表からも消えます",
          "配信済みの計画は履歴として残り、誰がいつ外したかを追えます（12.6）",
          "船員の労務判定は外したあとの割り当てで計算し直されます",
        ]}
        runLabel={removeMode === "delete" ? "削除を実行する" : "この内容で取り消す"}
        onCancel={() => setRemoving(null)}
        onRun={() => {
          const target = removing;
          setRemoving(null);
          if (target) clear(target.planId, target.label);
        }}
      />

      <FlashToast message={flash} onDone={() => setFlash(null)} />
    </>
  );
}
