import { GET as exportGet } from "../export/route";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/shore/export.csv — 旧 S-17 の書き出し口（互換のため残す）。
 *
 * 書き出しは `/api/v1/shore/export` に1本化した（レビュー EXPORT-01）。古いリンクやブックマークから
 * 来ても同じ結果になるよう、形式をカンマ区切りに固定して新しい口へそのまま渡す。
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  url.pathname = "/api/v1/shore/export";
  url.searchParams.set("format", url.searchParams.get("delimiter") === "tab" ? "tsv" : "csv");
  return exportGet(new Request(url, { headers: req.headers }));
}
