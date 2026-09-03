"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { t } from "@/i18n/ja";
import { fmtDateTime } from "@/lib/format";
import { useLocalConflictCount, useSyncBadge } from "@/lib/vessel-hooks";
import { vesselDb } from "@/lib/vessel-db";
import { setOfflineSim, syncNow, type SyncResult } from "@/lib/vessel-sync";
import { Button, Card, CardBody, CardHeader, Chip, Divider, Switch } from "@/ui";
import { GroupHeader } from "../_components/group-header";

/**
 * V-09 同期状態。未同期件数・最終同期日時・競合件数・隔離件数の常時可視化と手動同期
 * （基本設計書 8.4 / 8.6）。擬似オフライントグルで通信断→復帰→自動回復を検証できる。
 */
export default function SyncPage() {
  const {
    pendingCount,
    offlineSim,
    lastSyncAt,
    lastSyncError,
    pullCursor,
    serverQuarantineCount,
    localQuarantineCount,
  } = useSyncBadge();
  const conflictCount = useLocalConflictCount();
  const [result, setResult] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);

  const outboxPreview =
    useLiveQuery(() => vesselDb.outbox.orderBy("queuedAt").limit(10).toArray(), [], []) ?? [];
  const localCounts = useLiveQuery(
    async () => ({
      timeRecords: await vesselDb.timeRecords.count(),
      approvals: await vesselDb.approvals.count(),
      records: await vesselDb.records.count(),
    }),
    [],
    { timeRecords: 0, approvals: 0, records: 0 },
  ) ?? { timeRecords: 0, approvals: 0, records: 0 };

  async function manualSync() {
    setSyncing(true);
    try {
      setResult(await syncNow());
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="06" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card shadow="none" className="ui-card">
          <CardBody>
            <p className="text-sm text-foreground-600">未同期イベント</p>
            <p className="tabular-nums text-3xl font-bold">
              {pendingCount}
              <span className="ml-1 text-base font-normal">件</span>
            </p>
          </CardBody>
        </Card>
        <Card shadow="none" className={conflictCount > 0 ? "ui-card border border-danger" : "ui-card"}>
          <CardBody>
            <p className="text-sm text-foreground-600">競合（要確認）</p>
            <p className="tabular-nums text-3xl font-bold">
              {conflictCount}
              <span className="ml-1 text-base font-normal">件</span>
            </p>
            <p className="text-xs text-foreground-600">
              打刻は追記型で構造的に競合しない。同一記録への複数の訂正・変更（分岐）は双方保持して要確認
            </p>
          </CardBody>
        </Card>
        <Card shadow="none" className="ui-card">
          <CardBody>
            <p className="text-sm text-foreground-600">最終同期日時</p>
            <p className="tabular-nums font-bold">
              {lastSyncAt ? fmtDateTime(lastSyncAt) : "未同期"}
            </p>
          </CardBody>
        </Card>
        <Card shadow="none" className="ui-card">
          <CardBody>
            <p className="text-sm text-foreground-600">受信カーソル（Pull）</p>
            <p className="tabular-nums font-bold">v{pullCursor ?? "0"}</p>
            <p className="text-xs text-foreground-600">切断後もこの続きから再開（再開可能）</p>
          </CardBody>
        </Card>
        <Card shadow="none" className="ui-card">
          <CardBody>
            <p className="text-sm text-foreground-600">隔離（未知種別）</p>
            <p className="tabular-nums text-3xl font-bold">
              {serverQuarantineCount + localQuarantineCount}
              <span className="ml-1 text-base font-normal">件</span>
            </p>
            <p className="text-xs text-foreground-600">
              陸上側 {serverQuarantineCount} / 端末側 {localQuarantineCount}。未対応の種別は破棄せず隔離し、更新後に再処理
            </p>
          </CardBody>
        </Card>
        <Card shadow="none" className="ui-card">
          <CardBody>
            <p className="text-sm text-foreground-600">端末内の記録（IndexedDB）</p>
            <p className="tabular-nums text-sm">
              打刻 <span className="font-bold">{localCounts.timeRecords}</span> / 承認{" "}
              <span className="font-bold">{localCounts.approvals}</span> / 船内記録・シフト{" "}
              <span className="font-bold">{localCounts.records}</span>
            </p>
            <p className="text-xs text-foreground-600">通信断でもここに蓄積され、復帰時に転送される</p>
          </CardBody>
        </Card>
      </div>

      <Card shadow="none" className="ui-card">
        <CardHeader className="font-bold">通信・同期操作</CardHeader>
        <Divider />
        <CardBody className="flex flex-col gap-4">
          <Switch
            isSelected={offlineSim}
            onValueChange={(v) => void setOfflineSim(v)}
            color="warning"
          >
            擬似オフライン（通信断をシミュレート。記録は端末に蓄積されます）
          </Switch>
          <Button
            color="primary"
            className="min-h-14 text-lg"
            isLoading={syncing}
            onPress={() => void manualSync()}
          >
            手動同期を実行
          </Button>
          {result ? (
            <Chip
              variant="flat"
              radius="sm"
              color={result.ok ? "success" : result.skippedOffline ? "warning" : "danger"}
              className="h-auto whitespace-normal py-1"
            >
              {result.ok
                ? `✓ 同期完了: 送信 ${result.pushed}件 / 受信 ${result.pulled}件`
                : result.skippedOffline
                  ? "⚡ オフラインのため送信をスキップしました（キューに保持）"
                  : `✕ 同期失敗: ${result.error}（キューは保持され、次回同期で再開されます）`}
            </Chip>
          ) : null}
          {lastSyncError ? (
            <p className="text-sm text-danger">直近のエラー: {lastSyncError}</p>
          ) : null}
        </CardBody>
      </Card>

      <Card shadow="none" className="ui-card">
        <CardHeader className="font-bold">送信キュー（先頭10件）</CardHeader>
        <Divider />
        <CardBody>
          {outboxPreview.length === 0 ? (
            <p className="text-foreground-600">キューは空です。すべて同期済みです。</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {outboxPreview.map((o) => (
                <li key={o.eventId} className="tabular-nums">
                  {fmtDateTime(o.queuedAt)} — {t.syncKind[o.event.kind] ?? o.event.kind} ({o.eventId.slice(0, 12)}…)
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
