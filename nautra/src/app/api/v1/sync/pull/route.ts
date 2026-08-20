import { NextResponse } from "next/server";
import { eventsSince, getSyncStats } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/sync/pull?since=<version> — 陸上→船内の差分配信
 * （バージョンカーソル方式。基本設計書 7.2 / 8.1）。
 * 端末はカーソルを保存し、次回はその続きから再開する（再開可能）。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = Number(url.searchParams.get("since") ?? "0");
  if (!Number.isFinite(since) || since < 0) {
    return NextResponse.json(
      {
        type: "https://example.invalid/problems/invalid-cursor",
        title: "invalid-cursor",
        status: 400,
        detail: "since は 0 以上の数値で指定してください",
      },
      { status: 400, headers: { "Content-Type": "application/problem+json" } },
    );
  }
  const batch = eventsSince(since).slice(0, 500); // バッチ上限（8.2）
  const stats = getSyncStats();
  return NextResponse.json({
    events: batch,
    nextCursor: batch.length > 0 ? batch[batch.length - 1].serverSeq : since,
    serverVersion: stats.serverVersion,
    hasMore: batch.length > 0 && batch[batch.length - 1].serverSeq < stats.serverVersion,
  });
}
