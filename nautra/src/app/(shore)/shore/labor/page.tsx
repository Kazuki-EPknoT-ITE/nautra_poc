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
import { StatusChip } from "@/ui";
import { ShoreGuardNotice } from "../_components/guard";
import { ApprovalForm, type PendingDay } from "./_components/approval-form";
import { LeaveForm } from "./_components/leave-form";
import { LedgerImportForm } from "./_components/ledger-import-form";

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
export default async function ShoreLaborPage({
  searchParams,
}: {
  searchParams: Promise<{ crew?: string; month?: string }>;
}) {
  const guard = await requireShore("view_dashboard");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="労務管理（承認・記録簿）" />;

  const canApprove = await hasShorePermission("approve_labor_manager");
  const canEditLeave = await hasShorePermission("edit_leave");

  const crews = ledgerCrewOptions();
  const sp = await searchParams;
  const crewMemberId = crews.find((c) => c.id === sp.crew)?.id ?? crews[0].id;
  const month = sp.month ?? currentMonth();
  const period = buildLedger(crewMemberId, month);
  const months = monthOptions();
  const today = new Date().toISOString().slice(0, 10);

  const leave = buildLeaveBalance(crewMemberId);
  const leaveBoard = buildLeaveBoard();
  const restDates = new Set(period.aggregates.leaveDates);

  const pendingDays: PendingDay[] = period.days
    .filter((d) => d.summary.hasRecords && !d.approvedByManager)
    .map((d) => ({
      date: d.date,
      workedMinutes: d.summary.workedMinutes,
      level: d.summary.level,
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">労務管理（承認・記録簿）</h1>
        <p className="text-sm text-foreground-500">
          判定は船内と同じルール版 {period.appliedRuleVersion} で行っています
        </p>
      </div>

      {/* 対象の切替（サーバ側で組み立てるためリンクで切り替える） */}
      <section aria-label="対象の切替" className="glass-tile flex flex-wrap items-center gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-foreground-500">船員</span>
          {crews.map((c) => (
            <Link
              key={c.id}
              href={`/shore/labor?crew=${c.id}&month=${month}`}
              className={`rounded-medium px-3 py-1.5 text-sm ${
                c.id === crewMemberId ? "bg-primary text-primary-foreground" : "bg-default-100"
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-foreground-500">対象月</span>
          {months.map((m) => (
            <Link
              key={m}
              href={`/shore/labor?crew=${crewMemberId}&month=${m}`}
              className={`rounded-medium px-3 py-1.5 text-sm tabular-nums ${
                m === month ? "bg-primary text-primary-foreground" : "bg-default-100"
              }`}
            >
              {m}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link
            href={`/shore/labor/ledger/print?crew=${crewMemberId}&month=${month}`}
            className="rounded-medium bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
            prefetch={false}
          >
            記録簿を印刷・PDF
          </Link>
          <Link
            href={`/api/v1/shore/ledger.csv?crew=${crewMemberId}&month=${month}`}
            className="rounded-medium bg-default-100 px-3 py-1.5 text-sm font-semibold"
            prefetch={false}
          >
            CSV で出力
          </Link>
        </div>
      </section>

      <section aria-label="月次の集計" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "記録のある日", value: `${period.totals.recordedDays}日`, tone: "" },
          { label: "労働時間の合計", value: fmtMinutes(period.totals.workedMinutes), tone: "" },
          { label: "警告（赤）", value: `${period.totals.violationDays}日`, tone: "text-danger" },
          { label: "未承認", value: `${period.totals.pendingDays}日`, tone: "text-warning-700" },
        ].map((s) => (
          <div key={s.label} className="glass-tile p-4">
            <p className="text-sm text-foreground-500">{s.label}</p>
            <p className={`tabular-nums text-2xl font-bold ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </section>

      {/* 4週単位・月単位の集計（3.2.1「日単位・週単位・4週単位・月単位」） */}
      <section aria-label="4週間・1か月の集計" className="glass-tile p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">4週間・1か月のまとめ</h2>
          <p className="text-xs text-foreground-500">
            働いた日 {period.aggregates.monthly.workedDays}日 / 休んだ日{" "}
            {period.aggregates.monthly.restDays}日 / 時間外{" "}
            {fmtMinutes(period.aggregates.monthly.overtimeMinutes)} / 週平均{" "}
            {fmtMinutes(period.aggregates.fourWeek.weeklyAverageMinutes)}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {periodChecks.map(({ check, range }) => (
            <div key={`${check.key}-${range}`} className="glass-inset flex items-center gap-3 p-3">
              <StatusChip level={check.level} size="sm" />
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
          <div className="glass-inset flex items-center gap-3 p-3">
            <StatusChip level={period.aggregates.restDay.level} size="sm" />
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
      </section>

      {canApprove ? (
        <ApprovalForm crewMemberId={crewMemberId} crewName={period.crewName} days={pendingDays} />
      ) : (
        <p className="glass-tile p-4 text-sm text-foreground-600">
          承認・差戻しは労務管理責任者の担当です。ここでは記録の確認のみ行えます。
        </p>
      )}

      {/* タイムチャート（0〜24時） */}
      <section aria-label="船員別タイムチャート" className="glass-tile p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">
            タイムチャート — {period.crewName}（{period.position}）
          </h2>
          <div className="flex flex-wrap gap-3 text-xs text-foreground-500">
            {Object.entries(BAR_TONE).map(([cat, tone]) => (
              <span key={cat} className="flex items-center gap-1">
                <span className={`inline-block h-3 w-4 rounded-sm ${tone}`} aria-hidden="true" />
                {t.workCategory[cat]}
              </span>
            ))}
          </div>
        </div>
        <div className="mb-1 flex text-[10px] text-foreground-500">
          {[0, 6, 12, 18].map((h) => (
            <span key={h} className="w-1/4 tabular-nums">
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          {period.days
            .filter((d) => d.summary.hasRecords)
            .map((d) => {
              const style = LEVEL_STYLE[d.summary.level];
              return (
                <div key={d.date} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 tabular-nums text-xs text-foreground-500">
                    {fmtDateLabel(d.date)}
                  </span>
                  <div className="relative h-5 flex-1 overflow-hidden rounded-small bg-default-100">
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
                  </div>
                  <span className="w-16 shrink-0 tabular-nums text-right text-xs">
                    {fmtMinutes(d.summary.workedMinutes)}
                  </span>
                  <span className={`w-16 shrink-0 text-xs font-semibold ${style.cls}`}>
                    {style.icon} {style.label}
                  </span>
                </div>
              );
            })}
          {period.totals.recordedDays === 0 ? (
            <p className="text-sm text-foreground-500">この月の打刻記録はまだありません。</p>
          ) : null}
        </div>
      </section>

      {/* 休日・有給休暇・補償休日（3.2.4） */}
      <section aria-label="休日・有給休暇・補償休日" className="glass-tile flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">休日・有給休暇・補償休日</h2>
          <p className="text-xs text-foreground-500">
            残り日数は付与と取得から計算した値です（記録として持ちません）
          </p>
        </div>

        {leaveBoard.some((b) => b.expiringGrants.length > 0) ? (
          <div className="glass-inset border border-warning p-3">
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
              <tr className="border-b border-[var(--glass-border)] text-left text-foreground-500">
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
                  className={`border-b border-[var(--glass-border)] last:border-b-0 ${
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

      {/* 労務管理記録簿（第16号の5 相当） */}
      <section aria-label="労務管理記録簿" className="glass-tile overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="font-bold">労務管理記録簿（第16号の5書式に相当）</h2>
          <p className="text-xs text-foreground-500">
            {period.month} / {period.crewName} / 適用ルール版 {period.appliedRuleVersion}
          </p>
        </div>
        <table className="mt-3 w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-[var(--glass-border)] text-left text-foreground-500">
              <th className="px-4 py-2 font-medium">日付</th>
              <th className="px-2 py-2 font-medium">労働時間</th>
              <th className="px-2 py-2 font-medium">休息の合計</th>
              <th className="px-2 py-2 font-medium">分割回数</th>
              <th className="px-2 py-2 font-medium">最長休息</th>
              <th className="px-2 py-2 font-medium">休日</th>
              <th className="px-2 py-2 font-medium">判定</th>
              <th className="px-2 py-2 font-medium">承認</th>
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
                  <tr key={d.date} className="border-b border-[var(--glass-border)] last:border-b-0">
                    <td className="px-4 py-2 tabular-nums">{fmtDateLabel(d.date)}</td>
                    <td className="px-2 py-2 tabular-nums">{fmtMinutes(d.summary.workedMinutes)}</td>
                    <td className="px-2 py-2 tabular-nums">{fmtMinutes(d.summary.restTotalMinutes)}</td>
                    <td className="px-2 py-2 tabular-nums">{split}回</td>
                    <td className="px-2 py-2 tabular-nums">{fmtMinutes(longest)}</td>
                    <td className="px-2 py-2">{isRest ? "休み" : "—"}</td>
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
        <p className="px-4 py-3 text-xs text-foreground-500">
          記録は打刻（一次記録）から毎回導出しています。修正は本人の差戻し・再入力のみで、記録簿を直接
          書き換えることはできません（要件定義書 12.3）。
        </p>
      </section>

      {/* 国交省 Excel マクロ様式の取込（3.2.2） */}
      {canApprove ? (
        <section aria-label="記録簿の取込" className="glass-tile flex flex-col gap-3 p-4">
          <h2 className="font-bold">これまでの記録簿を取り込む（Excel様式 → CSV）</h2>
          <LedgerImportForm />
        </section>
      ) : null}
    </div>
  );
}
