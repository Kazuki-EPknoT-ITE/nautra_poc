import { getStoreVersion } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/sync/stream — 陸上の更新通知（Server-Sent Events）。
 *
 * 配置表・シフトの変更を船内へ**すぐに**反映するための通知経路。
 * 送るのは「版が変わった」ことだけで、データ本体は従来どおり Pull（カーソル方式）で
 * 取り直す。こうすることでオフライン耐性（8.1）と冪等・再開可能性（8.2）を崩さずに、
 * 通知が届かない環境でも定期同期だけで同じ結果になる。
 * 本番では Supabase Realtime に置き換える。
 */
const POLL_MS = 1000;
const HEARTBEAT_MS = 25_000;

export async function GET(req: Request): Promise<Response> {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastVersion = -1;
      let sinceHeartbeat = 0;
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // 切断済み（クライアントが閉じた直後）。cancel で後始末される
        }
      };
      const tick = () => {
        const { storeId, serverVersion } = getStoreVersion();
        if (serverVersion !== lastVersion) {
          lastVersion = serverVersion;
          sinceHeartbeat = 0;
          send(`data: ${JSON.stringify({ storeId, serverVersion })}\n\n`);
          return;
        }
        sinceHeartbeat += POLL_MS;
        if (sinceHeartbeat >= HEARTBEAT_MS) {
          sinceHeartbeat = 0;
          send(": ping\n\n"); // 経路維持（コメント行はクライアントで無視される）
        }
      };
      tick(); // 接続直後に現在の版を伝える（取りこぼしの検知に使う）
      timer = setInterval(tick, POLL_MS);
      req.signal.addEventListener("abort", () => {
        if (timer) clearInterval(timer);
      });
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // プロキシのバッファリング抑止
    },
  });
}
