"use server";

import { revalidatePath } from "next/cache";
import { crewNameOf } from "@/server/master-service";
import { recordDeletion } from "@/server/trash-service";
import { fmtDateLabel } from "@/lib/format";
import {
  checkShiftPlanCompliance,
  publishNewShift,
  publishNewStation,
  publishShiftChange,
  publishStationChange,
} from "@/server/shift-service";
import { requireShore } from "@/server/shore-session";
import type { ShiftType, StationScenario } from "@/sync-protocol/records";

/** シフトボードの操作結果（割り当て・取り外しで共通） */
export interface ShiftFormState {
  ok: boolean;
  message: string;
}

export interface ShiftChangeFormState {
  ok: boolean;
  message: string;
}

/** S-10: 通常配置表の変更配信（船内は SSE 通知で即座に反映される） */
export async function publishStationChangeAction(
  _prev: ShiftChangeFormState,
  formData: FormData,
): Promise<ShiftChangeFormState> {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) return { ok: false, message: "配置表を配信する権限がありません" };
  try {
    const supersedesId = String(formData.get("supersedesId") ?? "");
    if (!supersedesId) throw new Error("変更する配置を選択してください");
    const published = publishStationChange({
      supersedesId,
      station: String(formData.get("station") ?? ""),
      duty: String(formData.get("duty") ?? ""),
      changeNote: String(formData.get("changeNote") ?? ""),
    });
    revalidatePath("/shore/shifts");
    return {
      ok: true,
      message: `配信しました: ${published.station}（船内の配置表に即座に反映されます）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 通常配置表に新しい持ち場を追加して配信する */
export async function publishNewStationAction(
  _prev: ShiftChangeFormState,
  formData: FormData,
): Promise<ShiftChangeFormState> {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) return { ok: false, message: "配置表を作成する権限がありません" };
  try {
    const published = publishNewStation({
      crewMemberId: String(formData.get("crewMemberId") ?? ""),
      scenario: String(formData.get("scenario") ?? "arrival_departure") as StationScenario,
      station: String(formData.get("station") ?? ""),
      duty: String(formData.get("duty") ?? ""),
      changeNote: String(formData.get("changeNote") ?? ""),
    });
    revalidatePath("/shore/shifts");
    return {
      ok: true,
      message: `配置を追加しました: ${published.station}（船内の配置表に即座に反映されます）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 枡から外す。**削除ではなく「外した」跡を残す**（S-18 から30日以内に戻せる）。
 * 配信済みの計画を物理削除すると、船内に届いた版と食い違ったまま追えなくなるため。
 */
export async function clearWatchAction(planId: string, label: string): Promise<ShiftFormState> {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) return { ok: false, message: "シフトを配信する権限がありません" };
  try {
    recordDeletion({
      entityKind: "当直シフト",
      entityId: planId,
      entityLabel: label,
      mode: "delete",
      action: "シフトボードから外した",
      effect: "船内には取り消しとして届きます。元の計画は履歴に残ります",
      actor: guard.staff.id,
    });
    revalidatePath("/shore/shifts");
    revalidatePath("/shore/trash");
    return { ok: true, message: `${label} を外しました（30日以内なら削除・アーカイブから戻せます）` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/* ═══════════════ 配置表（カレンダー）からの作成・移動・変更（レビュー SHIFT-03） ═══════════════ */

/** 時刻は「HH:MM」。配置表の刻み（1・2・4時間）で決まった枠の開始・終了がそのまま入る */
export interface CalendarShiftInput {
  crewMemberId: string;
  date: string;
  from: string;
  to: string;
  shiftType: ShiftType;
  /** 同じ時間帯を続けて組むときの最終日（含む）。省略時はその日だけ */
  toDate?: string;
  note?: string;
}

/** 空いている枠に当直を作って配信する（ドラッグで置く・枠を押して作る、のどちらからも） */
export async function createCalendarShiftAction(input: CalendarShiftInput): Promise<ShiftFormState> {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) return { ok: false, message: "シフトを配信する権限がありません" };
  try {
    const shift = {
      crewMemberId: input.crewMemberId,
      fromDate: input.date,
      toDate: input.toDate || undefined,
      shiftType: input.shiftType,
      from: input.from,
      to: input.to,
      changeNote: input.note?.trim() || "配置表から作成",
    };
    // 作る前に、この当直を入れた場合の労務判定を取り、外れる日があれば結果に書く（黙って作らない。3.2.5）
    const compliance = checkShiftPlanCompliance(shift);
    const created = publishNewShift(shift);
    revalidatePath("/shore/shifts");
    const days = new Set(compliance.warnings.map((w) => w.date)).size;
    return {
      ok: true,
      message:
        `${crewNameOf(input.crewMemberId)} の当直を${created.length}件作って配信しました（${input.from}–${input.to}）` +
        (days > 0 ? `。⚠ 基準を外れる日が${days}日あります（右の労務チェックを確認してください）` : ""),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 当直を変更して配信する（種別・時刻・日。ブロックを押した欄、またはドラッグで別の枠へ移したとき） */
export async function changeCalendarShiftAction(
  planId: string,
  change: { date?: string; from: string; to: string; shiftType: ShiftType; note?: string },
): Promise<ShiftFormState> {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) return { ok: false, message: "シフトを配信する権限がありません" };
  try {
    const p = publishShiftChange({
      supersedesId: planId,
      date: change.date,
      from: change.from,
      to: change.to,
      shiftType: change.shiftType,
      changeNote: change.note?.trim() || "配置表から変更",
    });
    revalidatePath("/shore/shifts");
    return {
      ok: true,
      message: `${crewNameOf(p.crewMemberId)} の当直を ${fmtDateLabel(p.date ?? "")} ${p.from}–${p.to} に変更して配信しました`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
