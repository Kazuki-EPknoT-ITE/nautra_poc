import type { TimeRecord, WorkCategory } from "@/domain/labor-law/types";
import { addDays, startOfLocalDay, ymdLocal } from "@/domain/labor-law/evaluate";
import { DEMO_TENANT_ID, DEMO_VESSEL } from "@/lib/crew";
import {
  makeIdempotencyKey,
  SYNC_SCHEMA_VERSION,
  type ApprovalPayload,
  type SyncEvent,
} from "@/sync-protocol/events";

/**
 * デモシナリオ（過去6日分の打刻・承認）。サーバストア初期化時に一度だけ投入され、
 * 船内端末は初回 Pull で受信する（マスタ・履歴配信のPoC表現）。
 *
 * 意図した見どころ:
 * - 佐藤(航海士): 3日前 = 14.5h 労働・休息9.5h → 警告(赤)。船長が打刻誤りを差戻し済み。
 *                 前日 = 13h 労働 → 注意(黄)。週合計は 72h 上限の9割超 → 週次注意。
 * - 鈴木(機関長): 2日前 = 休息が4分割 → 分割回数超過の警告(赤)。
 * - 田中(甲板部員): スタンバイ待機の労働時間算入の例。全日適合。
 * - 加藤(船長): 当直2交代の標準パターン。全日適合。
 */

const SEED_DEVICE = "seed-shore-device";

function atLocal(ymd: string, hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const d = startOfLocalDay(ymd);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

type Shift = [WorkCategory, string, string];

const NORMAL_KATO: Shift[] = [
  ["navigation_watch", "04:00", "08:00"],
  ["navigation_watch", "16:00", "20:00"],
];
const NORMAL_SATO: Shift[] = [
  ["navigation_watch", "00:00", "04:00"],
  ["cargo", "12:00", "18:00"],
];
const NORMAL_SUZUKI: Shift[] = [
  ["maintenance", "08:00", "12:00"],
  ["maintenance", "13:00", "17:00"],
];
const NORMAL_TANAKA: Shift[] = [
  ["standby", "08:00", "11:00"],
  ["cargo", "13:00", "17:00"],
];

function shiftsFor(crewId: string, offset: number): Shift[] {
  if (crewId === "crew-kato") return NORMAL_KATO;
  if (crewId === "crew-sato") {
    if (offset === -3)
      return [
        ["navigation_watch", "00:00", "04:00"],
        ["cargo", "12:00", "22:30"], // 14.5h 労働 → 警告(赤)
      ];
    if (offset === -1)
      return [
        ["navigation_watch", "00:00", "04:00"],
        ["cargo", "12:00", "21:00"], // 13h 労働 → 注意(黄)
      ];
    return NORMAL_SATO;
  }
  if (crewId === "crew-suzuki") {
    if (offset === -2)
      return [
        ["maintenance", "06:00", "08:00"],
        ["maintenance", "10:00", "12:00"],
        ["cargo", "14:00", "18:00"], // 休息4分割 → 警告(赤)
      ];
    return NORMAL_SUZUKI;
  }
  return NORMAL_TANAKA;
}

function timeRecordEvent(rec: TimeRecord): SyncEvent {
  return {
    kind: "time_record",
    schemaVersion: SYNC_SCHEMA_VERSION,
    eventId: rec.id,
    deviceId: SEED_DEVICE,
    idempotencyKey: makeIdempotencyKey(SEED_DEVICE, rec.id),
    occurredAt: rec.occurredAt,
    payload: { ...rec },
  };
}

function approvalEvent(payload: ApprovalPayload): SyncEvent {
  return {
    kind: "approval",
    schemaVersion: SYNC_SCHEMA_VERSION,
    eventId: payload.id,
    deviceId: SEED_DEVICE,
    idempotencyKey: makeIdempotencyKey(SEED_DEVICE, payload.id),
    occurredAt: payload.decidedAt,
    payload,
  };
}

/** today（YYYY-MM-DD）を基準に過去6日分のデモイベントを決定的に生成する */
export function makeSeedEvents(today: string): SyncEvent[] {
  const events: SyncEvent[] = [];
  const crewIds = ["crew-kato", "crew-sato", "crew-suzuki", "crew-tanaka"];

  let remandTargetId: string | null = null;

  for (let offset = -6; offset <= -1; offset++) {
    const day = addDays(today, offset);
    for (const crewId of crewIds) {
      const shifts = shiftsFor(crewId, offset);
      shifts.forEach(([category, from, to], i) => {
        const base = `sd-${crewId}-${day}-${i}`;
        const startRec: TimeRecord = {
          id: `${base}-s`,
          tenantId: DEMO_TENANT_ID,
          vesselId: DEMO_VESSEL.id,
          crewMemberId: crewId,
          workCategory: category,
          action: "start",
          occurredAt: atLocal(day, from),
          entryType: "realtime",
          recordedBy: crewId,
          deviceId: SEED_DEVICE,
        };
        const endRec: TimeRecord = {
          ...startRec,
          id: `${base}-e`,
          action: "end",
          occurredAt: atLocal(day, to),
        };
        events.push(timeRecordEvent(startRec), timeRecordEvent(endRec));
        // 佐藤の赤日（-3）の荷役終了打刻を、船長差戻しの対象として記録
        if (crewId === "crew-sato" && offset === -3 && i === 1) {
          remandTargetId = endRec.id;
        }
      });
    }
  }

  // 承認シード: -6〜-4 は船長承認済み。佐藤の -3（赤）は船長が差戻し。
  for (let offset = -6; offset <= -4; offset++) {
    const day = addDays(today, offset);
    for (const crewId of crewIds) {
      events.push(
        approvalEvent({
          id: `sd-appr-${crewId}-${day}`,
          tenantId: DEMO_TENANT_ID,
          vesselId: DEMO_VESSEL.id,
          crewMemberId: crewId,
          date: day,
          decision: "approved",
          approvedBy: "crew-kato",
          approverRole: "captain",
          decidedAt: atLocal(addDays(day, 1), "08:30"),
        }),
      );
    }
  }
  if (remandTargetId) {
    const day = addDays(today, -3);
    events.push(
      approvalEvent({
        id: `sd-appr-crew-sato-${day}`,
        tenantId: DEMO_TENANT_ID,
        vesselId: DEMO_VESSEL.id,
        crewMemberId: "crew-sato",
        date: day,
        decision: "remanded",
        targetRecordId: remandTargetId,
        reason: "荷役終了 22:30 は打刻誤りの疑い。実際の終了時刻で再入力してください。",
        approvedBy: "crew-kato",
        approverRole: "captain",
        decidedAt: atLocal(addDays(day, 1), "08:30"),
      }),
    );
  }

  return events;
}

export function todayYmd(now = new Date()): string {
  return ymdLocal(now);
}
