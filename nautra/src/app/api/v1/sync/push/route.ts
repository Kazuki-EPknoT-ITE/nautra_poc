import { NextResponse } from "next/server";
import { syncPushRequestSchema } from "@/sync-protocol/events";
import { pushToStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/sync/push — 船内→陸上の同期イベント一括送信（基本設計書 7.2 / 8章）。
 * 冪等（再送安全）・未知種別は隔離。エラーは RFC 9457 Problem Details 形式。
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return problem(400, "invalid-json", "リクエストボディが JSON として解釈できません");
  }
  const parsed = syncPushRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, "invalid-push-request", "同期リクエストの形式が不正です", {
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  const { deviceId, events } = parsed.data;
  const outcome = pushToStore(deviceId, events);
  return NextResponse.json(outcome);
}

function problem(status: number, type: string, detail: string, extra: object = {}) {
  return NextResponse.json(
    {
      type: `https://example.invalid/problems/${type}`,
      title: type,
      status,
      detail,
      ...extra,
    },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}
