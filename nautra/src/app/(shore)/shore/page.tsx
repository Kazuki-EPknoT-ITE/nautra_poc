import Link from "next/link";
import { t } from "@/i18n/ja";
import { fmtDateLabel, fmtDateTime, fmtHoursShort, fmtMinutes } from "@/lib/format";
import { buildShoreDashboard } from "@/server/labor-service";
import { requireShore } from "@/server/shore-session";
import { buildVesselOverviews } from "@/server/vessel-overview-service";
import { DataTable, Section, StatBlock, StatusChip } from "@/ui";
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
 * S-01 労務ダッシュボード（基本設計書 6.2 / デザイン正本 `design/poc_design`）。
 *
 * 4段構成: **数字 → 船ごと → 急ぐ期限 → 船員ごとの7日**。
 * 上から下へ「どれくらいまずいか → どの船か → 何をいつまでに → 誰の話か」と
 * 絞り込めるように積む。判定は船内と同一のドメイン純関数＋労使協定を反映した
 * ルール版で行う（要件定義書 12.3 / 6.5）。
 */
export default async function ShoreDashboardPage() {
  const guard = await requireShore("view_dashboard");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="労務ダッシュボード" />;

  const d = buildShoreDashboard();
  const vessels = buildVesselOverviews();

  /**
   * 集計の数値。`tone` が付いた項目は **0 を超えたときだけ**色を持つ。
   * 常に赤い数字が並んでいると、本当に赤くなったときに気づけなくなるため。
   */
  const stats: {
    label: string;
    value: number;
    unit: string;
    tone?: "caution" | "violation";
    href: string;
    hint: string;
  }[] = [
    {
      label: "警告日数 ／ 7日間",
      value: d.totals.violationDays,
      unit: "日",
      tone: "violation",
      href: "/shore/labor",
      hint: "労務・記録簿（要対応の日）を見る",
    },
    {
      label: "注意日数 ／ 7日間",
      value: d.totals.cautionDays,
      unit: "日",
      tone: "caution",
      href: "/shore/labor",
      hint: "労務・記録簿（要注意の日）を見る",
    },
    {
      label: "承認待の日次レコード",
      value: d.totals.pendingApprovals,
      unit: "件",
      href: "/shore/labor",
      hint: "労務・記録簿（承認待）を見る",
    },
    {
      label: "差戻中",
      value: d.totals.remandedDays,
      unit: "件",
      tone: "caution",
      href: "/shore/labor",
      hint: "労務・記録簿（差戻中）を見る",
    },
    {
      label: "期限超過・期限接近",
      value: d.totals.deadlineUrgent,
      unit: "件",
      tone: "violation",
      href: "/shore/procedures",
      hint: "手続き・期限管理を見る",
    },
    {
      label: "配乗不可の船員",
      value: d.totals.manningBlocked,
      unit: "名",
      tone: "violation",
      href: "/shore/crew",
      hint: "配乗不可の船員を見る",
    },
  ];

  return (
    <>
      <section aria-label="法令遵守アラート集計" className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <StatBlock
            key={s.label}
            label={s.label}
            value={s.value}
            unit={s.unit}
            tone={s.tone ?? "none"}
            href={s.href}
            note={`${s.hint} →`}
          />
        ))}
      </section>

      <Section
        title="船ごとの状況"
        actions={
          <p className="m-0 text-xs text-foreground-400">
            船のカードを押すと、その船舶の管理ページへ移動します
          </p>
        }
        divided={false}
        bodyClassName="pt-0"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {vessels.map((v) => (
            <Link
              key={v.vesselId}
              href={`/shore/fleet/${v.vesselId}`}
              className="ui-row flex flex-col gap-1.5 p-3.5 transition-colors hover:bg-content2"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-lg font-bold text-foreground-900">{v.name}</span>
                <StatusChip
                  level={v.stateLevel}
                  size="sm"
                  className="flex-none"
                  label={v.onBoard.length === 0 && v.stateLevel === "caution" ? "配乗なし" : v.state}
                />
              </span>
              <span className="block text-xs leading-normal text-foreground-500">{v.spec}</span>
              {v.route ? (
                <span className="block truncate text-xs text-foreground-400">{v.route}</span>
              ) : null}
              <span className="grid grid-cols-4 gap-1.5 border-t border-[var(--ui-hairline)] pt-2.5">
                {[
                  { k: "乗船", v: v.onBoard.length, cls: "text-foreground-900" },
                  { k: "注意", v: v.cautionDays, cls: "text-primary" },
                  { k: "承認待", v: v.pendingApprovals, cls: "text-foreground-900" },
                  {
                    k: "違反",
                    v: v.violationDays,
                    cls: v.violationDays > 0 ? "text-danger" : "text-foreground-900",
                  },
                ].map((c) => (
                  <span key={c.k} className="block">
                    <span className="block text-2xs tracking-normal text-foreground-400">{c.k}</span>
                    <span className={`block font-mono text-xl tabular-nums ${c.cls}`}>{c.v}</span>
                  </span>
                ))}
              </span>
              <span className="block text-2xs leading-normal tracking-normal text-foreground-400">
                次の期限{" "}
                {v.nextDeadline
                  ? `${v.nextDeadline.title}（${
                      v.nextDeadline.days === null
                        ? "—"
                        : v.nextDeadline.days < 0
                          ? `${Math.abs(v.nextDeadline.days)}日 超過`
                          : `あと${v.nextDeadline.days}日`
                    }）`
                  : "なし"}
              </span>
            </Link>
          ))}
        </div>
      </Section>

      {/* 期限接近一覧（証書の期限 12.4 ＋ 手続きの着手期限 6.6② ＋ 休暇の時効 3.2.4） */}
      <Section
        title="期限が近いもの（急ぐ順）"
        actions={<RefreshButton />}
        bodyClassName="p-0"
      >
        <DataTable
          isEmpty={d.deadlines.length === 0}
          empty="期限が近いものはありません。"
          head={
            <>
              <th>状態</th>
              <th>対象</th>
              <th>内容</th>
              <th className="num">着手まで</th>
              <th className="num" />
            </>
          }
        >
          {d.deadlines.slice(0, 20).map((item) => (
            <tr key={item.key}>
              <td>
                <StatusChip
                  level={item.level}
                  size="sm"
                  label={item.level === "violation" ? "超過" : item.level === "caution" ? "着手期限" : "余裕"}
                />
              </td>
              <td>
                <p className="m-0 font-medium text-foreground-800">{item.subject}</p>
                <p className="m-0 mt-0.5 text-xs text-foreground-400">{DEADLINE_KIND[item.kind]}</p>
              </td>
              <td>
                <p className="m-0">{item.title}</p>
                <p className="m-0 mt-0.5 text-xs text-foreground-500">{item.message}</p>
              </td>
              <td className="num">
                {item.days === null
                  ? "—"
                  : item.days < 0
                    ? `${Math.abs(item.days)}日 超過`
                    : `${item.days}日`}
              </td>
              <td className="num">
                <Link href={item.href} className="ui-btn-quiet">
                  開く
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
        {d.deadlines.length > 20 ? (
          <p className="border-t border-[var(--ui-hairline)] px-[18px] py-3 text-xs text-foreground-500">
            ほかに {d.deadlines.length - 20}件 あります。
            <Link href="/shore/procedures" className="ml-1 text-primary underline-offset-2 hover:underline">
              手続き・期限
            </Link>
            で全部見られます。
          </p>
        ) : null}
      </Section>

      <Section
        title="船員別の遵守状況（直近7日）"
        note={`${d.rows.length}名 ／ 適用ルール版 ${d.appliedRuleVersion}`}
        bodyClassName="p-0"
      >
        <DataTable
          head={
            <>
              <th>船員</th>
              {d.rows[0]?.days.map((day) => (
                <th key={day.date} className="num">
                  {fmtDateLabel(day.date)}
                </th>
              ))}
              <th className="num">週合計 / 上限</th>
            </>
          }
        >
          {d.rows.map((row) => (
            <tr key={row.crew.id}>
              <td>
                <Link href={`/shore/crew/${row.crew.id}`} className="font-semibold hover:underline">
                  {row.crew.name}
                </Link>
                <p className="m-0 mt-0.5 text-xs text-foreground-400">
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
                  <td key={day.date} className="text-center align-middle">
                    {day.hasRecords ? (
                      <div className="flex flex-col items-center gap-1">
                        <StatusChip level={day.level} size="sm" label={fmtHoursShort(day.workedMinutes)} />
                        <span className="text-2xs tracking-normal text-foreground-400">
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
              <td className="align-middle">
                <div className="flex flex-col items-end gap-1">
                  <span className="font-mono tabular-nums font-semibold text-foreground-900">
                    {fmtMinutes(row.weeklyTotalMinutes)}
                  </span>
                  <StatusChip level={row.weekly.level} size="sm" />
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>

      <Section title="同期の受信状況" divided={false} bodyClassName="pt-0">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span>
            受信イベント <span className="font-mono font-bold tabular-nums">{d.sync.eventCount}</span> 件
          </span>
          <span>
            最終受信{" "}
            <span className="font-mono font-bold tabular-nums">
              {d.sync.lastReceivedAt ? fmtDateTime(d.sync.lastReceivedAt) : "—"}
            </span>
          </span>
          <span>
            隔離（未知種別・ポリシー違反）{" "}
            <span className="font-mono font-bold tabular-nums">{d.sync.quarantineCount}</span> 件
          </span>
          <span className={d.sync.conflictCount > 0 ? "text-danger" : undefined}>
            競合（要確認） <span className="font-mono font-bold tabular-nums">{d.sync.conflictCount}</span> 件
          </span>
          <span>
            サーバ版 <span className="font-mono font-bold tabular-nums">v{d.sync.serverVersion}</span>
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-sm">
          {Object.entries(t.syncKind).map(([kind, label]) => (
            <span key={kind} className="rounded-small bg-default-100 px-2 py-1">
              {label} <span className="font-mono font-bold tabular-nums">{d.countsByKind[kind] ?? 0}</span>
            </span>
          ))}
        </div>
      </Section>

      <p className="text-xs text-foreground-400">
        集計時刻: {fmtDateTime(d.generatedAt)}。判定は船内アプリと同一のドメイン関数
        （packages/domain 相当）で行われ、二重実装はありません。労使協定を登録すると、その
        適用期間から判定の基準が変わります。
      </p>
    </>
  );
}
