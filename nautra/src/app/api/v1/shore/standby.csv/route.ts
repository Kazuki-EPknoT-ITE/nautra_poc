import { buildStandbySummary, standbyCsv } from "@/server/document-service";
import { writeAuditLog } from "@/server/master-service";
import { requireShore } from "@/server/shore-session";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/shore/standby.csv?from=&to= — 待機時間・荷役時間の実績集計（S-14 / 要件 3.6.4）。
 *
 * 連携強化ガイドライン（第3版）が求める荷主・オペレーター間協議の基礎資料。
 * PoC は CSV（Excel で開ける）。Excel が UTF-8 と判別できるよう BOM を付ける。
 * 出力は要配慮情報を含まないが、誰が持ち出したかを監査証跡に残す（12.6）。
 */
export async function GET(req: Request): Promise<Response> {
  const guard = await requireShore("manage_documents");
  if (!guard.ok) {
    return new Response("この出力を行う権限がありません", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const rows = buildStandbySummary(from, to);

  writeAuditLog({
    action: "export",
    entityKind: "work_report",
    actor: guard.staff.id,
    summary: `待機時間・荷役時間の実績集計を CSV で出力（${from ?? "すべて"}〜${to ?? "すべて"}）`,
  });

  const body = `﻿${standbyCsv(rows, from, to)}`;
  const suffix = from || to ? `-${from ?? "start"}_${to ?? "end"}` : "";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="standby-cargo${suffix}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
