import Link from "next/link";
import { t } from "@/i18n/ja";
import { fmtDateTime } from "@/lib/format";
import { fmtLatLon } from "@/lib/position-plain";
import { listVessels } from "@/server/master-service";
import {
  buildPositionViews,
  buildScheduleViews,
  buildTrackLog,
  buildVoyageComparisons,
} from "@/server/position-service";
import { requireShore } from "@/server/shore-session";
import { StatusChip } from "@/ui";
import { ShoreGuardNotice } from "../_components/guard";
import { AutoRefresh } from "./_components/auto-refresh";
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
/**
 * この画面の主題（タブ）。**1画面1主題**にして、目的の節まで延々とめくらずに済むようにする
 * （デザイン正本 S-15 と同じやりかた。1枚が 3000px を超えないようにする）。
 * 位置と配船を分けても迷わないのは、「いまどこにいるか」と「次にどこへ行くか」で
 * 見に来る目的がはっきり違うため。
 */
const TABS = [
  // POS-03: いまの様子（自動で更新）と、記録の確認（期間で絞る）を分ける
  { id: "position", label: "いまの位置（リアルタイム）" },
  { id: "log", label: "航跡ログ" },
  // POS-02: 配船の計画と、実際にたどった航跡を船ごとに突き合わせる
  { id: "compare", label: "計画と実績" },
  { id: "schedule", label: "配船スケジュール" },
];

const fmtDelay = (min: number | null) => {
  if (min === null) return "—";
  if (Math.abs(min) < 30) return "計画どおり";
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  const span = h > 0 ? `${h}時間${m > 0 ? `${m}分` : ""}` : `${m}分`;
  return min > 0 ? `${span} 遅れ` : `${span} 早い`;
};
const delayLevel = (min: number | null) =>
  min === null ? ("none" as const) : Math.abs(min) < 30 ? ("ok" as const) : min >= 180 ? ("violation" as const) : ("caution" as const);

export default async function ShoreDispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; vessel?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  /** いま開いている主題。未指定なら先頭 */
  const tab = TABS.some((x) => x.id === sp.tab) ? sp.tab! : TABS[0]!.id;

  const guard = await requireShore("manage_dispatch");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="配船・位置情報" />;

  const vessels = listVessels();
  const views = buildPositionViews();
  const schedules = buildScheduleViews();
  const vesselId = vessels.find((v) => v.id === sp.vessel)?.id ?? vessels[0]?.id ?? "";
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  const from = ymd.test(sp.from ?? "") ? sp.from : undefined;
  const to = ymd.test(sp.to ?? "") ? sp.to : undefined;
  const log = tab === "log" ? buildTrackLog(vesselId, from, to) : null;
  const comparisons = tab === "compare" ? buildVoyageComparisons(vesselId) : [];
  const vesselHref = (id: string) =>
    `/shore/dispatch?tab=${tab}&vessel=${id}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;

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
    <div className="flex flex-col gap-[18px]">
      {/* 主題の切替（サーバ側で組み立てるためリンクで切り替える） */}
      <nav aria-label="配船・位置情報の主題" className="ui-card flex flex-wrap gap-2 p-3">
        {TABS.map((x) => (
          <Link
            key={x.id}
            href={`/shore/dispatch?tab=${x.id}`}
            aria-current={x.id === tab ? "page" : undefined}
            className={`ui-btn-quiet ${x.id === tab ? "ui-btn-selected" : ""}`}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      {tab === "log" || tab === "compare" ? (
        <div className="ui-card flex flex-wrap items-center gap-2 p-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="船">
            {vessels.map((v) => (
              <Link key={v.id} href={vesselHref(v.id)} className={`ui-btn-quiet ${v.id === vesselId ? "ui-btn-selected" : ""}`}>
                {v.name}
              </Link>
            ))}
          </div>
          {tab === "log" ? (
            <form method="get" action="/shore/dispatch" className="ml-auto flex flex-wrap items-center gap-2">
              <input type="hidden" name="tab" value="log" />
              <input type="hidden" name="vessel" value={vesselId} />
              <span className="text-sm font-bold text-foreground-700">期間</span>
              <input type="date" name="from" defaultValue={from} aria-label="いつから" className="ui-field !w-auto !py-1.5 font-mono" />
              <span>〜</span>
              <input type="date" name="to" defaultValue={to} aria-label="いつまで" className="ui-field !w-auto !py-1.5 font-mono" />
              <button type="submit" className="ui-btn-ghost h-9">
                絞り込む
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {tab === "log" && log ? (
        <>
          <section aria-label="航跡の記録" className="ui-card overflow-x-auto p-0">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>受信</th>
                  <th>位置</th>
                  <th className="num">速力</th>
                  <th className="num">針路</th>
                  <th>状態</th>
                  <th>行き先</th>
                  <th>取得元</th>
                </tr>
              </thead>
              <tbody>
                {log.rows.slice(0, 50).map((pos) => (
                  <tr key={pos.id}>
                    <td className="font-mono tabular-nums">{fmtDateTime(pos.observedAt)}</td>
                    <td className="font-mono tabular-nums">{fmtLatLon(pos.lat, pos.lon)}</td>
                    <td className="num">{pos.speedKnots ?? "—"}</td>
                    <td className="num">{pos.courseDeg ?? "—"}</td>
                    <td>{t.navStatus[pos.navStatus ?? "unknown"]}</td>
                    <td>{pos.destination ?? "—"}</td>
                    <td>{t.positionSource[pos.source]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {log.rows.length === 0 ? <p className="m-0 px-4 py-5 text-sm text-foreground-500">この期間の記録はありません</p> : null}
          </section>
          {log.track.length > 0 ? (
            <section aria-label="この期間の航跡" className="ui-dark px-5 py-[18px]">
              <SeaChart
                vessels={[
                  {
                    vesselId: log.vesselId,
                    vesselName: log.vesselName,
                    lat: log.track[log.track.length - 1]!.lat,
                    lon: log.track[log.track.length - 1]!.lon,
                    courseDeg: log.track[log.track.length - 1]!.courseDeg,
                    track: log.track.map((pos) => ({ lat: pos.lat, lon: pos.lon })),
                    stale: false,
                  },
                ]}
              />
            </section>
          ) : null}
          <ManualPositionForm vessels={vessels} />
        </>
      ) : null}

      {tab === "compare" ? (
        <section aria-label="計画と実績" className="flex flex-col gap-3">
          {comparisons.length === 0 ? <p className="ui-card m-0 p-4 text-sm text-foreground-500">この船の配船計画はありません</p> : null}
          {comparisons.map(({ schedule: sc, actual }) => (
            <div key={sc.id} className="ui-card flex flex-col gap-2 p-4">
              <p className="m-0 flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-sm text-foreground-500">{sc.voyageNo ?? "航海番号なし"}</span>
                <span className="text-lg font-bold">
                  {sc.departurePort} → {sc.arrivalPort}
                </span>
                <StatusChip
                  level="none"
                  size="sm"
                  label={
                    actual.state === "arrived"
                      ? "入港済み"
                      : actual.state === "underway"
                        ? "航海中"
                        : actual.state === "not_departed"
                          ? "出港前"
                          : "記録なし"
                  }
                />
              </p>
              <table className="ui-table">
                <thead>
                  <tr>
                    <th />
                    <th>計画</th>
                    <th>実績（航跡で確認）</th>
                    <th>差</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th className="text-left">出港</th>
                    <td className="font-mono tabular-nums">{fmtDateTime(sc.departureAt)}</td>
                    <td className="font-mono tabular-nums">{actual.actualDepartureAt ? fmtDateTime(actual.actualDepartureAt) : "—"}</td>
                    <td>
                      <StatusChip
                        level={delayLevel(actual.departureDelayMin)}
                        size="sm"
                        label={fmtDelay(actual.departureDelayMin)}
                        hint="航跡の観測で動き出した時刻との差。観測の間隔ぶんの誤差があります"
                      />
                    </td>
                  </tr>
                  <tr>
                    <th className="text-left">入港</th>
                    <td className="font-mono tabular-nums">{fmtDateTime(sc.arrivalAt)}</td>
                    <td className="font-mono tabular-nums">{actual.actualArrivalAt ? fmtDateTime(actual.actualArrivalAt) : "—"}</td>
                    <td>
                      <StatusChip
                        level={delayLevel(actual.arrivalDelayMin)}
                        size="sm"
                        label={fmtDelay(actual.arrivalDelayMin)}
                        hint="航跡の観測で止まった（係留・錨泊・荷役）時刻との差。観測の間隔ぶんの誤差があります"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ) : null}

      {tab === "position" ? (
        <>
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
      <section aria-label="簡易海図" className="ui-dark px-5 py-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-xl font-bold text-white">いまの位置</h2>
          <span className="flex items-center gap-3">
            <StatusChip
              level="caution"
              size="sm"
              label="参考情報"
              hint="位置は AIS の配信や GPS から受け取った参考情報です。途切れたり古いままのことがあるので、出入港の判断は船との連絡でも確かめてください（3.7.1）"
            />
            <AutoRefresh seconds={60} />
          </span>
        </div>
        {chartVessels.length === 0 ? (
          <p className="m-0 mt-3.5 text-base text-[#DFE1E0]">図に出せる位置がありません。</p>
        ) : (
          <div className="mt-3.5">
            <SeaChart vessels={chartVessels} />
          </div>
        )}
      </section>

        </>
      ) : null}

      {tab === "schedule" ? (
        <>
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
        </>
      ) : null}
    </div>
  );
}
