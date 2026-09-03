import Link from "next/link";
import { isLocale, translator, type Locale } from "@/i18n";
import { fmtMinutes } from "@/lib/format";
import { buildLedgerPrint, currentMonth, ledgerCrewOptions } from "@/server/ledger-service";
import { hasShorePermission, requireShore } from "@/server/shore-session";
import { ShoreGuardNotice } from "../../../_components/guard";
import { PrintToolbar } from "./_components/print-toolbar";

export const dynamic = "force-dynamic";

/**
 * 時間の表記も様式の言語に合わせる（見出しだけ英語で数値が「12時間」では様式にならない）。
 * 表示の言い換えはこの1か所に閉じ、画面のあちこちに書き分けを散らさない。
 */
function duration(locale: Locale, minutes: number): string {
  if (locale !== "en") return fmtMinutes(minutes);
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * 労務管理記録簿（第16号の5書式）の印刷ビュー。要件定義書 3.2.2:
 *   「第16号の5書式に準拠した労務管理記録簿の自動生成 / 電子保管と **PDF出力機能**
 *    （**英語版様式にも対応可能な設計とする**）」
 *
 * 設計:
 * - 見出しは **すべて i18n（`translate(locale, "ledger", key)`）から引く**。
 *   `?lang=en` を付けると英語様式になり、様式の追加は辞書にキーを足すだけで済む。
 * - 値は `buildLedgerPrint` のスナップショットのみを使う（画面で判定・集計をしない）。
 * - PDF 化はブラウザの印刷に任せる（外部ライブラリを増やさない）。A4 横に収める。
 */
export default async function LedgerPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ crew?: string; month?: string; lang?: string }>;
}) {
  const guard = await requireShore("view_dashboard");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="労務管理記録簿の印刷" />;
  const canSave = await hasShorePermission("manage_documents");

  const sp = await searchParams;
  const crews = ledgerCrewOptions();
  const crewMemberId = crews.find((c) => c.id === sp.crew)?.id ?? crews[0].id;
  const month = sp.month ?? currentMonth();
  const locale: Locale = isLocale(sp.lang) ? sp.lang : "ja";
  const tr = translator(locale);
  const data = buildLedgerPrint(crewMemberId, month);

  const levelMark: Record<string, string> = { ok: "✓", caution: "⚠", violation: "✕" };
  const approvalLabel = (v: string): string =>
    v === "approved" ? tr("ledger", "approved") : v === "remanded" ? tr("ledger", "remanded") : tr("ledger", "pending");

  const headers: [string, string][] = [
    [tr("ledger", "vessel"), data.vesselName],
    [tr("ledger", "crew"), data.crewName],
    [tr("ledger", "position"), data.position],
    [tr("ledger", "seamanBookNo"), data.seamanBookNo ?? tr("ledger", "none")],
    [tr("ledger", "month"), data.month],
    [tr("ledger", "ruleVersion"), data.appliedRuleVersion],
  ];

  const totals: [string, string][] = [
    [tr("ledger", "worked"), duration(locale, data.totals.workedMinutes)],
    [tr("ledger", "workedDays"), String(data.totals.workedDays)],
    [tr("ledger", "restDays"), String(data.totals.restDays)],
    [tr("ledger", "overtime"), duration(locale, data.totals.overtimeMinutes)],
    [tr("ledger", "weeklyAverage"), duration(locale, data.totals.weeklyAverageMinutes)],
    [tr("ledger", "exceptional"), duration(locale, data.totals.exceptionalMinutes)],
  ];

  return (
    <div className="ledger-print flex flex-col gap-4">
      {/*
        印刷用のレイアウト。材質（ui-*）は画面表示のためのもので紙には出さないため、
        ここだけ用紙サイズと非表示指定を持つ（globals.css は画面の材質に専念させる）。
      */}
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          header, nav, .no-print { display: none !important; }
          main { padding: 0 !important; max-width: none !important; }
          .ledger-print { gap: 6px !important; }
          .ledger-sheet { box-shadow: none !important; border: none !important; }
          .ledger-table { font-size: 9px !important; }
          .ledger-table th, .ledger-table td { padding: 1px 3px !important; }
        }
        .ledger-table { border-collapse: collapse; width: 100%; }
        .ledger-table th, .ledger-table td { border: 1px solid #767676; padding: 3px 6px; }
        .ledger-table th { background: rgba(0,0,0,0.05); font-weight: 600; }
      `}</style>

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <PrintToolbar
          crewMemberId={crewMemberId}
          month={month}
          canSave={canSave}
          printLabel={locale === "en" ? "Print / Save as PDF" : "印刷・PDFで保存"}
          saveLabel={locale === "en" ? "Save to document centre" : "帳票センターに保存"}
        />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-foreground-500">{tr("ledger", "language")}</span>
          {(["ja", "en"] as Locale[]).map((l) => (
            <Link
              key={l}
              href={`/shore/labor/ledger/print?crew=${crewMemberId}&month=${month}&lang=${l}`}
              className={`rounded-medium px-3 py-1.5 ${
                l === locale ? "bg-primary text-primary-foreground" : "bg-default-100"
              }`}
            >
              {l === "ja" ? "日本語" : "English"}
            </Link>
          ))}
          <Link
            href={`/shore/labor?crew=${crewMemberId}&month=${month}`}
            className="rounded-medium bg-default-100 px-3 py-1.5"
          >
            {locale === "en" ? "Back" : "戻る"}
          </Link>
        </div>
      </div>
      <p className="no-print text-sm text-foreground-600">{tr("ledger", "printHint")}</p>

      <section aria-label={tr("ledger", "documentTitle")} className="ledger-sheet ui-card p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold">{tr("ledger", "documentTitle")}</h1>
          <p className="text-xs text-foreground-600">{tr("ledger", "formNote")}</p>
        </div>

        <table className="ledger-table mb-3 text-sm">
          <tbody>
            <tr>
              {headers.slice(0, 3).map(([k]) => (
                <th key={k} className="w-[10%] text-left">
                  {k}
                </th>
              ))}
              {headers.slice(0, 3).map(([k, v]) => (
                <td key={`v-${k}`}>{v}</td>
              ))}
            </tr>
            <tr>
              {headers.slice(3).map(([k]) => (
                <th key={k} className="text-left">
                  {k}
                </th>
              ))}
              {headers.slice(3).map(([k, v]) => (
                <td key={`v-${k}`} className="tabular-nums">
                  {v}
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        <div className="overflow-x-auto">
          <table className="ledger-table text-sm">
            <thead>
              <tr>
                <th>{tr("ledger", "date")}</th>
                <th>{tr("ledger", "worked")}</th>
                <th>{tr("ledger", "restTotal")}</th>
                <th>{tr("ledger", "restSplit")}</th>
                <th>{tr("ledger", "restLongest")}</th>
                <th>{tr("ledger", "exceptional")}</th>
                <th>{tr("ledger", "restDay")}</th>
                <th>{tr("ledger", "judgement")}</th>
                <th>{tr("ledger", "approval")}</th>
                <th>{tr("ledger", "approver")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.date}>
                  <td className="tabular-nums">{r.date}</td>
                  <td className="tabular-nums">{duration(locale, r.workedMinutes)}</td>
                  <td className="tabular-nums">{duration(locale, r.restTotalMinutes)}</td>
                  <td className="tabular-nums">{r.restSplit}</td>
                  <td className="tabular-nums">{duration(locale, r.restLongestMinutes)}</td>
                  <td className="tabular-nums">
                    {r.exceptionalMinutes > 0 ? duration(locale, r.exceptionalMinutes) : tr("ledger", "none")}
                  </td>
                  <td>{r.isRestDay ? "○" : tr("ledger", "none")}</td>
                  <td>{levelMark[r.level] ?? ""}</td>
                  <td>{approvalLabel(r.approval)}</td>
                  <td>{r.approver || tr("ledger", "none")}</td>
                </tr>
              ))}
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center">
                    {tr("ledger", "none")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <table className="ledger-table text-sm">
            <tbody>
              <tr>
                <th colSpan={2} className="text-left">
                  {tr("ledger", "total")}
                </th>
              </tr>
              {totals.map(([k, v]) => (
                <tr key={k}>
                  <th className="w-1/2 text-left">{k}</th>
                  <td className="tabular-nums">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="ledger-table text-sm">
            <tbody>
              <tr>
                <th className="w-1/3 text-left">{tr("ledger", "managerSign")}</th>
                <td>
                  <span className="text-foreground-500">{tr("ledger", "signName")}: </span>
                  {data.approver?.name ?? ""}
                </td>
              </tr>
              <tr>
                <th className="text-left">{tr("ledger", "signDate")}</th>
                <td className="tabular-nums">
                  {data.approver ? data.approver.decidedAt.slice(0, 10) : ""}
                </td>
              </tr>
              <tr>
                <th className="text-left">{tr("ledger", "captainSign")}</th>
                <td />
              </tr>
              <tr>
                <th className="text-left">{tr("ledger", "generatedAt")}</th>
                <td className="tabular-nums">{data.generatedAt.slice(0, 19).replace("T", " ")}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-xs text-foreground-600">{tr("ledger", "sourceNote")}</p>
      </section>
    </div>
  );
}
