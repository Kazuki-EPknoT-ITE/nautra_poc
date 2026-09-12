import {
  buildExportRows,
  EXPORT_SETS,
  exportFileName,
  exportSetById,
  toCsv,
} from "@/server/export-service";
import { writeAuditLog } from "@/server/master-service";
import { csvEncodingOf, csvResponse, CSV_ENCODING_LABEL } from "@/server/csv-response";
import { getShoreSession } from "@/server/shore-session";
import { canShore } from "@/domain/authz/shore-roles";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/shore/export.csv?set=&cols=&delimiter=&encoding= — S-17 CSV書き出し。
 *
 * 列は画面で選んだものだけを出す（`cols` に列名をカンマ区切りで渡す）。
 * **書き出しは監査ログに残す**（12.6。誰が何をいつ持ち出したかを追えるようにする）。
 */
export async function GET(req: Request): Promise<Response> {
  const staff = await getShoreSession();
  if (!staff || !canShore(staff.role, "manage_documents")) {
    return new Response("この操作を行う権限がありません", { status: 403 });
  }

  const url = new URL(req.url);
  const set = exportSetById(url.searchParams.get("set") ?? EXPORT_SETS[0]!.id);
  if (!set) return new Response("不明な書き出し対象です", { status: 400 });

  const requested = (url.searchParams.get("cols") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const columns = requested.length > 0 ? set.columns.filter((c) => requested.includes(c)) : set.columns;
  const keep = columns.map((c) => set.columns.indexOf(c));
  const delimiter = url.searchParams.get("delimiter") === "tab" ? "\t" : ",";
  const encoding = csvEncodingOf(url.searchParams.get("encoding"));

  const rows = buildExportRows(set.id).map((r) => keep.map((i) => r[i] ?? ""));
  const { response, replaced } = csvResponse(
    toCsv(columns, rows, delimiter),
    exportFileName(set.id),
    encoding,
  );

  writeAuditLog({
    action: "export",
    entityKind: "csv_export",
    entityId: set.id,
    actor: staff.id,
    summary:
      `${set.label} を CSV で書き出し（${rows.length}行 / ${columns.length}列 / ${CSV_ENCODING_LABEL[encoding]}）` +
      (replaced > 0 ? `。${replaced}文字は Shift_JIS に無いため ? に置き換え` : ""),
  });

  return response;
}
