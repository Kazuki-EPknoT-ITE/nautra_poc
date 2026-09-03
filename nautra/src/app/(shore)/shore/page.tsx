import Link from "next/link";
import { t } from "@/i18n/ja";
import { fmtDateLabel, fmtDateTime, fmtHoursShort, fmtMinutes } from "@/lib/format";
import { buildShoreDashboard } from "@/server/labor-service";
import { requireShore } from "@/server/shore-session";
import { StatusChip } from "@/ui";
import { ShoreGuardNotice } from "./_components/guard";
import { RefreshButton } from "./_components/refresh-button";

export const dynamic = "force-dynamic";

/** 期限接近一覧の種別ラベル（見出しは i18n から、種別名だけここで短く添える） */
const DEADLINE_KIND: Record<string, string> = {
  credential: "証書",
  procedure: "手続き",
  leave: "休暇",
};

/**
 * S-01 労務ダッシュボード（基本設計書 6.2）。
 * 法令遵守アラート集計（黄/赤件数）・**期限接近一覧**・未同期/競合・承認待ちを1画面に集める。
 * 判定は船内と同一のドメイン純関数＋労使協定を反映したルール版で行う（要件定義書 12.3 / 6.5）。
 */
export default async function ShoreDashboardPage() {
  const guard = await requireShore("view_dashboard");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="労務ダッシュボード" />;

  const d = buildShoreDashboard();

  /**
   * 集計の数値。
   *
   * `alert` は「0 でなければ対処が要る」件数で、**0 のときは色を付けない**。
   * 常に赤い数字が並んでいると、本当に赤くなったときに気づけなくなるため
   * （DESIGN.md も赤はエラー状態に限ると定めている）。
   */
  const stats: { label: string; value: number; alert?: "danger" | "caution" }[] = [
    { label: "警告（赤）日数 / 7日間", value: d.totals.violationDays, alert: "danger" },
    { label: "注意（黄）日数 / 7日間", value: d.totals.cautionDays, alert: "caution" },
    { label: "承認待ち", value: d.totals.pendingApprovals },
    { label: "差戻し中", value: d.totals.remandedDays, alert: "caution" },
    { label: "期限が過ぎた・迫っている", value: d.totals.deadlineUrgent, alert: "danger" },
    { label: "配乗できない船員", value: d.totals.manningBlocked, alert: "danger" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">労務ダッシュボード</h1>
        <RefreshButton />
      </div>

      <section aria-label="法令遵守アラート集計" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => {
          const lit = s.alert && s.value > 0;
          return (
            <div key={s.label} className="ui-card p-4">
              <p className="text-sm text-foreground-500">{s.label}</p>
              <p
                className={`tabular-nums text-3xl font-semibold ${
                  lit ? (s.alert === "danger" ? "text-danger" : "text-warning-700") : "text-foreground"
                }`}
              >
                {s.value}
              </p>
            </div>
          );
        })}
      </section>

      {/* 期限接近一覧（証書の期限 12.4 ＋ 手続きの着手期限 6.6② ＋ 休暇の時効 3.2.4） */}
      <section aria-label="期限接近一覧" className="ui-card overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="font-bold">期限が近いもの（急ぐ順）</h2>
          <p className="text-xs text-foreground-500">
            証書・手続き・休暇の期限をまとめています。行から担当の画面へ移動できます。
          </p>
        </div>
        {d.deadlines.length === 0 ? (
          <p className="px-4 py-3 text-sm text-foreground-500">期限が近いものはありません。</p>
        ) : (
          <table className="mt-2 w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
                <th className="px-4 py-2 font-medium">状態</th>
                <th className="px-2 py-2 font-medium">対象</th>
                <th className="px-2 py-2 font-medium">内容</th>
                <th className="px-2 py-2 font-medium">あと</th>
                <th className="px-2 py-2 font-medium">やること</th>
              </tr>
            </thead>
            <tbody>
              {d.deadlines.slice(0, 20).map((item) => (
                <tr key={item.key} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                  <td className="px-4 py-2">
                    <StatusChip level={item.level} size="sm" />
                  </td>
                  <td className="px-2 py-2">
                    <p className="font-semibold">{item.subject}</p>
                    <p className="text-xs text-foreground-500">{DEADLINE_KIND[item.kind]}</p>
                  </td>
                  <td className="px-2 py-2">
                    <p>{item.title}</p>
                    <p className="text-xs text-foreground-600">{item.message}</p>
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {item.days === null
                      ? "—"
                      : item.days < 0
                        ? `${Math.abs(item.days)}日 超過`
                        : `${item.days}日`}
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      href={item.href}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      開く
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {d.deadlines.length > 20 ? (
          <p className="px-4 py-3 text-xs text-foreground-500">
            ほかに {d.deadlines.length - 20}件 あります。
            <Link href="/shore/procedures" className="ml-1 text-primary underline-offset-2 hover:underline">
              手続き・期限
            </Link>
            で全部見られます。
          </p>
        ) : null}
      </section>

      <section aria-label="次の作業" className="ui-card flex flex-wrap items-center gap-3 p-4">
        <span className="text-sm text-foreground-500">よく使う画面:</span>
        {[
          { href: "/shore/labor", label: "労務・記録簿" },
          { href: "/shore/crew", label: "船員" },
          { href: "/shore/manning", label: "配乗計画" },
          { href: "/shore/shifts", label: "シフト・配置表" },
          { href: "/shore/filings", label: "届出" },
          { href: "/shore/procedures", label: "手続き・期限" },
          { href: "/shore/training", label: "訓練" },
          { href: "/shore/fleet", label: "船舶・保守" },
          { href: "/shore/dispatch", label: "配船・位置" },
          { href: "/shore/documents", label: "帳票" },
          { href: "/shore/notices", label: "お知らせ・速報" },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="rounded-medium bg-default-100 px-3 py-1.5 text-sm">
            {l.label}
          </Link>
        ))}
      </section>

      <section
        aria-label="同期受信状況"
        className="ui-card flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm"
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

      <section aria-label="船内記録の受信状況（種別別）" className="ui-card px-4 py-3">
        <p className="mb-2 text-sm font-semibold">船内記録の受信状況（種別別・累計）</p>
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(t.syncKind).map(([kind, label]) => (
            <span key={kind} className="rounded-small bg-default-100 px-2 py-1">
              {label} <span className="tabular-nums font-bold">{d.countsByKind[kind] ?? 0}</span>
            </span>
          ))}
        </div>
      </section>

      <section aria-label="船員別の遵守状況（直近7日）" className="ui-card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
              <th className="px-4 py-3 font-medium">船員</th>
              {d.rows[0]?.days.map((day) => (
                <th key={day.date} className="px-2 py-3 text-center font-medium tabular-nums">
                  {fmtDateLabel(day.date)}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium">週合計 / 上限</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((row) => (
              <tr key={row.crew.id} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                <td className="px-4 py-3">
                  <Link href={`/shore/crew/${row.crew.id}`} className="font-semibold hover:underline">
                    {row.crew.name}
                  </Link>
                  <p className="text-xs text-foreground-500">
                    {row.crew.position}
                    <Link
                      href={`/shore/labor?crew=${row.crew.id}`}
                      className="ml-2 text-primary underline-offset-2 hover:underline"
                    >
                      労務管理
                    </Link>
                  </p>
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
        労使協定を登録すると、その適用期間から判定の基準が変わります。
      </p>
    </div>
  );
}
