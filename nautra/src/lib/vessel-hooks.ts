"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { TimeRecord } from "@/domain/labor-law/types";
import type { ApprovalPayload } from "@/sync-protocol/events";
import { CREW_MEMBERS, crewById, type CrewMember } from "./crew";
import { setSelectedCrewId } from "./vessel-actions";
import { getMeta, vesselDb } from "./vessel-db";

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

export interface SyncBadge {
  pendingCount: number;
  offlineSim: boolean;
  lastSyncAt: string | undefined;
  lastSyncError: string | undefined;
  pullCursor: string | undefined;
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
  return { pendingCount, offlineSim, lastSyncAt, lastSyncError, pullCursor };
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
