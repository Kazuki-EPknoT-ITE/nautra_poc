import { fmtDateTime } from "@/lib/format";
import { personName } from "@/lib/crew";
import { listAuditLogs } from "@/server/master-service";
import { requireShore } from "@/server/shore-session";
import { buildExportRows, EXPORT_SETS, exportSetById } from "@/server/export-service";
import { Section } from "@/ui";
import { ShoreGuardNotice } from "../_components/guard";
import { ExportPanel } from "./_components/export-panel";

export const dynamic = "force-dynamic";

/**
 * S-17 CSV書き出し（デザイン正本 `design/poc_design`）。
 *
 * 帳票センター（S-14）が「法定様式を作る」場所なのに対し、こちらは
 * **手元で集計し直すためにデータを持ち出す**場所。列を選び、中身を見てから落とせるように
 * する（開いてから「列が足りない」と気づくのを防ぐ）。書き出しは監査ログに残る（12.6）。
 */
export default async function ShoreExportsPage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string }>;
}) {
  const guard = await requireShore("manage_documents");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="CSV書き出し" />;

  const sp = await searchParams;
  const active = exportSetById(sp.set ?? "") ?? EXPORT_SETS[0]!;

  /** プレビューは先頭5行だけ。全件を描くと、選び直すたびに重くなる */
  const rows = buildExportRows(active.id);
  const preview = rows.slice(0, 5);

  const history = listAuditLogs(200)
    .filter((a) => a.action === "export")
    .slice(0, 8)
    .map((a) => ({
      at: fmtDateTime(a.occurredAt),
      summary: a.summary ?? "書き出し",
      who: personName(a.actor),
    }));

  return (
    <>
      <ExportPanel
        sets={EXPORT_SETS}
        activeId={active.id}
        columns={active.columns}
        preview={preview}
        totalRows={rows.length}
      />

      <Section title="書き出し履歴" note="監査ログから" bodyClassName="p-0">
        {history.length === 0 ? (
          <p className="m-0 px-[18px] py-5 text-sm text-foreground-500">
            まだ書き出しはありません。書き出すと、誰がいつ何を持ち出したかがここに残ります。
          </p>
        ) : (
          history.map((h, i) => (
            <div key={i} className="border-b border-[var(--ui-hairline)] px-[18px] py-3 last:border-b-0">
              <p className="m-0 font-mono text-xs text-foreground-500">{h.at}</p>
              <p className="m-0 mt-1 text-base text-foreground-800">{h.summary}</p>
              <p className="m-0 mt-0.5 text-xs text-foreground-400">{h.who}</p>
            </div>
          ))
        )}
      </Section>
    </>
  );
}
