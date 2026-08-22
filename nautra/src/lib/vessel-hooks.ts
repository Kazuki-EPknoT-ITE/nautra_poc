"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { TimeRecord } from "@/domain/labor-law/types";
import type { ApprovalPayload } from "@/sync-protocol/events";
import { latestBySupersedes, type RecordKind, type ShiftPlanPayload } from "@/sync-protocol/records";
import { CREW_MEMBERS, crewById, type CrewMember } from "./crew";
import { setSelectedCrewId } from "./vessel-actions";
import { getMeta, vesselDb, type VesselRecordRow } from "./vessel-db";

/** 選択中の打刻者（共用端末の打刻者選択方式。基本設計書 11.3） */
export function useSelectedCrew(): [CrewMember, (id: string) => void] {
  const selectedId = useLiveQuery(() => getMeta("selectedCrewId"), [], undefined);
  const crew = (selectedId && crewById(selectedId)) || CREW_MEMBERS[0];
  return [crew, (id: string) => void setSelectedCrewId(id)];
}

export function useCrewRecords(crewMemberId: string): TimeRecord[] {
  return (
    useLiveQuery(
      () => vesselDb.timeRecords.where("crewMemberId").equals(crewMemberId).toArray(),
      [crewMemberId],
      [] as TimeRecord[],
    ) ?? []
  );
}

export function useAllRecords(): TimeRecord[] {
  return useLiveQuery(() => vesselDb.timeRecords.toArray(), [], [] as TimeRecord[]) ?? [];
}

export function useApprovals(): ApprovalPayload[] {
  return useLiveQuery(() => vesselDb.approvals.toArray(), [], [] as ApprovalPayload[]) ?? [];
}

/** 船内記録（種別指定）。新しい順。訂正済（superseded）を含む全件を返す */
export function useRecords<K extends RecordKind>(kind: K): VesselRecordRow<K>[] {
  const rows = useLiveQuery(
    () => vesselDb.records.where("kind").equals(kind).toArray(),
    [kind],
    [] as VesselRecordRow[],
  ) as VesselRecordRow<K>[] | undefined;
  return useMemo(
    () => [...(rows ?? [])].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [rows],
  );
}

/** 有効なシフト計画（訂正で無効化されたものを除く）と変更通知の集計（V-08） */
export function useShiftPlans() {
  const all = useRecords("shift_plan");
  const ackAt = useLiveQuery(() => getMeta("shiftAckAt"), [], undefined);
  return useMemo(() => {
    const effective = latestBySupersedes(all) as (ShiftPlanPayload & { kind: "shift_plan" })[];
    const watches = effective.filter((p) => p.planType === "watch");
    const stations = effective.filter((p) => p.planType === "station");
    // 変更通知 = 既存計画を置き換えた配信。確認日時（端末状態）より新しいものを未読とする
    const changes = all
      .filter((p) => p.supersedesId)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const unread = changes.filter((c) => !ackAt || c.publishedAt > ackAt);
    const byId = new Map(all.map((p) => [p.id, p]));
    return { all, watches, stations, changes, unread, byId, ackAt };
  }, [all, ackAt]);
}

export interface SyncBadge {
  pendingCount: number;
  offlineSim: boolean;
  lastSyncAt: string | undefined;
  lastSyncError: string | undefined;
  pullCursor: string | undefined;
  /** 陸上側で隔離されている未知種別の件数（Pull 応答で受領。8.6） */
  serverQuarantineCount: number;
}

/** 未同期件数・最終同期・擬似オフライン状態（V-09 / ヘッダ常時表示。基本設計書 8.4） */
export function useSyncBadge(): SyncBadge {
  const pendingCount = useLiveQuery(() => vesselDb.outbox.count(), [], 0) ?? 0;
  const offlineSim = useLiveQuery(async () => (await getMeta("offlineSim")) === "1", [], false) ?? false;
  const lastSyncAt = useLiveQuery(() => getMeta("lastSyncAt"), [], undefined);
  const lastSyncError = useLiveQuery(async () => {
    const v = await getMeta("lastSyncError");
    return v || undefined;
  }, [], undefined);
  const pullCursor = useLiveQuery(() => getMeta("pullCursor"), [], undefined);
  const serverQuarantineCount =
    useLiveQuery(async () => Number((await getMeta("serverQuarantineCount")) ?? "0"), [], 0) ?? 0;
  return { pendingCount, offlineSim, lastSyncAt, lastSyncError, pullCursor, serverQuarantineCount };
}

/** 現在時刻（経過表示用に intervalMs ごとに更新） */
export function useNowTick(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
