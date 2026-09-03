import Link from "next/link";
import { t } from "@/i18n/ja";
import { fmtMinutes } from "@/lib/format";
import {
  buildStandbySummary,
  counterpartyOptions,
  listDocuments,
  monthRange,
  reportMonthOptions,
  standbyTotals,
} from "@/server/document-service";
import { todayLocal } from "@/server/master-service";
import { requireShore } from "@/server/shore-session";
import { DOCUMENT_KINDS, type DocumentKind } from "@/sync-protocol/masters";
import { ShoreGuardNotice } from "../_components/guard";
import { OpinionForm } from "./_components/opinion-form";
import { ReportForm } from "./_components/report-form";
import { SubmissionForm } from "./_components/submission-form";

export const dynamic = "force-dynamic";

/**
 * S-14 帳票・出力センター（要件定義書 9章 / 3.6.4 / 12.3）。
 *
 * 生成した書類の一覧・再出力（印刷）・提出記録に加えて、
 * 意見陳述書テンプレート・待機/荷役の実績集計（CSV）・運航実績レポートの生成を扱う。
 * 提出済みの書類は生成時点のスナップショットのまま保全し、書き換えない（12.3）。
 */
export default async function ShoreDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const guard = await requireShore("manage_documents");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="帳票・出力センター" />;

  const sp = await searchParams;
  const kindFilter = (sp.kind ?? "all") as DocumentKind | "all";
  const rows = listDocuments(kindFilter);
  const allRows = listDocuments();
  const today = todayLocal();
  const months = reportMonthOptions();
  const thisMonth = monthRange(months[0] ?? today.slice(0, 7));

  const standbyRows = buildStandbySummary();
  const totals = standbyTotals(standbyRows);

  const unsubmitted = allRows
    .filter((r) => !r.submitted)
    .map((r) => ({
      id: r.record.id,
      label: `${t.documentKind[r.record.kind] ?? r.record.kind}: ${r.record.title}（作成 ${r.record.generatedOn}）`,
    }));

  /** 一覧に出す種別の絞り込み（実際に存在する種別だけを出す） */
  const presentKinds = DOCUMENT_KINDS.filter((k) => allRows.some((r) => r.record.kind === k));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">帳票・出力センター</h1>
        <p className="text-sm text-foreground-500">
          作った書類の再出力・提出の記録と、実績データからの書類作成を行います
        </p>
      </div>

      <section aria-label="種別の絞り込み" className="glass-tile flex flex-wrap items-center gap-2 p-4">
        <span className="text-sm text-foreground-500">種別</span>
        <Link
          href="/shore/documents"
          className={`rounded-medium px-3 py-1.5 text-sm ${
            kindFilter === "all" ? "bg-primary text-primary-foreground" : "bg-default-100"
          }`}
        >
          すべて（{allRows.length}件）
        </Link>
        {presentKinds.map((k) => (
          <Link
            key={k}
            href={`/shore/documents?kind=${k}`}
            className={`rounded-medium px-3 py-1.5 text-sm ${
              kindFilter === k ? "bg-primary text-primary-foreground" : "bg-default-100"
            }`}
          >
            {t.documentKind[k]}
          </Link>
        ))}
      </section>

      <section aria-label="書類の一覧" className="glass-tile overflow-x-auto">
        <h2 className="px-4 pt-4 font-bold">作成した書類（新しい順）</h2>
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-foreground-500">この種別の書類はありません。</p>
        ) : (
          <table className="mt-3 w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] text-left text-foreground-500">
                <th className="px-4 py-2 font-medium">種別</th>
                <th className="px-2 py-2 font-medium">標題</th>
                <th className="px-2 py-2 font-medium">対象</th>
                <th className="px-2 py-2 font-medium">作成日</th>
                <th className="px-2 py-2 font-medium">形式</th>
                <th className="px-2 py-2 font-medium">提出記録</th>
                <th className="px-2 py-2 font-medium">再出力</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ record, submitted }) => (
                <tr key={record.id} className="border-b border-[var(--glass-border)] last:border-b-0">
                  <td className="px-4 py-2">{t.documentKind[record.kind] ?? record.kind}</td>
                  <td className="px-2 py-2 font-semibold">{record.title}</td>
                  <td className="px-2 py-2 text-foreground-600">{record.subjectLabel ?? "—"}</td>
                  <td className="px-2 py-2 tabular-nums">{record.generatedOn}</td>
                  <td className="px-2 py-2">{t.documentFormat[record.format] ?? record.format}</td>
                  <td className="px-2 py-2">
                    {submitted ? (
                      <span className="tabular-nums">
                        ✓ {record.submittedOn}
                        <span className="ml-1 text-xs text-foreground-500">{record.submittedTo}</span>
                      </span>
                    ) : (
                      <span className="text-warning-700">⚠ 未提出</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      href={`/shore/documents/${record.id}/print`}
                      className="rounded-medium border border-[var(--glass-border)] px-3 py-1.5 text-sm"
                      prefetch={false}
                    >
                      印刷する
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="px-4 py-3 text-xs text-foreground-500">
          提出した書類は作成した時点の内容のまま残します。あとから船員マスタや実績が変わっても
          書き換えません（提出したときの証しとして保全するため）。
        </p>
      </section>

      <SubmissionForm documents={unsubmitted} defaultDate={today} />

      <OpinionForm
        counterparties={counterpartyOptions()}
        defaultFrom={thisMonth.from}
        defaultTo={thisMonth.to}
      />

      <ReportForm months={months} />

      <section aria-label="待機時間と荷役時間の実績" className="glass-tile overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="font-bold">待機時間・荷役時間の実績（月別・港別）</h2>
          <Link
            href="/api/v1/shore/standby.csv"
            className="rounded-medium border border-[var(--glass-border)] px-3 py-1.5 text-sm font-semibold"
            prefetch={false}
          >
            CSV で出力
          </Link>
        </div>
        <p className="px-4 pt-2 text-sm text-foreground-600">
          荷主・オペレーターとの協議に使う基礎資料です。荷役待ちの待機は労働時間に算入されるため、
          待機が長い港・月がわかると運航計画の見直しを申し入れやすくなります。
        </p>
        {standbyRows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-foreground-500">
            集計できる待機・荷役の記録はありません。
          </p>
        ) : (
          <table className="mt-3 w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] text-left text-foreground-500">
                <th className="px-4 py-2 font-medium">月</th>
                <th className="px-2 py-2 font-medium">港</th>
                <th className="px-2 py-2 font-medium">待機の回数</th>
                <th className="px-2 py-2 font-medium">待機時間</th>
                <th className="px-2 py-2 font-medium">荷役の回数</th>
                <th className="px-2 py-2 font-medium">荷役時間</th>
                <th className="px-2 py-2 font-medium">終了が未記録</th>
              </tr>
            </thead>
            <tbody>
              {standbyRows.map((r) => (
                <tr
                  key={`${r.month}-${r.port}`}
                  className="border-b border-[var(--glass-border)] last:border-b-0"
                >
                  <td className="px-4 py-2 tabular-nums">{r.month}</td>
                  <td className="px-2 py-2">{r.port}</td>
                  <td className="px-2 py-2 tabular-nums">{r.standbyCount}回</td>
                  <td className="px-2 py-2 tabular-nums">{fmtMinutes(r.standbyMinutes)}</td>
                  <td className="px-2 py-2 tabular-nums">{r.cargoCount}回</td>
                  <td className="px-2 py-2 tabular-nums">{fmtMinutes(r.cargoMinutes)}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {r.openCount > 0 ? `⚠ ${r.openCount}件` : "—"}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="px-4 py-2">合計</td>
                <td className="px-2 py-2">—</td>
                <td className="px-2 py-2 tabular-nums">{totals.standbyCount}回</td>
                <td className="px-2 py-2 tabular-nums">{fmtMinutes(totals.standbyMinutes)}</td>
                <td className="px-2 py-2 tabular-nums">{totals.cargoCount}回</td>
                <td className="px-2 py-2 tabular-nums">{fmtMinutes(totals.cargoMinutes)}</td>
                <td className="px-2 py-2 tabular-nums">
                  {totals.openCount > 0 ? `⚠ ${totals.openCount}件` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
