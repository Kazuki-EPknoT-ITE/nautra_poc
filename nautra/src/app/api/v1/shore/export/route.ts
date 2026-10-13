import { canShore } from "@/domain/authz/shore-roles";
import { contentDisposition, csvEncodingOf, csvResponse, CSV_ENCODING_LABEL } from "@/server/csv-response";
import {
  buildExportRows,
  EXPORT_EXTENSION,
  exportFileBase,
  exportFormatOf,
  exportSetById,
  toCsv,
  type ExportFormat,
} from "@/server/export-service";
import { writeAuditLog } from "@/server/master-service";
import { getShoreSession } from "@/server/shore-session";
import { buildXlsx, XLSX_CONTENT_TYPE } from "@/server/xlsx";

export const dynamic = "force-dynamic";

const FORMAT_LABEL: Record<ExportFormat, string> = {
  xlsx: "Excel ブック",
  csv: "カンマ区切りテキスト",
  tsv: "タブ区切りテキスト",
};

/**
 * GET /api/v1/shore/export?set=&cols=&format=&encoding=&preview=1 — 各画面の「◯◯を書き出す」。
 *
 * - `preview=1` は書き出しの問いかけに出す**列と先頭5行**を JSON で返す（監査ログには残さない）
 * - それ以外はファイルを返し、**書き出したことを監査ログに残す**（12.6。誰が何をいつ持ち出したか）
 * - `format` は xlsx（既定）/ csv / tsv。文字コード（`encoding`）は区切りテキストのときだけ効く
 */
export async function GET(req: Request): Promise<Response> {
  const staff = await getShoreSession();
  if (!staff || !canShore(staff.role, "manage_documents")) {
    return new Response("この操作を行う権限がありません", { status: 403 });
  }

  const url = new URL(req.url);
  const set = exportSetById(url.searchParams.get("set") ?? "");
  if (!set) return new Response("不明な書き出し対象です", { status: 400 });

  const all = buildExportRows(set.id);

  if (url.searchParams.get("preview") === "1") {
    return Response.json(
      {
        label: set.label,
        columns: set.columns,
        rows: all.slice(0, 5),
        total: all.length,
        fileBase: exportFileBase(set.id),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const requested = (url.searchParams.get("cols") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const columns = requested.length > 0 ? set.columns.filter((c) => requested.includes(c)) : set.columns;
  if (columns.length === 0) return new Response("書き出す列を1つ以上選んでください", { status: 400 });
  const keep = columns.map((c) => set.columns.indexOf(c));
  const rows = all.map((r) => keep.map((i) => r[i] ?? ""));

  const format = exportFormatOf(url.searchParams.get("format"));
  const fileName = `${exportFileBase(set.id)}.${EXPORT_EXTENSION[format]}`;

  let response: Response;
  let detail: string;
  if (format === "xlsx") {
    response = new Response(new Uint8Array(buildXlsx(set.label, columns, rows)), {
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": contentDisposition(fileName),
        "Cache-Control": "no-store",
      },
    });
    detail = FORMAT_LABEL.xlsx;
  } else {
    const encoding = csvEncodingOf(url.searchParams.get("encoding"));
    const made = csvResponse(toCsv(columns, rows, format === "tsv" ? "\t" : ","), fileName, encoding);
    response = made.response;
    detail =
      `${FORMAT_LABEL[format]} / ${CSV_ENCODING_LABEL[encoding]}` +
      (made.replaced > 0 ? `。${made.replaced}文字は Shift_JIS に無いため ? に置き換え` : "");
  }

  writeAuditLog({
    action: "export",
    entityKind: "data_export",
    entityId: set.id,
    actor: staff.id,
    summary: `${set.label} を書き出し（${rows.length}行 / ${columns.length}列 / ${detail}）`,
  });

  return response;
}
