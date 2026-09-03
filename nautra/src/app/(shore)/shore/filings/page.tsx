import Link from "next/link";
import type { CrewRequirementResult, RequirementState } from "@/domain/filing/requirements";
import { t } from "@/i18n/ja";
import {
  filingFormOptions,
  listFilingCandidates,
  listFilings,
  type FilingRow,
} from "@/server/filing-service";
import { todayLocal } from "@/server/master-service";
import { requireShore } from "@/server/shore-session";
import { StatusChip } from "@/ui";
import { ShoreGuardNotice } from "../_components/guard";
import { FilingSteps } from "./_components/filing-steps";
import { FilingWizard } from "./_components/filing-wizard";

export const dynamic = "force-dynamic";

/**
 * S-07 届出ウィザード（要件定義書 3.8.3①〜⑦ / 3.8.5 / 4.3 / 6.3 / 9章）。
 *
 * 12.4 に従い、**不適合（ng）と要再確認（recheck）を必ず描き分ける**。
 * ng は赤＋「✕ 不適合」、recheck は黄＋「⚠ 要再確認」で、色だけに意味を持たせない。
 */

/** 添付要件の状態を色・記号・文言の3つで描く（色だけに依存しない。6.3 / 12.4） */
const REQUIREMENT_STYLE: Record<RequirementState, { cls: string; icon: string }> = {
  ok: { cls: "text-success", icon: "✓" },
  recheck: { cls: "text-warning-700", icon: "⚠" },
  ng: { cls: "text-danger", icon: "✕" },
};

function RequirementTable({ result }: { result: CrewRequirementResult }) {
  return (
    <div className="glass-inset p-3">
      {/* Chip は div を描くため p に入れない（不正なネストはハイドレーションを壊す） */}
      <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
        <StatusChip
          size="sm"
          level={result.level}
          label={
            result.submittable
              ? result.hasRecheck
                ? "要再確認あり"
                : "そのまま届け出られます"
              : "不適合あり"
          }
        />
        <span className="font-semibold">{result.crewName}</span>
        <Link
          href={`/shore/crew/${result.crewMemberId}`}
          className="text-primary underline-offset-2 hover:underline"
        >
          船員カルテを開く
        </Link>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {result.items.map((item) => {
          const style = REQUIREMENT_STYLE[item.state];
          return (
            <li key={item.key} className="flex flex-wrap gap-2">
              <span className={`font-bold ${style.cls}`}>
                {style.icon} {t.requirementState[item.state]}
              </span>
              <span className="font-semibold">{item.label}</span>
              <span className="text-foreground-600">{item.detail}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FilingCard({ row, today }: { row: FilingRow; today: string }) {
  const { filing, targets, check, documents } = row;
  const isDone = filing.status === "submitted" || filing.status === "accepted";

  return (
    <div className="glass-tile flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">
          {t.filingType[filing.filingType]}
          <span className="ml-2 text-sm font-normal text-foreground-600">
            {t.filingMethod[filing.method]}
          </span>
        </h3>
        <p className="text-sm">
          <span className="font-semibold">{t.filingStatus[filing.status]}</span>
          <span className="ml-2 tabular-nums text-foreground-500">対象 {targets.length}名</span>
          {filing.submittedOn ? (
            <span className="ml-2 tabular-nums text-foreground-500">
              {filing.submittedOn} 提出 / {filing.office}
            </span>
          ) : null}
        </p>
      </div>

      <ul className="flex flex-col gap-1 text-sm">
        {targets.map((tg) => (
          <li key={`${tg.crewMemberId}-${tg.effectiveOn}`} className="flex flex-wrap gap-2">
            <span className="font-semibold">{tg.crewName}</span>
            <span className="text-foreground-600">{tg.vesselName}</span>
            {tg.duty ? <span className="text-foreground-600">{tg.duty}</span> : null}
            <span className="tabular-nums text-foreground-500">効力発生 {tg.effectiveOn}</span>
          </li>
        ))}
      </ul>

      {/* 手順③ 添付要件チェッカー（3.8.3⑥）*/}
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-bold">
          添付要件の確認
          <span className="ml-2 font-normal text-foreground-600">
            不適合 <span className="tabular-nums">{check.ngCount}</span>件 / 要再確認{" "}
            <span className="tabular-nums">{check.recheckCount}</span>件
          </span>
        </h4>
        {check.ngCount > 0 ? (
          <p className="text-sm font-semibold text-danger">
            ✕ このままでは届出が受理保留になる可能性があります。船員カルテで不足している証書・保険を
            登録してから提出してください。
          </p>
        ) : check.recheckCount > 0 ? (
          <p className="text-sm font-semibold text-warning-700">
            ⚠ 要再確認が残っています。期限切れ（不適合）ではありませんが、原本を確認して確認日を
            更新しておくと安心です。
          </p>
        ) : (
          <p className="text-sm font-semibold text-success">
            ✓ 添付要件はすべて満たしています。そのまま届け出られます。
          </p>
        )}
        {check.results.map((r) => (
          <RequirementTable key={r.crewMemberId} result={r} />
        ))}
      </div>

      {/* 手順④ 生成した書類 */}
      <div>
        <h4 className="text-sm font-bold">生成した書類</h4>
        {documents.length === 0 ? (
          <p className="text-sm text-foreground-500">まだ書類を作っていません。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap gap-2">
                <span className="font-semibold">{t.documentKind[d.kind]}</span>
                <span className="text-foreground-600">{d.subjectLabel}</span>
                <span className="tabular-nums text-foreground-500">{d.generatedOn} 作成</span>
                {d.submittedOn ? (
                  <span className="tabular-nums text-foreground-500">{d.submittedOn} 提出</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {documents.length > 0 ? (
          <Link
            href={`/shore/filings/${filing.id}/print`}
            className="mt-2 inline-block rounded-medium border border-[var(--glass-border)] px-3 py-1.5 text-sm"
          >
            書類の中身を見る（印刷用）
          </Link>
        ) : null}
      </div>

      {/* 手順⑤ 提出の記録・船員手帳の記帳 */}
      {isDone ? (
        <div className="glass-inset p-3 text-sm">
          <p className="font-semibold">船員手帳の記帳情報（電子記録）</p>
          {(filing.seamanBookEntries ?? []).length === 0 ? (
            <p className="text-foreground-500">記帳情報はありません。</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {(filing.seamanBookEntries ?? []).map((e, i) => (
                <li key={`${e.crewMemberId}-${i}`} className="flex flex-wrap gap-2">
                  <span className="font-semibold">
                    {targets.find((tg) => tg.crewMemberId === e.crewMemberId)?.crewName ??
                      e.crewMemberId}
                  </span>
                  <span className="text-foreground-600">{e.vesselName}</span>
                  {e.duty ? <span className="text-foreground-600">{e.duty}</span> : null}
                  <span className="tabular-nums text-foreground-500">
                    {e.onDate ? `乗船 ${e.onDate}` : ""}
                    {e.offDate ? `下船 ${e.offDate}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <FilingSteps filingId={filing.id} status={filing.status} today={today} />
      )}
    </div>
  );
}

export default async function ShoreFilingsPage() {
  const guard = await requireShore("manage_filing");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="届出ウィザード" />;

  const now = new Date();
  const today = todayLocal(now);
  const rows = listFilings(now);
  const inProgress = rows.filter((r) => r.filing.status !== "submitted" && r.filing.status !== "accepted");
  const finished = rows.filter((r) => r.filing.status === "submitted" || r.filing.status === "accepted");
  const candidates = listFilingCandidates();
  const { crew, vessels } = filingFormOptions();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">届出（雇入・雇止）</h1>
        <p className="text-sm text-foreground-500">
          複数の船員・船をまとめて届け出ます（基準日 {today}）
        </p>
      </div>

      <FilingWizard candidates={candidates} crew={crew} vessels={vessels} today={today} />

      <section aria-label="作成中の届出" className="flex flex-col gap-3">
        <h2 className="font-bold">
          作成中の届出 <span className="tabular-nums text-foreground-500">{inProgress.length}件</span>
        </h2>
        {inProgress.length === 0 ? (
          <p className="text-sm text-foreground-500">作成中の届出はありません。</p>
        ) : (
          inProgress.map((row) => <FilingCard key={row.filing.id} row={row} today={today} />)
        )}
      </section>

      <section aria-label="提出済みの届出" className="flex flex-col gap-3">
        <h2 className="font-bold">
          提出済みの届出 <span className="tabular-nums text-foreground-500">{finished.length}件</span>
        </h2>
        {finished.length === 0 ? (
          <p className="text-sm text-foreground-500">提出済みの届出はありません。</p>
        ) : (
          finished.map((row) => <FilingCard key={row.filing.id} row={row} today={today} />)
        )}
      </section>

      <p className="text-xs text-foreground-500">
        届出は追記だけで進みます（作成中 → 確認済 → 書類生成済 → 提出済）。前の版は履歴として残り、
        生成した書類は作成した時点のマスタ値を保持するため、あとでマスタを直しても書き換わりません。
      </p>
    </div>
  );
}
