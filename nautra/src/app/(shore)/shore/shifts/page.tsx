import Link from "next/link";
import { t } from "@/i18n/ja";
import { personName } from "@/lib/crew";
import { fmtDateLabel, fmtDateTime, fmtMinutes } from "@/lib/format";
import { crewNameOf, listCrewMasters } from "@/server/master-service";
import { buildWatchLoad, getShiftWeek, getStationPlans } from "@/server/shift-service";
import { requireShore } from "@/server/shore-session";
import { listVessels } from "@/server/master-service";
import { buildShiftBoard, WATCH_SLOTS } from "@/server/shift-board-service";
import { ExportAction } from "../_components/export-action";
import { ShoreGuardNotice } from "../_components/guard";
import { ShiftBoard } from "./_components/shift-board";
import { NewShiftForm, type CrewOption } from "./_components/new-shift-form";
import { NewStationForm } from "./_components/new-station-form";
import { ShiftChangeForm, type ShiftOption } from "./_components/shift-change-form";
import { StationChangeForm, type StationOption } from "./_components/station-change-form";

export const dynamic = "force-dynamic";

/**
 * S-10 シフト作成（当直・停泊・荷役シフトと通常配置表の**作成**・変更・配信）。
 *
 * 計画は陸上が正本で、作成も変更も追記型イベントとして配信する。
 * 3.2.3 の「不規則勤務の中でも**公平な配分**と法令遵守を両立させる」に応えるため、
 * 直近2週間の当直時間を船員別に並べて偏りを見えるようにし、
 * 作成前にその計画で基準を超えないかを判定できるようにしている。
 */
/**
 * この画面の主題（タブ）。**1画面1主題**にして、目的の節まで延々とめくらずに済むようにする
 * （デザイン正本 S-15 と同じやりかた。1枚が 3000px を超えないようにする）。
 * 当直を組む・配置表を決める・配信の結果を確かめるは、同じ画面でも別の作業になる。
 */
const TABS = [
  { id: "watch", label: "当直を組む" },
  { id: "stations", label: "配置表" },
  { id: "history", label: "配信の履歴・競合" },
];

export default async function ShoreShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; vessel?: string }>;
}) {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="シフト・配置表" />;

  const sp = await searchParams;
  const vessels = listVessels();
  const vesselId = vessels.find((v) => v.id === sp.vessel)?.id ?? vessels[0]?.id ?? "";
  /** いま開いている主題。未指定なら先頭 */
  const tab = TABS.some((x) => x.id === sp.tab) ? sp.tab! : TABS[0]!.id;
  const board = buildShiftBoard(vesselId);

  const week = getShiftWeek();
  const load = buildWatchLoad();
  const crewMasters = listCrewMasters();
  const crews: CrewOption[] = crewMasters.map((m) => ({ id: m.crewMemberId, name: m.name }));
  const today = new Date().toISOString().slice(0, 10);
  /** 週間表に出す船員（乗組員＋計画のある船員） */
  const boardCrews = crews.length > 0 ? crews : [];

  const options: ShiftOption[] = [];
  for (const crew of boardCrews) {
    for (const d of week.days) {
      for (const p of week.cells[`${crew.id}|${d}`] ?? []) {
        options.push({
          id: p.id,
          label: `${fmtDateLabel(d)} ${crew.name} ${p.shiftType ? t.shiftType[p.shiftType] : ""} ${p.from}–${p.to}`,
          shiftType: p.shiftType ?? "navigation_watch",
          from: p.from ?? "",
          to: p.to ?? "",
        });
      }
    }
  }

  const stationOptions: StationOption[] = [];
  for (const [scenario, rows] of Object.entries(getStationPlans())) {
    for (const p of rows) {
      stationOptions.push({
        id: p.id,
        label: `${t.stationScenario[scenario]} / ${crewNameOf(p.crewMemberId)} — ${p.station}`,
        station: p.station ?? "",
        duty: p.duty ?? "",
      });
    }
  }

  const maxLoad = Math.max(1, ...load.rows.map((r) => r.minutes));

  return (
    <div className="flex flex-col gap-[18px]">
      {/* 主題の切替（サーバ側で組み立てるためリンクで切り替える） */}
      <nav aria-label="シフト作成の主題" className="ui-card flex flex-wrap gap-2 p-3">
        {TABS.map((x) => (
          <Link
            key={x.id}
            href={`/shore/shifts?tab=${x.id}`}
            aria-current={x.id === tab ? "page" : undefined}
            className={`ui-btn-quiet ${x.id === tab ? "ui-btn-selected" : ""}`}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      {tab === "watch" ? (
        <>
      <ShiftBoard
        vesselName={board.vesselName}
        vessels={vessels}
        activeVesselId={vesselId}
        days={board.days}
        today={board.today}
        slots={WATCH_SLOTS.map((sl) => ({ key: sl.key, label: sl.label }))}
        crews={board.crews}
        cells={board.cells}
        filled={board.filled}
        total={board.total}
        warnings={board.warnings}
        appliedRuleVersion={board.appliedRuleVersion}
        exportSlot={<ExportAction set="shift" label="シフトを書き出す" className="h-[38px]" />}
      />

      <section aria-label="週間当直表" className="ui-card overflow-x-auto">
        <h2 className="px-4 pt-4 font-bold">今週の当直（変則の時間帯を含む一覧）</h2>
        <table className="mt-2 w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
              <th className="px-4 py-3 font-medium">船員</th>
              {week.days.map((d) => (
                <th
                  key={d}
                  className={`px-2 py-3 text-center font-medium tabular-nums ${d === week.today ? "text-primary" : ""}`}
                >
                  {fmtDateLabel(d)}
                  {d === week.today ? "（本日）" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {boardCrews.map((crew) => (
              <tr key={crew.id} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                <td className="px-4 py-3">
                  <p className="font-semibold">{crew.name}</p>
                  <p className="text-xs text-foreground-500">
                    {crewMasters.find((m) => m.crewMemberId === crew.id)?.position ?? ""}
                  </p>
                </td>
                {week.days.map((d) => (
                  <td key={d} className="px-2 py-3 align-top">
                    <div className="flex flex-col gap-1">
                      {(week.cells[`${crew.id}|${d}`] ?? []).map((p) => (
                        <span
                          key={p.id}
                          className={`rounded-small bg-default-100 px-1.5 py-0.5 text-xs tabular-nums ${p.supersedesId ? "ring-1 ring-danger" : ""}`}
                        >
                          {p.shiftType ? t.shiftType[p.shiftType] : ""} {p.from}–{p.to}
                          {p.supersedesId ? " ✎" : ""}
                        </span>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 3.2.3 公平な配分の可視化 */}
      <section aria-label="当直の配分" className="ui-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">当直の配分（直近2週間）</h2>
          <p className="text-xs text-foreground-500">
            {load.from} 〜 {load.to} / 平均 {fmtMinutes(load.averageMinutes)}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {load.rows.map((r) => (
            <div key={r.crewMemberId} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-sm">{r.crewName}</span>
              <div className="h-4 flex-1 overflow-hidden rounded-small bg-default-100">
                <span
                  className="block h-full bg-foreground/70"
                  style={{ width: `${Math.round((r.minutes / maxLoad) * 100)}%` }}
                  aria-hidden="true"
                />
              </div>
              <span className="w-24 shrink-0 text-right text-sm tabular-nums">
                {fmtMinutes(r.minutes)}
              </span>
              <span className="w-28 shrink-0 text-right text-xs tabular-nums text-foreground-600">
                {r.count}本 /{" "}
                {r.diffFromAverage === 0
                  ? "平均どおり"
                  : r.diffFromAverage > 0
                    ? `平均より ${fmtMinutes(r.diffFromAverage)} 多い`
                    : `平均より ${fmtMinutes(-r.diffFromAverage)} 少ない`}
              </span>
            </div>
          ))}
          {load.rows.length === 0 ? (
            <p className="text-sm text-foreground-500">当直の計画はまだありません。</p>
          ) : null}
        </div>
      </section>

      <NewShiftForm crews={crews} today={today} />

      <ShiftChangeForm options={options} />

        </>
      ) : null}

      {tab === "stations" ? (
        <>
      <NewStationForm crews={crews} />

      <StationChangeForm options={stationOptions} />
        </>
      ) : null}

      {tab === "history" ? (
        <>

      {week.conflicts.length > 0 ? (
        <section aria-label="競合（要確認）" className="ui-card border border-danger p-4">
          <h2 className="mb-2 font-bold text-danger">競合（要確認） {week.conflicts.length}件</h2>
          <p className="mb-2 text-sm text-foreground-500">
            同一のシフトに対して複数の変更が配信されています。自動では解決せず双方を保持しています（基本設計書 8.3）。
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {week.conflicts.map((c) => (
              <li key={c.supersedesId}>
                原本 {c.supersedesId}:{" "}
                {c.candidates.map((p) => `${p.from}–${p.to}（${fmtDateTime(p.publishedAt)}）`).join(" / ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="配信済みの変更" className="ui-card p-4">
        <h2 className="mb-2 font-bold">配信済みの変更（新しい順）</h2>
        {week.changes.length === 0 ? (
          <p className="text-sm text-foreground-500">変更はありません。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {week.changes.slice(0, 20).map((c) => (
              <li key={c.id} className="flex flex-wrap gap-2">
                <span className="tabular-nums text-foreground-500">{fmtDateTime(c.publishedAt)}</span>
                <span className="font-semibold">{personName(c.crewMemberId)}</span>
                <span>{c.date ? fmtDateLabel(c.date) : ""}</span>
                <span className="tabular-nums">
                  {c.shiftType ? t.shiftType[c.shiftType] : ""} {c.from}–{c.to}
                </span>
                {c.changeNote ? <span className="text-foreground-500">— {c.changeNote}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
        </>
      ) : null}
    </div>
  );
}
