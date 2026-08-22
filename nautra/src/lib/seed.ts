import type { TimeRecord, WorkCategory } from "@/domain/labor-law/types";
import { addDays, startOfLocalDay, ymdLocal } from "@/domain/labor-law/evaluate";
import { CHECKLIST_TEMPLATES } from "@/lib/checklist-templates";
import { DEMO_TENANT_ID, DEMO_VESSEL, SHORE_PLANNER_ID } from "@/lib/crew";
import { DEFAULT_SAFETY_RULE_SET } from "@/rules/safety-rules";
import {
  makeIdempotencyKey,
  makeRecordEvent,
  SYNC_SCHEMA_VERSION,
  type ApprovalPayload,
  type SyncEvent,
} from "@/sync-protocol/events";
import type {
  ChecklistResultPayload,
  MaintenanceRecordPayload,
  ShiftPlanPayload,
  ShiftType,
  StationScenario,
  VoyageLogPayload,
  WorkReportPayload,
} from "@/sync-protocol/records";

/**
 * デモシナリオ（過去6日分の打刻・承認 + 船内記録 + 当直シフト計画）。
 * サーバストア初期化時に一度だけ投入され、船内端末は初回 Pull で受信する
 * （マスタ・履歴配信のPoC表現）。
 *
 * 意図した見どころ:
 * - 佐藤(航海士): 3日前 = 14.5h 労働・休息9.5h → 警告(赤)。船長が打刻誤りを差戻し済み。
 *                 前日 = 13h 労働 → 注意(黄)。週合計は 72h 上限の9割超 → 週次注意。
 * - 鈴木(機関長): 2日前 = 休息が4分割 → 分割回数超過の警告(赤)。
 * - 田中(甲板部員): スタンバイ待機の労働時間算入の例。全日適合。
 * - 加藤(船長): 当直2交代の標準パターン。全日適合。
 * - 航海: 2日前 横浜→名古屋（出港・定時・入港）、前日 名古屋で荷役待ち→揚荷。本日 出港予定。
 * - 点検: 2日前 出港前点検（合格）、前日 安全パトロール（通路に工具放置 → 不合格・是正済）。
 * - 保守: 前日の日常点検で 発電機=要注意、No.2ウインチ=不良（部品手配）。
 * - シフト: 本日の佐藤 荷役当直 12–18 → 13–19 に陸上が変更（変更通知の未読1件）。
 */

/** デモデータ版。上げるとストアが作り直される（PoC の .data/store.json のみ） */
export const SEED_VERSION = 2;

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

function base(id: string, occurredAt: string, recordedBy: string) {
  return {
    id,
    tenantId: DEMO_TENANT_ID,
    vesselId: DEMO_VESSEL.id,
    occurredAt,
    recordedBy,
    deviceId: SEED_DEVICE,
  };
}

/* ───────────── 打刻・承認（労務） ───────────── */

function laborSeed(today: string): SyncEvent[] {
  const events: SyncEvent[] = [];
  const crewIds = ["crew-kato", "crew-sato", "crew-suzuki", "crew-tanaka"];
  let remandTargetId: string | null = null;

  for (let offset = -6; offset <= -1; offset++) {
    const day = addDays(today, offset);
    for (const crewId of crewIds) {
      const shifts = shiftsFor(crewId, offset);
      shifts.forEach(([category, from, to], i) => {
        const b = `sd-${crewId}-${day}-${i}`;
        const startRec: TimeRecord = {
          id: `${b}-s`,
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
          id: `${b}-e`,
          action: "end",
          occurredAt: atLocal(day, to),
        };
        events.push(timeRecordEvent(startRec), timeRecordEvent(endRec));
        if (crewId === "crew-sato" && offset === -3 && i === 1) remandTargetId = endRec.id;
      });
    }
  }

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

/* ───────────── 03 航海日誌 ───────────── */

function voyageSeed(today: string): SyncEvent[] {
  const d2 = addDays(today, -2);
  const d1 = addDays(today, -1);
  const logs: VoyageLogPayload[] = [
    {
      ...base("sd-vlog-1", atLocal(d2, "06:00"), "crew-sato"),
      logType: "departure",
      port: "横浜港（大黒埠頭）",
      route: "横浜 → 名古屋",
      weather: "晴",
      wind: "北東 3m/s",
      seaState: "波高 0.5m",
      visibility: "良好",
      remarks: "定刻出港。水先人なし。乗組員4名 異常なし。",
    },
    {
      ...base("sd-vlog-2", atLocal(d2, "12:00"), "crew-kato"),
      logType: "position",
      position: "34°35'N 138°50'E（御前崎沖）",
      courseDeg: 250,
      speedKnots: 11.5,
      engineRpm: 620,
      weather: "晴",
      wind: "南西 5m/s",
      seaState: "波高 1.0m",
      visibility: "良好",
    },
    {
      ...base("sd-vlog-3", atLocal(d2, "18:30"), "crew-sato"),
      logType: "arrival",
      port: "名古屋港（金城埠頭）",
      route: "横浜 → 名古屋",
      weather: "曇",
      wind: "南 4m/s",
      seaState: "波高 0.3m",
      visibility: "良好",
      remarks: "着岸。タグ1隻使用。荷役は翌日バース空き次第。",
    },
    {
      ...base("sd-vlog-4", atLocal(d1, "15:20"), "crew-kato"),
      logType: "remark",
      remarks:
        "揚荷中、主機 潤滑油圧力低下の警報（一過性）。機関長点検の結果 異常なし。日常点検記録に詳細。",
    },
  ];
  return logs.map((p) => makeRecordEvent("voyage_log", p, SEED_DEVICE));
}

/* ───────────── 03 点検・操練・アルコール検知 ───────────── */

function inspectionSeed(today: string): SyncEvent[] {
  const d5 = addDays(today, -5);
  const d2 = addDays(today, -2);
  const d1 = addDays(today, -1);
  const events: SyncEvent[] = [];

  const pre = CHECKLIST_TEMPLATES.pre_departure;
  const preResult: ChecklistResultPayload = {
    ...base("sd-chk-1", atLocal(d2, "05:30"), "crew-kato"),
    templateId: "pre_departure",
    templateVersion: pre.version,
    items: pre.items.map((it) => ({ key: it.key, label: it.label, group: it.group, result: "ok" })),
    overall: "pass",
    remarks: "横浜出港前。全項目 異常なし。",
  };
  events.push(makeRecordEvent("checklist_result", preResult, SEED_DEVICE));

  const patrol = CHECKLIST_TEMPLATES.safety_patrol;
  const patrolResult: ChecklistResultPayload = {
    ...base("sd-chk-2", atLocal(d1, "10:00"), "crew-tanaka"),
    templateId: "safety_patrol",
    templateVersion: patrol.version,
    items: patrol.items.map((it) =>
      it.key === "passage"
        ? {
            key: it.key,
            label: it.label,
            group: it.group,
            result: "ng" as const,
            note: "機関室前通路に工具放置。即時撤去・是正済",
          }
        : { key: it.key, label: it.label, group: it.group, result: "ok" as const },
    ),
    overall: "fail",
    remarks: "通路の整理整頓 1件 是正。再発防止を朝礼で周知。",
  };
  events.push(makeRecordEvent("checklist_result", patrolResult, SEED_DEVICE));

  events.push(
    makeRecordEvent(
      "drill_record",
      {
        ...base("sd-drill-1", atLocal(d5, "14:00"), "crew-kato"),
        drillType: "fire",
        leader: "crew-kato",
        participants: ["crew-kato", "crew-sato", "crew-suzuki", "crew-tanaka"],
        durationMinutes: 45,
        remarks: "機関室火災想定。非常配置集合 3分20秒、消火ホース展張・放水。退船準備まで実施。",
      },
      SEED_DEVICE,
    ),
  );

  const limit = DEFAULT_SAFETY_RULE_SET.values.alcoholLimitMgPerL;
  const checks: [string, string][] = [
    ["crew-kato", "crew-sato"],
    ["crew-sato", "crew-kato"],
    ["crew-suzuki", "crew-kato"],
    ["crew-tanaka", "crew-kato"],
  ];
  checks.forEach(([crewMemberId, checkedBy], i) => {
    events.push(
      makeRecordEvent(
        "alcohol_check",
        {
          ...base(`sd-alc-${i}`, atLocal(d2, "05:00"), checkedBy),
          crewMemberId,
          valueMgPerL: 0,
          method: "detector",
          result: "pass",
          checkedBy,
          limitMgPerL: limit,
        },
        SEED_DEVICE,
      ),
    );
  });
  return events;
}

/* ───────────── 05 作業・待機・燃料・引継 / 日常点検・保守 ───────────── */

function workSeed(today: string): SyncEvent[] {
  const d3 = addDays(today, -3);
  const d2 = addDays(today, -2);
  const d1 = addDays(today, -1);
  const reports: WorkReportPayload[] = [
    {
      ...base("sd-work-1", atLocal(d1, "04:00"), "crew-sato"),
      reportType: "handover",
      crewMemberId: "crew-sato",
      startedAt: atLocal(d1, "04:00"),
      handoverTo: "crew-kato",
      handoverItems: "名古屋港 錨泊中。バース空き待ち（09:00 以降 着岸予定）。周辺船舶 2隻、気象変化なし。",
    },
    {
      ...base("sd-work-2", atLocal(d1, "08:00"), "crew-tanaka"),
      reportType: "standby",
      crewMemberId: "crew-tanaka",
      startedAt: atLocal(d1, "08:00"),
      endedAt: atLocal(d1, "11:00"),
      standbyReason: "荷役待ち（バース空き待ちによる総員配置）",
      remarks: "荷主都合の待機 3時間。労働時間に算入（要件 3.3.3 待機時間の見える化）。",
    },
    {
      ...base("sd-work-3", atLocal(d1, "09:30"), "crew-suzuki"),
      reportType: "fuel",
      crewMemberId: "crew-suzuki",
      startedAt: atLocal(d1, "09:30"),
      endedAt: atLocal(d1, "10:40"),
      fuelType: "A重油",
      fuelOperation: "bunkering",
      fuelQuantityL: 12000,
      remainingOnBoardL: 30000,
      remarks: "バンカー船より補給。油濁防止措置実施。",
    },
    {
      ...base("sd-work-4", atLocal(d1, "13:00"), "crew-sato"),
      reportType: "cargo",
      crewMemberId: "crew-sato",
      startedAt: atLocal(d1, "13:00"),
      endedAt: atLocal(d1, "17:00"),
      port: "名古屋港（金城埠頭）",
      cargoKind: "鋼材コイル",
      operation: "unload",
      quantity: "1,200 t",
      remarks: "クレーン2基。荷崩れ・損傷なし。",
    },
  ];
  const maint: MaintenanceRecordPayload[] = [
    {
      ...base("sd-maint-1", atLocal(d3, "10:00"), "crew-suzuki"),
      equipment: "steering_gear",
      recordType: "maintenance",
      crewMemberId: "crew-suzuki",
      condition: "good",
      action: "作動油交換・リンク部給脂",
      nextDueDate: addDays(today, 87),
    },
    {
      ...base("sd-maint-2", atLocal(d2, "07:00"), "crew-tanaka"),
      equipment: "hull",
      recordType: "daily_inspection",
      crewMemberId: "crew-tanaka",
      condition: "good",
      remarks: "水密扉・ハッチ閉鎖確認。",
    },
    {
      ...base("sd-maint-3", atLocal(d1, "09:00"), "crew-suzuki"),
      equipment: "main_engine",
      recordType: "daily_inspection",
      crewMemberId: "crew-suzuki",
      condition: "good",
      runningHours: 12480,
      remarks: "潤滑油圧力警報（15:20 一過性）は圧力センサー配線の接触不良。増し締めで復旧。",
    },
    {
      ...base("sd-maint-4", atLocal(d1, "09:10"), "crew-suzuki"),
      equipment: "generator",
      recordType: "daily_inspection",
      crewMemberId: "crew-suzuki",
      condition: "attention",
      runningHours: 9870,
      action: "潤滑油量やや少 → 20L 補給。消費傾向を継続監視",
    },
    {
      ...base("sd-maint-5", atLocal(d1, "11:30"), "crew-tanaka"),
      equipment: "deck_machinery",
      recordType: "daily_inspection",
      crewMemberId: "crew-tanaka",
      condition: "defect",
      action: "No.2 ウインチ ブレーキの効きが甘い。使用制限のうえ陸上へ部品手配依頼済",
      nextDueDate: addDays(today, 7),
    },
  ];
  return [
    ...reports.map((p) => makeRecordEvent("work_report", p, SEED_DEVICE)),
    ...maint.map((p) => makeRecordEvent("maintenance_record", p, SEED_DEVICE)),
  ];
}

/* ───────────── 04 当直シフト・配置表（陸上配信） ───────────── */

type PlannedWatch = [ShiftType, string, string];
const WATCH_PLAN: Record<string, PlannedWatch[]> = {
  "crew-kato": [
    ["navigation_watch", "04:00", "08:00"],
    ["navigation_watch", "16:00", "20:00"],
  ],
  "crew-sato": [
    ["navigation_watch", "00:00", "04:00"],
    ["cargo_watch", "12:00", "18:00"],
  ],
  "crew-suzuki": [
    ["engine_watch", "08:00", "12:00"],
    ["engine_watch", "13:00", "17:00"],
  ],
  "crew-tanaka": [
    ["cargo_watch", "08:00", "11:00"],
    ["cargo_watch", "13:00", "17:00"],
  ],
};

const STATION_PLAN: Record<StationScenario, [string, string, string][]> = {
  arrival_departure: [
    ["crew-kato", "船橋", "操船指揮・見張り・通信"],
    ["crew-sato", "船首", "係船作業指揮・揚錨機操作"],
    ["crew-suzuki", "機関室", "主機操作・スタンバイ"],
    ["crew-tanaka", "船尾", "係船作業・舷梯"],
  ],
  cargo: [
    ["crew-kato", "船橋/事務室", "総括・荷役計画確認・代理店対応"],
    ["crew-sato", "荷役監督（本船側）", "積付・バラスト指示・数量確認"],
    ["crew-suzuki", "機関室", "カーゴポンプ・バラスト操作"],
    ["crew-tanaka", "甲板", "荷役作業・ハッチ開閉・係船索調整"],
  ],
  emergency: [
    ["crew-kato", "船橋", "総指揮・遭難通報・退船命令"],
    ["crew-sato", "救命艇甲板", "救命艇/いかだ降下指揮・人員点呼"],
    ["crew-suzuki", "機関室", "主機停止・消火ポンプ起動・燃料遮断"],
    ["crew-tanaka", "現場", "消火班・負傷者搬送・防水"],
  ],
};

function shiftSeed(today: string): SyncEvent[] {
  const events: SyncEvent[] = [];
  const publishedAt = atLocal(addDays(today, -2), "09:00");
  const planBase = (id: string, crewMemberId: string, occurredAt: string) => ({
    ...base(id, occurredAt, SHORE_PLANNER_ID),
    crewMemberId,
    publishedAt,
    publishedBy: SHORE_PLANNER_ID,
  });

  for (let offset = -1; offset <= 6; offset++) {
    const day = addDays(today, offset);
    for (const [crewId, watches] of Object.entries(WATCH_PLAN)) {
      watches.forEach(([shiftType, from, to], i) => {
        const p: ShiftPlanPayload = {
          ...planBase(`sd-shift-${crewId}-${day}-${i}`, crewId, atLocal(day, from)),
          planType: "watch",
          date: day,
          shiftType,
          from,
          to,
        };
        events.push(makeRecordEvent("shift_plan", p, SEED_DEVICE));
      });
    }
  }

  // 変更通知: 本日の佐藤 荷役当直 12–18 → 13–19（陸上が本日 07:00 に配信）
  const changed: ShiftPlanPayload = {
    ...planBase(`sd-shift-change-crew-sato-${today}`, "crew-sato", atLocal(today, "13:00")),
    planType: "watch",
    date: today,
    shiftType: "cargo_watch",
    from: "13:00",
    to: "19:00",
    supersedesId: `sd-shift-crew-sato-${today}-1`,
    publishedAt: atLocal(today, "07:00"),
    changeNote: "荷役開始の繰り下げ（荷主都合）のため、荷役当直を 1時間後ろ倒し。",
  };
  events.push(makeRecordEvent("shift_plan", changed, SEED_DEVICE));

  for (const [scenario, rows] of Object.entries(STATION_PLAN) as [StationScenario, [string, string, string][]][]) {
    rows.forEach(([crewId, station, duty], i) => {
      const p: ShiftPlanPayload = {
        ...planBase(`sd-station-${scenario}-${i}`, crewId, publishedAt),
        planType: "station",
        scenario,
        station,
        duty,
      };
      events.push(makeRecordEvent("shift_plan", p, SEED_DEVICE));
    });
  }
  return events;
}

/** today（YYYY-MM-DD）を基準にデモイベントを決定的に生成する */
export function makeSeedEvents(today: string): SyncEvent[] {
  return [
    ...laborSeed(today),
    ...voyageSeed(today),
    ...inspectionSeed(today),
    ...workSeed(today),
    ...shiftSeed(today),
  ];
}

export function todayYmd(now = new Date()): string {
  return ymdLocal(now);
}
