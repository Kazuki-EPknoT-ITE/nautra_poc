"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addDays,
  evaluateDaily,
  evaluateWeekly,
  totalWorkedMinutes,
  ymdLocal,
} from "@/domain/labor-law/evaluate";
import type { LaborCheck } from "@/domain/labor-law/types";
import { cn } from "@/lib/cn";
import { CREW_MEMBERS, type CrewMember } from "@/lib/crew";
import { fmtDateLabel, fmtMinutes, fmtTime } from "@/lib/format";
import {
  CHECK_PLAIN_LABEL,
  describeApproval,
  describeCheck,
  formatCheckActual,
  formatCheckLimit,
  LEVEL_PLAIN,
} from "@/lib/labor-plain";
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
import {
  Button,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  GlassCard,
  Progress,
  Select,
  SelectItem,
  StatusChip,
} from "@/ui";
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
  const fourWeeks = useMemo(
    () => totalWorkedMinutes({ crewMemberId: crew.id, endDate: today, days: 28, records, now, ruleSet }),
    [crew.id, today, records, now, ruleSet],
  );

  const dailyMaxCheck = daily.checks.find((c) => c.key === "daily_max");
  const restChecks = daily.checks.filter((c) => c.key.startsWith("rest_"));
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

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="02" subtitle="本日の記録" />

      {/* 船長のみ: 表示する船員の切替（一般の船員は自分の記録だけ） */}
      {canViewAll ? (
        <GlassCard>
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
            <p className="text-sm text-foreground-600">
              一般の船員には自分の記録だけが表示されます。
            </p>
          </CardBody>
        </GlassCard>
      ) : null}

      {/* いちばん大きく「今日はどうなのか」を出す */}
      <GlassCard
        blurred
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
                  <span className="font-semibold">{CHECK_PLAIN_LABEL[c.key]}</span>: {describeCheck(c)}
                </li>
              ))}
            </ul>
          ) : null}
        </CardBody>
      </GlassCard>

      {/* 労働時間: 残り時間を数字と帯で示す */}
      <GlassCard>
        <CardHeader className="px-5 pb-2 pt-5 text-base font-bold">働いた時間</CardHeader>
        <CardBody className="flex flex-col gap-5 px-5 pb-5">
          <TimeBar
            title="今日"
            actual={daily.workedMinutes}
            limit={ruleSet.values.dailyMaxMinutes}
            check={dailyMaxCheck}
          />
          <TimeBar
            title="この7日間"
            actual={weekly.totalMinutes}
            limit={ruleSet.values.weeklyMaxMinutes}
            check={weekly.check}
          />
          <p className="text-sm text-foreground-600">
            この4週間の合計: <span className="tabular-nums font-semibold">{fmtMinutes(fourWeeks)}</span>
            （4週の上限判定は基準労働期間の設定後に有効化 — PoC対象外）
          </p>
        </CardBody>
      </GlassCard>

      {/* 休息 */}
      <GlassCard>
        <CardHeader className="px-5 pb-2 pt-5 text-base font-bold">休んだ時間</CardHeader>
        <CardBody className="flex flex-col gap-3 px-5 pb-5">
          {daily.hasRecords ? (
            <>
              {restChecks.map((c) => (
                <div key={c.key} className="glass-inset flex flex-col gap-1 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{CHECK_PLAIN_LABEL[c.key]}</span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">
                        {formatCheckActual(c)}
                        <span className="ml-1 text-sm text-foreground-600">
                          / 基準 {formatCheckLimit(c)}
                        </span>
                      </span>
                      <StatusChip level={c.level} size="sm" />
                    </div>
                  </div>
                  <p className="text-pretty text-sm text-foreground-600">{describeCheck(c)}</p>
                </div>
              ))}
              <details>
                <summary className="cursor-pointer text-sm text-foreground-600">
                  休んだ時間帯を見る（{daily.restPeriods.length}件）
                </summary>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {daily.restPeriods.map((p, i) => (
                    <li key={i} className="tabular-nums">
                      {fmtTime(p.startAt)}〜{fmtTime(p.endAt)}（{fmtMinutes(p.minutes)}）
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-foreground-600">
                  分割回数と最長休息は、日をまたぐ休みをつなげて数えます。
                </p>
              </details>
            </>
          ) : (
            <p className="text-foreground-600">今日の打刻がまだありません。</p>
          )}
        </CardBody>
      </GlassCard>

      {/* 承認状況（本人向けに何をすればよいかまで書く） */}
      <GlassCard>
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
      </GlassCard>

      {/* 船長のみ: 乗組員全体の状況 */}
      {canViewAll ? <CrewOverview today={today} now={now} onPick={setPickedCrewId} /> : null}

      <p className="text-xs text-foreground-600">
        適用ルール版: {daily.appliedRuleVersion}（{ruleSet.source}）。
        判定の基準は法令・労使協定の版管理データから読み込まれ、アプリ内に固定値を持ちません。
      </p>
    </div>
  );
}

/** 上限に対する実績を「残り時間」中心に見せる帯 */
function TimeBar({
  title,
  actual,
  limit,
  check,
}: {
  title: string;
  actual: number;
  limit: number;
  check?: LaborCheck;
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
        <StatusChip level={level} size="sm" />
      </div>
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
      <div className="glass-inset flex flex-wrap items-center gap-3 p-3">
        <span className="font-semibold">{fmtDateLabel(date)}</span>
        <span className="text-foreground-600">記録なし</span>
      </div>
    );
  }
  const info = describeApproval(approval?.decision);
  return (
    <div
      className={cn(
        "glass-inset flex flex-wrap items-center gap-3 p-3",
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
    <GlassCard blurred>
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
      <Divider className="bg-[var(--glass-border)]" />
      <CardBody className="flex flex-col gap-2 px-5 pb-5">
        {rows.map(({ crew, summary, approval }) => {
          const info = describeApproval(approval?.decision);
          return (
            <button
              key={crew.id}
              type="button"
              onClick={() => onPick(crew.id)}
              className="glass-inset flex flex-wrap items-center gap-3 p-3 text-left"
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
    </GlassCard>
  );
}
