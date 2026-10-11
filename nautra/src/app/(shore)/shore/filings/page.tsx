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
import { hasShorePermission, requireShore } from "@/server/shore-session";
import { StatusChip, StepBar, type Step } from "@/ui";
import { ExportAction } from "../_components/export-action";
import { ShoreGuardNotice } from "../_components/guard";
import { ProcedureList } from "../_components/procedures/procedure-list";
import { EventChainForm, NewProcedureForm } from "../_components/procedures/procedure-forms";
import { PROCEDURE_GROUP_LABEL } from "@/domain/procedures/deadlines";
import { buildProcedureBoard, procedureFormOptions } from "@/server/procedure-service";
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
    <div className="ui-inset p-3">
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

/**
 * 届出の手順（デザイン正本 S-07）。
 * 「受理保留を先に潰す」ための添付要件チェックを、書類を作る**前**に置くのが要点
 * （作ってから不備に気づくと、生成物ごと作り直しになるため。3.8.3⑥）。
 */
const FILING_STEPS: Step[] = [
  { no: 1, title: "種別・方式", note: "何をどう出すか" },
  { no: 2, title: "対象の選択", note: "複数船員・複数船舶" },
  { no: 3, title: "添付要件チェック", note: "受理保留を先に潰す" },
  { no: 4, title: "書類の生成", note: "スナップショット保存" },
  { no: 5, title: "提出の記録", note: "手帳の記帳もここで" },
];

function FilingCard({ row, today }: { row: FilingRow; today: string }) {
  const { filing, targets, check, documents } = row;
  const isDone = filing.status === "submitted" || filing.status === "accepted";

  /** 状態 → 手順番号。届出は追記だけで進むので、状態がそのまま進捗になる */
  const step =
    filing.status === "draft"
      ? 2
      : filing.status === "checked"
        ? 3
        : filing.status === "documents_ready"
          ? 4
          : 5;

  return (
    <div className="ui-card flex flex-col">
      <StepBar steps={FILING_STEPS} current={step} />
      <div className="flex flex-col gap-3 p-4">
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
            className="mt-2 inline-block rounded-medium border border-[var(--ui-hairline)] px-3 py-1.5 text-sm"
          >
            書類の中身を見る（印刷用）
          </Link>
        ) : null}
      </div>

      {/* 手順⑤ 提出の記録・船員手帳の記帳 */}
      {isDone ? (
        <div className="ui-inset p-3 text-sm">
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
    </div>
  );
}

/**
 * 届出の画面は作業ごとにタブで分ける（1画面1主題・めくらずに済むように。レビュー 0-3 / FILING-02）。
 * 「手続き・期限」は旧 S-08 の会社全体の一覧で、ここへ移した（DEADLINE-02）。
 */
const TABS = [
  { id: "create", label: "届出を作る" },
  { id: "progress", label: "作成中" },
  { id: "done", label: "提出済み" },
  { id: "procedures", label: "手続き・期限" },
];

export default async function ShoreFilingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const guard = await requireShore("manage_filing");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="届出ウィザード" />;

  const sp = await searchParams;
  const tab = TABS.some((x) => x.id === sp.tab) ? sp.tab! : TABS[0]!.id;
  const now = new Date();
  const today = todayLocal(now);
  const rows = listFilings(now);
  const inProgress = rows.filter((r) => r.filing.status !== "submitted" && r.filing.status !== "accepted");
  const finished = rows.filter((r) => r.filing.status === "submitted" || r.filing.status === "accepted");
  const candidates = listFilingCandidates();
  const { crew, vessels } = filingFormOptions();
  const canProcedures = await hasShorePermission("manage_procedures");
  const board = tab === "procedures" ? buildProcedureBoard(now) : null;
  const options = tab === "procedures" ? procedureFormOptions() : null;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="届出の主題" className="flex flex-wrap gap-2">
          {TABS.map((x) => (
            <Link
              key={x.id}
              href={`/shore/filings?tab=${x.id}`}
              aria-current={x.id === tab ? "page" : undefined}
              className={`ui-btn-quiet ${x.id === tab ? "ui-btn-selected" : ""}`}
            >
              {x.label}
              {x.id === "progress" && inProgress.length > 0 ? <span className="ml-1 font-mono">{inProgress.length}</span> : null}
            </Link>
          ))}
        </nav>
        <span className="ml-auto" />
        <ExportAction set="filing" label="手続き・提出記録を書き出す" />
      </div>

      {tab === "create" ? <FilingWizard candidates={candidates} crew={crew} vessels={vessels} today={today} /> : null}

      {tab === "progress" ? (
        <section aria-label="作成中の届出" className="flex flex-col gap-3">
          {inProgress.length === 0 ? (
            <p className="ui-card m-0 px-4 py-5 text-sm text-foreground-500">作成中の届出はありません。</p>
          ) : (
            inProgress.map((row) => <FilingCard key={row.filing.id} row={row} today={today} />)
          )}
        </section>
      ) : null}

      {tab === "done" ? (
        <section aria-label="提出済みの届出" className="flex flex-col gap-3">
          {finished.length === 0 ? (
            <p className="ui-card m-0 px-4 py-5 text-sm text-foreground-500">提出済みの届出はありません。</p>
          ) : (
            finished.map((row) => <FilingCard key={row.filing.id} row={row} today={today} />)
          )}
        </section>
      ) : null}

      {tab === "procedures" && board && options ? (
        <>
          <section aria-label="いま気にすべき件数" className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "期限を過ぎた", value: board.summary.overdue, level: board.summary.overdue > 0 ? "violation" : "ok" },
              { label: "期限が近い", value: board.summary.dueSoon, level: board.summary.dueSoon > 0 ? "violation" : "ok" },
              { label: "準備を始める時期", value: board.summary.startDue, level: board.summary.startDue > 0 ? "caution" : "ok" },
            ].map((x) => (
              <div key={x.label} className="ui-card flex items-center justify-between gap-2 px-4 py-3">
                <span className="text-base text-foreground-700">{x.label}</span>
                <StatusChip level={x.level as "ok" | "caution" | "violation"} label={`${x.value}件`} />
              </div>
            ))}
          </section>
          {board.byGroup.map(({ group, rows: groupRows }) => (
            <section key={group} aria-label={PROCEDURE_GROUP_LABEL[group]} className="ui-card flex flex-col gap-2 p-4">
              <h2 className="m-0 text-base font-bold">{PROCEDURE_GROUP_LABEL[group]}</h2>
              <ProcedureList rows={groupRows} canComplete={canProcedures} showSubject empty="この群に、いま対応する手続きはありません" />
            </section>
          ))}
          {canProcedures ? (
            <>
              <EventChainForm options={options} today={board.today} />
              <NewProcedureForm options={options} />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
