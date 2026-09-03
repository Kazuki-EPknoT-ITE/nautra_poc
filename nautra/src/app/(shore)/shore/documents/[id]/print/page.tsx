import Link from "next/link";
import { PRODUCT_NAME, t } from "@/i18n/ja";
import { fmtDateTime, fmtMinutes } from "@/lib/format";
import {
  documentById,
  type LaborEvidenceRow,
  type OperationReportSnapshot,
  type OpinionStatementSnapshot,
  type StandbyPortRow,
} from "@/server/document-service";
import { requireShore } from "@/server/shore-session";
import { ShoreGuardNotice } from "../../../_components/guard";
import { PrintButton } from "../../_components/print-button";

export const dynamic = "force-dynamic";

/**
 * 印刷用ビュー（S-14 再出力）。
 *
 * **生成時点のスナップショットだけを描く**。現在のマスタ・実績は読み直さない。
 * 提出済みの書類は以後マスタが更新されても書き換えず、提出時点の証跡として保全する
 * （要件定義書 12.3）。ブラウザの印刷から PDF 化できる。
 */

const PRINT_CSS = `
@media print {
  /* 画面用のヘッダ・操作ボタンは紙に出さない */
  .ui-bar, [data-print="hide"] { display: none !important; }
  main { max-width: none !important; padding: 0 !important; }
  .print-sheet { box-shadow: none !important; background: #fff !important; }
  .print-sheet table { page-break-inside: auto; }
  .print-sheet tr { page-break-inside: avoid; page-break-after: auto; }
  .print-sheet thead { display: table-header-group; }
  .print-block { page-break-inside: avoid; }
  .print-page-break { page-break-before: always; }
}
@page { size: A4; margin: 18mm 16mm; }
`;

function isOpinion(snapshot: unknown): snapshot is OpinionStatementSnapshot {
  return (
    typeof snapshot === "object" &&
    snapshot !== null &&
    (snapshot as { documentKind?: string }).documentKind === "opinion_statement"
  );
}

function isOperationReport(snapshot: unknown): snapshot is OperationReportSnapshot {
  return (
    typeof snapshot === "object" &&
    snapshot !== null &&
    (snapshot as { documentKind?: string }).documentKind === "operation_report"
  );
}

function StandbyTable({ rows }: { rows: StandbyPortRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-foreground-500">この期間の待機・荷役の記録はありません。</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
            <th className="py-2 pr-3 font-medium">月</th>
            <th className="py-2 pr-3 font-medium">港</th>
            <th className="py-2 pr-3 font-medium">待機の回数</th>
            <th className="py-2 pr-3 font-medium">待機時間</th>
            <th className="py-2 pr-3 font-medium">荷役の回数</th>
            <th className="py-2 pr-3 font-medium">荷役時間</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.month}-${r.port}`} className="border-b border-[var(--ui-hairline)]">
              <td className="py-2 pr-3 tabular-nums">{r.month}</td>
              <td className="py-2 pr-3">{r.port}</td>
              <td className="py-2 pr-3 tabular-nums">{r.standbyCount}回</td>
              <td className="py-2 pr-3 tabular-nums">{fmtMinutes(r.standbyMinutes)}</td>
              <td className="py-2 pr-3 tabular-nums">{r.cargoCount}回</td>
              <td className="py-2 pr-3 tabular-nums">{fmtMinutes(r.cargoMinutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LaborTable({ rows, ruleVersion }: { rows: LaborEvidenceRow[]; ruleVersion: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-foreground-500">この期間の打刻記録はありません。</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
            <th className="py-2 pr-3 font-medium">船員</th>
            <th className="py-2 pr-3 font-medium">労働時間の合計</th>
            <th className="py-2 pr-3 font-medium">うち時間外</th>
            <th className="py-2 pr-3 font-medium">働いた日数</th>
            <th className="py-2 pr-3 font-medium">休んだ日数</th>
            <th className="py-2 pr-3 font-medium">注意・警告の日数</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.crewMemberId} className="border-b border-[var(--ui-hairline)]">
              <td className="py-2 pr-3">{r.crewName}</td>
              <td className="py-2 pr-3 tabular-nums">{fmtMinutes(r.workedMinutes)}</td>
              <td className="py-2 pr-3 tabular-nums">{fmtMinutes(r.overtimeMinutes)}</td>
              <td className="py-2 pr-3 tabular-nums">{r.workedDays}日</td>
              <td className="py-2 pr-3 tabular-nums">{r.restDays}日</td>
              <td className="py-2 pr-3 tabular-nums">
                注意 {r.cautionDays}日 / 警告 {r.violationDays}日
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-foreground-500">
        判定に使ったルール版: {ruleVersion}（打刻の一次記録から算出）
      </p>
    </div>
  );
}

export default async function DocumentPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const guard = await requireShore("manage_documents");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="帳票の印刷" />;

  const { id } = await params;
  const record = documentById(id);

  if (!record) {
    return (
      <div className="ui-card flex flex-col items-start gap-3 p-6">
        <h1 className="text-xl font-bold">この書類は見つかりません</h1>
        <p className="text-sm text-foreground-600">
          訂正・更新されて別の版に置き換わった可能性があります。一覧から開き直してください。
        </p>
        <Link
          href="/shore/documents"
          className="rounded-medium bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          帳票の一覧へ
        </Link>
      </div>
    );
  }

  const snapshot = record.snapshot;

  return (
    <div className="flex flex-col gap-4">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div data-print="hide" className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/shore/documents" className="text-sm text-primary underline-offset-2 hover:underline">
          ← 帳票の一覧へ戻る
        </Link>
        <PrintButton />
      </div>

      <article className="print-sheet ui-card flex flex-col gap-5 p-8">
        <header className="print-block flex flex-col gap-1 border-b border-[var(--ui-hairline)] pb-4">
          <p className="text-xs text-foreground-500">{t.documentKind[record.kind] ?? record.kind}</p>
          <h1 className="text-balance text-2xl font-bold">{record.title}</h1>
          <p className="text-sm text-foreground-600">{record.subjectLabel ?? ""}</p>
          <p className="tabular-nums text-xs text-foreground-500">
            作成日 {record.generatedOn}
            {record.submittedOn
              ? ` / 提出日 ${record.submittedOn} / 提出先 ${record.submittedTo ?? "—"}`
              : " / 未提出"}
          </p>
        </header>

        {isOpinion(snapshot) ? (
          <>
            <section className="print-block flex flex-col gap-3">
              <p className="text-right tabular-nums text-sm">{snapshot.issuedOn}</p>
              <p className="text-lg font-bold">{snapshot.counterparty} 御中</p>
              <p className="text-right text-sm">{snapshot.issuerLabel}</p>
              <h2 className="mt-2 text-center text-lg font-bold">意見陳述書（運航計画の変更要請）</h2>
              {snapshot.paragraphs.map((p, i) => (
                <p key={i} className="text-sm leading-7">
                  {p}
                </p>
              ))}
            </section>

            <section className="print-block flex flex-col gap-2">
              <h3 className="font-bold">
                記 1. 待機時間・荷役時間の実績（{snapshot.periodFrom}〜{snapshot.periodTo}）
              </h3>
              <StandbyTable rows={snapshot.standbyRows} />
              <p className="tabular-nums text-sm">
                待機の合計 {fmtMinutes(snapshot.standbyTotals.standbyMinutes)}（
                {snapshot.standbyTotals.standbyCount}回） / 荷役の合計{" "}
                {fmtMinutes(snapshot.standbyTotals.cargoMinutes)}（{snapshot.standbyTotals.cargoCount}回）
              </p>
            </section>

            <section className="print-block flex flex-col gap-2">
              <h3 className="font-bold">記 2. 乗組員の労働時間の実績</h3>
              <LaborTable rows={snapshot.laborRows} ruleVersion={snapshot.appliedRuleVersion} />
            </section>

            <p className="text-xs text-foreground-600">{snapshot.legalBasis}</p>
          </>
        ) : isOperationReport(snapshot) ? (
          <>
            <section className="print-block flex flex-col gap-2">
              <h2 className="text-lg font-bold">運航実績レポート（{snapshot.month}）</h2>
              <p className="tabular-nums text-sm text-foreground-600">
                作成 {snapshot.issuedOn} / {snapshot.issuerLabel}
              </p>
            </section>

            <section className="print-block flex flex-col gap-2">
              <h3 className="font-bold">1. 航海の実績</h3>
              {snapshot.voyages.length === 0 ? (
                <p className="text-sm text-foreground-500">この月の航海はありません。</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
                        <th className="py-2 pr-3 font-medium">船</th>
                        <th className="py-2 pr-3 font-medium">航海番号</th>
                        <th className="py-2 pr-3 font-medium">出港</th>
                        <th className="py-2 pr-3 font-medium">入港</th>
                        <th className="py-2 pr-3 font-medium">貨物</th>
                        <th className="py-2 pr-3 font-medium">数量</th>
                        <th className="py-2 pr-3 font-medium">相手先</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.voyages.map((v) => (
                        <tr key={`${v.voyageNo}-${v.departureAt}`} className="border-b border-[var(--ui-hairline)]">
                          <td className="py-2 pr-3">{v.vesselName}</td>
                          <td className="py-2 pr-3 tabular-nums">{v.voyageNo}</td>
                          <td className="py-2 pr-3">
                            {v.departurePort}
                            <span className="ml-1 tabular-nums text-xs text-foreground-500">
                              {fmtDateTime(v.departureAt)}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            {v.arrivalPort}
                            <span className="ml-1 tabular-nums text-xs text-foreground-500">
                              {fmtDateTime(v.arrivalAt)}
                            </span>
                          </td>
                          <td className="py-2 pr-3">{v.cargoKind}</td>
                          <td className="py-2 pr-3 tabular-nums">{v.quantity}</td>
                          <td className="py-2 pr-3">{v.counterparty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="print-block flex flex-col gap-2">
              <h3 className="font-bold">2. 荷役の実績</h3>
              {snapshot.cargoOps.length === 0 ? (
                <p className="text-sm text-foreground-500">この月の荷役記録はありません。</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {snapshot.cargoOps.map((c, i) => (
                    <li key={i} className="tabular-nums">
                      {c.date} {c.port} / {t.cargoOperation[c.operation] ?? c.operation} {c.cargoKind}{" "}
                      {c.quantity} / 所要 {fmtMinutes(c.minutes)}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="print-block flex flex-col gap-2">
              <h3 className="font-bold">3. 燃料</h3>
              {snapshot.fuel.length === 0 ? (
                <p className="text-sm text-foreground-500">この月の燃料記録はありません。</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-1 text-sm">
                    {snapshot.fuel.map((f, i) => (
                      <li key={i} className="tabular-nums">
                        {f.date} {f.fuelType} {t.fuelOperation[f.operation] ?? f.operation}{" "}
                        {f.quantityL.toLocaleString("ja-JP")} L
                        {f.remainingOnBoardL !== null
                          ? ` / 残 ${f.remainingOnBoardL.toLocaleString("ja-JP")} L`
                          : ""}
                      </li>
                    ))}
                  </ul>
                  <p className="tabular-nums text-sm">
                    補給の合計 {snapshot.fuelTotals.bunkeringL.toLocaleString("ja-JP")} L / 消費の合計{" "}
                    {snapshot.fuelTotals.consumptionL.toLocaleString("ja-JP")} L
                  </p>
                </>
              )}
            </section>

            <section className="print-block flex flex-col gap-2">
              <h3 className="font-bold">4. 待機時間・荷役時間</h3>
              <StandbyTable rows={snapshot.standbyRows} />
            </section>

            <section className="print-block flex flex-col gap-2">
              <h3 className="font-bold">5. 乗組員の労働時間</h3>
              <LaborTable rows={snapshot.laborRows} ruleVersion={snapshot.appliedRuleVersion} />
            </section>
          </>
        ) : (
          <section className="print-block flex flex-col gap-2">
            <p className="text-sm text-foreground-600">
              この書類には作成時点の中身が保存されていません（本番では PDF・Excel の実体を保管します）。
              提出の記録と書類の情報だけを表示しています。
            </p>
            <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
              <dt className="text-foreground-500">種別</dt>
              <dd>{t.documentKind[record.kind] ?? record.kind}</dd>
              <dt className="text-foreground-500">標題</dt>
              <dd>{record.title}</dd>
              <dt className="text-foreground-500">対象</dt>
              <dd>{record.subjectLabel ?? "—"}</dd>
              <dt className="text-foreground-500">作成日</dt>
              <dd className="tabular-nums">{record.generatedOn}</dd>
              <dt className="text-foreground-500">形式</dt>
              <dd>{t.documentFormat[record.format] ?? record.format}</dd>
              <dt className="text-foreground-500">提出日</dt>
              <dd className="tabular-nums">{record.submittedOn ?? "未提出"}</dd>
              <dt className="text-foreground-500">提出先</dt>
              <dd>{record.submittedTo ?? "—"}</dd>
            </dl>
          </section>
        )}

        <footer className="print-block border-t border-[var(--ui-hairline)] pt-3 text-xs text-foreground-500">
          {PRODUCT_NAME} で作成 / 書類ID {record.id}
          {record.supersedesId ? `（前の版 ${record.supersedesId} を置き換え）` : ""}
        </footer>
      </article>
    </div>
  );
}
