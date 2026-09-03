import Link from "next/link";
import { t } from "@/i18n/ja";
import { fmtMinutes } from "@/lib/format";
import { listVessels, todayLocal } from "@/server/master-service";
import {
  chartersNeedingAttention,
  expenseTotals,
  listCharters,
  listExpenses,
  listInvoices,
  listPayrolls,
  listSubsidies,
  officeRules,
  payrollMonthOptions,
} from "@/server/office-service";
import { requireShore } from "@/server/shore-session";
import { ShoreGuardNotice } from "../_components/guard";
import { CharterForm, type CharterOption } from "./_components/charter-form";
import { ExpenseForm } from "./_components/expense-form";
import { InvoicePaidForm } from "./_components/invoice-paid-form";
import { PayrollConfirmForm } from "./_components/payroll-confirm-form";
import { SubsidyForm, SubsidyStatusForm } from "./_components/subsidy-forms";

export const dynamic = "force-dynamic";

/** 金額の表示（3桁区切り。数字は tabular-nums で桁を揃える） */
function yen(amount: number | undefined): string {
  if (amount === undefined) return "—";
  return `${amount.toLocaleString("ja-JP")}円`;
}

const SECTIONS = [
  { id: "charters", label: "傭船契約" },
  { id: "invoices", label: "請求・入金" },
  { id: "expenses", label: "経費" },
  { id: "payrolls", label: "船員給与" },
  { id: "subsidies", label: "補助金・行政手続き" },
];

/**
 * 陸上事務（傭船・請求・経費・給与・補助金）。要件定義書 3.6.1 / 3.6.2 / 3.6.3。
 *
 * 少人数の陸上スタッフが Excel と紙で回している事務を1画面に集約する。
 * 期限・入金遅延・まるめの影響といった「見落とすと困ること」を先に出し、
 * 一覧はそのあとに置く。すべて追記型で、状態の変更も新しい版として積む。
 */
export default async function ShoreOfficePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const guard = await requireShore("manage_office");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="傭船・請求・経理" />;

  const sp = await searchParams;
  const today = todayLocal();
  const vessels = listVessels();

  const charters = listCharters();
  const charterAlerts = chartersNeedingAttention();
  const charterOptions: CharterOption[] = charters.map((c) => ({
    id: c.record.id,
    label: `${c.vesselName} / ${c.record.counterparty}（${t.charterType[c.record.contractType]}）`,
    targetVesselId: c.record.targetVesselId,
    counterparty: c.record.counterparty,
    contractType: c.record.contractType,
    from: c.record.from,
    to: c.record.to ?? "",
    rate: c.record.rate !== undefined ? String(c.record.rate) : "",
    rateUnit: c.record.rateUnit ?? "",
    status: c.record.status,
    terms: c.record.terms ?? "",
  }));

  const invoices = listInvoices();
  const overdueInvoices = invoices.filter((i) => i.overdue);
  const unpaidOptions = invoices
    .filter((i) => i.record.status !== "paid")
    .map((i) => ({
      id: i.record.id,
      label: `${i.record.invoiceNo} / ${i.record.counterparty} / ${yen(i.totalAmount)}${
        i.record.dueOn ? `（支払期限 ${i.record.dueOn}）` : ""
      }`,
    }));

  const expenses = listExpenses();
  const totals = expenseTotals(expenses);

  const payrollMonths = payrollMonthOptions();
  const month = sp.month ?? payrollMonths[0] ?? today.slice(0, 7);
  const payrolls = listPayrolls(month);
  const draftPayrolls = payrolls
    .filter((p) => p.record.status === "draft")
    .map((p) => ({
      id: p.record.id,
      label: `${p.crewName} / ${p.record.month} / 時間外まるめ後 ${fmtMinutes(p.overtime.roundedMinutes)}`,
    }));

  const subsidies = listSubsidies();
  const subsidyOptions = subsidies.map((s) => ({
    id: s.record.id,
    label: `${s.record.title}（${t.subsidyStatus[s.record.status]}）`,
    status: s.record.status,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">傭船・請求・経理</h1>
        <p className="text-sm text-foreground-500">
          契約の期限・入金の遅れ・給与のもとになる時間を1画面で確認します
        </p>
      </div>

      <nav aria-label="この画面の目次" className="ui-card flex flex-wrap items-center gap-2 p-4">
        <span className="text-sm text-foreground-500">目次</span>
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-medium bg-default-100 px-3 py-1.5 text-sm">
            {s.label}
          </a>
        ))}
      </nav>

      {/* ── 先に知らせるもの（期限・遅延） ── */}
      {charterAlerts.length > 0 || overdueInvoices.length > 0 ? (
        <section aria-label="早めに手を打つこと" className="ui-card border border-warning p-4">
          <h2 className="font-bold">⚠ 早めに手を打つこと</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {overdueInvoices.map((i) => (
              <li key={i.record.id} className="text-danger">
                ✕ 入金が遅れています: {i.record.counterparty} / {i.record.invoiceNo} /{" "}
                <span className="tabular-nums">{yen(i.totalAmount)}</span>
                {i.daysToDue !== null ? `（支払期限を ${Math.abs(i.daysToDue)}日 過ぎています）` : ""}
              </li>
            ))}
            {charterAlerts.map((c) => (
              <li key={c.record.id} className="text-warning-700">
                ⚠ 契約の期限が近づいています: {c.vesselName} / {c.record.counterparty}
                {c.daysToExpiry !== null
                  ? c.daysToExpiry >= 0
                    ? `（あと ${c.daysToExpiry}日 で満了）`
                    : `（満了日を ${Math.abs(c.daysToExpiry)}日 過ぎています）`
                  : ""}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-foreground-500">
            契約は満了の {officeRules.charterExpiryCautionDays}日前から知らせます（設定で変えられます）。
          </p>
        </section>
      ) : null}

      {/* ══════ 3.6.1 傭船契約 ══════ */}
      <section id="charters" aria-label="傭船契約" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">傭船契約</h2>
        <div className="ui-card overflow-x-auto">
          {charters.length === 0 ? (
            <p className="p-4 text-sm text-foreground-500">登録された契約はありません。</p>
          ) : (
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
                  <th className="px-4 py-2 font-medium">船</th>
                  <th className="px-2 py-2 font-medium">相手先</th>
                  <th className="px-2 py-2 font-medium">種別</th>
                  <th className="px-2 py-2 font-medium">期間</th>
                  <th className="px-2 py-2 font-medium">用船料</th>
                  <th className="px-2 py-2 font-medium">状態</th>
                  <th className="px-2 py-2 font-medium">満了まで</th>
                </tr>
              </thead>
              <tbody>
                {charters.map((c) => (
                  <tr key={c.record.id} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                    <td className="px-4 py-2">{c.vesselName}</td>
                    <td className="px-2 py-2 font-semibold">{c.record.counterparty}</td>
                    <td className="px-2 py-2">{t.charterType[c.record.contractType]}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {c.record.from} 〜 {c.record.to ?? "定めなし"}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {c.record.rate !== undefined
                        ? `${c.record.rate.toLocaleString("ja-JP")} ${c.record.rateUnit ?? ""}`
                        : "—"}
                    </td>
                    <td className="px-2 py-2">{t.charterStatus[c.record.status]}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {c.daysToExpiry === null ? (
                        "—"
                      ) : c.expired ? (
                        <span className="text-foreground-600">
                          {Math.abs(c.daysToExpiry)}日 過ぎています
                        </span>
                      ) : c.expiringSoon ? (
                        <span className="text-warning-700">⚠ あと {c.daysToExpiry}日</span>
                      ) : (
                        `あと ${c.daysToExpiry}日`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <CharterForm vessels={vessels} contracts={charterOptions} defaultFrom={today} />
      </section>

      {/* ══════ 3.6.1 / 3.6.2 請求・入金 ══════ */}
      <section id="invoices" aria-label="請求・入金" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">請求・入金</h2>
        <p className="ui-card p-4 text-sm text-foreground-600">
          請求書はインボイス制度・電子帳簿保存法の保存要件の対象です。電子で受け渡しした請求書は
          電子のまま保存し、日付・金額・取引先で探せるようにしておく必要があります。
          ここでは原本の識別（保存先のファイル名）を一緒に持ち、どの原本を指しているかを追えるようにしています。
        </p>
        <div className="ui-card overflow-x-auto">
          {invoices.length === 0 ? (
            <p className="p-4 text-sm text-foreground-500">登録された請求はありません。</p>
          ) : (
            <table className="w-full min-w-[1020px] text-sm">
              <thead>
                <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
                  <th className="px-4 py-2 font-medium">請求番号</th>
                  <th className="px-2 py-2 font-medium">相手先</th>
                  <th className="px-2 py-2 font-medium">対象期間</th>
                  <th className="px-2 py-2 font-medium">請求日</th>
                  <th className="px-2 py-2 font-medium">支払期限</th>
                  <th className="px-2 py-2 font-medium">金額（税抜）</th>
                  <th className="px-2 py-2 font-medium">消費税</th>
                  <th className="px-2 py-2 font-medium">状態</th>
                  <th className="px-2 py-2 font-medium">原本の識別</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.record.id} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                    <td className="px-4 py-2 tabular-nums font-semibold">{i.record.invoiceNo}</td>
                    <td className="px-2 py-2">{i.record.counterparty}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {i.record.periodFrom && i.record.periodTo
                        ? `${i.record.periodFrom}〜${i.record.periodTo}`
                        : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{i.record.issuedOn}</td>
                    <td className="px-2 py-2 tabular-nums">{i.record.dueOn ?? "—"}</td>
                    <td className="px-2 py-2 tabular-nums">{yen(i.record.amount)}</td>
                    <td className="px-2 py-2 tabular-nums">{yen(i.record.taxAmount)}</td>
                    <td className="px-2 py-2">
                      {i.overdue ? (
                        <span className="font-semibold text-danger">✕ {t.invoiceStatus.overdue}</span>
                      ) : i.record.status === "paid" ? (
                        <span>
                          ✓ {t.invoiceStatus.paid}
                          <span className="ml-1 tabular-nums text-xs text-foreground-500">
                            {i.record.paidOn}
                          </span>
                        </span>
                      ) : i.dueSoon ? (
                        <span className="text-warning-700">⚠ まもなく支払期限</span>
                      ) : (
                        t.invoiceStatus[i.record.status]
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs text-foreground-600">
                      {i.record.archiveRef ?? "未登録"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <InvoicePaidForm invoices={unpaidOptions} defaultDate={today} />
      </section>

      {/* ══════ 3.6.2 経費 ══════ */}
      <section id="expenses" aria-label="経費" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">経費</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="ui-card p-4">
            <h3 className="mb-2 font-bold">区分ごとの合計</h3>
            {totals.byKind.length === 0 ? (
              <p className="text-sm text-foreground-500">集計できる経費はありません。</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {totals.byKind.map((k) => (
                  <li key={k.key} className="flex items-baseline justify-between gap-3">
                    <span>
                      {t.expenseKind[k.key] ?? k.key}
                      <span className="ml-1 text-xs text-foreground-500">{k.count}件</span>
                    </span>
                    <span className="tabular-nums font-semibold">{yen(k.amount)}</span>
                  </li>
                ))}
                <li className="mt-1 flex items-baseline justify-between gap-3 border-t border-[var(--ui-hairline)] pt-1">
                  <span className="font-bold">合計</span>
                  <span className="tabular-nums font-bold">{yen(totals.total)}</span>
                </li>
              </ul>
            )}
          </div>
          <div className="ui-card p-4">
            <h3 className="mb-2 font-bold">船ごとの合計</h3>
            {totals.byVessel.length === 0 ? (
              <p className="text-sm text-foreground-500">集計できる経費はありません。</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {totals.byVessel.map((v) => (
                  <li key={v.key} className="flex items-baseline justify-between gap-3">
                    <span>
                      {v.key}
                      <span className="ml-1 text-xs text-foreground-500">{v.count}件</span>
                    </span>
                    <span className="tabular-nums font-semibold">{yen(v.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="ui-card overflow-x-auto">
          {expenses.length === 0 ? (
            <p className="p-4 text-sm text-foreground-500">登録された経費はありません。</p>
          ) : (
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
                  <th className="px-4 py-2 font-medium">支出日</th>
                  <th className="px-2 py-2 font-medium">区分</th>
                  <th className="px-2 py-2 font-medium">件名</th>
                  <th className="px-2 py-2 font-medium">金額</th>
                  <th className="px-2 py-2 font-medium">支払先</th>
                  <th className="px-2 py-2 font-medium">船</th>
                  <th className="px-2 py-2 font-medium">領収書</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.record.id} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                    <td className="px-4 py-2 tabular-nums">{e.record.spentOn}</td>
                    <td className="px-2 py-2">{t.expenseKind[e.record.kind]}</td>
                    <td className="px-2 py-2 font-semibold">{e.record.title}</td>
                    <td className="px-2 py-2 tabular-nums">{yen(e.record.amount)}</td>
                    <td className="px-2 py-2">{e.record.supplier ?? "—"}</td>
                    <td className="px-2 py-2">{e.vesselName}</td>
                    <td className="px-2 py-2 text-xs text-foreground-600">
                      {e.record.receiptRef ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <ExpenseForm vessels={vessels} defaultDate={today} />
      </section>

      {/* ══════ 3.6.2 船員給与 ══════ */}
      <section id="payrolls" aria-label="船員給与" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">船員給与</h2>
        <div className="ui-card flex flex-wrap items-center gap-2 p-4">
          <span className="text-sm text-foreground-500">対象月</span>
          {payrollMonths.map((m) => (
            <Link
              key={m}
              href={`/shore/office?month=${m}#payrolls`}
              className={`rounded-medium px-3 py-1.5 text-sm tabular-nums ${
                m === month ? "bg-primary text-primary-foreground" : "bg-default-100"
              }`}
            >
              {m}
            </Link>
          ))}
        </div>
        <p className="ui-card p-4 text-sm text-foreground-600">
          時間外は打刻から計算し、設定のまるめ単位（{officeRules.payrollRoundingUnitMinutes}分・
          {officeRules.payrollRoundingMode === "nearest"
            ? "四捨五入"
            : officeRules.payrollRoundingMode === "floor"
              ? "切り捨て"
              : "切り上げ"}
          ）を当てはめた値を給与に渡します。まるめの前後を並べて出しているので、まるめで
          どれだけ増減するかが確認できます。支給額はその場で計算した表示で、保存はしていません。
        </p>
        <div className="ui-card overflow-x-auto">
          {payrolls.length === 0 ? (
            <p className="p-4 text-sm text-foreground-500">この月の給与はまだありません。</p>
          ) : (
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
                  <th className="px-4 py-2 font-medium">船員</th>
                  <th className="px-2 py-2 font-medium">基本給</th>
                  <th className="px-2 py-2 font-medium">手当</th>
                  <th className="px-2 py-2 font-medium">時間外（打刻の実績→まるめ後）</th>
                  <th className="px-2 py-2 font-medium">時間外手当</th>
                  <th className="px-2 py-2 font-medium">控除</th>
                  <th className="px-2 py-2 font-medium">支給額</th>
                  <th className="px-2 py-2 font-medium">状態</th>
                </tr>
              </thead>
              <tbody>
                {payrolls.map((p) => (
                  <tr key={p.record.id} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                    <td className="px-4 py-2 font-semibold">{p.crewName}</td>
                    <td className="px-2 py-2 tabular-nums">{yen(p.record.baseAmount)}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {yen(p.allowanceTotal)}
                      <span className="block text-xs text-foreground-500">
                        {Object.entries(p.record.allowances ?? {})
                          .map(([name, v]) => `${name} ${v.toLocaleString("ja-JP")}`)
                          .join(" / ") || "—"}
                      </span>
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {p.hasRecords ? (
                        <>
                          {fmtMinutes(p.overtime.rawMinutes)} → {fmtMinutes(p.overtime.roundedMinutes)}
                          <span className="block text-xs text-foreground-500">
                            まるめで
                            {p.overtime.diffMinutes === 0
                              ? "変わりません"
                              : `${p.overtime.diffMinutes > 0 ? "+" : ""}${p.overtime.diffMinutes}分`}
                          </span>
                        </>
                      ) : (
                        <span className="text-warning-700">⚠ この月の打刻はまだありません</span>
                      )}
                      <span className="block text-xs text-foreground-500">
                        {p.record.status === "draft"
                          ? `計算中の値 ${fmtMinutes(p.record.overtimeMinutes ?? 0)}`
                          : `確定値 ${fmtMinutes(p.record.overtimeMinutes ?? 0)}（${
                              p.record.roundingUnitMinutes ?? officeRules.payrollRoundingUnitMinutes
                            }分単位でまるめ）`}
                      </span>
                    </td>
                    <td className="px-2 py-2 tabular-nums">{yen(p.record.overtimeAmount)}</td>
                    <td className="px-2 py-2 tabular-nums">
                      −{p.deductionTotal.toLocaleString("ja-JP")}円
                      <span className="block text-xs text-foreground-500">
                        {Object.entries(p.record.deductions ?? {})
                          .map(([name, v]) => `${name} ${v.toLocaleString("ja-JP")}`)
                          .join(" / ") || "—"}
                      </span>
                    </td>
                    <td className="px-2 py-2 tabular-nums font-bold">{yen(p.netAmount)}</td>
                    <td className="px-2 py-2">
                      {p.record.status === "draft" ? (
                        <span className="text-warning-700">⚠ {t.payrollStatus.draft}</span>
                      ) : (
                        <span>✓ {t.payrollStatus[p.record.status]}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="px-4 py-3 text-xs text-foreground-500">
            支給額 = 基本給 + 手当 + 時間外手当 − 控除。判定に使ったルール版{" "}
            {payrolls[0]?.appliedRuleVersion ?? "—"}。
          </p>
        </div>
        <PayrollConfirmForm payrolls={draftPayrolls} />
      </section>

      {/* ══════ 3.6.3 補助金・行政手続き ══════ */}
      <section id="subsidies" aria-label="補助金・行政手続き" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">補助金・行政手続き</h2>
        <p className="ui-card p-4 text-sm text-foreground-600">
          船舶の建造・改造に係る補助金、内航海運業法にもとづく届出、海上労働検査への対応資料の準備を
          ここでまとめて管理します。
        </p>
        <div className="ui-card overflow-x-auto">
          {subsidies.length === 0 ? (
            <p className="p-4 text-sm text-foreground-500">登録された手続きはありません。</p>
          ) : (
            <table className="w-full min-w-[940px] text-sm">
              <thead>
                <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
                  <th className="px-4 py-2 font-medium">標題</th>
                  <th className="px-2 py-2 font-medium">区分</th>
                  <th className="px-2 py-2 font-medium">所管</th>
                  <th className="px-2 py-2 font-medium">申請日</th>
                  <th className="px-2 py-2 font-medium">期限</th>
                  <th className="px-2 py-2 font-medium">金額</th>
                  <th className="px-2 py-2 font-medium">状態</th>
                </tr>
              </thead>
              <tbody>
                {subsidies.map((s) => (
                  <tr key={s.record.id} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                    <td className="px-4 py-2 font-semibold">
                      {s.record.title}
                      {s.record.body ? (
                        <span className="block text-xs font-normal text-foreground-500">
                          {s.record.body}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">{t.subsidyCategory[s.record.category]}</td>
                    <td className="px-2 py-2">{s.record.authority ?? "—"}</td>
                    <td className="px-2 py-2 tabular-nums">{s.record.appliedOn ?? "—"}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {s.record.dueOn ?? "—"}
                      {s.overdue ? (
                        <span className="block text-xs text-danger">✕ 期限を過ぎています</span>
                      ) : s.daysToDue !== null && s.daysToDue >= 0 && s.record.status !== "done" ? (
                        <span className="block text-xs text-foreground-500">あと {s.daysToDue}日</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{yen(s.record.amount)}</td>
                    <td className="px-2 py-2">{t.subsidyStatus[s.record.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <SubsidyForm />
        <SubsidyStatusForm subsidies={subsidyOptions} />
      </section>
    </div>
  );
}
