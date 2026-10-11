import Link from "next/link";
import { canShore } from "@/domain/authz/shore-roles";
import { addDaysYmd } from "@/domain/crew/freshness";
import { t } from "@/i18n/ja";
import {
  evaluationHistoryByCrew,
  listEvaluations,
  personLabel,
} from "@/server/evaluation-service";
import { listCrewMasters, todayLocal } from "@/server/master-service";
import { listActiveShoreStaff, requireShore } from "@/server/shore-session";
import { EVALUATION_ITEMS } from "@/sync-protocol/masters";
import { ShoreGuardNotice } from "../_components/guard";
import {
  EvaluationForm,
  type CorrectableEvaluation,
  type PersonOption,
} from "./_components/evaluation-form";

export const dynamic = "force-dynamic";

/** 1〜5 の点数を細い棒で表す（白黒基調。色で意味を作らず、数値を必ず併記する） */
function ScoreBar({ score }: { score: number | undefined }) {
  const value = typeof score === "number" ? score : 0;
  return (
    <span className="flex items-center gap-2">
      <span className="inline-block h-2 w-16 rounded-full bg-default-100" aria-hidden="true">
        <span
          className="block h-2 rounded-full bg-foreground/70"
          style={{ width: `${Math.max(0, Math.min(value, 5)) * 20}%` }}
        />
      </span>
      <span className="tabular-nums text-xs">{value > 0 ? value : "—"}</span>
    </span>
  );
}

/**
 * S-13 評価・人事考課（要件定義書 3.1.5）。
 *
 * 運用上の留意「評価情報はハラスメントの温床とならないよう本人開示ルールを定め、
 * 評価者・閲覧者を限定する」を、次の3点で実装に反映している。
 * 1. 閲覧・記入の権限を管理者だけに限定する（`shore-roles.ts`。URL 直打ちでも中身は出さない）
 * 2. 評価ごとに**本人開示の可否**を保持し、一覧・詳細の両方で明示する
 * 3. 画面の冒頭で「閲覧が限定されていること」を書き、記入・訂正は監査ログに残す
 */
export default async function ShoreEvaluationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; crew?: string; edit?: string }>;
}) {
  const guard = await requireShore("view_evaluation");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="評価・人事考課" />;

  // 権限判定は shore-roles.ts の表が唯一の情報源。画面でロール名の分岐を書かない
  const canEdit = canShore(guard.staff.role, "edit_evaluation");
  const sp = await searchParams;
  // 閲覧（一覧・推移）と入力（記入・直す）をタブで分ける（レビュー EVAL-04）。入力のタブは権限がある人にだけ出す（0-8）
  const TABS = [
    { id: "list", label: "評価の一覧" },
    { id: "trend", label: "船員ごとの推移" },
    ...(canEdit
      ? [
          { id: "new", label: "＋ 評価を記入する" },
          { id: "edit", label: "評価を直す" },
        ]
      : []),
  ];
  const tab = TABS.some((x) => x.id === sp.tab) ? sp.tab! : "list";
  const rows = listEvaluations();
  const byCrew = evaluationHistoryByCrew();
  const today = todayLocal();

  const crewOptions: PersonOption[] = listCrewMasters().map((c) => ({
    id: c.crewMemberId,
    label: `${c.name}（${c.position ?? "職名未登録"}）`,
  }));
  const evaluatorOptions: PersonOption[] = [
    ...listCrewMasters().map((c) => ({
      id: c.crewMemberId,
      label: `${c.name}（${c.position ?? "職名未登録"}）`,
    })),
    ...listActiveShoreStaff().map((s) => ({ id: s.id, label: `${s.name}（${s.title}）` })),
  ];
  const correctable: CorrectableEvaluation[] = rows.map((r) => ({
    id: r.record.id,
    label: `${r.crewName} / ${r.record.periodFrom}〜${r.record.periodTo}（評価者 ${r.evaluatorName}）`,
    crewMemberId: r.record.crewMemberId,
    periodFrom: r.record.periodFrom,
    periodTo: r.record.periodTo,
    scores: r.record.scores,
    comment: r.record.comment ?? "",
    evaluatedBy: r.record.evaluatedBy,
    disclosedToCrew: r.record.disclosedToCrew,
  }));

  const editing = tab === "edit" ? correctable.find((c) => c.id === sp.edit) : undefined;
  const trendCrew = byCrew.find((c) => c.crewMemberId === sp.crew) ?? byCrew[0];

  return (
    <div className="flex flex-col gap-[18px]">
      <nav aria-label="評価の主題" className="ui-card flex flex-wrap gap-2 p-3">
        {TABS.map((x) => (
          <Link
            key={x.id}
            href={`/shore/evaluations?tab=${x.id}`}
            aria-current={x.id === tab ? "page" : undefined}
            className={`ui-btn-quiet ${x.id === tab ? "ui-btn-selected" : ""}`}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      {tab === "list" || (tab === "edit" && !editing) ? (
        <section aria-label="評価の一覧" className="ui-card overflow-x-auto p-0">
          {rows.length === 0 ? (
            <p className="m-0 px-4 py-5 text-sm text-foreground-500">記録された評価はありません</p>
          ) : (
            <table className="ui-table min-w-[900px]">
              <thead>
                <tr>
                  <th>船員</th>
                  <th>対象期間</th>
                  <th>総合</th>
                  <th>評価者</th>
                  <th>本人開示</th>
                  <th>所見</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.record.id}>
                    <td className="font-semibold">{r.crewName}</td>
                    <td className="whitespace-nowrap tabular-nums">
                      {r.record.periodFrom} 〜 {r.record.periodTo}
                    </td>
                    <td>
                      <ScoreBar score={r.average ?? undefined} />
                      <span className="tabular-nums text-xs text-foreground-500">
                        {r.average === null ? "—" : r.average.toFixed(1)} / 5.0
                      </span>
                    </td>
                    <td>{r.evaluatorName}</td>
                    <td>
                      {r.record.disclosedToCrew ? (
                        <span className="font-semibold">✓ 開示</span>
                      ) : (
                        <span className="text-foreground-600">✕ 非開示</span>
                      )}
                    </td>
                    <td className="text-foreground-600">
                      {r.record.comment ? <span className="line-clamp-2 block max-w-md">{r.record.comment}</span> : "—"}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <Link href={`/shore/evaluations?tab=trend&crew=${r.record.crewMemberId}`} className="ui-btn-quiet">
                        推移
                      </Link>
                      {canEdit ? (
                        <Link href={`/shore/evaluations?tab=edit&edit=${r.record.id}`} className="ui-btn-quiet ml-1">
                          直す
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {tab === "trend" ? (
        <section aria-label="船員ごとの推移" className="flex flex-col gap-3">
          {byCrew.length === 0 ? (
            <p className="ui-card m-0 px-4 py-5 text-sm text-foreground-500">推移を出せる評価はまだありません</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="船員">
                {byCrew.map((c) => (
                  <Link
                    key={c.crewMemberId}
                    href={`/shore/evaluations?tab=trend&crew=${c.crewMemberId}`}
                    aria-current={c.crewMemberId === trendCrew?.crewMemberId ? "true" : undefined}
                    className={`ui-btn-quiet ${c.crewMemberId === trendCrew?.crewMemberId ? "ui-btn-selected" : ""}`}
                  >
                    {c.crewName}
                  </Link>
                ))}
              </div>
              {trendCrew
                ? [trendCrew].map((crew) => (
            <div key={crew.crewMemberId} className="ui-card overflow-x-auto p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-bold">{crew.crewName}</h3>
                <p className="m-0 text-xs text-foreground-500">{crew.rows.length}回</p>
              </div>
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
                    <th className="py-2 pr-3 font-medium">項目</th>
                    {crew.rows.map((r) => (
                      <th key={r.record.id} className="py-2 pr-3 font-medium tabular-nums">
                        {r.record.periodTo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {EVALUATION_ITEMS.map((item) => (
                    <tr key={item} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                      <td className="py-2 pr-3">{t.evaluationItem[item]}</td>
                      {crew.rows.map((r) => (
                        <td key={`${r.record.id}-${item}`} className="py-2 pr-3">
                          <ScoreBar score={r.record.scores[item]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 pr-3 font-semibold">総合（平均）</td>
                    {crew.rows.map((r) => (
                      <td key={`${r.record.id}-avg`} className="py-2 pr-3 tabular-nums font-semibold">
                        {r.average === null ? "—" : r.average.toFixed(1)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              {crew.rows.map((r) =>
                r.record.comment ? (
                  <p key={`${r.record.id}-c`} data-user-text className="mt-2 text-xs text-foreground-600">
                    <span className="tabular-nums font-semibold">{r.record.periodTo}</span> の所見（
                    {personLabel(r.record.evaluatedBy)}）: {r.record.comment}
                  </p>
                ) : null,
              )}
            </div>
                  ))
                : null}
            </>
          )}
        </section>
      ) : null}

      {tab === "new" && canEdit ? (
        <EvaluationForm
          items={EVALUATION_ITEMS}
          crewOptions={crewOptions}
          evaluatorOptions={evaluatorOptions}
          defaultEvaluatedBy={guard.staff.id}
          defaultPeriodFrom={addDaysYmd(today, -180)}
          defaultPeriodTo={today}
        />
      ) : null}

      {tab === "edit" && canEdit && editing ? (
        <>
          <p className="m-0 flex flex-wrap items-center gap-2 text-base">
            <span className="font-bold">直す評価:</span> {editing.label}
            <Link href="/shore/evaluations?tab=edit" className="ui-btn-quiet">
              別の評価を選ぶ
            </Link>
          </p>
          <EvaluationForm
            key={editing.id}
            items={EVALUATION_ITEMS}
            crewOptions={crewOptions}
            evaluatorOptions={evaluatorOptions}
            initial={editing}
            defaultEvaluatedBy={guard.staff.id}
            defaultPeriodFrom={addDaysYmd(today, -180)}
            defaultPeriodTo={today}
          />
        </>
      ) : null}
    </div>
  );
}
