import Link from "next/link";

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
      label: "警告の日（7日）",
      value: d.totals.violationDays,
      unit: "日",
      tone: "violation",
      href: "/shore/labor",
      hint: "労務・記録簿（要対応の日）を見る",
    },
    {
      label: "注意の日（7日）",
      value: d.totals.cautionDays,
      unit: "日",
      tone: "caution",
      href: "/shore/labor",
      hint: "労務・記録簿（要注意の日）を見る",
    },
    {
      label: "承認待ち",
      value: d.totals.pendingApprovals,
      unit: "件",
      href: "/shore/labor",
      hint: "労務・記録簿（承認待）を見る",
    },
    {
      label: "差戻し中",
      value: d.totals.remandedDays,
      unit: "件",
      tone: "caution",
      href: "/shore/labor",
      hint: "労務・記録簿（差戻中）を見る",
    },
    {
      label: "期限が近い",
      value: d.totals.deadlineUrgent,
      unit: "件",
      tone: "violation",
      href: "/shore/filings?tab=procedures",
      hint: "手続き・期限管理を見る",
    },
    {
      label: "配乗できない",
      value: d.totals.manningBlocked,
      unit: "名",
      tone: "violation",
      href: "/shore/crew?status=blocked",
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
            title={s.hint}
            note="→"
          />
        ))}
      </section>

      <Section
        title="船ごとの状況"
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
              <td title={item.message} className="cursor-help">
                {item.title}
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
          <p className="m-0 border-t border-[var(--ui-hairline)] px-[18px] py-3">
            <Link href="/shore/filings?tab=procedures" className="ui-btn-quiet">
              すべて見る（ほか {d.deadlines.length - 20}件）
            </Link>
          </p>
        ) : null}
      </Section>

    </>
  );
}
