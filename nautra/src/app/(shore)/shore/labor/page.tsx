import Link from "next/link";
import { t } from "@/i18n/ja";
import { CREW_MEMBERS, personName } from "@/lib/crew";
import { fmtDateLabel, fmtDateTime, fmtMinutes } from "@/lib/format";
import { buildLedger, currentMonth, monthOptions } from "@/server/ledger-service";
import { ApprovalForm, type PendingDay } from "./_components/approval-form";

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

/**
 * S-06 労務管理（承認・記録簿）。
 * 船員別のタイムチャート、労務管理責任者による日次一括承認、
 * 労務管理記録簿（第16号の5書式に相当）の確認と CSV 出力を行う。
 */
export default async function ShoreLaborPage({
  searchParams,
}: {
  searchParams: Promise<{ crew?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const crewMemberId = sp.crew ?? CREW_MEMBERS[0].id;
  const month = sp.month ?? currentMonth();
  const period = buildLedger(crewMemberId, month);
  const months = monthOptions();

  const pendingDays: PendingDay[] = period.days
    .filter((d) => d.summary.hasRecords && !d.approvedByManager)
    .map((d) => ({
      date: d.date,
      workedMinutes: d.summary.workedMinutes,
      level: d.summary.level,
      captainApproved: d.approval?.approverRole === "captain" && d.approval.decision === "approved",
    }));

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
          {CREW_MEMBERS.map((c) => (
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
        <Link
          href={`/api/v1/shore/ledger.csv?crew=${crewMemberId}&month=${month}`}
          className="ml-auto rounded-medium bg-default-100 px-3 py-1.5 text-sm font-semibold"
          prefetch={false}
        >
          記録簿を CSV で出力
        </Link>
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

      <ApprovalForm crewMemberId={crewMemberId} crewName={period.crewName} days={pendingDays} />

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

      {/* 労務管理記録簿（第16号の5 相当） */}
      <section aria-label="労務管理記録簿" className="glass-tile overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="font-bold">労務管理記録簿（第16号の5書式に相当）</h2>
          <p className="text-xs text-foreground-500">
            {period.month} / {period.crewName} / 適用ルール版 {period.appliedRuleVersion}
          </p>
        </div>
        <table className="mt-3 w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-[var(--glass-border)] text-left text-foreground-500">
              <th className="px-4 py-2 font-medium">日付</th>
              <th className="px-2 py-2 font-medium">労働時間</th>
              <th className="px-2 py-2 font-medium">休息の合計</th>
              <th className="px-2 py-2 font-medium">分割回数</th>
              <th className="px-2 py-2 font-medium">最長休息</th>
              <th className="px-2 py-2 font-medium">判定</th>
              <th className="px-2 py-2 font-medium">承認</th>
            </tr>
          </thead>
          <tbody>
            {period.days
              .filter((d) => d.summary.hasRecords)
              .map((d) => {
                const style = LEVEL_STYLE[d.summary.level];
                const longest = d.summary.restPeriods.reduce((max, r) => Math.max(max, r.minutes), 0);
                return (
                  <tr key={d.date} className="border-b border-[var(--glass-border)] last:border-b-0">
                    <td className="px-4 py-2 tabular-nums">{fmtDateLabel(d.date)}</td>
                    <td className="px-2 py-2 tabular-nums">{fmtMinutes(d.summary.workedMinutes)}</td>
                    <td className="px-2 py-2 tabular-nums">{fmtMinutes(d.summary.restTotalMinutes)}</td>
                    <td className="px-2 py-2 tabular-nums">{d.summary.restPeriods.length}回</td>
                    <td className="px-2 py-2 tabular-nums">{fmtMinutes(longest)}</td>
                    <td className={`px-2 py-2 font-semibold ${style.cls}`}>
                      {style.icon} {style.label}
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
                      ) : (
                        <span className="text-warning-700">未承認</span>
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
    </div>
  );
}
