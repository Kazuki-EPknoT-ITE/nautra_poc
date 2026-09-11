import { addDays, ymdLocal } from "@/domain/labor-law/evaluate";
import { checkLabel } from "@/i18n/ja";
import type { CheckLevel } from "@/domain/labor-law/types";
import { buildVesselManning } from "@/server/manning-service";
import { checkShiftPlanCompliance, getShiftWeek } from "@/server/shift-service";
import { trashedEntityIds } from "@/server/trash-service";
import type { ShiftType } from "@/sync-protocol/records";

/**
 * S-10 シフト作成ボード（デザイン正本 `design/poc_design`）。
 *
 * デザインは当直を **週（7日）× 時間帯（4時間×6）の枡目**で組ませる。
 * 4時間の当直は船の基本形で、枡に落とせば「誰がいつ当直か」が形で分かる
 * （自由な開始・終了は既存のフォームから引き続き作れる）。
 *
 * 枡から外すのは削除ではなく **`trash_entry` の追記**にする。配信済みの計画を
 * 物理削除すると、船内に届いた版と食い違ったまま追えなくなるため（12.3 / ガードレール②）。
 */

/** 4時間ごとの当直帯。デザインの `SHIFT_SLOTS` と同じ刻み */
export const WATCH_SLOTS: { key: string; from: string; to: string; label: string }[] = [
  { key: "00-04", from: "00:00", to: "04:00", label: "00–04" },
  { key: "04-08", from: "04:00", to: "08:00", label: "04–08" },
  { key: "08-12", from: "08:00", to: "12:00", label: "08–12" },
  { key: "12-16", from: "12:00", to: "16:00", label: "12–16" },
  { key: "16-20", from: "16:00", to: "20:00", label: "16–20" },
  { key: "20-24", from: "20:00", to: "24:00", label: "20–24" },
];

export function watchSlotOf(key: string) {
  return WATCH_SLOTS.find((s) => s.key === key);
}

export interface BoardCell {
  slotKey: string;
  date: string;
  /** 割り当て済みならその計画（1枡1人。複数あれば先頭を出す） */
  planId: string | null;
  crewMemberId: string | null;
  crewName: string | null;
  shiftType: ShiftType | null;
  /** 配信済みの変更で置き換わった枡（船内へ変更が届いている） */
  changed: boolean;
}

export interface BoardCrew {
  crewMemberId: string;
  name: string;
  position: string;
  photo?: string;
  /** この週に入っている当直の本数 */
  assignedCount: number;
}

export interface ShiftBoard {
  vesselId: string;
  vesselName: string;
  /** 週の7日（今日を2日目に置く。getShiftWeek と同じ窓） */
  days: string[];
  today: string;
  crews: BoardCrew[];
  cells: BoardCell[];
  filled: number;
  total: number;
  warnings: { crewName: string; date: string; label: string; level: CheckLevel }[];
  appliedRuleVersion: string;
}

/** 「HH:MM」がその枡の帯に当たるか（開始時刻だけで判定する。枡は4時間固定） */
function slotKeyOf(from: string | undefined): string | null {
  if (!from) return null;
  return WATCH_SLOTS.find((s) => s.from === from)?.key ?? null;
}

export function buildShiftBoard(vesselId: string, now = new Date()): ShiftBoard {
  const week = getShiftWeek(now);
  const manning = buildVesselManning(now).find((v) => v.vesselId === vesselId);
  const removed = trashedEntityIds("当直シフト");

  const crews: BoardCrew[] = (manning?.onBoard ?? []).map((r) => ({
    crewMemberId: r.crewMemberId,
    name: r.name,
    position: r.position,
    photo: r.photo,
    assignedCount: 0,
  }));
  const byId = new Map(crews.map((c) => [c.crewMemberId, c]));

  const cells: BoardCell[] = [];
  for (const slot of WATCH_SLOTS) {
    for (const date of week.days) {
      const hit = crews
        .flatMap((c) => week.cells[`${c.crewMemberId}|${date}`] ?? [])
        .filter((p) => !removed.has(p.id))
        .find((p) => slotKeyOf(p.from) === slot.key);
      if (hit) byId.get(hit.crewMemberId)!.assignedCount += 1;
      cells.push({
        slotKey: slot.key,
        date,
        planId: hit?.id ?? null,
        crewMemberId: hit?.crewMemberId ?? null,
        crewName: hit ? (byId.get(hit.crewMemberId)?.name ?? hit.crewMemberId) : null,
        shiftType: (hit?.shiftType as ShiftType | undefined) ?? null,
        changed: Boolean(hit?.supersedesId),
      });
    }
  }

  /**
   * 労務チェックは**いま入っている割当のまま**1週間働いた想定で見る。
   * 割り当てた瞬間に警告が出ることが要点なので、保存前の確認フォームとは別に
   * 盤面の下へ常時出す（3.2.3「公平な配分と法令遵守の両立」）。
   */
  const warnings: ShiftBoard["warnings"] = [];
  let appliedRuleVersion = "";
  for (const c of crews) {
    if (c.assignedCount === 0) continue;
    const firstSlot = WATCH_SLOTS[0]!;
    const result = checkShiftPlanCompliance(
      {
        crewMemberId: c.crewMemberId,
        fromDate: week.days[0]!,
        toDate: week.days[week.days.length - 1]!,
        shiftType: "off",
        from: firstSlot.from,
        to: firstSlot.to,
      },
      now,
    );
    appliedRuleVersion = result.appliedRuleVersion;
    for (const w of result.warnings) {
      warnings.push({
        crewName: c.name,
        date: w.date,
        label: checkLabel(w.check.key),
        level: w.level,
      });
    }
  }

  return {
    vesselId,
    vesselName: manning?.vesselName ?? vesselId,
    days: week.days,
    today: week.today ?? ymdLocal(now),
    crews,
    cells,
    filled: cells.filter((c) => c.planId).length,
    total: cells.length,
    warnings: warnings.slice(0, 12),
    appliedRuleVersion,
  };
}

export { addDays };
