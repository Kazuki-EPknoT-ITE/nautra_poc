import type { WorkCategory } from "@/domain/labor-law/types";
import type { ShiftPlanPayload, ShiftType } from "@/sync-protocol/records";

/**
 * 当直シフト（陸上・船長が割り当てた計画）と打刻の作業種別の対応。
 * 打刻は「割り当てられた作業から選ぶ」ことを基本とするため、この対応表を
 * 打刻画面（01）とシフト画面（04：計画/実績の対比）の双方で共用する（二重実装しない）。
 */
export const SHIFT_TO_WORK: Record<ShiftType, WorkCategory[]> = {
  navigation_watch: ["navigation_watch"],
  engine_watch: ["maintenance", "other"],
  port_watch: ["navigation_watch", "other"],
  cargo_watch: ["cargo", "standby"],
  off: [],
};

/** 割り当てられた作業（同じ作業種別を指すシフトはまとめる） */
export interface AssignedWork {
  category: WorkCategory;
  /** 割り当て元のシフト（当直種別と時間帯） */
  sources: { planId: string; shiftType: ShiftType; from: string; to: string }[];
}

/**
 * 指定船員・指定日に割り当てられた作業種別を、当直シフト計画から導出する。
 * 計画は陸上正本（船内は参照のみ）。ここでは導出のみを行い、計画を書き換えない
 * （基本設計書 8.3「計画・実績分離」）。
 */
export function assignedWorkFor(
  crewMemberId: string,
  date: string,
  plans: ShiftPlanPayload[],
): AssignedWork[] {
  const byCategory = new Map<WorkCategory, AssignedWork>();
  const todays = plans
    .filter((p) => p.planType === "watch" && p.crewMemberId === crewMemberId && p.date === date)
    .sort((a, b) => (a.from ?? "").localeCompare(b.from ?? ""));

  for (const p of todays) {
    if (!p.shiftType) continue;
    for (const category of SHIFT_TO_WORK[p.shiftType]) {
      const entry = byCategory.get(category) ?? { category, sources: [] };
      entry.sources.push({
        planId: p.id,
        shiftType: p.shiftType,
        from: p.from ?? "",
        to: p.to ?? "",
      });
      byCategory.set(category, entry);
    }
  }
  return [...byCategory.values()];
}
