"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { t } from "@/i18n/ja";
import { fmtDateTime } from "@/lib/format";
import { useLocalConflictCount, useSyncBadge } from "@/lib/vessel-hooks";
import { vesselDb } from "@/lib/vessel-db";
import { setOfflineSim, syncNow, type SyncResult } from "@/lib/vessel-sync";
import { StatusChip } from "@/ui";
import { Button, Switch } from "@/ui/heroui";
import { GroupHeader } from "../_components/group-header";

/**
 * V-09 同期状態（基本設計書 8.4 / 8.6）。送っていない記録・最後に送った時刻・確かめが要る記録を
 * 常に見せ、手で送れる。言葉は日常語にし、説明の文ではなく帯の色と記号で状態を伝える（レビュー SYNC-02/03）。
 * 受信カーソル・端末内の件数などの仕組みの値は利用者の判断に使わないので出さない。
 */
export default function SyncPage() {
  const {
    pendingCount,
    offlineSim,
    lastSyncAt,
    lastSyncError,
    serverQuarantineCount,
    localQuarantineCount,
  } = useSyncBadge();
  const conflictCount = useLocalConflictCount();
  const heldCount = serverQuarantineCount + localQuarantineCount;
  const [result, setResult] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);

  const outboxPreview =
    useLiveQuery(() => vesselDb.outbox.orderBy("queuedAt").limit(10).toArray(), [], []) ?? [];

  async function manualSync() {
    setSyncing(true);
    try {
      setResult(await syncNow());
    } finally {
      setSyncing(false);
    }
  }

  // 帯は「送れない（通信なし）」「送っていない記録がある」「すべて送った」の3つだけ
  const state = offlineSim ? "offline" : pendingCount > 0 ? "pending" : "done";
  const band = {
    offline: { icon: "⊘", text: "通信なし", sub: "記録はこの端末に残しています", cls: "!bg-[#EFE9E1] text-[#6F5638]" },
    pending: { icon: "↑", text: `送っていない記録 ${pendingCount}件`, sub: null, cls: "!bg-[#EFE9E1] text-[#6F5638]" },
    done: { icon: "✓", text: "すべて送りました", sub: null, cls: "text-foreground-900" },
  }[state];

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="06" />

      <section aria-label="送った状態" className={`ui-card flex flex-wrap items-center gap-5 border-0 p-5 ${band.cls}`}>
        <span aria-hidden="true" className="text-5xl font-bold leading-none">
          {band.icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-3xl font-bold">{band.text}</span>
          {band.sub ? <span className="text-lg">{band.sub}</span> : null}
          <span className="font-mono text-lg tabular-nums">
            最後に送った時刻 {lastSyncAt ? fmtDateTime(lastSyncAt) : "まだありません"}
          </span>
        </span>
        <Button
          color="primary"
          className="min-h-16 min-w-48 text-xl"
          isLoading={syncing}
          isDisabled={offlineSim}
          onPress={() => void manualSync()}
        >
          いま同期する
        </Button>
      </section>

      {result ? (
        <p className="m-0">
          <StatusChip
            level={result.ok ? "ok" : "caution"}
            size="lg"
            hint={false}
            label={
              result.ok
                ? `送った ${result.pushed}件 ／ 受け取った ${result.pulled}件`
                : result.skippedOffline
                  ? "通信がないので送れませんでした。記録は残っています"
                  : "送れませんでした。記録は残っているので、あとでもう一度押してください"
            }
          />
        </p>
      ) : null}

      {conflictCount > 0 || heldCount > 0 || lastSyncError ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="確かめが要るもの">
          {conflictCount > 0 ? (
            <StatusChip
              level="violation"
              label={`⚡ 確認が必要な記録 ${conflictCount}件`}
              hint="同じ記録が2か所で別々に直されました。どちらも残してあるので、船長か陸上の担当者が確かめます"
            />
          ) : null}
          {heldCount > 0 ? (
            <StatusChip
              level="caution"
              label={`取り込めなかった記録 ${heldCount}件`}
              hint="この版のアプリでは読めない記録です。捨てずに取ってあり、アプリを新しくすると取り込みます"
            />
          ) : null}
          {lastSyncError ? (
            <StatusChip level="caution" label="前回は送れませんでした" hint={lastSyncError} />
          ) : null}
        </div>
      ) : null}

      {outboxPreview.length > 0 ? (
        <section aria-label="まだ送っていない記録" className="ui-card p-0">
          <ul className="m-0 flex list-none flex-col p-0">
            {outboxPreview.map((o) => (
              <li key={o.eventId} className="ui-row flex items-center gap-4 px-4 py-2.5 text-lg">
                <span aria-hidden="true" className="text-[#917351]">
                  ↑
                </span>
                <span className="flex-1">{t.syncKind[o.event.kind] ?? "記録"}</span>
                <span className="font-mono tabular-nums text-foreground-600">{fmtDateTime(o.queuedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="ui-card p-4">
        <Switch isSelected={offlineSim} onValueChange={(v) => void setOfflineSim(v)} color="warning" size="lg">
          通信を切って試す
        </Switch>
      </div>
    </div>
  );
}
