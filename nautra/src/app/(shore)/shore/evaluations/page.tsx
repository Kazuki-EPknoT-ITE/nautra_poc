import { canShore } from "@/domain/authz/shore-roles";
import { addDaysYmd } from "@/domain/crew/freshness";
import { t } from "@/i18n/ja";
import {
  evaluationHistoryByCrew,
  listEvaluations,
  personLabel,
} from "@/server/evaluation-service";
import { listCrewMasters, todayLocal } from "@/server/master-service";
import { SHORE_STAFF_ACCOUNTS, requireShore } from "@/server/shore-session";
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
export default async function ShoreEvaluationsPage() {
  const guard = await requireShore("view_evaluation");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="評価・人事考課" />;

  // 権限判定は shore-roles.ts の表が唯一の情報源。画面でロール名の分岐を書かない
  const canEdit = canShore(guard.staff.role, "edit_evaluation");
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
    ...SHORE_STAFF_ACCOUNTS.map((s) => ({ id: s.id, label: `${s.name}（${s.title}）` })),
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">評価・人事考課</h1>
        <p className="text-sm text-foreground-500">
          下船時・定期の評価を同じ項目で記録し、育成計画に使います
        </p>
      </div>

      <section aria-label="取り扱いの注意" className="glass-tile border border-warning p-4">
        <h2 className="font-bold">⚠ この画面は閲覧できる人を限定しています</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-foreground-600">
          <li>
            開けるのは <span className="font-semibold">{t.shoreRole.admin}</span>{" "}
            だけです。船長・労務管理責任者・事務担当の画面には出しません。
          </li>
          <li>
            評価は本人の処遇に関わる情報です。評価ごとに「本人に開示するか」を決めて記録し、
            開示すると決めたものだけを本人に見せます。
          </li>
          <li>記入・訂正はすべて記録に残ります（誰がいつ書いたかを後から確認できます）。</li>
          <li>訂正しても元の評価は消えません。新しい版で置き換わります。</li>
        </ul>
      </section>

      {canEdit ? (
        <EvaluationForm
          items={EVALUATION_ITEMS}
          crewOptions={crewOptions}
          evaluatorOptions={evaluatorOptions}
          correctable={correctable}
          defaultEvaluatedBy={guard.staff.id}
          defaultPeriodFrom={addDaysYmd(today, -180)}
          defaultPeriodTo={today}
        />
      ) : (
        <p className="glass-tile p-4 text-sm text-foreground-600">
          この役職では評価の記入はできません（参照のみ）。
        </p>
      )}

      <section aria-label="評価の一覧" className="glass-tile overflow-x-auto">
        <h2 className="px-4 pt-4 font-bold">評価の一覧（新しい順）</h2>
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-foreground-500">記録された評価はありません。</p>
        ) : (
          <table className="mt-3 w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] text-left text-foreground-500">
                <th className="px-4 py-2 font-medium">船員</th>
                <th className="px-2 py-2 font-medium">対象期間</th>
                <th className="px-2 py-2 font-medium">総合（5項目の平均）</th>
                <th className="px-2 py-2 font-medium">評価者</th>
                <th className="px-2 py-2 font-medium">本人開示</th>
                <th className="px-2 py-2 font-medium">所見</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.record.id} className="border-b border-[var(--glass-border)] last:border-b-0">
                  <td className="px-4 py-2 font-semibold">{r.crewName}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {r.record.periodFrom} 〜 {r.record.periodTo}
                  </td>
                  <td className="px-2 py-2">
                    <ScoreBar score={r.average ?? undefined} />
                    <span className="tabular-nums text-xs text-foreground-500">
                      {r.average === null ? "—" : r.average.toFixed(1)} / 5.0
                    </span>
                  </td>
                  <td className="px-2 py-2">{r.evaluatorName}</td>
                  <td className="px-2 py-2">
                    {r.record.disclosedToCrew ? (
                      <span className="font-semibold">✓ 本人に開示する</span>
                    ) : (
                      <span className="text-foreground-600">✕ 本人に開示しない</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-foreground-600">
                    {r.record.comment ? (
                      <span className="line-clamp-2 block max-w-md">{r.record.comment}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="px-4 py-3 text-xs text-foreground-500">
          総合は5項目の平均をその場で計算して表示しています（平均値は保存しません）。
        </p>
      </section>

      <section aria-label="船員ごとの推移" className="flex flex-col gap-4">
        <h2 className="font-bold">船員ごとの推移（育成計画のために履歴を並べます）</h2>
        {byCrew.length === 0 ? (
          <p className="text-sm text-foreground-500">推移を出せる評価はまだありません。</p>
        ) : (
          byCrew.map((crew) => (
            <div key={crew.crewMemberId} className="glass-tile overflow-x-auto p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-bold">{crew.crewName}</h3>
                <p className="text-xs text-foreground-500">
                  {crew.rows.length}回の評価（古い順に左から）
                </p>
              </div>
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--glass-border)] text-left text-foreground-500">
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
                    <tr key={item} className="border-b border-[var(--glass-border)] last:border-b-0">
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
                  <p key={`${r.record.id}-c`} className="mt-2 text-xs text-foreground-600">
                    <span className="tabular-nums font-semibold">{r.record.periodTo}</span> の所見（
                    {personLabel(r.record.evaluatedBy)}）: {r.record.comment}
                  </p>
                ) : null,
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
