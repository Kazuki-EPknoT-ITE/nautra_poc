import { CREW_MEMBERS } from "@/lib/crew";
import { buildLedger, currentMonth, ledgerCsv } from "@/server/ledger-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/shore/ledger.csv?crew=&month= — 労務管理記録簿の出力（S-06 / S-14）。
 * PoC は CSV（Excel で開ける）。本番は第16号の5書式の PDF 生成・電子保管に置き換える。
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const crew = url.searchParams.get("crew") ?? CREW_MEMBERS[0].id;
  const month = url.searchParams.get("month") ?? currentMonth();
  const period = buildLedger(crew, month);
  // Excel が UTF-8 と判別できるよう BOM を付ける
  const body = `﻿${ledgerCsv(period)}`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="labor-ledger-${crew}-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
