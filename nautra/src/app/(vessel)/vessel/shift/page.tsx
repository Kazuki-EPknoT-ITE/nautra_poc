"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addDays, ymdLocal } from "@/domain/labor-law/evaluate";
import { buildIntervals } from "@/domain/labor-law/intervals";
import { SHIFT_TO_WORK } from "@/lib/assigned-work";
import { cn } from "@/lib/cn";
import { personName } from "@/lib/crew";
import { fmtDateLabel, fmtDateTime, fmtTime } from "@/lib/format";
import { useLocale } from "@/lib/use-locale";
import {
  describeActual,
  describeShiftChange,
  describeWatchStatus,
  shiftWindow,
  watchStatus,
} from "@/lib/shift-plain";
import { acknowledgeShiftChanges } from "@/lib/vessel-actions";
import {
  useCrewRecords,
  useNowTick,
  usePermission,
  useSessionCrew,
  useShiftPlans,
} from "@/lib/vessel-hooks";
import { STATION_SCENARIOS, type ShiftPlanPayload } from "@/sync-protocol/records";
import { Button, Card, CardBody, CardHeader, Chip, Divider } from "@/ui";
import { CrewWatchTable } from "../_components/crew-watch-table";
import { GroupHeader } from "../_components/group-header";

/**
 * V-08 シフト・配置表。当直シフト・通常配置表の参照（編集は陸上 S-10）と変更通知。
 *
 * - **当直はサインイン中の本人の分だけ**を表示する。全員の当直表は船長（view_all_crew）のみ。
 * - **通常配置表は船内全員の持ち場**を表示する（非常配置は全員が互いの持ち場を知る必要がある）。
 *   陸上の変更は SSE 通知（`useLiveSync`）で即座に反映される。
 * - 計画は陸上正本（Pull で配信）、実績は船内の打刻（01）として別レコードに保持し、
 *   画面上で計画/実績を対比する（基本設計書 8.3「計画・実績分離」）。
 */
export default function ShiftPage() {
  const session = useSessionCrew();
  const { tr } = useLocale(); // 当直種別・配置場面の表示言語（10.2）
  const canViewAll = usePermission("view_all_crew"); // 全員の当直表は船長のみ
  const { watches, stations, changes, unread, byId, ackAt } = useShiftPlans();
  const now = useNowTick(30_000);
  const today = ymdLocal(now);
  const selfId = session?.id ?? "";
  const records = useCrewRecords(selfId); // 実績は本人の打刻のみ読む
  const [showAll, setShowAll] = useState(false);

  /** 本人の当直（本日） */
  const myToday = useMemo(
    () =>
      watches
        .filter((w) => w.crewMemberId === selfId && w.date === today)
        .sort((a, b) => (a.from ?? "").localeCompare(b.from ?? "")),
    [watches, selfId, today],
  );
  const status = useMemo(() => watchStatus(myToday, now), [myToday, now]);
  const plain = describeWatchStatus(status);

  /** 予定ごとの実績（打刻）対比 */
  const intervals = useMemo(() => buildIntervals(records), [records]);
  const withActual = useMemo(
    () =>
      myToday.map((plan) => {
        const win = shiftWindow(plan);
        const cats = plan.shiftType ? SHIFT_TO_WORK[plan.shiftType] : [];
        const matched = win
          ? intervals.filter((iv) => {
              const ivEnd = iv.endAt ?? now;
              return iv.startAt < win[1] && ivEnd > win[0] && cats.includes(iv.workCategory);
            })
          : [];
        return {
          plan,
          matched,
          started: win ? now >= win[0] : false,
          onDuty: win ? now >= win[0] && now < win[1] : false,
        };
      }),
    [myToday, intervals, now],
  );

  /** 本人の今週の当直（昨日〜6日後） */
  const myWeek = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 1));
    return days.map((d) => ({
      date: d,
      plans: watches
        .filter((w) => w.crewMemberId === selfId && w.date === d)
        .sort((a, b) => (a.from ?? "").localeCompare(b.from ?? "")),
    }));
  }, [watches, selfId, today]);

  const changedIds = useMemo(() => new Set(changes.map((c) => c.id)), [changes]);

  /** 変更通知は本人の分のみ（船長は全員分） */
  const myChanges = useMemo(
    () => (canViewAll && showAll ? changes : changes.filter((c) => c.crewMemberId === selfId)),
    [changes, canViewAll, showAll, selfId],
  );
  const myUnread = useMemo(
    () => (canViewAll && showAll ? unread : unread.filter((c) => c.crewMemberId === selfId)),
    [unread, canViewAll, showAll, selfId],
  );

  /** 通常配置表: 自分の持ち場（場面別）と船内全員の配置 */
  const myStations = useMemo(
    () => stations.filter((s) => s.crewMemberId === selfId),
    [stations, selfId],
  );

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader
        group="04"
        right={
          myUnread.length > 0 ? (
            <Chip size="sm" variant="flat" color="warning" radius="sm">
              変更 {myUnread.length}件
            </Chip>
          ) : null
        }
      />

      {/* いまの状態（初めてでも一目で分かる大きな表示） */}
      <Card shadow="none" className="glass-tile">
        <CardBody className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-baseline gap-3">
            <span aria-hidden="true" className="text-3xl">
              {plain.icon}
            </span>
            <span className="text-2xl font-bold">{plain.title}</span>
            <span className="ml-auto text-sm text-foreground-600">
              {session ? `${session.name}（${session.position}）` : "—"} / {fmtDateLabel(today)}
            </span>
          </div>
          {plain.detail ? <p className="text-lg text-foreground-600">{plain.detail}</p> : null}
          {status.state === "on_duty" && status.current ? (
            <div className="glass-inset flex flex-wrap items-center gap-3 p-4">
              <span className="tabular-nums text-3xl font-bold">
                {status.current.plan.from}–{status.current.plan.to}
              </span>
              <span className="text-lg">
                {status.current.plan.shiftType ? tr("shiftType", status.current.plan.shiftType) : ""}
              </span>
              <Button
                as={Link}
                href="/vessel/punch"
                color="primary"
                radius="lg"
                className="ml-auto min-h-12 px-6 text-base font-bold"
              >
                打刻する
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* 本日の予定と打刻 */}
      <Card shadow="none" className="glass-tile">
        <CardHeader className="font-bold">本日の当直（あなたの分）</CardHeader>
        <Divider />
        <CardBody className="flex flex-col gap-2">
          {withActual.length === 0 ? (
            <p className="text-foreground-600">本日の当直はありません。</p>
          ) : (
            withActual.map(({ plan, matched, started, onDuty }) => (
              <div
                key={plan.id}
                className={cn("glass-inset flex flex-col gap-1 p-4", onDuty && "border-2 border-primary")}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="tabular-nums text-2xl font-bold">
                    {plan.from}–{plan.to}
                  </span>
                  <span className="text-lg">{plan.shiftType ? tr("shiftType", plan.shiftType) : "—"}</span>
                  {onDuty ? (
                    <Chip size="sm" color="primary" variant="solid" radius="sm">
                      ● 当直中
                    </Chip>
                  ) : null}
                  {changedIds.has(plan.id) ? (
                    <Chip size="sm" variant="flat" color="warning" radius="sm">
                      ✎ 変更されました
                    </Chip>
                  ) : null}
                </div>
                <p
                  className={cn(
                    "text-base",
                    matched.length > 0
                      ? "text-foreground-600"
                      : onDuty
                        ? "font-semibold text-warning-700"
                        : "text-foreground-600",
                  )}
                >
                  {matched.length > 0 ? "✓ " : onDuty ? "⚠ " : "－ "}
                  {describeActual(matched.length, started, onDuty)}
                  {matched.length > 0 ? (
                    <span className="ml-2 tabular-nums">
                      {matched
                        .map(
                          (iv) =>
                            `${fmtTime(iv.startAt.toISOString())}–${iv.endAt ? fmtTime(iv.endAt.toISOString()) : "作業中"}`,
                        )
                        .join(", ")}
                    </span>
                  ) : null}
                </p>
              </div>
            ))
          )}
          <p className="text-xs text-foreground-600">
            予定は陸上が決めた計画、実績はあなたの打刻（01）です。計画を実績で上書きしません。
          </p>
        </CardBody>
      </Card>

      {/* 変更通知 */}
      <Card shadow="none" className={cn("glass-tile", myUnread.length > 0 && "border-2 border-warning")}>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold">陸上からのお知らせ（予定の変更）</span>
          {myUnread.length > 0 ? (
            <Button
              size="sm"
              color="primary"
              className="min-h-10"
              onPress={() => void acknowledgeShiftChanges()}
            >
              {myUnread.length}件を確認しました
            </Button>
          ) : (
            <span className="text-sm text-foreground-600">
              新しいお知らせはありません{ackAt ? `（最終確認 ${fmtDateTime(ackAt)}）` : ""}
            </span>
          )}
        </CardHeader>
        <Divider />
        <CardBody className="flex flex-col gap-2">
          {myChanges.length === 0 ? (
            <p className="text-foreground-600">予定の変更はありません。</p>
          ) : (
            myChanges.slice(0, 10).map((c) => {
              const prev = c.supersedesId ? byId.get(c.supersedesId) : undefined;
              const isUnread = myUnread.some((u) => u.id === c.id);
              return (
                <div key={c.id} className="glass-inset flex flex-col gap-1 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {isUnread ? (
                      <Chip size="sm" color="warning" variant="flat" radius="sm">
                        未確認
                      </Chip>
                    ) : null}
                    {c.crewMemberId !== selfId ? (
                      <span className="font-semibold">{personName(c.crewMemberId)}</span>
                    ) : null}
                    <span className="text-base font-semibold">
                      {c.date ? `${fmtDateLabel(c.date)}: ` : ""}
                      {describeShiftChange(c, prev)}
                    </span>
                  </div>
                  {c.changeNote ? <p className="text-sm text-foreground-600">理由: {c.changeNote}</p> : null}
                  <p className="text-xs text-foreground-600">
                    陸上 {personName(c.publishedBy)} が {fmtDateTime(c.publishedAt)} に配信
                  </p>
                </div>
              );
            })
          )}
        </CardBody>
      </Card>

      {/* 通常配置表: あなたの持ち場 */}
      <Card shadow="none" className="glass-tile">
        <CardHeader className="font-bold">あなたの持ち場（通常配置表）</CardHeader>
        <Divider />
        <CardBody className="flex flex-col gap-2">
          {STATION_SCENARIOS.map((sc) => {
            const mine = myStations.find((s) => s.scenario === sc);
            return (
              <div key={sc} className="glass-inset flex flex-wrap items-center gap-3 p-4">
                <span className="w-44 shrink-0 text-foreground-600">{tr("stationScenario", sc)}</span>
                <span className="text-xl font-bold">{mine?.station ?? "配置なし"}</span>
                {mine?.duty ? <span className="text-foreground-600">{mine.duty}</span> : null}
                {mine && changedIds.has(mine.id) ? (
                  <Chip size="sm" variant="flat" color="warning" radius="sm">
                    ✎ 変更されました
                  </Chip>
                ) : null}
              </div>
            );
          })}
        </CardBody>
      </Card>

      {/* 通常配置表: 船内全員 */}
      <Card shadow="none" className="glass-tile">
        <CardHeader className="font-bold">船内の配置（全員）</CardHeader>
        <Divider />
        <CardBody className="flex flex-col gap-4">
          {STATION_SCENARIOS.map((sc) => (
            <div key={sc} className="flex flex-col gap-1">
              <h3 className="font-bold text-foreground-600">{tr("stationScenario", sc)}</h3>
              <StationRows
                rows={stations.filter((s) => s.scenario === sc)}
                selfId={selfId}
                changedIds={changedIds}
              />
            </div>
          ))}
          <p className="text-xs text-foreground-600">
            配置は陸上が変更すると、この画面にすぐ反映されます（変更された行には「変更」が付きます）。
          </p>
        </CardBody>
      </Card>

      {/* 今週の当直（本人。船長は全員表示に切替可） */}
      <Card shadow="none" className="glass-tile">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold">今週の当直{canViewAll && showAll ? "（全員）" : "（あなたの分）"}</span>
          {canViewAll ? (
            <Button
              size="sm"
              variant="bordered"
              className="min-h-10 border-[var(--glass-border-strong)]"
              onPress={() => setShowAll((v) => !v)}
            >
              {showAll ? "自分の分だけ表示" : "全員の当直表を見る"}
            </Button>
          ) : null}
        </CardHeader>
        <Divider />
        <CardBody className={canViewAll && showAll ? "p-0" : undefined}>
          {canViewAll && showAll ? (
            <CrewWatchTable watches={watches} today={today} changedIds={changedIds} selfId={selfId} />
          ) : (
            <div className="flex flex-col gap-1">
              {myWeek.map(({ date, plans }) => (
                <div
                  key={date}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-medium px-3 py-2",
                    date === today && "glass-inset font-semibold",
                  )}
                >
                  <span className="w-28 shrink-0 tabular-nums">
                    {fmtDateLabel(date)}
                    {date === today ? "（本日）" : ""}
                  </span>
                  {plans.length === 0 ? (
                    <span className="text-foreground-600">当直なし</span>
                  ) : (
                    plans.map((p) => (
                      <span key={p.id} className="tabular-nums">
                        {p.shiftType ? tr("shiftType", p.shiftType) : ""} {p.from}–{p.to}
                        {changedIds.has(p.id) ? (
                          <span className="ml-1 text-warning-700">✎ 変更</span>
                        ) : null}
                      </span>
                    ))
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <p className="text-xs text-foreground-600">
        当直・配置の作成と変更は陸上アプリ（S-10）で行います。船内は参照のみです。
        デモ:{" "}
        <Link href="/shore/shifts" className="text-primary underline-offset-2 hover:underline">
          陸上で当直・配置を変更する →
        </Link>
      </p>
    </div>
  );
}

/** 場面ごとの配置一覧（自分の行は「あなた」と明示する） */
function StationRows({
  rows,
  selfId,
  changedIds,
}: {
  rows: ShiftPlanPayload[];
  selfId: string;
  changedIds: Set<string>;
}) {
  if (rows.length === 0) return <p className="text-sm text-foreground-600">配置の登録がありません。</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((s) => (
          <tr
            key={s.id}
            className={cn(
              "border-b border-[var(--glass-border)] last:border-b-0",
              s.crewMemberId === selfId && "bg-content2/60",
            )}
          >
            <td className="px-2 py-2 font-semibold">
              {personName(s.crewMemberId)}
              {s.crewMemberId === selfId ? (
                <span className="ml-1 text-xs text-foreground-600">（あなた）</span>
              ) : null}
            </td>
            <td className="px-2 py-2">{s.station}</td>
            <td className="px-2 py-2 text-foreground-600">{s.duty}</td>
            <td className="px-2 py-2 text-right">
              {changedIds.has(s.id) ? <span className="text-warning-700">✎ 変更</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
