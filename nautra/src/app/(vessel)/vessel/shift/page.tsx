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
import { Button, Card, CardBody, CardHeader, Chip, Divider } from "@/ui/heroui";
import { CrewWatchTable } from "../_components/crew-watch-table";
import { CaptainShiftEditor } from "../_components/captain-shift-editor";
import { GroupHeader } from "../_components/group-header";
import { StationMatrix, WeekTimeline } from "./_components/week-timeline";

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
  const canManageShift = usePermission("manage_shift"); // 当直の作成・変更も船長のみ（SHIFT-04）
  const { watches, stations, changes, unread, byId, ackAt, conflictIds, rejected } = useShiftPlans();
  const now = useNowTick(30_000);
  const today = ymdLocal(now);
  const selfId = session?.id ?? "";
  const records = useCrewRecords(selfId); // 実績は本人の打刻のみ読む
  const [showAll, setShowAll] = useState(false);
  // 変更通知は新しい4件だけ出し、残りは「もっと見る」（一覧を全件出さない）
  const [moreChanges, setMoreChanges] = useState(false);

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
      <Card shadow="none" className="ui-card">
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
            <div className="ui-inset flex flex-wrap items-center gap-3 p-4">
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
      <Card shadow="none" className="ui-card">
        <CardHeader className="border-l-4 border-primary pl-3 text-xl font-bold">本日の当直（あなたの分）</CardHeader>
        <Divider />
        <CardBody className="flex flex-col gap-2">
          {withActual.length === 0 ? (
            <p className="text-foreground-600">本日の当直はありません。</p>
          ) : (
            withActual.map(({ plan, matched, started, onDuty }) => (
              <div
                key={plan.id}
                className={cn("ui-inset flex flex-col gap-1 p-4", onDuty && "border-2 border-primary")}
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
        </CardBody>
      </Card>

      {/* 変更通知 */}
      <Card shadow="none" className={cn("ui-card", myUnread.length > 0 && "border-2 border-warning")}>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <span className="border-l-4 border-primary pl-3 text-xl font-bold">陸上からのお知らせ（予定の変更）</span>
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
            myChanges.slice(0, moreChanges ? 30 : 4).map((c) => {
              const prev = c.supersedesId ? byId.get(c.supersedesId) : undefined;
              const isUnread = myUnread.some((u) => u.id === c.id);
              return (
                <div key={c.id} className="ui-inset flex flex-col gap-1 p-4">
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
                    {/* 船長が船内で変えたものは「船長」、それ以外は陸上の配信（SHIFT-04） */}
                    {c.publishedBy.startsWith("crew-") ? "船長" : "陸上"} {personName(c.publishedBy)} が {fmtDateTime(c.publishedAt)} に配信
                  </p>
                </div>
              );
            })
          )}
          {myChanges.length > 4 && !moreChanges ? (
            <button type="button" className="ui-btn-ghost min-h-11 self-center px-5 text-base" onClick={() => setMoreChanges(true)}>
              もっと見る（{myChanges.length - 4}件）
            </button>
          ) : null}
        </CardBody>
      </Card>

      {/* 通常配置表: あなたの持ち場 */}
      <Card shadow="none" className="ui-card">
        <CardHeader className="border-l-4 border-primary pl-3 text-xl font-bold">あなたの持ち場（通常配置表）</CardHeader>
        <Divider />
        <CardBody className="flex flex-col gap-2">
          {STATION_SCENARIOS.map((sc) => {
            const mine = myStations.find((s) => s.scenario === sc);
            return (
              <div key={sc} className="ui-inset flex flex-wrap items-center gap-3 p-4">
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
      <Card shadow="none" className="ui-card">
        <CardHeader className="border-l-4 border-primary pl-3 text-xl font-bold">船内の配置（全員）</CardHeader>
        <Divider />
        <CardBody className="p-0">
          <StationMatrix
            stations={stations}
            scenarios={STATION_SCENARIOS}
            scenarioLabel={(sc) => tr("stationScenario", sc)}
            crewName={personName}
            selfId={selfId}
            changedIds={changedIds}
          />
        </CardBody>
      </Card>

      {canManageShift && session ? <CaptainShiftEditor sessionId={session.id} today={today} watches={watches} /> : null}
      {canManageShift && rejected.length > 0 ? (
        <p role="alert" className="ui-card m-0 border-danger px-4 py-3 text-lg text-danger">
          ✕ 陸上で受け付けられなかった当直が {rejected.length}件 あります（船長の記録と確認できませんでした）。陸上に確認してください
        </p>
      ) : null}

      {/* 今週の当直（本人。船長は全員表示に切替可） */}
      <Card shadow="none" className="ui-card">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <span className="border-l-4 border-primary pl-3 text-xl font-bold">今週の当直{canViewAll && showAll ? "（全員）" : "（あなたの分）"}</span>
          {canViewAll ? (
            <Button
              size="sm"
              variant="bordered"
              className="min-h-10 border-[var(--ui-hairline-strong)]"
              onPress={() => setShowAll((v) => !v)}
            >
              {showAll ? "自分の分だけ表示" : "全員の当直表を見る"}
            </Button>
          ) : null}
        </CardHeader>
        <Divider />
        <CardBody className={canViewAll && showAll ? "p-0" : undefined}>
          {canViewAll && showAll ? (
            <CrewWatchTable watches={watches} today={today} changedIds={changedIds} conflictIds={conflictIds} selfId={selfId} />
          ) : (
            <WeekTimeline
              days={myWeek}
              today={today}
              nowMinutes={now.getHours() * 60 + now.getMinutes()}
              changedIds={changedIds}
              label={(p) => (p.shiftType ? tr("shiftType", p.shiftType) : "当直")}
            />
          )}
        </CardBody>
      </Card>

    </div>
  );
}
