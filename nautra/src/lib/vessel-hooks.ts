"use client";

import { trashedIdsOf } from "@/lib/trash";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { TimeRecord } from "@/domain/labor-law/types";
import type { ApprovalPayload } from "@/sync-protocol/events";
import {
  findSupersedeConflicts,
  latestBySupersedes,
  type NoticePayload,
  type RecordKind,
  type RecordTemplatePayload,
  type ShiftPlanPayload,
  type TemplateUsage,
} from "@/sync-protocol/records";
import { can, canSwitchCrew, type Permission } from "@/domain/authz/roles";
import { CREW_MEMBERS, crewById, type CrewMember } from "./crew";
import { effectiveNotices, unreadNotices } from "./notices";
import { builtInChecklistTemplates, effectiveTemplates } from "./record-templates";
import { setSelectedCrewId } from "./vessel-actions";
import { getMeta, vesselDb, type VesselRecordRow } from "./vessel-db";
import { SESSION_CREW_KEY } from "./vessel-session";

/**
 * サインイン中の船員（未サインインは null。読み込み中は undefined）。
 * meta 未設定と読み込み中を区別するため、解決後は必ず文字列（未設定は ""）を返す。
 */
export function useSessionCrew(): CrewMember | null | undefined {
  // 既定値を渡さない = 解決前は undefined（読み込み中）、解決後は "" か船員ID
  const id = useLiveQuery(async () => (await getMeta(SESSION_CREW_KEY)) ?? "", []);
  if (id === undefined) return undefined; // 読み込み中
  return id ? (crewById(id) ?? null) : null;
}

/** サインイン中のロールが権限を持つか（判定は domain/authz に集約） */
export function usePermission(permission: Permission): boolean {
  const session = useSessionCrew();
  return session ? can(session.role, permission) : false;
}

/**
 * 画面が対象とする船員。
 * 本人は自分に固定され、船長（view_all_crew）のみ対象船員を切り替えられる（基本設計書 11.2）。
 */
export function useActiveCrew(): {
  crew: CrewMember;
  select: (id: string) => void;
  canSwitch: boolean;
  session: CrewMember | null | undefined;
} {
  const session = useSessionCrew();
  const selectedId = useLiveQuery(() => getMeta("selectedCrewId"), [], undefined);
  const canSwitch = session ? canSwitchCrew(session.role) : false;
  const selected = (selectedId && crewById(selectedId)) || undefined;
  const crew = canSwitch ? (selected ?? session ?? CREW_MEMBERS[0]) : (session ?? CREW_MEMBERS[0]);
  return { crew, select: (id: string) => void setSelectedCrewId(id), canSwitch, session };
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

/**
 * 配信済みの記録項目テンプレート（上司・陸上が追加した項目を含む有効な最新版）。
 * 未配信の端末では既定のテンプレートにフォールバックし、点検が止まらないようにする。
 */
export function useRecordTemplates(usage: TemplateUsage): RecordTemplatePayload[] {
  const all = useRecords("record_template");
  return useMemo(() => {
    const effective = effectiveTemplates(all, usage);
    if (effective.length > 0) return effective;
    return usage === "checklist" ? builtInChecklistTemplates() : [];
  }, [all, usage]);
}

/**
 * 陸上からのお知らせ・速報（有効なもののみ・新しい順）と未読件数。
 * 取り消し・訂正は supersedesId で置き換えられ、期限切れは表示しない。
 */
export function useNotices(): {
  notices: NoticePayload[];
  unread: NoticePayload[];
  ackAt: string | undefined;
} {
  const all = useRecords("notice");
  const ackAt = useLiveQuery(() => getMeta("noticeAckAt"), [], undefined);
  const readRaw = useLiveQuery(() => getMeta("noticeReadIds"), [], undefined);
  return useMemo(() => {
    const notices = effectiveNotices(all);
    const readIds = new Set<string>(readRaw ? (JSON.parse(readRaw) as string[]) : []);
    return { notices, unread: unreadNotices(notices, ackAt, readIds), ackAt };
  }, [all, ackAt, readRaw]);
}

/** 有効なシフト計画（訂正で無効化されたものを除く）と変更通知の集計（V-08） */
export function useShiftPlans() {
  const recorded = useRecords("shift_plan");
  // 陸上の配置表で外した当直（S-18 のゴミ箱）は船内でも出さない
  const trash = useRecords("trash_entry");
  const ackAt = useLiveQuery(() => getMeta("shiftAckAt"), [], undefined);
  const rejectedRaw = useLiveQuery(() => getMeta("serverQuarantinedIds"), [], undefined);
  return useMemo(() => {
    // 陸上で受け付けられなかった計画（船長以外の記録とみなされた等）は、端末だけで有効にしない（SHIFT-04）
    const rejectedIds = new Set<string>(rejectedRaw ? (JSON.parse(rejectedRaw) as string[]) : []);
    const rejected = recorded.filter((p) => rejectedIds.has(p.id));
    const removed = trashedIdsOf(trash, "当直シフト");
    const all = recorded.filter((p) => !rejectedIds.has(p.id) && !removed.has(p.id));
    const effective = latestBySupersedes(all) as (ShiftPlanPayload & { kind: "shift_plan" })[];
    const watches = effective.filter((p) => p.planType === "watch");
    const stations = effective.filter((p) => p.planType === "station");
    // 変更通知 = 既存計画を置き換えた配信。確認日時（端末状態）より新しいものを未読とする
    const changes = all
      .filter((p) => p.supersedesId)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const unread = changes.filter((c) => !ackAt || c.publishedAt > ackAt);
    const byId = new Map(all.map((p) => [p.id, p]));
    // 自動解決不能な競合（同一原本を複数の変更が置き換えた分岐）。双方保持し「要確認」として提示（8.3）
    const conflicts = findSupersedeConflicts(all);
    const conflictIds = new Set(conflicts.flatMap((c) => c.candidates.map((x) => x.id)));
    return { all, watches, stations, changes, unread, byId, ackAt, conflicts, conflictIds, rejected };
  }, [recorded, trash, ackAt, rejectedRaw]);
}

/** 端末内の競合件数（supersedes 分岐）= 船内記録・シフト計画の全種別を対象に算出 */
export function useLocalConflictCount(): number {
  const rows = useLiveQuery(() => vesselDb.records.toArray(), [], [] as VesselRecordRow[]) ?? [];
  return useMemo(() => {
    const byKind = new Map<string, VesselRecordRow[]>();
    for (const r of rows) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
    let n = 0;
    for (const list of byKind.values()) n += findSupersedeConflicts(list).length;
    return n;
  }, [rows]);
}

export interface SyncBadge {
  pendingCount: number;
  offlineSim: boolean;
  lastSyncAt: string | undefined;
  lastSyncError: string | undefined;
  pullCursor: string | undefined;
  /** 陸上側で隔離されている未知種別の件数（Pull 応答で受領。8.6） */
  serverQuarantineCount: number;
  /** 端末側で隔離した未対応種別の件数（アプリ更新後に再処理。8.6） */
  localQuarantineCount: number;
}

/** 未同期件数・最終同期・擬似オフライン状態（V-09 / ヘッダ常時表示。基本設計書 8.4） */
const EMPTY_BADGE: SyncBadge = {
  pendingCount: 0,
  offlineSim: false,
  lastSyncAt: undefined,
  lastSyncError: undefined,
  pullCursor: undefined,
  serverQuarantineCount: 0,
  localQuarantineCount: 0,
};

export function useSyncBadge(): SyncBadge {
  // 1つの購読にまとめる（ヘッダは全画面に出るため、購読数と再描画を最小にする）
  return (
    useLiveQuery(async () => {
      const [pendingCount, localQuarantineCount, meta] = await Promise.all([
        vesselDb.outbox.count(),
        vesselDb.quarantine.count(),
        vesselDb.meta.bulkGet([
          "offlineSim",
          "lastSyncAt",
          "lastSyncError",
          "pullCursor",
          "serverQuarantineCount",
        ]),
      ]);
      const [offline, at, err, cursor, quarantined] = meta.map((m) => m?.value);
      return {
        pendingCount,
        localQuarantineCount,
        offlineSim: offline === "1",
        lastSyncAt: at || undefined,
        lastSyncError: err || undefined,
        pullCursor: cursor,
        serverQuarantineCount: Number(quarantined ?? "0"),
      } satisfies SyncBadge;
    }, []) ?? EMPTY_BADGE
  );
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

/**
 * 配信済みの船員マスタから顔写真を引く（共用端末は「顔で選ぶ」ほうが速い）。
 * 未配信・未登録なら undefined を返し、画面は頭文字の枠で描く。
 */
export function useCrewPhotos(): Map<string, string> {
  const rows = useRecords("crew_photo");
  return useMemo(() => {
    const map = new Map<string, string>();
    // 同じ船員の版が複数届いていても、いちばん新しい1件だけを使う
    for (const r of latestBySupersedes(rows)) {
      if (!r.removed && r.dataUrl) map.set(r.crewMemberId, r.dataUrl);
    }
    return map;
  }, [rows]);
}

/**
 * 自分に割り当てられた、まだ終わっていない作業（作業指示。レビュー PUNCH-05）。
 * 陸上・船長が割り当てたものが同期で届く。外された作業（ゴミ箱）は出さない。期限の早い順。
 */
export function useMyTasks(crewMemberId: string) {
  const tasks = useRecords("work_task");
  const trash = useRecords("trash_entry");
  return useMemo(() => {
    const removed = trashedIdsOf(trash, "作業タスク");
    return latestBySupersedes(tasks)
      .filter((t) => t.assigneeCrewId === crewMemberId && t.state !== "done" && !removed.has(t.id))
      .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
  }, [tasks, trash, crewMemberId]);
}
