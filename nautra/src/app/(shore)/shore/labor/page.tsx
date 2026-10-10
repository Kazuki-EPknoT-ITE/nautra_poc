import Link from "next/link";
import { checkLabel, t } from "@/i18n/ja";
import { personName } from "@/lib/crew";
import { fmtDateLabel, fmtDateTime, fmtMinutes } from "@/lib/format";
import {
  buildLedger,
  checkActualOf,
  currentMonth,
  ledgerCrewOptions,
  monthOptions,
} from "@/server/ledger-service";
import { buildLeaveBalance, buildLeaveBoard } from "@/server/leave-service";
import { hasShorePermission, requireShore } from "@/server/shore-session";
import { cn } from "@/lib/cn";
import { Section, StatusChip } from "@/ui";
import { ExportAction } from "../_components/export-action";
import { ShoreGuardNotice } from "../_components/guard";
import { ApprovalForm, type PendingDay } from "./_components/approval-form";
import { LeaveForm } from "./_components/leave-form";
import { LedgerImportForm } from "./_components/ledger-import-form";
import { LaborCalendar } from "./_components/labor-calendar";
import { describeCheck } from "@/lib/labor-plain";

export const dynamic = "force-dynamic";

const LEVEL_STYLE: Record<string, { cls: string; icon: string; label: string }> = {
  ok: { cls: "text-success", icon: "✓", label: "適合" },
  caution: { cls: "text-warning-700", icon: "⚠", label: "注意" },
  violation: { cls: "text-danger", icon: "✕", label: "警告" },
};

/** 作業種別ごとの帯（白黒基調のため濃度で区別し、凡例と併記する） */
const BAR_TONE: Record<string, string> = {
  navigation_watch: "bg-foreground/85",
  cargo: "bg-foreground/60",
  standby: "bg-foreground/35",
  maintenance: "bg-foreground/50",
  other: "bg-foreground/25",
};

/** 判定項目の実績・上限の書き方（時間で表さない項目だけ単位が違う） */
function checkValue(key: string, value: number): string {
  if (key === "rest_split") return `${value}回`;
  if (key === "rest_day") return `${value}日`;
  return fmtMinutes(value);
}

/**
 * S-06 労務管理（承認・記録簿）。
 *
 * - 船員別のタイムチャートと日次一括承認（労務管理責任者）
 * - **4週単位・月単位の自動集計**（3.2.1）と 3.2.5③ の上限判定
 * - **休日・有給休暇・補償休日**の付与状況と未消化の可視化（3.2.4）
 * - 労務管理記録簿（第16号の5書式に相当）の確認・CSV 出力・**印刷（PDF）**（3.2.2）
 * - 国交省 Excel マクロ様式（CSV）の**取込**（3.2.2）
 */
/**
 * この画面の主題（タブ）。**1画面1主題**にして、目的の節まで延々とめくらずに済むようにする
 * （デザイン正本 S-15 と同じやりかた。1枚が 3000px を超えないようにする）。
 * 対象の切替（船員・月）は主題をまたいで効くので、タブの外に置く。
 */
const TABS = [
  { id: "status", label: "上限と集計・承認" },
  { id: "chart", label: "タイムチャート" },
  { id: "leave", label: "休日・有給" },
  { id: "ledger", label: "記録簿・取込" },
];

export default async function ShoreLaborPage({
  searchParams,
}: {
  searchParams: Promise<{ crew?: string; month?: string; tab?: string }>;
}) {
  const guard = await requireShore("view_dashboard");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="労務管理（承認・記録簿）" />;

  const canApprove = await hasShorePermission("approve_labor_manager");
  const canEditLeave = await hasShorePermission("edit_leave");

  const crews = ledgerCrewOptions();
  const sp = await searchParams;
  /** いま開いている主題。未指定なら先頭 */
  const tab = TABS.some((x) => x.id === sp.tab) ? sp.tab! : TABS[0]!.id;
  const crewMemberId = crews.find((c) => c.id === sp.crew)?.id ?? crews[0].id;
  const month = sp.month ?? currentMonth();
  const period = buildLedger(crewMemberId, month);
  // カレンダーで送れる範囲は直近12か月（LABOR-03）
  const months = monthOptions(new Date(), 12);
  const today = new Date().toISOString().slice(0, 10);

  const leave = buildLeaveBalance(crewMemberId);
  const leaveBoard = buildLeaveBoard();
  const restDates = new Set(period.aggregates.leaveDates);

  /** その日に外れた基準を、初心者にも分かる文でつなぐ（ホバーの説明。LABOR-05） */
  const dayHint = (d: (typeof period.days)[number]) =>
    d.summary.checks
      .filter((c) => c.level !== "ok")
      .map((c) => describeCheck(c))
      .join(" ") || undefined;

  const pendingDays: PendingDay[] = period.days
    .filter((d) => d.summary.hasRecords && !d.approvedByManager)
    .map((d) => ({
      date: d.date,
      workedMinutes: d.summary.workedMinutes,
      level: d.summary.level,
      hint: dayHint(d),
      captainApproved: d.approval?.approverRole === "captain" && d.approval.decision === "approved",
    }));

  /** 4週・月の判定（3.2.1 自動集計 / 3.2.5③） */
  // 休日（rest_day）は下に専用の枠を置くので、上限系の一覧からは外す
  const periodChecks = [
    ...period.aggregates.fourWeek.checks
      .filter((c) => c.key !== "rest_day")
      .map((c) => ({
        check: c,
        range: `${fmtDateLabel(period.aggregates.fourWeek.from)}〜${fmtDateLabel(period.aggregates.fourWeek.to)}`,
      })),
    ...period.aggregates.monthly.checks
      .filter((c) => c.key !== "rest_day")
      .map((c) => ({ check: c, range: `${period.month}` })),
  ];

  /**
   * 上限ゲージの材料。4週・月の判定に「休息の分割」を足して4枚にする。
   * 判定そのものはドメイン関数が済ませているので、ここは表示用の詰め替えだけ。
   */
  const limitCards = [
    ...periodChecks.slice(0, 3).map(({ check, range }) => ({
      key: `${check.key}-${range}`,
      label: `${checkLabel(check.key)}（${range}）`,
      actual: checkValue(check.key, check.actual),
      limit: checkValue(check.key, check.limit),
      ratio: check.limit > 0 ? check.actual / check.limit : 0,
      level: check.level,
      hint: describeCheck(check),
      note:
        check.level === "violation"
          ? "上限を超えています。休息を入れて是正してください。"
          : check.level === "caution"
            ? "上限に近づいています。"
            : "上限内です。",
    })),
    {
      key: "rest_day",
      label: checkLabel("rest_day") + "（直近1週間）",
      actual: `${period.aggregates.restDay.actual}日`,
      limit: `${period.aggregates.restDay.limit}日`,
      ratio:
        period.aggregates.restDay.limit > 0
          ? period.aggregates.restDay.actual / period.aggregates.restDay.limit
          : 0,
      level: period.aggregates.restDay.level,
      hint: describeCheck(period.aggregates.restDay),
      note:
        period.aggregates.restDay.level === "ok"
          ? "週1日以上の休日が取れています（3.2.5⑤）。"
          : "休日が足りません。休みを入れてください。",
    },
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      {/* 対象の切替（サーバ側で組み立てるためリンクで切り替える） */}
      <section aria-label="対象の切替" className="ui-card flex flex-col gap-3.5 px-[18px] py-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 flex-none text-sm text-foreground-500">対象船員</p>
          {crews.map((c) => (
            <Link
              key={c.id}
              href={`/shore/labor?crew=${c.id}&month=${month}`}
              aria-current={c.id === crewMemberId ? "true" : undefined}
              className={cn(
                "flex flex-col rounded-small border px-3 py-1.5",
                c.id === crewMemberId
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-[var(--ui-hairline-strong)] bg-content1 text-foreground-700",
              )}
            >
              <span className="text-base font-bold">{c.name}</span>
              <span className="text-2xs tracking-normal opacity-75">{c.position ?? ""}</span>
            </Link>
          ))}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Link
              href={`/shore/labor/ledger/print?crew=${crewMemberId}&month=${month}`}
              className="ui-btn-primary h-9"
              prefetch={false}
            >
              記録簿を印刷・PDF
            </Link>
            <ExportAction set="labor" label="労務記録を書き出す" />
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-4 border-t border-[var(--ui-hairline)] pt-3">
          <p className="m-0 flex-none pt-1.5 text-sm text-foreground-500">集計期間</p>
          <div className="w-full max-w-[400px]">
            <LaborCalendar
              crewMemberId={crewMemberId}
              month={month}
              oldest={months[months.length - 1]!}
              newest={months[0]!}
              today={today}
              days={period.days.map((d) => ({
                date: d.date,
                hasRecords: d.summary.hasRecords,
                level: d.summary.level,
                hint: dayHint(d),
                pending: d.proposalPending,
              }))}
            />
          </div>
        </div>
      </section>

      {/*
        上限ゲージ（デザインの「上限カード」）。
        **実績／上限と残りを1枚にまとめる**。数字だけだと「あとどれだけ働けるか」が
        読み取れず、棒だけだと法定の値が見えないため、両方を同じカードに置く。
      */}
      {/* 主題の切替（サーバ側で組み立てるためリンクで切り替える。船員・月の選択は持ち回る） */}
      <nav aria-label="労務管理の主題" className="ui-card flex flex-wrap gap-2 p-3">
        {TABS.map((x) => (
          <Link
            key={x.id}
            href={`/shore/labor?crew=${crewMemberId}&month=${month}&tab=${x.id}`}
            aria-current={x.id === tab ? "page" : undefined}
            className={`ui-btn-quiet ${x.id === tab ? "ui-btn-selected" : ""}`}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      {tab === "status" ? (
        <>
      <section aria-label="上限に対する実績" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {limitCards.map((l) => (
          <div
            key={l.key}
            className={cn(
              "ui-card px-[18px] py-4",
              l.level === "violation" && "border-danger",
              l.level === "caution" && "border-primary",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="m-0 text-sm leading-normal text-foreground-500">{l.label}</p>
              <StatusChip level={l.level} size="sm" hint={l.level === "ok" ? undefined : l.hint} />
            </div>
            <p
              className={cn(
                "m-0 mt-2 font-mono text-4xl font-semibold tabular-nums",
                l.level === "violation" && "text-danger",
                l.level === "caution" && "text-warning-700",
                l.level === "ok" && "text-foreground-900",
              )}
            >
              {l.actual}
              <span className="ml-1.5 text-base font-normal text-foreground-400">/ {l.limit}</span>
            </p>
            <span className="mt-3 block h-[5px] overflow-hidden rounded-[3px] bg-[#DFE1E0]">
              <span
                className={cn(
                  "block h-full rounded-[3px]",
                  l.level === "violation"
                    ? "bg-danger"
                    : l.level === "caution"
                      ? "bg-primary"
                      : "bg-foreground-700",
                )}
                style={{ width: `${Math.min(100, Math.round(l.ratio * 100))}%` }}
              />
            </span>
            <p className="m-0 mt-2 text-xs leading-normal text-foreground-500">{l.note}</p>
          </div>
        ))}
      </section>

      {/* 4週単位・月単位の集計（3.2.1「日単位・週単位・4週単位・月単位」） */}
      <Section
        title="4週間・1か月のまとめ"
        divided={false}
        bodyClassName="px-[18px] pb-4 pt-0"
        actions={
          <p className="m-0 text-xs text-foreground-400">
            働いた日 {period.aggregates.monthly.workedDays}日 / 休んだ日{" "}
            {period.aggregates.monthly.restDays}日 / 時間外{" "}
            {fmtMinutes(period.aggregates.monthly.overtimeMinutes)} / 週平均{" "}
            {fmtMinutes(period.aggregates.fourWeek.weeklyAverageMinutes)}
          </p>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {periodChecks.map(({ check, range }) => (
            <div key={`${check.key}-${range}`} className="ui-inset flex items-center gap-3 p-3">
              <StatusChip level={check.level} size="sm" hint={check.level === "ok" ? undefined : describeCheck(check)} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{checkLabel(check.key)}</p>
                <p className="text-xs text-foreground-600">
                  <span className="tabular-nums">{checkValue(check.key, check.actual)}</span>
                  <span className="text-foreground-500">
                    {" "}
                    / 上限 {checkValue(check.key, check.limit)}（{range}）
                  </span>
                </p>
              </div>
            </div>
          ))}
          {/* 週1日以上の休日付与（3.2.5⑤）。休暇記録の日付を含めて判定する */}
          <div className="ui-inset flex items-center gap-3 p-3">
            <StatusChip
              level={period.aggregates.restDay.level}
              size="sm"
              hint={period.aggregates.restDay.level === "ok" ? undefined : describeCheck(period.aggregates.restDay)}
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{checkLabel("rest_day")}</p>
              <p className="text-xs text-foreground-600">
                直近1週間で休んだ日{" "}
                <span className="tabular-nums">{period.aggregates.restDay.actual}日</span>
                <span className="text-foreground-500">
                  {" "}
                  / 必要 {period.aggregates.restDay.limit}日
                </span>
                {period.aggregates.restDay.level !== "ok"
                  ? " — 休日が足りません。休みを入れてください。"
                  : ""}
              </p>
            </div>
          </div>
        </div>
      </Section>

      {canApprove ? (
        <ApprovalForm crewMemberId={crewMemberId} crewName={period.crewName} days={pendingDays} />
      ) : (
        <p className="ui-card p-4 text-sm text-foreground-600">
          承認・差戻しは労務管理責任者の担当です。ここでは記録の確認のみ行えます。
        </p>
      )}

        </>
      ) : null}

      {tab === "chart" ? (
      /* タイムチャート（0〜24時）。1日1本の帯で、いつ働いたかを日をまたいで見比べる */
      <Section
        title={`タイムチャート — ${period.crewName}（${period.position}）`}
        actions={
          <div className="flex flex-wrap gap-3 text-xs text-foreground-500">
            {Object.entries(BAR_TONE).map(([cat, tone]) => (
              <span key={cat} className="flex items-center gap-1.5">
                <span className={`inline-block h-2 w-3.5 rounded-[1px] ${tone}`} aria-hidden="true" />
                {t.workCategory[cat]}
              </span>
            ))}
          </div>
        }
        bodyClassName="px-[18px] py-4"
      >
        <div className="mb-2.5 flex pl-[78px] pr-[310px] font-mono text-xs text-foreground-400">
          {[0, 6, 12, 18].map((h) => (
            <span key={h} className="w-1/4 tabular-nums">
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {period.days
            .filter((d) => d.summary.hasRecords)
            .map((d) => (
              <div key={d.date} id={`d-${d.date}`} className="flex scroll-mt-24 items-center">
                <span className="flex-none basis-[78px] font-mono text-xs text-foreground-700">
                  {fmtDateLabel(d.date)}
                </span>
                <span className="relative h-[26px] flex-1 overflow-hidden rounded-[2px] bg-[#DFE1E0]">
                  {d.bars.map((b, i) => (
                    <span
                      key={`${d.date}-${i}`}
                      title={b.label}
                      className={`absolute inset-y-0 ${BAR_TONE[b.workCategory] ?? "bg-foreground/40"} ${
                        b.open ? "opacity-70" : ""
                      }`}
                      style={{ left: `${b.start * 100}%`, width: `${Math.max(b.width * 100, 0.4)}%` }}
                    />
                  ))}
                </span>
                <span className="flex-none basis-[74px] text-right font-mono text-sm tabular-nums text-foreground-800">
                  {fmtMinutes(d.summary.workedMinutes)}
                </span>
                <span className="flex-none basis-[86px] text-right">
                  <StatusChip level={d.summary.level} size="sm" hint={dayHint(d)} />
                </span>
                <span className="flex flex-none basis-[150px] items-center justify-end gap-1.5">
                  {d.proposalPending ? (
                    <span className="rounded-small bg-warning-100 px-1.5 py-px text-xs font-semibold text-warning-700">
                      本人の確認待ち
                    </span>
                  ) : null}
                  {canApprove && (d.summary.level !== "ok" || d.proposalPending) ? (
                    <Link
                      href={`/shore/labor/adjust?crew=${crewMemberId}&date=${d.date}`}
                      className="ui-btn-quiet"
                    >
                      修正を依頼
                    </Link>
                  ) : null}
                </span>
              </div>
            ))}
          {period.totals.recordedDays === 0 ? (
            <p className="text-sm text-foreground-500">この月の打刻記録はまだありません。</p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-baseline gap-6 border-t border-[var(--ui-hairline)] pt-5">
          <div>
            <p className="m-0 text-xs text-foreground-400">この月の労働時間</p>
            <p className="m-0 mt-1.5 font-mono text-3xl font-semibold leading-none tabular-nums text-foreground-900">
              {fmtMinutes(period.totals.workedMinutes)}
              <span className="ml-1.5 text-sm font-normal text-foreground-400">
                / 記録のある日 {period.totals.recordedDays}日
              </span>
            </p>
          </div>
          <StatusChip
            level={
              period.totals.violationDays > 0
                ? "violation"
                : period.totals.pendingDays > 0
                  ? "caution"
                  : "ok"
            }
            label={
              period.totals.violationDays > 0
                ? `要対応 ${period.totals.violationDays}日`
                : period.totals.pendingDays > 0
                  ? `承認待 ${period.totals.pendingDays}日`
                  : "すべて承認済み"
            }
          />
        </div>
      </Section>

      ) : null}

      {tab === "leave" ? (
      /* 休日・有給休暇・補償休日（3.2.4） */
      <section aria-label="休日・有給休暇・補償休日" className="ui-card flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">休日・有給休暇・補償休日</h2>
          <p className="text-xs text-foreground-500">
            残り日数は付与と取得から計算した値です（記録として持ちません）
          </p>
        </div>

        {leaveBoard.some((b) => b.expiringGrants.length > 0) ? (
          <div className="ui-inset border border-warning p-3">
            <p className="text-sm font-semibold text-warning-700">
              ⚠ 使わないまま期限が来る休みがあります
            </p>
            <ul className="mt-1 flex flex-col gap-0.5 text-sm">
              {leaveBoard.flatMap((b) =>
                b.expiringGrants.map((g) => (
                  <li key={g.record.id}>
                    {b.crewName} — {t.leaveKind[g.record.kind]} {g.record.days}日分が あと{" "}
                    <span className="tabular-nums font-semibold">{g.daysToExpiry}日</span> で
                    使えなくなります（{g.record.expiresOn} まで）
                  </li>
                )),
              )}
            </ul>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
                <th className="px-2 py-2 font-medium">船員</th>
                {["paid_leave", "statutory_holiday", "compensatory", "special"].map((k) => (
                  <th key={k} className="px-2 py-2 text-right font-medium">
                    {t.leaveKind[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaveBoard.map((b) => (
                <tr
                  key={b.crewMemberId}
                  className={`border-b border-[var(--ui-hairline)] last:border-b-0 ${
                    b.crewMemberId === crewMemberId ? "font-semibold" : ""
                  }`}
                >
                  <td className="px-2 py-2">
                    <Link
                      href={`/shore/labor?crew=${b.crewMemberId}&month=${month}`}
                      className="hover:underline"
                    >
                      {b.crewName}
                    </Link>
                  </td>
                  {["paid_leave", "statutory_holiday", "compensatory", "special"].map((k) => {
                    const row = b.kinds.find((x) => x.kind === k);
                    return (
                      <td key={k} className="px-2 py-2 text-right tabular-nums">
                        {row && (row.granted > 0 || row.taken > 0) ? (
                          <>
                            <span className="font-bold">{row.remaining}</span>
                            <span className="text-xs text-foreground-500">
                              {" "}
                              日（{t.leaveSummary.granted}
                              {row.granted} / {t.leaveSummary.taken}
                              {row.taken}）
                            </span>
                          </>
                        ) : (
                          <span className="text-foreground-400">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {leaveBoard.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-3 text-sm text-foreground-500">
                    休暇の記録はまだありません。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="mb-1 font-bold">{leave.crewName} の休みの記録</h3>
          {leave.records.length === 0 ? (
            <p className="text-sm text-foreground-500">この船員の休暇の記録はありません。</p>
          ) : (
            <ul className="flex flex-col gap-0.5 text-sm">
              {leave.records.slice(0, 12).map((r) => (
                <li key={r.id} className="flex flex-wrap gap-2">
                  <span className="tabular-nums text-foreground-500">{r.date}</span>
                  <span className="font-semibold">{t.leaveKind[r.kind]}</span>
                  <span>{t.leaveAction[r.action]}</span>
                  <span className="tabular-nums">{r.days}日</span>
                  {r.expiresOn ? (
                    <span className="text-foreground-500">{r.expiresOn} まで</span>
                  ) : null}
                  {r.reason ? <span className="text-foreground-500">— {r.reason}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {canEditLeave ? (
          <LeaveForm crews={crews} defaultCrewId={crewMemberId} today={today} />
        ) : (
          <p className="text-sm text-foreground-600">
            休みの付与・取得の登録は管理者（休日・有給を付与する権限）のみが行えます。
          </p>
        )}
      </section>

      ) : null}

      {tab === "ledger" ? (
        <>
      {/* 労務管理記録簿（第16号の5 相当） */}
      <Section
        title="労務管理記録簿（第16号の5書式に相当）"
        note="検査・監査で提出する法定帳簿です"
        actions={
          <p className="m-0 text-xs text-foreground-400">
            {period.month} ／ {period.crewName} ／ 適用ルール版 {period.appliedRuleVersion}
          </p>
        }
        bodyClassName="p-0"
      >
        <div className="ui-table-scroll" style={{ maxHeight: 520 }}>
          <table className="ui-table min-w-[900px]">
          <thead>
            <tr>
              <th>日付</th>
              <th className="num">労働時間</th>
              <th className="num">休息の合計</th>
              <th className="num">分割回数</th>
              <th className="num">最長休息</th>
              <th>休日</th>
              <th>判定</th>
              <th>承認</th>
            </tr>
          </thead>
          <tbody>
            {period.days
              .filter((d) => d.summary.hasRecords || restDates.has(d.date))
              .map((d) => {
                const style = LEVEL_STYLE[d.summary.level];
                // 分割回数・最長休息は「判定に使った値」を出す（日跨ぎの休息を1つに数える）
                const split = checkActualOf(d.summary, "rest_split", d.summary.restPeriods.length);
                const longest = checkActualOf(
                  d.summary,
                  "rest_longest",
                  d.summary.restPeriods.reduce((max, r) => Math.max(max, r.minutes), 0),
                );
                const isRest = !d.summary.hasRecords || restDates.has(d.date);
                return (
                  <tr key={d.date}>
                    <td className="font-mono tabular-nums">{fmtDateLabel(d.date)}</td>
                    <td className="num">{fmtMinutes(d.summary.workedMinutes)}</td>
                    <td className="num">{fmtMinutes(d.summary.restTotalMinutes)}</td>
                    <td className="num">{split}回</td>
                    <td className="num">{fmtMinutes(longest)}</td>
                    <td>{isRest ? "休み" : "—"}</td>
                    <td className={`px-2 py-2 font-semibold ${style.cls}`}>
                      {d.summary.hasRecords ? (
                        <>
                          {style.icon} {style.label}
                        </>
                      ) : (
                        <span className="font-normal text-foreground-500">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {d.approval ? (
                        <span className={d.approval.decision === "remanded" ? "text-danger" : undefined}>
                          {d.approval.decision === "approved" ? "承認" : "差戻し"}
                          <span className="ml-1 text-xs text-foreground-500">
                            {d.approval.approverRole === "labor_manager" ? "労務管理責任者" : "船長"}
                            {" / "}
                            {personName(d.approval.approvedBy)}
                            {" / "}
                            {fmtDateTime(d.approval.decidedAt)}
                          </span>
                        </span>
                      ) : d.summary.hasRecords ? (
                        <span className="text-warning-700">未承認</span>
                      ) : (
                        <span className="text-foreground-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
          </table>
        </div>
        <p className="m-0 border-t border-[var(--ui-hairline)] px-[18px] py-3 text-xs text-foreground-500">
          記録は打刻（一次記録）から毎回導出しています。修正は本人の差戻し・再入力のみで、記録簿を直接
          書き換えることはできません（要件定義書 12.3）。
        </p>
      </Section>

      {/* 国交省 Excel マクロ様式の取込（3.2.2） */}
      {canApprove ? (
        <Section
          title="これまでの記録簿を取り込む（Excel 様式）"
          note="取り込んだ分も打刻と同じ一次記録として追記されます"
          divided={false}
        >
          <LedgerImportForm />
        </Section>
      ) : null}
        </>
      ) : null}
    </div>
  );
}
