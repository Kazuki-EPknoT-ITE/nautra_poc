import { t } from "@/i18n/ja";
import { fmtDateLabel, fmtDateTime, fmtHoursShort, fmtMinutes } from "@/lib/format";
import { buildShoreDashboard } from "@/server/labor-service";
import { StatusChip } from "@/ui";
import { RefreshButton } from "./_components/refresh-button";

export const dynamic = "force-dynamic";

/**
 * S-01 労務ダッシュボード（PoC 簡易版）。
 * 法令遵守アラート集計（黄/赤件数）・承認状況・同期受信状況を表示する。
 * 判定は船内と同一のドメイン純関数＋同一ルール版で行う（二重実装しない。要件定義書 12.3）。
 */
export default function ShoreDashboardPage() {
  const d = buildShoreDashboard();

  const stats = [
    { label: "警告（赤）日数 / 7日間", value: d.totals.violationDays, tone: "text-danger" },
    { label: "注意（黄）日数 / 7日間", value: d.totals.cautionDays, tone: "text-warning" },
    { label: "承認待ち", value: d.totals.pendingApprovals, tone: "text-foreground" },
    { label: "差戻し中", value: d.totals.remandedDays, tone: "text-danger" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">労務ダッシュボード</h1>
        <RefreshButton />
      </div>

      <section aria-label="法令遵守アラート集計" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-large border border-default-200 bg-content1 p-4">
            <p className="text-sm text-foreground-500">{s.label}</p>
            <p className={`tabular-nums text-3xl font-bold ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </section>

      <section
        aria-label="同期受信状況"
        className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-large border border-default-200 bg-content1 px-4 py-3 text-sm"
      >
        <span>
          受信イベント <span className="tabular-nums font-bold">{d.sync.eventCount}</span> 件
        </span>
        <span>
          最終受信{" "}
          <span className="tabular-nums font-bold">
            {d.sync.lastReceivedAt ? fmtDateTime(d.sync.lastReceivedAt) : "—"}
          </span>
        </span>
        <span>
          隔離（未知種別・ポリシー違反） <span className="tabular-nums font-bold">{d.sync.quarantineCount}</span> 件
        </span>
        <span className={d.sync.conflictCount > 0 ? "text-danger" : undefined}>
          競合（要確認） <span className="tabular-nums font-bold">{d.sync.conflictCount}</span> 件
        </span>
        <span>
          サーバ版 <span className="tabular-nums font-bold">v{d.sync.serverVersion}</span>
        </span>
      </section>

      <section aria-label="船内記録の受信状況（種別別）" className="rounded-large border border-default-200 bg-content1 px-4 py-3">
        <p className="mb-2 text-sm font-semibold">船内記録の受信状況（種別別・累計）</p>
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(t.syncKind).map(([kind, label]) => (
            <span key={kind} className="rounded-small bg-default-100 px-2 py-1">
              {label} <span className="tabular-nums font-bold">{d.countsByKind[kind] ?? 0}</span>
            </span>
          ))}
        </div>
      </section>

      <section aria-label="船員別の遵守状況（直近7日）" className="overflow-x-auto rounded-large border border-default-200 bg-content1">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-default-200 text-left text-foreground-500">
              <th className="px-4 py-3 font-medium">船員</th>
              {d.rows[0]?.days.map((day) => (
                <th key={day.date} className="px-2 py-3 text-center font-medium tabular-nums">
                  {fmtDateLabel(day.date)}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium">週合計 / 72h</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((row) => (
              <tr key={row.crew.id} className="border-b border-default-100 last:border-b-0">
                <td className="px-4 py-3">
                  <p className="font-semibold">{row.crew.name}</p>
                  <p className="text-xs text-foreground-500">{row.crew.position}</p>
                </td>
                {row.days.map((day) => {
                  const approval = row.approvalByDate[day.date];
                  return (
                    <td key={day.date} className="px-2 py-3 text-center align-middle">
                      {day.hasRecords ? (
                        <div className="flex flex-col items-center gap-1">
                          <StatusChip level={day.level} size="sm" label={fmtHoursShort(day.workedMinutes)} />
                          <span className="text-xs text-foreground-500">
                            {approval
                              ? approval.decision === "approved"
                                ? "✓承認済"
                                : "✕差戻し"
                              : "⚠承認待ち"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-foreground-300">–</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right align-middle">
                  <div className="flex flex-col items-end gap-1">
                    <span className="tabular-nums font-semibold">{fmtMinutes(row.weeklyTotalMinutes)}</span>
                    <StatusChip level={row.weekly.level} size="sm" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-foreground-400">
        適用ルール版: {d.appliedRuleVersion} / 集計時刻: {fmtDateTime(d.generatedAt)}。
        判定は船内アプリと同一のドメイン関数（packages/domain 相当）で行われ、二重実装はありません。
      </p>
    </div>
  );
}
