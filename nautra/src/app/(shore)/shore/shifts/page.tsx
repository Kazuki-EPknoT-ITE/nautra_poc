import { t } from "@/i18n/ja";
import { CREW_MEMBERS, personName } from "@/lib/crew";
import { fmtDateLabel, fmtDateTime } from "@/lib/format";
import { getShiftWeek } from "@/server/shift-service";
import { ShiftChangeForm, type ShiftOption } from "./_components/shift-change-form";

export const dynamic = "force-dynamic";

/**
 * S-10 シフト作成（PoC 簡易版）。当直シフトの一覧と変更配信。
 * 変更は既存計画を無効化する新規レコードとして配信され、船内 V-08 に変更通知として届く。
 */
export default function ShoreShiftsPage() {
  const week = getShiftWeek();
  const options: ShiftOption[] = [];
  for (const crew of CREW_MEMBERS) {
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">シフト作成・配信（S-10 簡易版）</h1>
        <p className="text-sm text-foreground-500">計画は陸上が正本。変更は船内へ同期され変更通知になります。</p>
      </div>

      <section aria-label="週間当直表" className="overflow-x-auto rounded-large border border-default-200 bg-content1">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-default-200 text-left text-foreground-500">
              <th className="px-4 py-3 font-medium">船員</th>
              {week.days.map((d) => (
                <th key={d} className={`px-2 py-3 text-center font-medium tabular-nums ${d === week.today ? "text-primary" : ""}`}>
                  {fmtDateLabel(d)}
                  {d === week.today ? "（本日）" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CREW_MEMBERS.map((crew) => (
              <tr key={crew.id} className="border-b border-default-100 last:border-b-0">
                <td className="px-4 py-3">
                  <p className="font-semibold">{crew.name}</p>
                  <p className="text-xs text-foreground-500">{crew.position}</p>
                </td>
                {week.days.map((d) => (
                  <td key={d} className="px-2 py-3 align-top">
                    <div className="flex flex-col gap-1">
                      {(week.cells[`${crew.id}|${d}`] ?? []).map((p) => (
                        <span key={p.id} className={`rounded-small bg-default-100 px-1.5 py-0.5 text-xs tabular-nums ${p.supersedesId ? "ring-1 ring-danger" : ""}`}>
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

      <ShiftChangeForm options={options} />

      {week.conflicts.length > 0 ? (
        <section aria-label="競合（要確認）" className="rounded-large border border-danger bg-content1 p-4">
          <h2 className="mb-2 font-bold text-danger">競合（要確認） {week.conflicts.length}件</h2>
          <p className="mb-2 text-sm text-foreground-500">
            同一のシフトに対して複数の変更が配信されています。自動では解決せず双方を保持しています（基本設計書 8.3）。
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {week.conflicts.map((c) => (
              <li key={c.supersedesId}>
                原本 {c.supersedesId}: {c.candidates.map((p) => `${p.from}–${p.to}（${fmtDateTime(p.publishedAt)}）`).join(" / ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="配信済みの変更" className="rounded-large border border-default-200 bg-content1 p-4">
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
    </div>
  );
}
