import Link from "next/link";
import { t } from "@/i18n/ja";
import { personName } from "@/lib/crew";
import { fmtDateLabel, fmtDateTime } from "@/lib/format";
import { crewNameOf, listCrewMasters } from "@/server/master-service";
import { getShiftWeek, getStationPlans } from "@/server/shift-service";
import { requireShore } from "@/server/shore-session";
import { listVessels } from "@/server/master-service";
import { buildShiftCalendar } from "@/server/shift-calendar-service";
import { ExportAction } from "../_components/export-action";
import { ShoreGuardNotice } from "../_components/guard";
import { ShiftCalendar } from "./_components/shift-calendar";
import { NewStationForm, type CrewOption } from "./_components/new-station-form";
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
  searchParams: Promise<{ tab?: string; vessel?: string; start?: string; step?: string }>;
}) {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="シフト・配置表" />;

  const sp = await searchParams;
  const vessels = listVessels();
  const vesselId = vessels.find((v) => v.id === sp.vessel)?.id ?? vessels[0]?.id ?? "";
  /** いま開いている主題。未指定なら先頭 */
  const tab = TABS.some((x) => x.id === sp.tab) ? sp.tab! : TABS[0]!.id;
  // 配置表（カレンダー）。刻みは1時間が既定（SHIFT-07）。週は ?start= で送る
  const step = [1, 2, 4].includes(Number(sp.step)) ? Number(sp.step) : 1;
  const calendar = buildShiftCalendar(vesselId, sp.start);

  const week = getShiftWeek();
  const crewMasters = listCrewMasters();
  const crews: CrewOption[] = crewMasters.map((m) => ({ id: m.crewMemberId, name: m.name }));

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
        <ShiftCalendar
          cal={calendar}
          vessels={vessels}
          step={step}
          exportSlot={<ExportAction set="shift" label="シフトを書き出す" />}
        />
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
