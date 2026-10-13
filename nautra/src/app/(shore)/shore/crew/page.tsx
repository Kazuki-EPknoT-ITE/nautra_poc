import Link from "next/link";
import type { ManningStatus } from "@/domain/crew/manning";
import { t } from "@/i18n/ja";
import { fmtMinutes } from "@/lib/format";
import { buildLaborSnapshots } from "@/server/crew-service";
import { buildManningBoard } from "@/server/manning-service";
import { requireShore } from "@/server/shore-session";
import { crewPhotoMap } from "@/server/crew-photo-service";
import { CrewPhoto, StatusChip } from "@/ui";
import { ExportAction } from "../_components/export-action";
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
  // 顔写真は船員マスタとは別に持つ（差し替えでマスタの版を増やさないため）
  const photos = crewPhotoMap();
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
    <div className="flex flex-col gap-[18px]">
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
                className={`ui-btn-quiet ${f.key === status ? "ui-btn-selected" : ""}`}
              >
                {f.label}
                <span className="ml-1 tabular-nums">{count}</span>
              </Link>
            );
          })}
        </div>
        <CrewSearchForm status={status} q={q} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ExportAction set="crew" label="船員名簿を書き出す" />
          <Link href="/shore/crew/new" className="ui-btn-primary h-9">
            ＋ 船員を登録
          </Link>
        </div>
      </section>

      <section aria-label="船員一覧" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const l = labor.get(r.crewMemberId);
          const warnings = r.credentialStatuses.filter((s) => s.level !== "ok");
          const expired = warnings.filter((s) => s.expiry === "expired").length;
          const stale = warnings.filter((s) => s.freshness !== "fresh").length;
          return (
            <Link
              key={r.crewMemberId}
              href={`/shore/crew/${r.crewMemberId}`}
              className="ui-card flex items-start gap-3.5 p-4 transition-colors hover:bg-content2"
            >
              <CrewPhoto name={r.name} initial={r.photo} src={photos.get(r.crewMemberId)} size="lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="m-0 flex flex-wrap items-baseline gap-2" title={r.age !== null ? `${r.age}歳` : undefined}>
                  <span className="text-xl font-bold text-foreground-900">{r.name}</span>
                  <span className="text-sm text-foreground-500">{r.position}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip
                    level={r.eligibility.level}
                    size="sm"
                    label={t.manningStatus[r.eligibility.status]}
                    hint={r.eligibility.issues.map((i) => i.label).join("・") || false}
                  />
                  <span className={r.currentVesselName ? "text-sm font-semibold text-foreground-800" : "text-sm text-foreground-500"}>
                    {r.currentVesselName ?? "配乗待ち"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-sm tabular-nums text-foreground-700" title="直近7日の労働時間">
                    7日 <span className="font-semibold">{fmtMinutes(l?.weeklyMinutes ?? 0)}</span>
                  </span>
                  {(l?.violationDays ?? 0) > 0 ? <StatusChip level="violation" size="sm" label={`警告 ${l?.violationDays}日`} hint="直近7日で労働時間・休息の上限を超えた日" /> : null}
                  {(l?.cautionDays ?? 0) > 0 ? <StatusChip level="caution" size="sm" label={`注意 ${l?.cautionDays}日`} hint="直近7日で上限に近づいた日" /> : null}
                  {(l?.pendingDays ?? 0) > 0 ? <StatusChip level="none" size="sm" label={`未承認 ${l?.pendingDays}日`} hint={false} /> : null}
                  {warnings.length > 0 ? (
                    <StatusChip
                      level={expired > 0 ? "violation" : "caution"}
                      size="sm"
                      label={`証書 ${warnings.length}件`}
                      hint={`期限切れ ${expired}件 / 要再確認 ${stale}件: ${warnings.map((w) => w.credential.name).join("・")}`}
                    />
                  ) : null}
                </div>
                {(l?.todayWatches ?? []).length > 0 ? (
                  <p
                    className="m-0 font-mono text-xs text-foreground-500"
                    title={(l?.todayWatches ?? []).map((w) => `${w.shiftType ? t.shiftType[w.shiftType] : ""} ${w.from}–${w.to}`).join(" / ")}
                  >
                    当直 {l!.todayWatches[0]!.from}–{l!.todayWatches[0]!.to}
                    {l!.todayWatches.length > 1 ? ` ほか${l!.todayWatches.length - 1}` : ""}
                  </p>
                ) : null}
              </div>
            </Link>
          );
        })}
        {rows.length === 0 ? (
          <p className="text-sm text-foreground-500">当てはまる船員はいません</p>
        ) : null}
      </section>

    </div>
  );
}
