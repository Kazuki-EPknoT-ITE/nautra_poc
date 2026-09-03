import { NextResponse } from "next/server";
import { eventsSince, getSyncStats } from "@/server/store";

export const dynamic = "force-dynamic";

/** バッチ上限（基本設計書 8.2）。端末は回線に応じてこれ以下を要求できる */
const MAX_BATCH = 500;

/**
 * GET /api/v1/sync/pull?since=<version>&limit=<n> — 陸上→船内の差分配信
 * （バージョンカーソル方式。基本設計書 7.2 / 8.1）。
 *
 * 端末はカーソルを保存し、次回はその続きから再開する（再開可能）。
 * 応答には隔離件数（8.6: 同期状態画面に表示）とストア識別子（作り直し検知）を含める。
 *
 * **帯域適応**（要件定義書 10.1「通信量を抑えた差分同期・データ圧縮。衛星通信の普及を
 * 見据えた帯域適応」）: `limit` で 1 回に受け取る件数を端末が絞れる。
 * 細い回線では小さく刻み、途中で切れても `nextCursor` から再開できる。
 * 上限を超える要求は MAX_BATCH に丸める（サーバを守る）。
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

  const rawLimit = url.searchParams.get("limit");
  const limit =
    rawLimit === null
      ? MAX_BATCH
      : Math.min(MAX_BATCH, Math.max(1, Math.floor(Number(rawLimit)) || MAX_BATCH));

  const pending = eventsSince(since);
  const batch = pending.slice(0, limit);
  const stats = getSyncStats();
  return NextResponse.json({
    events: batch,
    nextCursor: batch.length > 0 ? batch[batch.length - 1].serverSeq : since,
    serverVersion: stats.serverVersion,
    hasMore: batch.length > 0 && batch[batch.length - 1].serverSeq < stats.serverVersion,
    /** 残りの件数（端末が進捗を出せるようにする。8.4 同期状態の可視化） */
    remaining: Math.max(0, pending.length - batch.length),
    quarantineCount: stats.quarantineCount,
    storeId: stats.storeId,
  });
}
