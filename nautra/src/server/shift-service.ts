import { addDays, ymdLocal } from "@/domain/labor-law/evaluate";
import { DEMO_TENANT_ID, DEMO_VESSEL, SHORE_PLANNER_ID } from "@/lib/crew";
import { ulid } from "@/lib/ids";
import { makeIdempotencyKey, makeRecordEvent } from "@/sync-protocol/events";
import {
  findSupersedeConflicts,
  latestBySupersedes,
  shiftPlanPayloadSchema,
  type ShiftPlanPayload,
  type ShiftType,
} from "@/sync-protocol/records";
import { getRecordsOfKind, pushToStore } from "./store";

/**
 * 陸上のシフト管理サービス（manning ドメイン。S-10 簡易版）。
 * 計画は陸上正本: 変更は既存計画を supersedes する新規レコードとして配信し、
 * 船内は Pull で受信して「変更通知」として提示する（基本設計書 8.3 計画・実績分離）。
 */

const SHORE_DEVICE = "shore-planner-device";

export interface ShiftWeek {
  today: string;
  days: string[];
  /** crewId|date → 有効なシフト（開始時刻順） */
  cells: Record<string, ShiftPlanPayload[]>;
  changes: ShiftPlanPayload[];
  /** 自動解決不能な競合（同一シフトへの複数の変更）。双方保持して要確認 */
  conflicts: ReturnType<typeof findSupersedeConflicts<ShiftPlanPayload>>;
}

export function getShiftWeek(now = new Date()): ShiftWeek {
  const today = ymdLocal(now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 1));
  const all = getRecordsOfKind("shift_plan");
  const effective = latestBySupersedes(all).filter((p) => p.planType === "watch");
  const cells: Record<string, ShiftPlanPayload[]> = {};
  for (const p of effective) {
    if (!p.date) continue;
    const key = `${p.crewMemberId}|${p.date}`;
    (cells[key] ??= []).push(p);
  }
  for (const arr of Object.values(cells)) arr.sort((a, b) => (a.from ?? "").localeCompare(b.from ?? ""));
  const changes = all
    .filter((p) => p.supersedesId)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { today, days, cells, changes, conflicts: findSupersedeConflicts(all) };
}

export interface PublishShiftChangeInput {
  /** 置き換える既存シフトID */
  supersedesId: string;
  shiftType: ShiftType;
  from: string;
  to: string;
  changeNote?: string;
  /**
   * 変更イベントID（冪等キーの元）。画面側で採番して渡すと再試行・二重送信が同一イベントになる。
   * 省略時はサーバで採番する（PoC）。
   */
  changeId?: string;
}

/** シフト変更を配信する（既存計画を無効化する新規レコードを追記。原本は保持） */
export function publishShiftChange(input: PublishShiftChangeInput, now = new Date()): ShiftPlanPayload {
  const all = getRecordsOfKind("shift_plan");
  const original = all.find((p) => p.id === input.supersedesId);
  if (!original || original.planType !== "watch" || !original.date) {
    throw new Error("対象のシフトが見つかりません");
  }
  // 既に置き換え済みの原本をさらに置き換えると分岐（自動解決不能な競合）になるため拒否する（8.3）
  if (!latestBySupersedes(all).some((p) => p.id === original.id)) {
    throw new Error("このシフトは既に変更済みです。画面を更新して最新のシフトを選び直してください");
  }
  if (!/^\d{2}:\d{2}$/.test(input.from) || !/^\d{2}:\d{2}$/.test(input.to)) {
    throw new Error("時刻は HH:MM で指定してください");
  }
  const payload: ShiftPlanPayload = shiftPlanPayloadSchema.parse({
    id: input.changeId?.trim() || `shift-${ulid().toLowerCase()}`,
    tenantId: DEMO_TENANT_ID,
    vesselId: DEMO_VESSEL.id,
    occurredAt: new Date(`${original.date}T${input.from}:00`).toISOString(),
    recordedAt: now.toISOString(),
    recordedBy: SHORE_PLANNER_ID,
    deviceId: SHORE_DEVICE,
    supersedesId: original.id,
    planType: "watch",
    crewMemberId: original.crewMemberId,
    date: original.date,
    shiftType: input.shiftType,
    from: input.from,
    to: input.to,
    publishedAt: now.toISOString(),
    publishedBy: SHORE_PLANNER_ID,
    changeNote: input.changeNote?.trim() || undefined,
  });
  const outcome = pushToStore(SHORE_DEVICE, [makeRecordEvent("shift_plan", payload, SHORE_DEVICE)]);
  const key = makeIdempotencyKey(SHORE_DEVICE, payload.id);
  if (!outcome.accepted.includes(key) && !outcome.duplicates.includes(key)) {
    throw new Error("配信できませんでした（イベントが受理されず隔離されました）");
  }
  return payload;
}
