import { addDays, evaluateDaily, evaluateWeekly, ymdLocal } from "@/domain/labor-law/evaluate";
import type { CheckLevel } from "@/domain/labor-law/types";
import { checkLabel } from "@/i18n/ja";
import { describeCheck } from "@/lib/labor-plain";
import { shiftWindow } from "@/lib/shift-plain";
import { findSupersedeConflicts, latestBySupersedes, type ShiftPlanPayload, type ShiftType } from "@/sync-protocol/records";
import { crewPhotoMap } from "./crew-photo-service";
import { currentLaborRuleSet } from "./labor-rules";
import { buildVesselManning } from "./manning-service";
import { shoreStaffById } from "./shore-session";
import { buildWatchLoad, planToTimeRecords } from "./shift-service";
import { getRecordsOfKind } from "./store";
import { trashedEntityIds } from "./trash-service";
import { crewNameOf } from "./master-service";

/**
 * S-10 シフト作成の**配置表（カレンダー）**（レビュー SHIFT-03 / SHIFT-06 / SHIFT-07）。
 *
 * 1週間を横に、0〜24時を縦に並べ、当直を**時間どおりの長さのブロック**で置く（変則の時間帯もそのまま見える）。
 * 労務チェック・今週の当直・当直の配分（直近2週間）を別の節に分けず、この1枚に含める:
 * - 基準を外れる日のブロックに ⚠／✕ を付け、理由は右の欄とホバーで読む
 * - 左の船員の札に「今週の当直時間」と「直近2週間の当直時間（平均との差）」を出す
 *
 * 判定は打刻と同じドメイン純関数（計画どおり働いた想定の打刻に置き換えて評価する）。外した当直（ゴミ箱）は除く。
 */

export interface CalendarPlan {
  id: string;
  crewMemberId: string;
  crewName: string;
  date: string;
  from: string;
  to: string;
  shiftType: ShiftType | null;
  /** 0時からの分（開始・終了）。日をまたぐ当直は終了を 24時で切り、`overnight` を立てる */
  startMin: number;
  endMin: number;
  overnight: boolean;
  /** 配信済みの変更で置き換わった当直か（船内へ変更が届いている） */
  changed: boolean;
  changeNote?: string;
  publishedAt: string;
  publishedByName: string;
  /** この当直の日・船員に注意／警告があるか */
  level: CheckLevel;
  /** 同じ当直を陸上と船長が別々に変えた（双方を残して要確認。SHIFT-04） */
  conflict: boolean;
}

export interface CalendarCrew {
  crewMemberId: string;
  name: string;
  position: string;
  photo?: string;
  photoDataUrl?: string;
  /** この週に組まれている当直の時間（分） */
  weekMinutes: number;
  /** 直近2週間の当直の時間（分）と、乗組員の平均との差 */
  twoWeekMinutes: number;
  diffFromAverage: number;
}

export interface CalendarWarning {
  crewMemberId: string;
  crewName: string;
  date: string;
  label: string;
  level: CheckLevel;
  text: string;
}

export interface ShiftCalendar {
  vesselId: string;
  vesselName: string;
  start: string;
  days: string[];
  today: string;
  crews: CalendarCrew[];
  plans: CalendarPlan[];
  warnings: CalendarWarning[];
  appliedRuleVersion: string;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const worst = (a: CheckLevel, b: CheckLevel): CheckLevel =>
  a === "violation" || b === "violation" ? "violation" : a === "caution" || b === "caution" ? "caution" : "ok";

/** 週の初日（既定は今日の前日。これまでのシフト表と同じ窓） */
export function defaultCalendarStart(now = new Date()): string {
  return addDays(ymdLocal(now), -1);
}

export function buildShiftCalendar(vesselId: string, start?: string, now = new Date()): ShiftCalendar {
  const today = ymdLocal(now);
  const first = start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : defaultCalendarStart(now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
  const manning = buildVesselManning(now).find((v) => v.vesselId === vesselId);
  const removed = trashedEntityIds("当直シフト");
  const photos = crewPhotoMap();
  const onBoard = manning?.onBoard ?? [];
  const crewIds = new Set(onBoard.map((r) => r.crewMemberId));

  const allPlans = getRecordsOfKind("shift_plan");
  const conflictIds = new Set(findSupersedeConflicts(allPlans).flatMap((c) => c.candidates.map((x) => x.id)));
  const effective = latestBySupersedes(allPlans).filter(
    (p): p is ShiftPlanPayload & { date: string; from: string; to: string } =>
      p.planType === "watch" && Boolean(p.date && p.from && p.to) && !removed.has(p.id) && crewIds.has(p.crewMemberId),
  );

  // 労務チェック: 計画どおり働いた想定で、表示している7日を船員ごとに判定する
  const ruleSet = currentLaborRuleSet(now);
  const at = new Date(Math.max(now.getTime(), new Date(`${addDays(days[6]!, 1)}T00:00:00`).getTime()));
  const warnings: CalendarWarning[] = [];
  const levelByCrewDate = new Map<string, CheckLevel>();
  for (const crewMemberId of crewIds) {
    const records = planToTimeRecords(effective.filter((p) => p.crewMemberId === crewMemberId));
    if (records.length === 0) continue;
    for (const date of days) {
      const checks = [
        ...evaluateDaily({ crewMemberId, date, records, now: at, ruleSet }).checks,
        evaluateWeekly({ crewMemberId, endDate: date, records, now: at, ruleSet }).check,
      ].filter((c) => c.level !== "ok");
      for (const check of checks) {
        // 週の判定は日ごとに同じものが続くので、最初に外れた日だけ出す
        if (check.key === "weekly_max" && warnings.some((w) => w.crewMemberId === crewMemberId && w.label === checkLabel(check.key))) continue;
        warnings.push({
          crewMemberId,
          crewName: crewNameOf(crewMemberId),
          date,
          label: checkLabel(check.key),
          level: check.level,
          text: describeCheck(check),
        });
        const key = `${crewMemberId}|${date}`;
        levelByCrewDate.set(key, worst(levelByCrewDate.get(key) ?? "ok", check.level));
      }
    }
  }

  const plans: CalendarPlan[] = effective
    .filter((p) => days.includes(p.date))
    .map((p) => {
      const startMin = toMin(p.from);
      const rawEnd = p.to === "24:00" ? 1440 : toMin(p.to);
      const overnight = rawEnd <= startMin;
      return {
        id: p.id,
        crewMemberId: p.crewMemberId,
        crewName: crewNameOf(p.crewMemberId),
        date: p.date,
        from: p.from,
        to: p.to,
        shiftType: (p.shiftType as ShiftType | undefined) ?? null,
        startMin,
        endMin: overnight ? 1440 : rawEnd,
        overnight,
        changed: Boolean(p.supersedesId),
        changeNote: p.changeNote,
        publishedAt: p.publishedAt,
        publishedByName: shoreStaffById(p.publishedBy)?.name ?? crewNameOf(p.publishedBy),
        level: levelByCrewDate.get(`${p.crewMemberId}|${p.date}`) ?? "ok",
        conflict: conflictIds.has(p.id),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);

  const load = buildWatchLoad(now);
  const crews: CalendarCrew[] = onBoard.map((r) => {
    const weekMinutes = effective
      .filter((p) => p.crewMemberId === r.crewMemberId && days.includes(p.date) && p.shiftType !== "off")
      .reduce((sum, p) => {
        const win = shiftWindow(p);
        return win ? sum + Math.round((win[1].getTime() - win[0].getTime()) / 60000) : sum;
      }, 0);
    const row = load.rows.find((x) => x.crewMemberId === r.crewMemberId);
    return {
      crewMemberId: r.crewMemberId,
      name: r.name,
      position: r.position,
      photo: r.photo,
      photoDataUrl: photos.get(r.crewMemberId),
      weekMinutes,
      twoWeekMinutes: row?.minutes ?? 0,
      diffFromAverage: row?.diffFromAverage ?? 0,
    };
  });

  return {
    vesselId,
    vesselName: manning?.vesselName ?? vesselId,
    start: first,
    days,
    today,
    crews,
    plans,
    warnings: warnings.sort((a, b) => a.date.localeCompare(b.date)),
    appliedRuleVersion: ruleSet.version,
  };
}
