import { t } from "@/i18n/ja";
import { fmtDateTime } from "@/lib/format";
import { fmtLatLon } from "@/lib/position-plain";
import { listVessels } from "@/server/master-service";
import { buildPositionViews, buildScheduleViews } from "@/server/position-service";
import { requireShore } from "@/server/shore-session";
import { StatusChip } from "@/ui";
import { ShoreGuardNotice } from "../_components/guard";
import { ManualPositionForm } from "./_components/manual-position-form";
import { ScheduleForm } from "./_components/schedule-form";
import { ScheduleStatusControls } from "./_components/schedule-status-controls";
import { SeaChart, type ChartVessel } from "./_components/sea-chart";

export const dynamic = "force-dynamic";

/**
 * S-12 配船・位置情報（要件定義書 3.7.1 / 3.7.2）。
 *
 * 位置は**配船判断の参考情報**として扱う（3.7.1 留意点）。無償の AIS 配信は可用性・
 * データ品質の保証がないため、画面でそのことを明示し、観測が古いものには注意を出す。
 * 取得は position-service の `fetchPositions()`（商用 API への差替え点）に閉じてある。
 */
export default async function ShoreDispatchPage() {
  const guard = await requireShore("manage_dispatch");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="配船・位置情報" />;

  const vessels = listVessels();
  const views = buildPositionViews();
  const schedules = buildScheduleViews();

  const chartVessels: ChartVessel[] = views
    .filter((v) => v.latest)
    .map((v) => ({
      vesselId: v.vesselId,
      vesselName: v.vesselName,
      lat: v.latest!.lat,
      lon: v.latest!.lon,
      courseDeg: v.latest!.courseDeg,
      track: v.track.map((p) => ({ lat: p.lat, lon: p.lon })),
      stale: v.freshness?.stale ?? false,
    }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">配船・位置情報</h1>
        <p className="text-sm text-foreground-500">位置は参考情報です（後述の注意を読んでください）</p>
      </div>

      {/* 3.7.1 留意点: 無償 AIS は SLA がないため参考情報と位置づける */}
      <section aria-label="位置情報の扱い" className="ui-card p-4">
        <h2 className="mb-1 font-bold">⚠ この画面の位置は「参考情報」です</h2>
        <p className="text-sm text-foreground-600">
          位置は AIS の配信サービスやスマートフォンの GPS から受け取っています。受信が途切れたり、
          値が古いままになることがあり、正確さは保証されていません。
          <span className="font-semibold">出港・入港の判断は、必ず船との連絡でも確かめてください。</span>
          将来もっと確かな有料サービスに切り替えられるよう、位置の取り込みは1か所にまとめてあります。
        </p>
      </section>

      {/* 3.7.1 船ごとの最新位置 */}
      <section aria-label="いまの位置" className="ui-card p-4">
        <h2 className="mb-2 font-bold">いまの位置</h2>
        {views.every((v) => !v.latest) ? (
          <p className="text-sm text-foreground-500">位置の情報はまだありません。</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {views.map((v) => (
              <li
                key={v.vesselId}
                className="flex flex-col gap-1 border-b border-[var(--ui-hairline)] pb-3 last:border-b-0"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-bold">{v.vesselName}</span>
                  {v.latest ? (
                    <>
                      <StatusChip
                        level={v.freshness?.level ?? "ok"}
                        size="sm"
                        label={t.navStatus[v.latest.navStatus ?? "unknown"]}
                      />
                      <span className="tabular-nums">{fmtLatLon(v.latest.lat, v.latest.lon)}</span>
                      <span className="tabular-nums text-foreground-500">
                        速力 {v.latest.speedKnots ?? "—"} ノット / 針路 {v.latest.courseDeg ?? "—"} 度
                      </span>
                      <span className="text-foreground-500">
                        行き先 {v.latest.destination ?? "—"}
                        {v.latest.eta ? ` / 到着見込み ${fmtDateTime(v.latest.eta)}` : ""}
                      </span>
                      <span className="text-foreground-500">
                        取得元 {t.positionSource[v.latest.source]}
                      </span>
                    </>
                  ) : (
                    <span className="text-foreground-500">位置の情報がありません</span>
                  )}
                </div>
                {v.latest && v.freshness ? (
                  <p
                    className={`text-sm ${
                      v.freshness.stale ? "text-warning-700" : "text-foreground-600"
                    }`}
                  >
                    {v.freshness.stale ? "⚠ " : ""}
                    {v.freshness.message}（受信 {fmtDateTime(v.latest.observedAt)}）
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 簡易海図（外部の地図タイル・ライブラリは使わない） */}
      <section aria-label="簡易海図" className="ui-card p-4">
        <h2 className="mb-2 font-bold">簡易海図（日本近海）</h2>
        {chartVessels.length === 0 ? (
          <p className="text-sm text-foreground-500">図に出せる位置がありません。</p>
        ) : (
          <SeaChart vessels={chartVessels} />
        )}
      </section>

      {/* 3.7.2 配船スケジュール */}
      <section aria-label="配船スケジュール" className="flex flex-col gap-3">
        <h2 className="font-bold">
          配船のスケジュール
          <span className="ml-2 tabular-nums text-sm font-normal text-foreground-500">
            {schedules.length}件
          </span>
        </h2>
        {schedules.length === 0 ? (
          <p className="ui-card p-4 text-sm text-foreground-500">配船の予定はありません。</p>
        ) : (
          schedules.map((s) => (
            <div key={s.schedule.id} className="ui-card flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold">{s.vesselName}</span>
                <span className="tabular-nums text-foreground-500">
                  {s.schedule.voyageNo ?? "航海番号なし"}
                </span>
                <StatusChip
                  level={s.schedule.status === "canceled" ? "none" : "ok"}
                  size="sm"
                  label={t.scheduleStatus[s.schedule.status]}
                />
              </div>
              <p className="text-sm">
                <span className="font-semibold">
                  {s.schedule.departurePort} → {s.schedule.arrivalPort}
                </span>
                <span className="ml-2 tabular-nums text-foreground-500">
                  {fmtDateTime(s.schedule.departureAt)} 出港 / {fmtDateTime(s.schedule.arrivalAt)} 入港
                </span>
              </p>
              <p className="text-sm text-foreground-500">
                貨物 {s.schedule.cargoKind ?? "—"} / 数量 {s.schedule.quantity ?? "—"} / 相手先{" "}
                {s.schedule.counterparty ?? "—"}
              </p>
              {s.schedule.planningNote ? (
                <p className="text-sm text-foreground-600">メモ: {s.schedule.planningNote}</p>
              ) : null}
              {s.crewChanges.length > 0 ? (
                <ul className="flex flex-col gap-1 text-sm text-warning-700">
                  {s.crewChanges.map((c) => (
                    <li key={`${c.crewMemberId}-${c.date}`}>
                      ⚠ この期間に {c.crewName}
                      {c.duty ? `（${c.duty}）` : ""} が {c.date} に
                      {c.eventType === "off" ? "下船" : "乗船"}する予定です。交代の手配を確認してください
                    </li>
                  ))}
                </ul>
              ) : null}
              <ScheduleStatusControls scheduleId={s.schedule.id} current={s.schedule.status} />
            </div>
          ))
        )}
      </section>

      <ScheduleForm vessels={vessels} />
      <ManualPositionForm vessels={vessels} />
    </div>
  );
}
