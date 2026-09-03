import Link from "next/link";
import { notFound } from "next/navigation";
import { t } from "@/i18n/ja";
import { filingRowOf } from "@/server/filing-service";
import { requireShore } from "@/server/shore-session";
import type { GeneratedDocumentPayload } from "@/sync-protocol/records";
import { ShoreGuardNotice } from "../../../_components/guard";

export const dynamic = "force-dynamic";

/**
 * 生成した提出書類の印刷用ビュー（要件定義書 3.8.3③⑤ / 9章）。
 *
 * 表示は `generated_document.snapshot`（**生成時点のマスタ値**）だけを読む。
 * 以後にマスタが更新されても提出物の中身は変わらない（12.3 提出物は書き換えない）。
 * PDF はブラウザの印刷機能で出す前提とし、`@media print` で余計な枠を落とす。
 */

const PRINT_CSS = `
.print-sheet { background: #fff; color: #111; }
.print-sheet table { border-collapse: collapse; width: 100%; }
.print-sheet th, .print-sheet td { border: 1px solid #444; padding: 6px 8px; vertical-align: top; }
.print-sheet th { background: #f2f2f2; text-align: left; font-weight: 600; white-space: nowrap; }
@media print {
  header, nav, .no-print { display: none !important; }
  main { max-width: none !important; padding: 0 !important; }
  .print-sheet { break-after: page; box-shadow: none; border: 0; }
  .print-sheet:last-child { break-after: auto; }
}
`;

interface CrewSnapshot {
  crewMemberId?: string;
  name?: string;
  nameKana?: string;
  birthDate?: string;
  seamanBookNo?: string;
  address?: string;
  position?: string;
  credentials?: { category: string; name: string; grade?: string; number?: string; expiresOn?: string }[];
  insurances?: { kind: string; number?: string; acquiredOn?: string; lastVerifiedOn?: string }[];
}

interface FilingDocSnapshot {
  filingType?: string;
  method?: string;
  effectiveOn?: string;
  duty?: string;
  crew?: CrewSnapshot;
  vessel?: { name?: string; grossTonnage?: number; imoNumber?: string; navigationArea?: string; requiredCrew?: number };
  rows?: (CrewSnapshot & {
    no?: number;
    duty?: string;
    onDate?: string;
    licenseName?: string;
    vesselName?: string;
    effectiveOn?: string;
  })[];
  copies?: number;
}

function Field({ label, value }: { label: string; value?: string | number }) {
  return (
    <tr>
      <th scope="row" className="w-40">
        {label}
      </th>
      <td>{value === undefined || value === "" ? "—" : String(value)}</td>
    </tr>
  );
}

/** 雇入（雇止）届出書 第六号書式・雇入契約変更（更新）届出書 */
function FilingSheet({ doc, snap }: { doc: GeneratedDocumentPayload; snap: FilingDocSnapshot }) {
  const crew = snap.crew ?? {};
  const license = crew.credentials?.find((c) => c.category === "license");
  const medical = crew.credentials?.find((c) => c.category === "medical");
  const stcw = crew.credentials?.find((c) => c.category === "stcw_basic");
  const practical = crew.credentials?.find((c) => c.category === "stcw_practical");

  return (
    <section aria-label={doc.title} className="print-sheet glass-tile p-6">
      <h2 className="mb-1 text-center text-lg font-bold">{doc.title}</h2>
      <p className="mb-4 text-center text-xs">
        船員法第37条（雇入契約成立等の届出）／作成日 {doc.generatedOn}
        {doc.submittedOn ? ` ／ ${doc.submittedTo} へ ${doc.submittedOn} 提出` : ""}
      </p>

      <table className="mb-4">
        <tbody>
          <Field label="届出の種別" value={snap.filingType ? t.filingType[snap.filingType] : undefined} />
          <Field label="提出の方式" value={snap.method ? t.filingMethod[snap.method] : undefined} />
          <Field label="船舶の名称" value={snap.vessel?.name} />
          <Field label="総トン数" value={snap.vessel?.grossTonnage ? `${snap.vessel.grossTonnage} トン` : undefined} />
          <Field label="航行区域" value={snap.vessel?.navigationArea} />
          <Field label="職務" value={snap.duty} />
          <Field label="効力発生の年月日" value={snap.effectiveOn} />
        </tbody>
      </table>

      <h3 className="mb-1 text-sm font-bold">船員の情報</h3>
      <table className="mb-4">
        <tbody>
          <Field label="氏名" value={crew.name} />
          <Field label="氏名（カナ）" value={crew.nameKana} />
          <Field label="生年月日" value={crew.birthDate} />
          <Field label="船員手帳番号" value={crew.seamanBookNo} />
          <Field label="住所" value={crew.address} />
          <Field label="海技免状" value={license ? `${license.name}${license.number ? `（${license.number}）` : ""}${license.expiresOn ? ` ${license.expiresOn} まで` : ""}` : undefined} />
          <Field label="健康証明書" value={medical ? `${medical.name}${medical.expiresOn ? `（${medical.expiresOn} まで）` : ""}` : undefined} />
          <Field label="基本訓練修了証" value={stcw?.name} />
          <Field label="実技講習修了証" value={practical?.name} />
        </tbody>
      </table>

      <h3 className="mb-1 text-sm font-bold">保険の加入</h3>
      <table>
        <tbody>
          {(crew.insurances ?? []).length === 0 ? (
            <tr>
              <td>加入情報が登録されていません。</td>
            </tr>
          ) : (
            (crew.insurances ?? []).map((i) => (
              <tr key={i.kind}>
                <th scope="row" className="w-40">
                  {t.insuranceKind[i.kind] ?? i.kind}
                </th>
                <td>
                  {i.number ?? "記号番号なし"}
                  {i.acquiredOn ? ` / 資格取得 ${i.acquiredOn}` : ""}
                  {i.lastVerifiedOn ? ` / 確認 ${i.lastVerifiedOn}` : ""}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

/** クルーリスト（海員名簿第六表）。届出時に2通提出する */
function CrewListSheet({ doc, snap }: { doc: GeneratedDocumentPayload; snap: FilingDocSnapshot }) {
  const rows = snap.rows ?? [];
  return (
    <section aria-label={doc.title} className="print-sheet glass-tile p-6">
      <h2 className="mb-1 text-center text-lg font-bold">{doc.title}</h2>
      <p className="mb-4 text-center text-xs">
        {snap.vessel?.name}
        {snap.vessel?.grossTonnage ? ` / ${snap.vessel.grossTonnage} トン` : ""} ／ 作成日 {doc.generatedOn}
        {snap.copies ? ` ／ ${snap.copies}通 提出` : ""}
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th scope="col">No.</th>
              <th scope="col">氏名</th>
              <th scope="col">生年月日</th>
              <th scope="col">船員手帳番号</th>
              <th scope="col">職務</th>
              <th scope="col">乗船日</th>
              <th scope="col">海技免状</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>乗組員がいません。</td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.crewMemberId}-${i}`}>
                  <td className="tabular-nums">{r.no ?? i + 1}</td>
                  <td>{r.name ?? "—"}</td>
                  <td className="tabular-nums">{r.birthDate ?? "—"}</td>
                  <td className="tabular-nums">{r.seamanBookNo ?? "—"}</td>
                  <td>{r.duty ?? "—"}</td>
                  <td className="tabular-nums">{r.onDate ?? "—"}</td>
                  <td>{r.licenseName ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** 電子届出用 雇入（止）届出書（Excel様式に相当する一括の行データ） */
function ElectronicSheet({ doc, snap }: { doc: GeneratedDocumentPayload; snap: FilingDocSnapshot }) {
  const rows = snap.rows ?? [];
  return (
    <section aria-label={doc.title} className="print-sheet glass-tile p-6">
      <h2 className="mb-1 text-center text-lg font-bold">{doc.title}</h2>
      <p className="mb-4 text-center text-xs">
        {snap.filingType ? t.filingType[snap.filingType] : ""} ／{" "}
        {snap.method ? t.filingMethod[snap.method] : ""} ／ 作成日 {doc.generatedOn}
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th scope="col">氏名</th>
              <th scope="col">生年月日</th>
              <th scope="col">船員手帳番号</th>
              <th scope="col">船名</th>
              <th scope="col">職務</th>
              <th scope="col">効力発生日</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.crewMemberId}-${i}`}>
                <td>{r.name ?? "—"}</td>
                <td className="tabular-nums">{r.birthDate ?? "—"}</td>
                <td className="tabular-nums">{r.seamanBookNo ?? "—"}</td>
                <td>{r.vesselName ?? "—"}</td>
                <td>{r.duty ?? "—"}</td>
                <td className="tabular-nums">{r.effectiveOn ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs">
        国交省オンラインシステムへ登録する電子届出用の様式です（PoC では行データとして表示します）。
      </p>
    </section>
  );
}

export default async function FilingPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const guard = await requireShore("manage_filing");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="届出書類の印刷" />;

  const { id } = await params;
  const row = filingRowOf(id);
  if (!row) notFound();

  return (
    <div className="flex flex-col gap-4">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-balance text-2xl font-bold">
            {t.filingType[row.filing.filingType]} の提出書類
          </h1>
          <p className="text-sm text-foreground-500">
            ブラウザの印刷（Ctrl+P / ⌘P）で PDF にできます。中身は作成した時点の値です。
          </p>
        </div>
        <Link
          href="/shore/filings"
          className="rounded-medium border border-[var(--glass-border)] px-3 py-1.5 text-sm"
        >
          ← 届出の一覧へ
        </Link>
      </div>

      {row.documents.length === 0 ? (
        <p className="text-sm text-foreground-500">この届出にはまだ書類がありません。</p>
      ) : (
        row.documents.map((doc) => {
          const snap = (doc.snapshot ?? {}) as FilingDocSnapshot;
          if (doc.kind === "crew_list") return <CrewListSheet key={doc.id} doc={doc} snap={snap} />;
          if (doc.kind === "electronic_filing_xlsx")
            return <ElectronicSheet key={doc.id} doc={doc} snap={snap} />;
          return <FilingSheet key={doc.id} doc={doc} snap={snap} />;
        })
      )}
    </div>
  );
}
