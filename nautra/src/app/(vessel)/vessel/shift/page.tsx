"use client";

import Link from "next/link";
import { useMemo } from "react";
import { addDays, startOfLocalDay, ymdLocal } from "@/domain/labor-law/evaluate";
import { buildIntervals } from "@/domain/labor-law/intervals";
import { t } from "@/i18n/ja";
import { SHIFT_TO_WORK } from "@/lib/assigned-work";
import { cn } from "@/lib/cn";
import { CREW_MEMBERS, personName } from "@/lib/crew";
import { fmtDateLabel, fmtDateTime, fmtTime } from "@/lib/format";
import { acknowledgeShiftChanges } from "@/lib/vessel-actions";
import { useAllRecords, useNowTick, useActiveCrew, useShiftPlans } from "@/lib/vessel-hooks";
import { STATION_SCENARIOS, type ShiftPlanPayload, type ShiftType } from "@/sync-protocol/records";
import { Accordion, AccordionItem, Button, Card, CardBody, CardHeader, Chip, Divider } from "@/ui";
import { CrewPicker } from "../_components/crew-picker";
import { GroupHeader } from "../_components/group-header";

/** 当直種別は白黒基調。種別は文言で区別する（色は情報を担わない） */
const SHIFT_COLOR: Record<ShiftType, "primary" | "default"> = {
  navigation_watch: "primary",
  engine_watch: "default",
  port_watch: "default",
  cargo_watch: "primary",
  off: "default",
};

function shiftWindow(p: ShiftPlanPayload): [Date, Date] | null {
  if (!p.date || !p.from || !p.to) return null;
  const s = startOfLocalDay(p.date);
  const e = startOfLocalDay(p.date);
  const [sh, sm] = p.from.split(":").map(Number);
  const [eh, em] = p.to.split(":").map(Number);
  s.setHours(sh, sm, 0, 0);
  e.setHours(eh, em, 0, 0);
  if (e <= s) e.setDate(e.getDate() + 1);
  return [s, e];
}

/**
 * V-08 シフト・配置表。当直シフト・通常配置表の参照（編集は陸上 S-10）と変更通知。
 * 計画は陸上正本（Pull で配信）、実績は船内の打刻（01）として別レコードに保持し、
 * 画面上で計画/実績を対比する（基本設計書 8.3「計画・実績分離」）。
 */
export default function ShiftPage() {
  const { crew, select: selectCrew, canSwitch } = useActiveCrew();
  const { watches, stations, changes, unread, byId, ackAt } = useShiftPlans();
  const records = useAllRecords();
  const now = useNowTick(60_000);
  const today = ymdLocal(now);

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

  const changedIds = useMemo(() => new Set(changes.map((c) => c.id)), [changes]);

  // 選択船員の本日シフトと実績（打刻区間）の対比
  const myToday = useMemo(() => {
    const plans = table.get(`${crew.id}|${today}`) ?? [];
    const intervals = buildIntervals(records.filter((r) => r.crewMemberId === crew.id));
    return plans.map((p) => {
      const win = shiftWindow(p);
      const cats = p.shiftType ? SHIFT_TO_WORK[p.shiftType] : [];
      const matched = win
        ? intervals.filter((iv) => {
            const ivEnd = iv.endAt ?? now;
            const overlaps = iv.startAt < win[1] && ivEnd > win[0];
            return overlaps && cats.includes(iv.workCategory);
          })
        : [];
      const started = win ? now >= win[0] : false;
      return { plan: p, matched, started };
    });
  }, [table, crew.id, today, records, now]);

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader
        group="04"
        right={
          <Chip size="sm" variant="flat" color={unread.length > 0 ? "danger" : "default"} radius="sm">
            変更通知 {unread.length}件
          </Chip>
        }
      />
      {canSwitch ? <CrewPicker selected={crew} onSelect={selectCrew} /> : null}

      {/* 本日の自分の当直（計画 vs 実績） */}
      <Card shadow="none" className="glass-tile">
        <CardHeader className="flex items-center justify-between">
          <span className="font-bold">本日の当直 ─ {crew.name}</span>
          <span className="text-sm text-foreground-600">{fmtDateLabel(today)}</span>
        </CardHeader>
        <Divider />
        <CardBody className="flex flex-col gap-2">
          {myToday.length === 0 ? (
            <p className="text-foreground-600">本日の当直予定はありません。</p>
          ) : (
            myToday.map(({ plan, matched, started }) => (
              <div key={plan.id} className="glass-inset flex flex-wrap items-center gap-2 p-3">
                <Chip variant="flat" color={plan.shiftType ? SHIFT_COLOR[plan.shiftType] : "default"} radius="sm">
                  {plan.shiftType ? t.shiftType[plan.shiftType] : "—"}
                </Chip>
                <span className="tabular-nums text-xl font-bold">
                  {plan.from}–{plan.to}
                </span>
                {changedIds.has(plan.id) ? (
                  <Chip size="sm" variant="flat" color="danger" radius="sm">
                    変更あり
                  </Chip>
                ) : null}
                <span className="ml-auto text-sm">
                  実績（打刻）:{" "}
                  {matched.length > 0 ? (
                    <span className="tabular-nums font-semibold">
                      ✓ {matched.map((iv) => `${fmtTime(iv.startAt.toISOString())}–${iv.endAt ? fmtTime(iv.endAt.toISOString()) : "作業中"}`).join(", ")}
                    </span>
                  ) : started ? (
                    <span className="font-semibold text-warning-700">⚠ 未打刻</span>
                  ) : (
                    <span className="text-foreground-600">開始前</span>
                  )}
                </span>
              </div>
            ))
          )}
          <p className="text-xs text-foreground-600">
            計画は陸上の配信値、実績は船内の打刻（01）です。両者は別レコードとして保持され、計画を実績で上書きしません。
          </p>
        </CardBody>
      </Card>

      {/* 変更通知 */}
      <Card shadow="none" className={cn("glass-tile", unread.length > 0 && "border-2 border-danger")}>
        <CardHeader className="flex items-center justify-between">
          <span className="font-bold">陸上からの変更通知</span>
          {unread.length > 0 ? (
            <Button size="sm" color="danger" variant="solid" className="min-h-10" onPress={() => void acknowledgeShiftChanges()}>
              {unread.length}件を確認済みにする
            </Button>
          ) : (
            <span className="text-sm text-foreground-600">
              未読なし{ackAt ? `（確認 ${fmtDateTime(ackAt)}）` : ""}
            </span>
          )}
        </CardHeader>
        <Divider />
        <CardBody className="flex flex-col gap-2">
          {changes.length === 0 ? (
            <p className="text-foreground-600">変更通知はありません。</p>
          ) : (
            changes.slice(0, 10).map((c) => {
              const prev = c.supersedesId ? byId.get(c.supersedesId) : undefined;
              const isUnread = unread.some((u) => u.id === c.id);
              return (
                <div key={c.id} className="glass-inset flex flex-col gap-1 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {isUnread ? (
                      <Chip size="sm" color="danger" variant="solid" radius="sm">
                        未読
                      </Chip>
                    ) : null}
                    <span className="font-semibold">{personName(c.crewMemberId)}</span>
                    <span>{c.date ? fmtDateLabel(c.date) : ""}</span>
                    <span className="tabular-nums">
                      {prev?.from && prev?.to ? (
                        <>
                          <span className="line-through text-foreground-600">
                            {prev.shiftType ? t.shiftType[prev.shiftType] : ""} {prev.from}–{prev.to}
                          </span>{" "}
                          →{" "}
                        </>
                      ) : null}
                      <span className="font-bold">
                        {c.shiftType ? t.shiftType[c.shiftType] : ""} {c.from}–{c.to}
                      </span>
                    </span>
                    <span className="ml-auto text-xs text-foreground-600">
                      配信 {fmtDateTime(c.publishedAt)} / {personName(c.publishedBy)}
                    </span>
                  </div>
                  {c.changeNote ? <p className="text-sm text-foreground-600">{c.changeNote}</p> : null}
                </div>
              );
            })
          )}
        </CardBody>
      </Card>

      {/* 週間当直表 */}
      <Card shadow="none" className="glass-tile">
        <CardHeader className="font-bold">週間当直表（昨日〜6日後）</CardHeader>
        <Divider />
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] text-left text-foreground-600">
                <th className="px-3 py-2 font-medium">船員</th>
                {days.map((d) => (
                  <th
                    key={d}
                    className={cn("px-2 py-2 text-center font-medium tabular-nums", d === today && "bg-content2 text-primary")}
                  >
                    {fmtDateLabel(d)}
                    {d === today ? "（本日）" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CREW_MEMBERS.map((c) => (
                <tr key={c.id} className={cn("border-b border-[var(--glass-border)] last:border-b-0", c.id === crew.id && "bg-content2/60")}>
                  <td className="px-3 py-2">
                    <p className="font-semibold">{c.name}</p>
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
                                  "rounded-small px-1.5 py-0.5 text-xs tabular-nums",
                                  p.shiftType === "navigation_watch" && "bg-primary/20 text-primary",
                                  p.shiftType === "engine_watch" && "bg-content3 text-foreground",
                                  p.shiftType === "cargo_watch" && "bg-foreground/10 text-foreground",
                                  p.shiftType === "port_watch" && "bg-content3 text-foreground",
                                  p.shiftType === "off" && "bg-content3 text-foreground-600",
                                  changedIds.has(p.id) && "ring-1 ring-danger",
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
        </CardBody>
      </Card>

      {/* 通常配置表 */}
      <Card shadow="none" className="glass-tile">
        <CardHeader className="font-bold">通常配置表</CardHeader>
        <Divider />
        <CardBody className="p-0">
          <Accordion selectionMode="multiple" defaultExpandedKeys={["arrival_departure"]}>
            {STATION_SCENARIOS.map((sc) => (
              <AccordionItem key={sc} aria-label={t.stationScenario[sc]} title={t.stationScenario[sc]}>
                <table className="w-full text-sm">
                  <tbody>
                    {stations
                      .filter((s) => s.scenario === sc)
                      .map((s) => (
                        <tr key={s.id} className={cn("border-b border-[var(--glass-border)] last:border-b-0", s.crewMemberId === crew.id && "bg-content2/60")}>
                          <td className="px-2 py-2 font-semibold">{personName(s.crewMemberId)}</td>
                          <td className="px-2 py-2">{s.station}</td>
                          <td className="px-2 py-2 text-foreground-600">{s.duty}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </AccordionItem>
            ))}
          </Accordion>
        </CardBody>
      </Card>

      <p className="text-xs text-foreground-600">
        シフト・配置表の作成と変更は陸上アプリ（S-10）で行います。船内は参照のみです。
        デモ: <Link href="/shore/shifts" className="text-primary underline-offset-2 hover:underline">陸上でシフトを変更する →</Link>
        （変更は同期で本画面に届き、変更通知として表示されます）
      </p>
    </div>
  );
}
