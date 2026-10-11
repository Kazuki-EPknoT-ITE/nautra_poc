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
  vesselOptions,
} from "@/server/document-service";
import { filterPast } from "@/lib/record-filter";
import { todayLocal } from "@/server/master-service";
import { requireShore } from "@/server/shore-session";
import { DOCUMENT_KINDS, type DocumentKind } from "@/sync-protocol/masters";
import { SearchField, StatusChip } from "@/ui";
import { ExportAction } from "../_components/export-action";
import { ShoreGuardNotice } from "../_components/guard";
import { OpinionForm } from "./_components/opinion-form";
import { ReportForm } from "./_components/report-form";
import {
  BulkPermitForm,
  CrewRegisterForm,
  DrillRecordDocForm,
} from "./_components/statutory-forms";
import { SubmitRowForm } from "./_components/submission-form";

/** 主題（レビュー FORM-05: スクロールで作業させず、タブで分ける） */
const TABS = [
  { id: "list", label: "作った書類" },
  { id: "make", label: "書類を作る" },
  { id: "standby", label: "待機・荷役の実績" },
] as const;

/** 作れる書類（レビュー FORM-04/06: 選んだ1つの入力だけを出す） */
const MAKE = [
  { id: "opinion", label: "意見陳述書", hint: "オペレーター宛。期間の待機時間と労働時間の実績を自動で添えます（3.6.4）" },
  { id: "report", label: "運航実績レポート", hint: "対象月の航海・荷役・燃料・待機・労働時間を1つにまとめます（3.3.3）" },
  { id: "register", label: "海員名簿", hint: "乗下船の記録から組み立てます。入力する項目はありません（9章）" },
  { id: "permit", label: "一括届出の許可申請", hint: "これまでの届出の実績と労務管理の状況を自動で添えます（3.8.3）" },
  { id: "drill", label: "操練の実施記録", hint: "船内で記録した操練を期間でまとめます（9章 / 3.9）" },
] as const;

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
  searchParams: Promise<{ tab?: string; kind?: string; make?: string; q?: string; from?: string; to?: string; status?: string }>;
}) {
  const guard = await requireShore("manage_documents");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="帳票・出力センター" />;

  const sp = await searchParams;
  const tab = TABS.some((x) => x.id === sp.tab) ? sp.tab! : "list";
  const make = MAKE.find((m) => m.id === sp.make)?.id ?? MAKE[0].id;
  const kindFilter = (sp.kind ?? "all") as DocumentKind | "all";
  const status = sp.status === "unsubmitted" || sp.status === "submitted" ? sp.status : "all";
  const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
  const from = ymdRe.test(sp.from ?? "") ? sp.from! : "";
  const to = ymdRe.test(sp.to ?? "") ? sp.to! : "";
  const q = (sp.q ?? "").slice(0, 100);
  // キーワードと期間（作成日）で探す（レビュー FORM-02。判定は船内の「過去を見る」と同じ filterPast）
  const rows = filterPast(
    listDocuments(kindFilter).filter((r) => (status === "all" ? true : status === "submitted" ? r.submitted : !r.submitted)),
    { from, to, q },
    (r) => r.record.generatedOn,
    (r) =>
      [t.documentKind[r.record.kind] ?? r.record.kind, r.record.title, r.record.subjectLabel ?? "", r.record.submittedTo ?? ""].join(" "),
  );
  const listHref = (over: Record<string, string>) => {
    const u = new URLSearchParams({ tab: "list", kind: kindFilter, status, q, from, to, ...over });
    for (const [k, v] of [...u.entries()]) if (!v || v === "all") u.delete(k);
    return `/shore/documents?${u.toString()}`;
  };
  const allRows = listDocuments();
  const today = todayLocal();
  const months = reportMonthOptions();
  const thisMonth = monthRange(months[0] ?? today.slice(0, 7));

  const standbyRows = buildStandbySummary();
  const totals = standbyTotals(standbyRows);

  const unsubmittedCount = allRows.filter((r) => !r.submitted).length;

  /** 一覧に出す種別の絞り込み（実際に存在する種別だけを出す） */
  const presentKinds = DOCUMENT_KINDS.filter((k) => allRows.some((r) => r.record.kind === k));

  return (
    <div className="flex flex-col gap-[18px]">
      <nav aria-label="帳票・出力の主題" className="ui-card flex flex-wrap gap-2 p-3">
        {TABS.map((x) => (
          <Link
            key={x.id}
            href={`/shore/documents?tab=${x.id}`}
            aria-current={x.id === tab ? "page" : undefined}
            className={`ui-btn-quiet ${x.id === tab ? "ui-btn-selected" : ""}`}
          >
            {x.label}
            {x.id === "list" && unsubmittedCount > 0 ? (
              <span className="ml-1.5 font-mono text-xs">未提出 {unsubmittedCount}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      {tab === "list" ? (
        <>
          <form method="get" action="/shore/documents" className="ui-card flex flex-wrap items-center gap-2 px-[18px] py-3" aria-label="書類を探す">
            <input type="hidden" name="tab" value="list" />
            {kindFilter !== "all" ? <input type="hidden" name="kind" value={kindFilter} /> : null}
            {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
            <SearchField name="q" defaultValue={q} placeholder="標題・対象・提出先" ariaLabel="キーワード" className="w-64" />
            <span className="text-sm font-bold text-foreground-700">作成日</span>
            <input type="date" name="from" defaultValue={from} aria-label="いつから" className="ui-field !w-auto !py-1.5 font-mono" />
            <span>〜</span>
            <input type="date" name="to" defaultValue={to} aria-label="いつまで" className="ui-field !w-auto !py-1.5 font-mono" />
            <button type="submit" className="ui-btn-ghost h-9">
              探す
            </button>
            {q || from || to ? (
              <Link href={listHref({ q: "", from: "", to: "" })} className="ui-btn-quiet">
                条件を消す
              </Link>
            ) : null}
          </form>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["all", `すべて ${allRows.length}`],
                ["unsubmitted", `未提出 ${unsubmittedCount}`],
                ["submitted", `提出済み ${allRows.length - unsubmittedCount}`],
              ] as const
            ).map(([id, label]) => (
              <Link
                key={id}
                href={listHref({ status: id })}
                aria-current={status === id ? "true" : undefined}
                className={`ui-btn-quiet ${status === id ? "ui-btn-selected" : ""}`}
              >
                {label}
              </Link>
            ))}
            <span className="mx-1 h-5 w-px bg-[#CCCCCC]" aria-hidden="true" />
            <Link
              href={listHref({ kind: "all" })}
              aria-current={kindFilter === "all" ? "true" : undefined}
              className={`ui-btn-quiet ${kindFilter === "all" ? "ui-btn-selected" : ""}`}
            >
              全種別
            </Link>
            {presentKinds.map((k) => (
              <Link
                key={k}
                href={listHref({ kind: k })}
                aria-current={kindFilter === k ? "true" : undefined}
                className={`ui-btn-quiet ${kindFilter === k ? "ui-btn-selected" : ""}`}
              >
                {t.documentKind[k]}
              </Link>
            ))}
          </div>

          <section aria-label="作った書類" className="ui-card p-0">
            {rows.length === 0 ? (
              <p className="m-0 px-[18px] py-5 text-sm text-foreground-500">条件に合う書類はありません</p>
            ) : (
              <div className="ui-table-scroll" style={{ maxHeight: 560 }}>
                <table className="ui-table min-w-[980px]">
                  <thead>
                    <tr>
                      <th className="num">作成日</th>
                      <th>種別</th>
                      <th>標題</th>
                      <th>対象</th>
                      <th>提出</th>
                      <th className="num" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map(({ record, submitted }) => (
                      <tr key={record.id}>
                        <td className="num whitespace-nowrap">{record.generatedOn}</td>
                        <td className="text-foreground-500">{t.documentKind[record.kind] ?? record.kind}</td>
                        <td className="font-medium text-foreground-800">{record.title}</td>
                        <td className="text-foreground-500">{record.subjectLabel ?? "—"}</td>
                        <td>
                          {submitted ? (
                            <StatusChip
                              level="ok"
                              size="sm"
                              label={`${record.submittedOn} ${record.submittedTo ?? ""}`}
                              hint="提出した書類は作成した時点の内容のまま残します（12.3）"
                            />
                          ) : (
                            <SubmitRowForm documentId={record.id} title={record.title} defaultDate={today} />
                          )}
                        </td>
                        <td className="num">
                          <Link href={`/shore/documents/${record.id}/print`} className="ui-btn-quiet" prefetch={false}>
                            印刷する
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {tab === "make" ? (
        <>
          <nav aria-label="作る書類" className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {MAKE.map((m) => (
              <Link
                key={m.id}
                href={`/shore/documents?tab=make&make=${m.id}`}
                aria-current={make === m.id ? "true" : undefined}
                title={m.hint}
                className={`ui-card flex min-h-[64px] items-center justify-center border-2 px-3 text-center text-lg font-bold ${make === m.id ? "border-primary text-primary" : "border-transparent text-foreground-800"}`}
              >
                {m.label}
              </Link>
            ))}
          </nav>
          <p className="m-0 text-sm text-foreground-600">{MAKE.find((m) => m.id === make)?.hint}</p>
          {make === "opinion" ? (
            <OpinionForm counterparties={counterpartyOptions()} defaultFrom={thisMonth.from} defaultTo={thisMonth.to} />
          ) : null}
          {make === "report" ? <ReportForm months={months} /> : null}
          {make === "register" ? <CrewRegisterForm vessels={vesselOptions()} /> : null}
          {make === "permit" ? <BulkPermitForm /> : null}
          {make === "drill" ? <DrillRecordDocForm from={thisMonth.from} to={thisMonth.to} /> : null}
        </>
      ) : null}

      {tab === "standby" ? (
      <section aria-label="待機時間と荷役時間の実績" className="ui-card overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="m-0 text-lg font-bold">月別・港別</h2>
          <ExportAction set="standby" label="待機・荷役の実績を書き出す" />
        </div>
        {standbyRows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-foreground-500">
            集計できる待機・荷役の記録はありません。
          </p>
        ) : (
          <table className="mt-3 w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
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
                  className="border-b border-[var(--ui-hairline)] last:border-b-0"
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
      ) : null}
    </div>
  );
}
