"use client";

import { useMemo, useState } from "react";
import { startOfLocalDay, ymdLocal } from "@/domain/labor-law/evaluate";
import { WORK_CATEGORIES, type TimeRecord, type WorkCategory } from "@/domain/labor-law/types";
import { cn } from "@/lib/cn";
import { CREW_MEMBERS, personName } from "@/lib/crew";
import { fmtDateTime, fmtTimeSec } from "@/lib/format";
import { useLocale } from "@/lib/use-locale";
import { recordPunch } from "@/lib/vessel-actions";
import {
  useApprovals,
  useCrewRecords,
  useNowTick,
  usePermission,
  useSessionCrew,
} from "@/lib/vessel-hooks";
import { Section, StatusChip } from "@/ui";
import { Select, SelectItem } from "@/ui/heroui";
import { GroupHeader } from "../_components/group-header";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function parseLocal(dateStr: string, timeStr: string): Date {
  const d = startOfLocalDay(dateStr);
  const [h, m] = timeStr.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

function dayLabel(date: string, today: string): string {
  const d = startOfLocalDay(date);
  const diff = Math.round((startOfLocalDay(today).getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return "今日";
  if (diff === 1) return "昨日";
  if (diff === 2) return "一昨日";
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

function shiftDays(date: string, days: number): string {
  const d = startOfLocalDay(date);
  d.setDate(d.getDate() + days);
  return ymdLocal(d);
}

/**
 * V-02 打刻履歴・事後入力（デザイン正本 `design/poc_design` の `atHistory`）。
 *
 * 打刻そのもの（V-01）とは別画面にする。**その日の記録を確かめる**のと
 * **いま打刻する**のは目的が違い、同じ画面に載せると打刻ボタンまでが遠くなるため。
 *
 * - 表示は**自分の記録のみ**。船長だけが他船員の打刻を参照できる（11.2）。参照だけで、
 *   直接の修正は誰にもできない（訂正は差戻し → 本人の再入力。ガードレール②）
 * - 事後入力は**理由が必須**。履歴には「事後入力」と残り、後から経緯を追える
 */
export default function VesselHistoryPage() {
  const session = useSessionCrew();
  const canAfterEntry = usePermission("punch_after_entry");
  const canAdjustCrew = usePermission("adjust_crew_punch");
  const { tr } = useLocale();
  const now = useNowTick(30_000);
  const today = ymdLocal(now);

  const myId = session?.id ?? "";
  const [viewCrew, setViewCrew] = useState("");
  const viewCrewId = canAdjustCrew && viewCrew ? viewCrew : myId;
  const isViewingOther = viewCrewId !== myId;

  const [date, setDate] = useState(today);
  const records = useCrewRecords(viewCrewId);
  const approvals = useApprovals();

  const supersededIds = useMemo(
    () => new Set(records.filter((r) => r.supersedesId).map((r) => r.supersedesId as string)),
    [records],
  );
  const remandByRecordId = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of approvals) {
      if (a.decision === "remanded" && a.targetRecordId) map.set(a.targetRecordId, a.reason ?? "差戻し");
    }
    return map;
  }, [approvals]);

  const rows = useMemo(
    () =>
      records
        .filter((r) => ymdLocal(new Date(r.occurredAt)) === date)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    [records, date],
  );

  /* ───────── 事後入力 ───────── */
  const [afterDate, setAfterDate] = useState(today);
  const [afterCategory, setAfterCategory] = useState<WorkCategory>("cargo");
  const [afterFrom, setAfterFrom] = useState("08:00");
  const [afterTo, setAfterTo] = useState("12:00");
  const [afterReason, setAfterReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function submitAfterEntry() {
    setFormError(null);
    if (!session) return;
    if (!afterReason.trim()) {
      setFormError("事後入力には理由の記入が必要です");
      return;
    }
    const from = parseLocal(afterDate, afterFrom);
    const to = parseLocal(afterDate, afterTo);
    if (to.getTime() <= from.getTime()) {
      setFormError("終了時刻は開始時刻より後にしてください");
      return;
    }
    try {
      await recordPunch({
        crewMemberId: session.id,
        workCategory: afterCategory,
        action: "start",
        entryType: "after",
        occurredAt: from,
        note: afterReason.trim(),
      });
      await recordPunch({
        crewMemberId: session.id,
        workCategory: afterCategory,
        action: "end",
        entryType: "after",
        occurredAt: to,
        note: afterReason.trim(),
      });
      setFlash(`${tr("workCategory", afterCategory)} を事後入力しました（${afterDate}）`);
      setAfterReason("");
      setDate(afterDate);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  }

  /* ───────── 差戻し分の再入力 ───────── */
  const [resubmitTarget, setResubmitTarget] = useState<TimeRecord | null>(null);
  const [resubmitDate, setResubmitDate] = useState(today);
  const [resubmitTime, setResubmitTime] = useState("17:00");

  function openResubmit(record: TimeRecord) {
    setResubmitTarget(record);
    const d = new Date(record.occurredAt);
    setResubmitDate(ymdLocal(d));
    setResubmitTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    setFormError(null);
  }

  async function submitResubmit() {
    if (!resubmitTarget || !session) return;
    setFormError(null);
    try {
      await recordPunch({
        crewMemberId: session.id,
        workCategory: resubmitTarget.workCategory,
        action: resubmitTarget.action,
        entryType: "resubmit",
        occurredAt: parseLocal(resubmitDate, resubmitTime),
        supersedesId: resubmitTarget.id,
      });
      setFlash("差戻し分を再入力しました（元の打刻は訂正済として保持されます）");
      setResubmitTarget(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!session) return null;

  const quickDays = [today, shiftDays(today, -1), shiftDays(today, -2)];

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="01" subtitle="打刻の履歴と事後入力" />

      <div className="flex flex-wrap items-center gap-2.5">
        {quickDays.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDate(d)}
            aria-pressed={date === d}
            className={cn("ui-btn-ghost min-h-[52px] text-lg", date === d && "ui-btn-selected")}
          >
            {dayLabel(d, today)}
          </button>
        ))}
        <label className="ml-auto inline-flex min-h-[52px] cursor-pointer items-center gap-2.5 rounded-small border border-[var(--ui-hairline-strong)] bg-content1 px-3.5">
          <span className="text-lg text-foreground-500">日付を指定</span>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="cursor-pointer border-none bg-transparent font-mono text-xl text-foreground-800"
          />
        </label>
      </div>

      {canAdjustCrew ? (
        <Section
          title="表示する船員"
          divided={false}
          bodyClassName="pt-0"
        >
          <Select
            aria-label="表示する船員"
            size="sm"
            className="max-w-xs"
            selectedKeys={[viewCrewId]}
            onSelectionChange={(keys) => {
              const k = [...keys][0];
              setViewCrew(k ? String(k) : "");
            }}
          >
            {CREW_MEMBERS.map((c) => (
              <SelectItem key={c.id}>{`${c.name}（${c.position}）`}</SelectItem>
            ))}
          </Select>
        </Section>
      ) : null}

      {flash ? (
        <p className="ui-card border-primary px-4 py-3 text-lg font-semibold">✓ {flash}</p>
      ) : null}

      <Section
        title={`${dayLabel(date, today)} の打刻`}
        note={isViewingOther ? `${personName(viewCrewId)} の記録` : undefined}
        bodyClassName="p-0"
      >
        {rows.length === 0 ? (
          <p className="m-0 px-4 py-5 text-lg text-foreground-500">
            この日の打刻はありません。打刻し忘れの場合は、下の「後から打刻を追加する」から入力してください。
          </p>
        ) : (
          <div>
            {rows.map((r) => {
              const superseded = supersededIds.has(r.id);
              const remand = !superseded ? remandByRecordId.get(r.id) : undefined;
              return (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 border-b border-[var(--ui-hairline)] px-4 py-3 last:border-b-0"
                >
                  <div className="flex flex-wrap items-center gap-3.5">
                    <span
                      className={cn(
                        "flex-none basis-[88px] font-mono text-xl tabular-nums text-foreground-800",
                        superseded && "line-through opacity-60",
                      )}
                    >
                      {fmtTimeSec(r.occurredAt)}
                    </span>
                    <span className={cn("flex-1 text-lg text-foreground-700", superseded && "line-through opacity-60")}>
                      {tr("workCategory", r.workCategory)}
                    </span>
                    <span className="flex-none basis-16 text-lg text-foreground-500">
                      {tr("action", r.action)}
                    </span>
                    <span className="rounded-small bg-default-100 px-2 py-[3px] text-xs font-semibold text-foreground-700">
                      {tr("entryType", r.entryType)}
                    </span>
                    {r.exceptionKind ? (
                      <span className="rounded-small bg-warning-100 px-2 py-[3px] text-xs font-semibold text-warning-700">
                        ⚑ 別枠 {tr("exceptionalWork", r.exceptionKind)}
                      </span>
                    ) : null}
                    {superseded ? <StatusChip level="none" label="訂正済（原本は保持）" /> : null}
                    {remand ? <StatusChip level="violation" label="差戻し" /> : null}
                  </div>
                  {r.note ? <p className="m-0 text-base text-foreground-500">理由: {r.note}</p> : null}
                  {remand ? (
                    <div className="flex flex-col items-start gap-2">
                      <p className="m-0 text-base text-danger">{remand}</p>
                      {canAfterEntry && !isViewingOther ? (
                        <button type="button" onClick={() => openResubmit(r)} className="ui-btn-danger min-h-11">
                          正しい時刻で再入力する
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {resubmitTarget ? (
        <Section title="差戻し分の再入力" divided={false}>
          <p className="m-0 mb-3 text-base leading-relaxed text-foreground-500">
            対象: {tr("workCategory", resubmitTarget.workCategory)} {tr("action", resubmitTarget.action)}（
            {fmtDateTime(resubmitTarget.occurredAt)}）。正しい日時で再入力すると、元の打刻は「訂正済」と
            なり集計から外れます（元レコードは保全されます）。
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-[5px] block text-base text-foreground-500">正しい日付</span>
              <input
                type="date"
                value={resubmitDate}
                max={today}
                onChange={(e) => setResubmitDate(e.target.value)}
                className="ui-field min-h-[52px] font-mono text-xl"
              />
            </label>
            <label className="block">
              <span className="mb-[5px] block text-base text-foreground-500">正しい時刻</span>
              <input
                type="time"
                value={resubmitTime}
                onChange={(e) => setResubmitTime(e.target.value)}
                className="ui-field min-h-[52px] font-mono text-xl"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-3">
            <button type="button" onClick={() => setResubmitTarget(null)} className="ui-btn-ghost min-h-14 flex-none px-6 text-lg">
              やめる
            </button>
            <button type="button" onClick={() => void submitResubmit()} className="ui-btn-danger min-h-14 flex-1 text-lg">
              再入力を登録
            </button>
          </div>
        </Section>
      ) : null}

      {canAfterEntry && !isViewingOther ? (
        <Section title="後から打刻を追加する" divided={false}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-[5px] block text-base text-foreground-500">日付</span>
              <input
                type="date"
                value={afterDate}
                max={today}
                onChange={(e) => setAfterDate(e.target.value)}
                className="ui-field min-h-[52px] font-mono text-xl"
              />
            </label>
            <label className="block">
              <span className="mb-[5px] block text-base text-foreground-500">作業種別</span>
              <select
                value={afterCategory}
                onChange={(e) => setAfterCategory(e.target.value as WorkCategory)}
                className="ui-field min-h-[52px] text-xl"
              >
                {WORK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {tr("workCategory", c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-[5px] block text-base text-foreground-500">開始</span>
              <input
                type="time"
                value={afterFrom}
                onChange={(e) => setAfterFrom(e.target.value)}
                className="ui-field min-h-[52px] font-mono text-xl"
              />
            </label>
            <label className="block">
              <span className="mb-[5px] block text-base text-foreground-500">終了</span>
              <input
                type="time"
                value={afterTo}
                onChange={(e) => setAfterTo(e.target.value)}
                className="ui-field min-h-[52px] font-mono text-xl"
              />
            </label>
          </div>
          <label className="mt-3 block">
            <span className="mb-[5px] block text-base text-foreground-500">理由（必須）</span>
            <textarea
              value={afterReason}
              onChange={(e) => setAfterReason(e.target.value)}
              rows={2}
              placeholder="例）端末の電池切れのため、荷役終了を後から入力します。"
              className="ui-field min-h-16 text-lg"
            />
          </label>
          {formError ? <p className="mt-2 text-lg text-danger">✕ {formError}</p> : null}
          <button
            type="button"
            onClick={() => void submitAfterEntry()}
            className="ui-btn-primary mt-3.5 min-h-14 w-full text-2xl"
          >
            事後入力を記録する
          </button>
        </Section>
      ) : null}
    </div>
  );
}
