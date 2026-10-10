"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addDays,
  evaluateDaily,
  evaluatePeriod,
  evaluateWeekly,
  monthRange,
  ymdLocal,
  type PeriodLaborSummary,
} from "@/domain/labor-law/evaluate";
import type { LaborCheck } from "@/domain/labor-law/types";
import { cn } from "@/lib/cn";
import { CREW_MEMBERS, type CrewMember } from "@/lib/crew";
import { fmtDateLabel, fmtMinutes } from "@/lib/format";
import {
  checkPlainLabelFor,
  describeApproval,
  describeCheck,
  describeExceptionalMinutes,
  describePeriodTotal,
  formatCheckActual,
  LEVEL_PLAIN,
} from "@/lib/labor-plain";
import { useLocale } from "@/lib/use-locale";
import {
  useAllRecords,
  useApprovals,
  useCrewRecords,
  useNowTick,
  usePermission,
  useSessionCrew,
} from "@/lib/vessel-hooks";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";
import { resolveApproval, type ApprovalPayload } from "@/sync-protocol/events";
import { SurfaceCard, StatusChip } from "@/ui";
import { Button, CardBody, CardHeader, Chip, Divider, Progress, Select, SelectItem } from "@/ui/heroui";
import { GroupHeader } from "../_components/group-header";

/**
 * V-03 労務管理記録簿（本日の集計）。
 *
 * 表示は役割で分ける（基本設計書 11.2）:
 * - 一般の船員: **自分の記録だけ**を、初めてでも分かる言葉で表示する
 * - 船長（view_all_crew）: 上に加えて乗組員全員の状況一覧と承認への導線を表示する
 *
 * 判定は domain/labor-law の純関数、言い換えは lib/labor-plain が担い、
 * この画面は表示だけを行う（判定ロジックを持たない）。
 */
export default function LedgerPage() {
  const session = useSessionCrew();
  const canViewAll = usePermission("view_all_crew");
  const { locale, tr } = useLocale();
  const now = useNowTick(30_000);
  const ruleSet = DEFAULT_LABOR_RULE_SET;
  const today = ymdLocal(now);

  // 表示対象。既定は本人。船長のみ他船員に切り替えられる
  const [pickedCrewId, setPickedCrewId] = useState<string>("");
  const crew: CrewMember =
    (canViewAll && CREW_MEMBERS.find((c) => c.id === pickedCrewId)) || session || CREW_MEMBERS[0];

  const records = useCrewRecords(crew.id);
  const approvals = useApprovals();

  const daily = useMemo(
    () => evaluateDaily({ crewMemberId: crew.id, date: today, records, now, ruleSet }),
    [crew.id, today, records, now, ruleSet],
  );
  const weekly = useMemo(
    () => evaluateWeekly({ crewMemberId: crew.id, endDate: today, records, now, ruleSet }),
    [crew.id, today, records, now, ruleSet],
  );
  /**
   * 期間の自動集計（要件定義書 3.2.1「日単位・週単位・4週単位・月単位」）。
   * 4週間で 4週上限と基準労働期間の週平均・休日付与を、今月で時間外の上限を判定する。
   * どちらも別枠（安全臨時労働・緊急作業）を除いた時間で上限を見る（3.2.5⑥）。
   */
  const fourWeeks = useMemo(
    () =>
      evaluatePeriod({
        crewMemberId: crew.id,
        from: addDays(today, -27),
        to: today,
        records,
        now,
        ruleSet,
        include: ["four_week_max", "reference_period", "rest_day"],
      }),
    [crew.id, today, records, now, ruleSet],
  );
  const thisMonth = useMemo(() => {
    const { from } = monthRange(today.slice(0, 7));
    return evaluatePeriod({
      crewMemberId: crew.id,
      from,
      to: today, // 月末までではなく「今日まで」で見る（先の予定は積み上がっていない）
      records,
      now,
      ruleSet,
      include: ["monthly_overtime"],
    });
  }, [crew.id, today, records, now, ruleSet]);

  const dailyMaxCheck = daily.checks.find((c) => c.key === "daily_max");
  const attentionChecks = daily.checks.filter((c) => c.level !== "ok");

  // 直近3日の承認状況（本人向け。船長は選択中の船員の分）
  const approvalDays = useMemo(() => {
    return [0, -1, -2].map((offset) => {
      const date = addDays(today, offset);
      const summary = evaluateDaily({ crewMemberId: crew.id, date, records, now, ruleSet });
      const resolved = resolveApproval(
        approvals
          .filter((a) => a.crewMemberId === crew.id && a.date === date)
          .map((payload) => ({ payload })),
      );
      return { date, summary, approval: resolved };
    });
  }, [today, crew.id, records, approvals, now, ruleSet]);

  if (!session) return null;
  const overall = daily.hasRecords ? daily.level : "none";
  const plain = LEVEL_PLAIN[overall];
  const isSelf = crew.id === session.id;

  /**
   * 本日の3つの数字。判定（level）はドメイン関数の結果をそのまま使い、
   * ここでは言い回しだけを決める（判定をこの画面で作らない）。
   */
  const restSplitCheck = daily.checks.find((c) => c.key === "rest_split");
  const restTotalCheck = daily.checks.find((c) => c.key === "rest_total");
  const laborKpis: { caption: string; value: string; unit: string; note: string; level: string }[] = [
    {
      caption: "労働時間",
      value: fmtMinutes(daily.workedMinutes),
      unit: `/ ${fmtMinutes(ruleSet.values.dailyMaxMinutes)}`,
      note: dailyMaxCheck ? describeCheck(dailyMaxCheck) : "上限内です。",
      level: dailyMaxCheck?.level ?? "ok",
    },
    {
      caption: "休息時間",
      value: fmtMinutes(daily.restTotalMinutes),
      unit: `/ ${fmtMinutes(ruleSet.values.restMinDailyMinutes)} 以上`,
      note: restTotalCheck ? describeCheck(restTotalCheck) : "休息は足りています。",
      level: restTotalCheck?.level ?? "ok",
    },
    {
      caption: "休息の分割",
      value: String(restSplitCheck?.actual ?? daily.restPeriods.length),
      unit: `回 / 上限 ${restSplitCheck?.limit ?? ruleSet.values.restSplitMax}回`,
      note: restSplitCheck ? describeCheck(restSplitCheck) : "分割の回数は上限内です。",
      level: restSplitCheck?.level ?? "ok",
    },
  ];

  /** 作業種別ごとの内訳（多い順）。並列打刻ぶんは重複を含む */
  const categoryBars = Object.entries(daily.workedByCategory)
    .map(([category, minutes]) => ({ category, minutes: minutes ?? 0 }))
    .filter((b) => b.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
  const barScale = Math.max(ruleSet.values.dailyMaxMinutes, ...categoryBars.map((b) => b.minutes));

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="02" subtitle="本日の記録" />

      {/* 船長のみ: 表示する船員の切替（一般の船員は自分の記録だけ） */}
      {canViewAll ? (
        <SurfaceCard>
          <CardBody className="flex flex-wrap items-center gap-3 p-4">
            <Select
              label="表示する船員（船長のみ）"
              size="sm"
              className="max-w-xs"
              selectedKeys={[crew.id]}
              onSelectionChange={(keys) => {
                const k = [...keys][0];
                setPickedCrewId(k ? String(k) : "");
              }}
            >
              {CREW_MEMBERS.map((c) => (
                <SelectItem key={c.id}>{`${c.name}（${c.position}）`}</SelectItem>
              ))}
            </Select>
          </CardBody>
        </SurfaceCard>
      ) : null}

      {/* いちばん大きく「今日はどうなのか」を出す */}
      <SurfaceCard
       
        className={cn(
          "border-2",
          overall === "violation"
            ? "border-danger"
            : overall === "caution"
              ? "border-warning"
              : "border-transparent",
        )}
      >
        <CardBody className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-foreground-600">
              {fmtDateLabel(today)}の状態 ─ {crew.name}（{crew.position}）
              {isSelf ? "" : "（参照）"}
            </p>
            {daily.hasOpenInterval ? (
              <Chip size="sm" variant="flat" radius="sm">
                作業中を含む（現在時刻まで計算）
              </Chip>
            ) : null}
          </div>
          <p className="text-balance text-3xl font-bold">
            <span aria-hidden="true" className="mr-2">
              {plain.icon}
            </span>
            {plain.title}
          </p>
          <p className="text-pretty text-foreground-600">{plain.summary}</p>

          {attentionChecks.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {attentionChecks.map((c) => (
                <li key={c.key} className="text-pretty">
                  <span aria-hidden="true" className="mr-1">
                    {LEVEL_PLAIN[c.level].icon}
                  </span>
                  <span className="font-semibold">{checkPlainLabelFor(locale, c.key)}</span>:{" "}
                  {describeCheck(c)}
                </li>
              ))}
            </ul>
          ) : null}
        </CardBody>
      </SurfaceCard>

      {/*
        3つの数字（デザイン正本 V-03 の KPI）。
        「働いた」「休んだ」「休みが何回に分かれたか」は船員が毎日いちばん気にする3つで、
        言い換えの文よりも**数字そのもの**を先に大きく出す。判定の色は上限に触れたときだけ。
      */}
      <section aria-label="本日の数字" className="grid gap-3 sm:grid-cols-3">
        {laborKpis.map((k) => (
          <div key={k.caption} className="ui-card px-[18px] py-4">
            <p className="m-0 text-base text-foreground-500">{k.caption}</p>
            <p className="m-0 mt-2 flex items-baseline gap-2">
              <span
                className={cn(
                  "font-mono text-5xl font-semibold leading-none tabular-nums",
                  k.level === "violation"
                    ? "text-danger"
                    : k.level === "caution"
                      ? "text-warning-700"
                      : "text-foreground-900",
                )}
              >
                {k.value}
              </span>
              <span className="font-mono text-lg text-foreground-400">{k.unit}</span>
            </p>
            <p className="m-0 mt-2 text-base leading-relaxed text-foreground-700">{k.note}</p>
          </div>
        ))}
      </section>

      {/* 作業種別ごとの内訳（デザイン正本 V-03 の横棒）。並列打刻ぶんは重複を含む */}
      {categoryBars.length > 0 ? (
        <section aria-label="作業種別ごとの内訳" className="ui-card">
          <div className="flex items-baseline justify-between gap-3 border-b border-[var(--ui-hairline-strong)] px-4 py-3">
            <h2 className="m-0 text-xl font-bold text-foreground-900">作業種別ごとの内訳（今日）</h2>
            <span className="text-base text-foreground-400">
              縦線 = 上限 {fmtMinutes(ruleSet.values.dailyMaxMinutes)}
            </span>
          </div>
          <div className="px-4 pb-3 pt-1.5">
            {categoryBars.map((b) => (
              <div key={b.category} className="flex items-center gap-3.5 py-2">
                <span className="flex-none basis-32 text-lg text-foreground-700">
                  {tr("workCategory", b.category)}
                </span>
                <span className="relative block flex-1">
                  <span className="block h-5 overflow-hidden rounded-[2px] bg-[#DFE1E0]">
                    <span
                      className="block h-full bg-foreground-700"
                      style={{ width: `${Math.min(100, (b.minutes / barScale) * 100)}%` }}
                    />
                  </span>
                </span>
                <span className="flex-none basis-[66px] text-right font-mono text-xl tabular-nums text-foreground-800">
                  {fmtMinutes(b.minutes)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* 労働時間: 残り時間を数字と帯で示す */}
      <SurfaceCard>
        <CardHeader className="px-5 pb-2 pt-5 text-base font-bold">働いた時間</CardHeader>
        <CardBody className="flex flex-col gap-5 px-5 pb-5">
          <TimeBar
            title="今日"
            actual={daily.workedMinutes}
            limit={ruleSet.values.dailyMaxMinutes}
            check={dailyMaxCheck}
            tr={tr}
          />
          {describeExceptionalMinutes(daily.exceptionalMinutes) ? (
            <p className="text-pretty text-sm text-foreground-600">
              <span aria-hidden="true">⚑ </span>
              {describeExceptionalMinutes(daily.exceptionalMinutes)}
              実績としては記録簿に残ります。
            </p>
          ) : null}
          <TimeBar
            title="この7日間"
            actual={weekly.totalMinutes}
            limit={ruleSet.values.weeklyMaxMinutes}
            check={weekly.check}
            tr={tr}
          />
        </CardBody>
      </SurfaceCard>

      {/* まとめて見る（4週間・今月）。日単位・週単位に続く自動集計。要件定義書 3.2.1 */}
      <SurfaceCard>
        <CardHeader className="px-5 pb-2 pt-5 text-base font-bold">まとめて見る</CardHeader>
        <CardBody className="flex flex-col gap-3 px-5 pb-5">
          <PeriodBlock
            title="この4週間"
            summary={fourWeeks}
            locale={locale}
            tr={tr}
            sentence={describePeriodTotal(
              "この4週間",
              fourWeeks,
              fourWeeks.checks.find((c) => c.key === "four_week_max"),
            )}
          />
          <PeriodBlock
            title="今月（今日まで）"
            summary={thisMonth}
            locale={locale}
            tr={tr}
            /* 今月の目安は「残業の上限」なので、合計時間の目安としては書かない
               （目安は下のチェック行に「今月の残業した時間」として出る） */
            sentence={describePeriodTotal("今月", thisMonth, undefined)}
          />
        </CardBody>
      </SurfaceCard>

      {/* 承認状況（本人向けに何をすればよいかまで書く） */}
      <SurfaceCard>
        <CardHeader className="px-5 pb-2 pt-5 text-base font-bold">船長の承認</CardHeader>
        <CardBody className="flex flex-col gap-2 px-5 pb-5">
          {approvalDays.map(({ date, summary, approval }) => (
            <ApprovalRow
              key={date}
              date={date}
              hasRecords={summary.hasRecords}
              approval={approval}
              showAction={isSelf}
            />
          ))}
        </CardBody>
      </SurfaceCard>

      {/* 船長のみ: 乗組員全体の状況 */}
      {canViewAll ? <CrewOverview today={today} now={now} onPick={setPickedCrewId} /> : null}

    </div>
  );
}

/** 上限に対する実績を「残り時間」中心に見せる帯 */
function TimeBar({
  title,
  actual,
  limit,
  check,
  tr,
}: {
  title: string;
  actual: number;
  limit: number;
  check?: LaborCheck;
  /** 判定レベルの表示言語（要件定義書 10.2） */
  tr: (group: string, key: string) => string;
}) {
  const level = check?.level ?? "ok";
  const remain = Math.max(0, limit - actual);
  const over = Math.max(0, actual - limit);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-lg font-bold">{title}</span>
        <span className="tabular-nums text-2xl font-bold">
          {fmtMinutes(actual)}
          <span className="ml-1 text-base font-normal text-foreground-600">/ 上限 {fmtMinutes(limit)}</span>
        </span>
      </div>
      <Progress
        aria-label={`${title}の労働時間`}
        value={Math.min(100, (actual / limit) * 100)}
        color={level === "violation" ? "danger" : level === "caution" ? "warning" : "success"}
        size="lg"
        radius="sm"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn("font-semibold", level === "violation" && "text-danger")}>
          {over > 0 ? `${fmtMinutes(over)} 超過しています` : `あと ${fmtMinutes(remain)} 働けます`}
        </span>
        <StatusChip level={level} size="sm" label={tr("level", level)} />
      </div>
    </div>
  );
}

/**
 * 期間（4週間・今月）の集計と上限判定（要件定義書 3.2.1 / 3.2.5③⑥）。
 * 判定は evaluatePeriod、言い換えは lib/labor-plain が担い、ここは表示だけを行う。
 */
function PeriodBlock({
  title,
  summary,
  sentence,
  locale,
  tr,
}: {
  title: string;
  summary: PeriodLaborSummary;
  sentence: string;
  locale: Parameters<typeof checkPlainLabelFor>[0];
  tr: (group: string, key: string) => string;
}) {
  const exceptional = describeExceptionalMinutes(summary.exceptionalMinutes);
  return (
    <div className="ui-inset flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-lg font-bold">{title}</span>
        <StatusChip level={summary.level} size="sm" label={tr("level", summary.level)} />
      </div>
      <p className="text-pretty">{sentence}</p>
      {exceptional ? (
        <p className="text-pretty text-sm text-foreground-600">
          <span aria-hidden="true">⚑ </span>
          {exceptional}実績としては記録簿に残ります。
        </p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {summary.checks.map((c) => (
          <li key={c.key} className="flex flex-wrap items-center gap-2 text-sm">
            <span aria-hidden="true">{LEVEL_PLAIN[c.level].icon}</span>
            <span className="font-semibold">{checkPlainLabelFor(locale, c.key)}</span>
            <span className="tabular-nums">{formatCheckActual(c)}</span>
            <span className="text-foreground-600">{describeCheck(c)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 1日分の承認状況（何をすればよいかまで書く） */
function ApprovalRow({
  date,
  hasRecords,
  approval,
  showAction,
}: {
  date: string;
  hasRecords: boolean;
  approval: ApprovalPayload | null;
  showAction: boolean;
}) {
  if (!hasRecords) {
    return (
      <div className="ui-inset flex flex-wrap items-center gap-3 p-3">
        <span className="font-semibold">{fmtDateLabel(date)}</span>
        <span className="text-foreground-600">記録なし</span>
      </div>
    );
  }
  const info = describeApproval(approval?.decision, approval?.approverRole);
  return (
    <div
      className={cn(
        "ui-inset flex flex-wrap items-center gap-3 p-3",
        info.tone === "bad" && "border border-danger",
      )}
    >
      <span className="font-semibold">{fmtDateLabel(date)}</span>
      <span className={cn("font-bold", info.tone === "bad" && "text-danger")}>
        <span aria-hidden="true" className="mr-1">
          {info.icon}
        </span>
        {info.label}
      </span>
      <span className="text-sm text-foreground-600">{info.note}</span>
      {info.tone === "bad" && showAction ? (
        <Button
          as={Link}
          href="/vessel/punch"
          size="sm"
          color="danger"
          radius="md"
          className="ml-auto min-h-11"
        >
          打刻を直す
        </Button>
      ) : null}
    </div>
  );
}

/**
 * 船長向けの乗組員一覧。
 * このコンポーネントは権限がある場合だけ描画され、他船員の記録の読み出しもここに閉じる
 * （本番では API 側の権限ガードと RLS でサーバから返さない。11.1）。
 */
function CrewOverview({
  today,
  now,
  onPick,
}: {
  today: string;
  now: Date;
  onPick: (crewId: string) => void;
}) {
  const records = useAllRecords();
  const approvals = useApprovals();
  const ruleSet = DEFAULT_LABOR_RULE_SET;

  const rows = useMemo(
    () =>
      CREW_MEMBERS.map((c) => {
        const summary = evaluateDaily({ crewMemberId: c.id, date: today, records, now, ruleSet });
        const approval = resolveApproval(
          approvals
            .filter((a) => a.crewMemberId === c.id && a.date === today)
            .map((payload) => ({ payload })),
        );
        return { crew: c, summary, approval };
      }),
    [today, records, approvals, now, ruleSet],
  );

  const pending = rows.filter((r) => r.summary.hasRecords && !r.approval).length;
  const alerts = rows.filter((r) => r.summary.hasRecords && r.summary.level !== "ok").length;

  return (
    <SurfaceCard>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 px-5 pb-2 pt-5">
        <span className="text-base font-bold">乗組員の状況（本日）</span>
        <div className="flex flex-wrap items-center gap-2">
          <Chip size="sm" variant="flat" color={alerts > 0 ? "danger" : "default"} radius="sm">
            要確認 {alerts}名
          </Chip>
          <Chip size="sm" variant="flat" color={pending > 0 ? "warning" : "default"} radius="sm">
            未承認 {pending}名
          </Chip>
          <Button
            as={Link}
            href="/vessel/approve"
            size="sm"
            color="primary"
            radius="md"
            className="min-h-11 font-semibold"
          >
            承認する
          </Button>
        </div>
      </CardHeader>
      <Divider className="bg-[var(--ui-hairline)]" />
      <CardBody className="flex flex-col gap-2 px-5 pb-5">
        {rows.map(({ crew, summary, approval }) => {
          const info = describeApproval(approval?.decision, approval?.approverRole);
          return (
            <button
              key={crew.id}
              type="button"
              onClick={() => onPick(crew.id)}
              className="ui-inset flex flex-wrap items-center gap-3 p-3 text-left"
            >
              <span className="min-w-32 font-semibold">{crew.name}</span>
              <span className="text-sm text-foreground-600">{crew.position}</span>
              {summary.hasRecords ? (
                <>
                  <span className="tabular-nums font-semibold">{fmtMinutes(summary.workedMinutes)}</span>
                  <StatusChip level={summary.level} size="sm" />
                  <span className="ml-auto text-sm">
                    <span aria-hidden="true" className="mr-1">
                      {info.icon}
                    </span>
                    {info.label}
                  </span>
                </>
              ) : (
                <span className="ml-auto text-sm text-foreground-600">本日の記録なし</span>
              )}
            </button>
          );
        })}
        <p className="text-xs text-foreground-600">
          名前を押すと、その船員の内訳を上に表示します。打刻の修正は本人への差戻しで依頼します。
        </p>
      </CardBody>
    </SurfaceCard>
  );
}
