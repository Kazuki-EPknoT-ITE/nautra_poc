"use client";

import { useMemo, useState } from "react";
import { addDays } from "@/domain/labor-law/evaluate";
import { cn } from "@/lib/cn";
import { CREW_MEMBERS } from "@/lib/crew";
import { fmtDateLabel } from "@/lib/format";
import { useLocale } from "@/lib/use-locale";
import { appendRecord, newRecordBase } from "@/lib/vessel-actions";
import type { ShiftPlanPayload, ShiftType } from "@/sync-protocol/records";

const TYPES: ShiftType[] = ["navigation_watch", "engine_watch", "port_watch", "cargo_watch"];

/**
 * 船長が船内で当直を作る・変える（レビュー SHIFT-04。利用者の判断「船長だけ船内で作成可」）。
 *
 * 計画は陸上正本だが、船長に限って船内からも配信できる。作った計画は陸上と同じ `shift_plan` として
 * 同期され、陸上の配置表と労務チェックにそのまま出る。同じ当直を陸上と船長が別々に変えた場合は、
 * 双方を残して「競合（要確認）」として示す（自動では解決しない）。サーバも記録者が船長かを確かめる。
 */
export function CaptainShiftEditor({
  sessionId,
  today,
  watches,
}: {
  sessionId: string;
  today: string;
  watches: ShiftPlanPayload[];
}) {
  const { tr } = useLocale();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i - 1)), [today]);
  const [crewId, setCrewId] = useState(CREW_MEMBERS[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [targetId, setTargetId] = useState<string>("");
  const [shiftType, setShiftType] = useState<ShiftType>("navigation_watch");
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("12:00");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  /** 選んだ船員・日の当直（変えるときの対象） */
  const existing = watches
    .filter((w) => w.crewMemberId === crewId && w.date === date)
    .sort((a, b) => (a.from ?? "").localeCompare(b.from ?? ""));

  function pickTarget(id: string) {
    setTargetId(id);
    const w = existing.find((x) => x.id === id);
    if (w) {
      setShiftType((w.shiftType as ShiftType) ?? "navigation_watch");
      setFrom(w.from ?? "08:00");
      setTo(w.to ?? "12:00");
    }
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to) || from === to) {
        throw new Error("開始と終了の時刻を確かめてください");
      }
      const now = new Date();
      const base = await newRecordBase(sessionId, now, targetId || undefined);
      const payload: ShiftPlanPayload = {
        ...base,
        // 計画の時刻（いつの当直か）。記録した時刻は recordedAt に残る
        occurredAt: new Date(`${date}T${from}:00`).toISOString(),
        planType: "watch",
        crewMemberId: crewId,
        date,
        shiftType,
        from,
        to,
        publishedAt: now.toISOString(),
        publishedBy: sessionId,
        changeNote: targetId ? "船長が船内で変更" : "船長が船内で作成",
      };
      await appendRecord("shift_plan", payload);
      const name = CREW_MEMBERS.find((c) => c.id === crewId)?.name ?? crewId;
      setResult({
        ok: true,
        message: `${name} の当直を${targetId ? "変更" : "作成"}しました（${fmtDateLabel(date)} ${from}–${to}）。同期すると陸上にも届きます`,
      });
      setTargetId("");
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="当直を作る・変える" className="ui-card flex flex-col gap-3 p-4">
      <h2 className="m-0 text-xl font-bold text-foreground-900">当直を作る・変える</h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="船員">
        {CREW_MEMBERS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={crewId === c.id}
            onClick={() => {
              setCrewId(c.id);
              setTargetId("");
            }}
            className={cn("ui-btn-quiet min-h-11 !text-base", crewId === c.id && "ui-btn-selected")}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="日">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={date === d}
            onClick={() => {
              setDate(d);
              setTargetId("");
            }}
            className={cn("ui-btn-quiet min-h-11 font-mono !text-base", date === d && "ui-btn-selected")}
          >
            {fmtDateLabel(d)}
          </button>
        ))}
      </div>
      {existing.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="変える当直">
          <span className="text-base text-foreground-600">変える当直</span>
          <button type="button" aria-pressed={targetId === ""} onClick={() => setTargetId("")} className={cn("ui-btn-quiet min-h-11 !text-base", targetId === "" && "ui-btn-selected")}>
            ＋ 新しく作る
          </button>
          {existing.map((w) => (
            <button
              key={w.id}
              type="button"
              aria-pressed={targetId === w.id}
              onClick={() => pickTarget(w.id)}
              className={cn("ui-btn-quiet min-h-11 font-mono !text-base", targetId === w.id && "ui-btn-selected")}
            >
              {w.from}–{w.to}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2" role="group" aria-label="当直の種別">
        {TYPES.map((k) => (
          <button key={k} type="button" aria-pressed={shiftType === k} onClick={() => setShiftType(k)} className={cn("ui-btn-quiet min-h-11 !text-base", shiftType === k && "ui-btn-selected")}>
            {tr("shiftType", k)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="開始" type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="ui-field !w-auto font-mono text-lg" />
        <span className="text-lg">–</span>
        <input aria-label="終了" type="time" value={to} onChange={(e) => setTo(e.target.value)} className="ui-field !w-auto font-mono text-lg" />
        <button type="button" onClick={() => void submit()} disabled={busy} className="ui-btn-primary ml-auto min-h-12 px-6 text-lg">
          {busy ? "配信中…" : targetId ? "この内容に変える" : "当直を作る"}
        </button>
      </div>
      {result ? (
        <p role="status" className={cn("m-0 text-base", result.ok ? "text-foreground-800" : "text-danger")}>
          {result.ok ? "✓" : "✕"} {result.message}
        </p>
      ) : null}
    </section>
  );
}
