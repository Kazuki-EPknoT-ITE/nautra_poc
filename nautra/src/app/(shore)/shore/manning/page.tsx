import Link from "next/link";
import { t } from "@/i18n/ja";
import { fmtDateLabel } from "@/lib/format";
import {
  buildManningCandidates,
  buildManningGantt,
  recentEmbarkations,
} from "@/server/manning-plan-service";
import { buildAshoreCrew, buildManningBoard, buildVesselManning } from "@/server/manning-service";
import { listVessels, todayLocal } from "@/server/master-service";
import { requireShore } from "@/server/shore-session";
import { StatusChip } from "@/ui";
import { ShoreGuardNotice } from "../_components/guard";
import { EmbarkForm } from "./_components/embark-form";

export const dynamic = "force-dynamic";

/**
 * S-05 配乗計画ボード（要件定義書 3.1.2 / 4.1 / 6.6①）。
 *
 * 船×期間で配乗の見通しを示し、**配乗ブロック該当者を警告付きで表示**する
 * （黙って候補から消さず、事由と解き方を添える）。乗下船の登録を起点に、
 * 手続き一式（届出・保険・記帳・チェック）が自動で起票される。
 */
export default async function ShoreManningPage() {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="配乗計画ボード" />;

  const now = new Date();
  const today = todayLocal(now);
  const vessels = buildVesselManning(now);
  const ashore = buildAshoreCrew(now);
  const gantt = buildManningGantt(now, 60);
  const candidates = buildManningCandidates(buildManningBoard(now));
  const recent = recentEmbarkations();
  const maxCount = Math.max(1, ...gantt.rows.flatMap((r) => r.counts));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">配乗計画</h1>
        <p className="text-sm text-foreground-500">
          船ごとの乗組みと、これから60日の見通し（基準日 {today}）
        </p>
      </div>

      {/* ── 船ごとの乗組み（法定定員に対する過不足） ── */}
      <section aria-label="船ごとの乗組み" className="grid gap-3 lg:grid-cols-2">
        {vessels.map((v) => {
          const gap = v.requiredCrew === null ? null : v.onBoard.length - v.requiredCrew;
          return (
            <div key={v.vesselId} className="ui-card flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-bold">{v.vesselName}</h2>
                <p className="text-sm text-foreground-600">
                  法定定員{" "}
                  <span className="tabular-nums font-semibold">
                    {v.requiredCrew === null ? "未登録" : `${v.requiredCrew}名`}
                  </span>
                  <span className="mx-2">/</span>
                  いま{" "}
                  <span className="tabular-nums font-semibold">{v.onBoard.length}名</span>
                </p>
              </div>

              {gap === null ? (
                <p className="text-sm text-foreground-500">
                  法定定員が船舶マスタに登録されていないため、過不足を出せません。
                </p>
              ) : gap < 0 ? (
                <p className="text-sm font-semibold text-danger">
                  ✕ {Math.abs(gap)}名 足りません。乗船の予定を入れてください。
                </p>
              ) : gap === 0 ? (
                <p className="text-sm font-semibold text-success">✓ 定員ちょうどです。</p>
              ) : (
                <p className="text-sm text-foreground-600">✓ 定員より {gap}名 多く乗っています。</p>
              )}

              {v.onBoard.length === 0 ? (
                <p className="text-sm text-foreground-500">いま乗っている船員はいません。</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {v.onBoard.map((row) => (
                    <li key={row.crewMemberId} className="flex flex-wrap items-center gap-2">
                      {/*
                        既に乗っている船員には「配乗できません」と出さない。
                        3.1.2 のブロック条件は**これから配乗する候補**に対する判定であり、
                        乗船中の人に同じ文言を出すと「今すぐ降ろせ」と読めてしまう。
                        乗船中は「何を直す必要があるか」を示す表現にする。
                      */}
                      <StatusChip
                        size="sm"
                        level={row.eligibility.level}
                        label={
                          row.eligibility.status === "eligible"
                            ? "問題ありません"
                            : row.eligibility.status === "blocked"
                              ? "要対応"
                              : "確認が要ります"
                        }
                      />
                      <Link
                        href={`/shore/crew/${row.crewMemberId}`}
                        className="font-semibold text-primary underline-offset-2 hover:underline"
                      >
                        {row.name}
                      </Link>
                      <span className="text-foreground-600">{row.position}</span>
                      <span className="tabular-nums text-foreground-500">
                        {row.boardedOn ? `${row.boardedOn} から乗船中` : "乗船日 不明"}
                      </span>
                      {row.eligibility.issues.length > 0 ? (
                        <span className="text-foreground-600">
                          （{row.eligibility.issues.map((i) => i.label).join("・")}）
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              <div>
                <h3 className="mt-1 text-sm font-semibold">これからの予定</h3>
                {v.planned.length === 0 ? (
                  <p className="text-sm text-foreground-500">この船の乗下船の予定はありません。</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {v.planned
                      .slice()
                      .sort((a, b) => a.event.date.localeCompare(b.event.date))
                      .map(({ row, event }) => (
                        <li key={event.id} className="flex flex-wrap items-center gap-2">
                          <span className="tabular-nums text-foreground-500">{event.date}</span>
                          <span className="font-semibold">{t.embarkationEvent[event.eventType]}</span>
                          <span>{row.name}</span>
                          {event.duty ? <span className="text-foreground-600">{event.duty}</span> : null}
                          {event.blockNoteAtPlanning ? (
                            <span className="text-warning-700">⚠ {event.blockNoteAtPlanning}</span>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* ── 60日の見通し（簡易ガント） ── */}
      <section aria-label="これから60日の見通し" className="ui-card p-4">
        <h2 className="mb-1 font-bold">これから60日の見通し</h2>
        <p className="mb-3 text-sm text-foreground-600">
          横棒の高さがその日に乗っている人数です。定員に足りない日は棒の下に ✕ を付けています。
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-[900px] text-sm">
            <caption className="sr-only">船ごとの日別 乗船人数（今日から60日）</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-content1 px-2 py-1 text-left font-medium text-foreground-500">
                  船
                </th>
                {gantt.dates.map((d, i) => (
                  <th
                    key={d}
                    scope="col"
                    className="w-[14px] px-0 py-1 text-[10px] font-normal text-foreground-500"
                  >
                    {i % 7 === 0 ? <span className="tabular-nums">{d.slice(5)}</span> : <span className="sr-only">{d}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gantt.rows.map((row) => (
                <tr key={row.vesselId} className="border-t border-[var(--ui-hairline)]">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 whitespace-nowrap bg-content1 px-2 py-1 text-left font-semibold"
                  >
                    {row.vesselName}
                    <span className="ml-1 font-normal text-foreground-500">
                      （定員 {row.requiredCrew === null ? "未登録" : `${row.requiredCrew}名`}）
                    </span>
                  </th>
                  {row.counts.map((count, i) => (
                    <td key={gantt.dates[i]} className="px-0 py-1 align-bottom">
                      <div
                        className="flex h-8 w-[12px] flex-col justify-end"
                        title={`${gantt.dates[i]} ${row.vesselName} ${count}名${row.shortages[i] ? "（定員に足りません）" : ""}`}
                      >
                        <div
                          aria-hidden="true"
                          className="w-full rounded-sm bg-foreground/70"
                          style={{ height: `${(count / maxCount) * 100}%` }}
                        />
                      </div>
                      <div className="h-3 text-center text-[9px] leading-3 text-danger">
                        {row.shortages[i] ? "✕" : ""}
                      </div>
                      <span className="sr-only">
                        {gantt.dates[i]}: {count}名{row.shortages[i] ? "（定員に足りません）" : ""}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {gantt.rows.map((row) => {
            const short = row.shortages.filter(Boolean).length;
            return (
              <li key={row.vesselId}>
                <span className="font-semibold">{row.vesselName}</span>:{" "}
                {row.requiredCrew === null ? (
                  <span className="text-foreground-500">定員が未登録のため過不足を判定できません。</span>
                ) : short === 0 ? (
                  <span className="text-success">✓ 60日のあいだ定員を満たしています。</span>
                ) : (
                  <span className="text-danger">✕ 定員に足りない日が {short}日 あります。</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── 配乗待ちの船員（ブロック該当者も理由つきで出す） ── */}
      <section aria-label="配乗待ちの船員" className="ui-card p-4">
        <h2 className="mb-1 font-bold">
          配乗待ちの船員 <span className="tabular-nums text-foreground-500">{ashore.length}名</span>
        </h2>
        <p className="mb-3 text-sm text-foreground-600">
          配乗できない事由がある人も、理由を添えてここに出します（候補から黙って外しません）。
        </p>
        {ashore.length === 0 ? (
          <p className="text-sm text-foreground-500">配乗待ちの船員はいません。</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {ashore.map((row) => (
              <li
                key={row.crewMemberId}
                className="border-b border-[var(--ui-hairline)] pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip
                    size="sm"
                    level={row.eligibility.level}
                    label={t.manningStatus[row.eligibility.status]}
                  />
                  <Link
                    href={`/shore/crew/${row.crewMemberId}`}
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    {row.name}
                  </Link>
                  <span className="text-foreground-600">{row.position}</span>
                  {row.plannedEvents.length > 0 ? (
                    <span className="tabular-nums text-foreground-500">
                      予定: {row.plannedEvents[0].date}{" "}
                      {t.embarkationEvent[row.plannedEvents[0].eventType]}
                    </span>
                  ) : null}
                </div>
                {row.eligibility.issues.length === 0 ? (
                  <p className="mt-1 text-sm text-success">✓ そのまま配乗できます。</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1 text-sm">
                    {row.eligibility.issues.map((i) => (
                      <li key={i.key}>
                        <span
                          className={
                            i.severity === "block"
                              ? "font-bold text-danger"
                              : "font-bold text-warning-700"
                          }
                        >
                          {i.severity === "block" ? "✕" : "⚠"} {i.label}
                        </span>
                        <span className="ml-2 text-foreground-600">{i.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <EmbarkForm candidates={candidates} vessels={listVessels()} today={today} />

      <section aria-label="最近の乗下船" className="ui-card p-4">
        <h2 className="mb-2 font-bold">最近の乗下船（予定・実績）</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-foreground-500">乗下船の記録はありません。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {recent.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-2">
                <span className="tabular-nums text-foreground-500">{fmtDateLabel(e.date)}</span>
                <span className="font-semibold">{t.embarkationEvent[e.eventType]}</span>
                <span>{e.crewName}</span>
                <span className="text-foreground-600">{e.vesselName}</span>
                {e.duty ? <span className="text-foreground-600">{e.duty}</span> : null}
                <span className="text-foreground-500">{t.embarkationStatus[e.status]}</span>
                {e.contractType ? (
                  <span className="text-foreground-500">{t.embarkationContract[e.contractType]}</span>
                ) : null}
                {e.blockNoteAtPlanning ? (
                  <span className="text-warning-700">⚠ {e.blockNoteAtPlanning}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-foreground-500">
        配乗可否・過不足・見通しはいずれも一次記録から都度算出した導出値で、どこにも保存していません。
        判定は船員カルテ・届出の添付要件チェックと同じ関数を使っています。
      </p>
    </div>
  );
}
