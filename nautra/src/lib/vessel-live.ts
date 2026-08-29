"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getMeta } from "./vessel-db";
import { syncNow } from "./vessel-sync";

/**
 * 陸上の更新通知（SSE）を受けて即座に Pull する。
 *
 * シフト・配置表の変更を船内へ**すぐに**反映するための経路。通知は「版が変わった」
 * 合図だけで、取り込みは従来の Pull（カーソル方式）に任せる。したがって通知が
 * 届かない環境でも定期同期で同じ結果になり、オフライン耐性は変わらない（8.1）。
 * 擬似オフライン中は接続しない（通信断のデモを壊さない）。
 */
export function useLiveSync(): void {
  // 解決前（undefined）は接続しない。オフライン解除で再接続する
  const offline = useLiveQuery(async () => (await getMeta("offlineSim")) === "1", []);

  useEffect(() => {
    if (offline !== false) return;
    const es = new EventSource("/api/v1/sync/stream");
    es.onmessage = (ev) => {
      void (async () => {
        try {
          const { serverVersion } = JSON.parse(ev.data) as { serverVersion: number };
          const cursor = Number((await getMeta("pullCursor")) ?? "0");
          // 端末が取り込み済みの位置より先に進んでいるときだけ取りに行く
          if (serverVersion > cursor) await syncNow();
        } catch {
          // 壊れた通知は無視する（次の通知か定期同期で追いつく）
        }
      })();
    };
    // 切断時はブラウザが自動再接続する。失敗し続けても定期同期（60秒）が残る
    return () => es.close();
  }, [offline]);
}
