import Link from "next/link";
import type { ManningStatus } from "@/domain/crew/manning";
import { t } from "@/i18n/ja";
import { fmtMinutes } from "@/lib/format";
import { buildLaborSnapshots } from "@/server/crew-service";
import { buildManningBoard } from "@/server/manning-service";
import { requireShore } from "@/server/shore-session";
import { StatusChip } from "@/ui";
import { ShoreGuardNotice } from "../_components/guard";
import { CrewSearchForm } from "./_components/crew-search-form";

export const dynamic = "force-dynamic";

/** 絞り込みの選択肢（配乗可否は導出値。ここでは表示の出し分けにだけ使う） */
const FILTERS: { key: "all" | ManningStatus; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "eligible", label: t.manningStatus.eligible },
  { key: "caution", label: t.manningStatus.caution },
  { key: "blocked", label: t.manningStatus.blocked },
];

/**
 * S-02 船員一覧（要件定義書 3.1.4「写真付き一覧での即時検索、資格・健康状態の可視化、
 * 配乗判断の迅速化」）。
 *
 * 配乗可否は**導出値**で、`manning-service` → `domain/crew/manning` が唯一の判定経路
 * （12.3）。この画面は判定を行わず、結果を並べて絞り込むだけの参照ビューとする。
 * 編集は S-04 船員マスタ編集（/shore/crew/[id]/edit）に集約する。
 */
export default async function ShoreCrewPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const guard = await requireShore("view_crew");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="船員一覧" />;

  const sp = await searchParams;
  const status = (FILTERS.find((f) => f.key === sp.status)?.key ?? "all") as "all" | ManningStatus;
  const q = (sp.q ?? "").trim();

  const board = buildManningBoard();
  const labor = buildLaborSnapshots(board.map((r) => r.crewMemberId));
  const rows = board.filter((r) => {
    if (status !== "all" && r.eligibility.status !== status) return false;
    if (q && !r.name.includes(q) && !(r.master?.nameKana ?? "").includes(q)) return false;
    return true;
  });

  const href = (next: { status?: string; q?: string }) => {
    const params = new URLSearchParams();
    const s = next.status ?? status;
    const query = next.q ?? q;
    if (s && s !== "all") params.set("status", s);
    if (query) params.set("q", query);
    const qs = params.toString();
    return qs ? `/shore/crew?${qs}` : "/shore/crew";
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">船員一覧</h1>
        <p className="text-sm text-foreground-500">
          配乗できるか・証書が切れていないかを、写真付きの一覧でまとめて確認できます。
        </p>
      </div>

      <section aria-label="絞り込み" className="ui-card flex flex-wrap items-center gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-foreground-500">配乗できるか</span>
          {FILTERS.map((f) => {
            const count =
              f.key === "all"
                ? board.length
                : board.filter((r) => r.eligibility.status === f.key).length;
            return (
              <Link
                key={f.key}
                href={href({ status: f.key })}
                aria-current={f.key === status ? "true" : undefined}
                className={`rounded-medium px-3 py-1.5 text-sm ${
                  f.key === status ? "bg-primary text-primary-foreground" : "bg-default-100"
                }`}
              >
                {f.label}
                <span className="ml-1 tabular-nums">{count}</span>
              </Link>
            );
          })}
        </div>
        <CrewSearchForm status={status} q={q} />
      </section>

      <section aria-label="船員一覧" className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => {
          const l = labor.get(r.crewMemberId);
          const warnings = r.credentialStatuses.filter((s) => s.level !== "ok");
          const expired = warnings.filter((s) => s.expiry === "expired").length;
          const stale = warnings.filter((s) => s.freshness !== "fresh").length;
          return (
            <Link
              key={r.crewMemberId}
              href={`/shore/crew/${r.crewMemberId}`}
              className="ui-card flex items-start gap-4 p-4 hover:opacity-90"
            >
              <span
                aria-hidden="true"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-default-100 text-lg font-bold"
              >
                {r.photo ?? r.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  {r.name}
                  <span className="text-sm font-normal text-foreground-500">
                    {r.position}
                    {r.age !== null ? ` / ${r.age}歳` : ""}
                  </span>
                </p>
                {/* Chip は div を描くため p に入れない（不正なネストはハイドレーションを壊す） */}
                <div className="mt-1">
                  <StatusChip
                    level={r.eligibility.level}
                    size="sm"
                    label={t.manningStatus[r.eligibility.status]}
                  />
                </div>
                <p className="mt-1 text-sm">
                  <span className="text-foreground-500">乗っている船: </span>
                  {r.currentVesselName ?? "乗船していません（配乗待ち）"}
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-foreground-500">直近7日 </span>
                  <span className="font-semibold tabular-nums">
                    {fmtMinutes(l?.weeklyMinutes ?? 0)}
                  </span>
                  <span className="ml-2 text-foreground-500">
                    警告 {l?.violationDays ?? 0}日 / 注意 {l?.cautionDays ?? 0}日 / 未承認{" "}
                    {l?.pendingDays ?? 0}日
                  </span>
                </p>
                <p className="mt-1 text-xs text-foreground-500">
                  {warnings.length === 0
                    ? "証書はすべて期限内・確認済みです。"
                    : `証書の注意 ${warnings.length}件（期限切れ ${expired}件 / 要再確認 ${stale}件）`}
                </p>
                <p className="mt-1 text-xs text-foreground-500">
                  本日の当直:{" "}
                  {(l?.todayWatches ?? []).length === 0
                    ? "なし"
                    : (l?.todayWatches ?? [])
                        .map((w) => `${w.shiftType ? t.shiftType[w.shiftType] : ""} ${w.from}–${w.to}`)
                        .join(" / ")}
                </p>
              </div>
            </Link>
          );
        })}
        {rows.length === 0 ? (
          <p className="text-sm text-foreground-500">
            この条件に当てはまる船員はいません。絞り込みを変えてください。
          </p>
        ) : null}
      </section>

      <p className="text-xs text-foreground-500">
        「配乗できるか」は入力項目ではなく、免状・健康証明書・基本訓練・保険の確認状況と直近の
        労働時間から、開くたびに計算しています（要件定義書 12.3）。内容を直すのは船員マスタの
        1画面だけで、この一覧やカルテからは書き換えられません。
      </p>
    </div>
  );
}
