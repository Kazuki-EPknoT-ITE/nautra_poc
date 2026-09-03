"use server";

import { revalidatePath } from "next/cache";
import { checkLabel } from "@/i18n/ja";
import { fmtDateLabel, fmtMinutes } from "@/lib/format";
import {
  checkShiftPlanCompliance,
  publishNewShift,
  publishNewStation,
  publishShiftChange,
  publishStationChange,
  type PublishNewShiftInput,
} from "@/server/shift-service";
import { requireShore } from "@/server/shore-session";
import type { ShiftType, StationScenario } from "@/sync-protocol/records";

export interface ShiftChangeFormState {
  ok: boolean;
  message: string;
}

/** S-10: シフト変更の配信（Server Action。API ルート同様に薄い入出力層としドメインサービスへ委譲） */
export async function publishShiftChangeAction(
  _prev: ShiftChangeFormState,
  formData: FormData,
): Promise<ShiftChangeFormState> {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) return { ok: false, message: "シフトを配信する権限がありません" };
  try {
    const supersedesId = String(formData.get("supersedesId") ?? "");
    const shiftType = String(formData.get("shiftType") ?? "") as ShiftType;
    const from = String(formData.get("from") ?? "");
    const to = String(formData.get("to") ?? "");
    const changeNote = String(formData.get("changeNote") ?? "");
    if (!supersedesId) throw new Error("変更するシフトを選択してください");
    const published = publishShiftChange({ supersedesId, shiftType, from, to, changeNote });
    revalidatePath("/shore/shifts");
    revalidatePath("/shore");
    return {
      ok: true,
      message: `配信しました: ${published.date} ${published.from}–${published.to}（船内の次回同期で変更通知になります）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
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

/* ═══════════════ 新規作成（基本設計書 S-10「当直・停泊・荷役シフトの作成・配信」） ═══════════════ */

export interface NewShiftFormState {
  ok: boolean;
  /** idle = 未操作 / checked = 事前判定だけ / published = 配信済み */
  phase: "idle" | "checked" | "published";
  message: string;
  /** 法令チェックの警告（作成は止めないが必ず見せる。3.2.5） */
  warnings: string[];
}

/**
 * `"use server"` のモジュールから公開できるのは async 関数だけなので、
 * 初期状態は**エクスポートせず**、フォーム側で同じ形を持つ（定数を輸出すると SSR が壊れる）。
 */
const NEW_SHIFT_INITIAL: NewShiftFormState = {
  ok: false,
  phase: "idle",
  message: "",
  warnings: [],
};

function readShiftInput(formData: FormData): PublishNewShiftInput {
  return {
    crewMemberId: String(formData.get("crewMemberId") ?? ""),
    fromDate: String(formData.get("fromDate") ?? ""),
    toDate: String(formData.get("toDate") ?? "") || undefined,
    shiftType: String(formData.get("shiftType") ?? "navigation_watch") as ShiftType,
    from: String(formData.get("from") ?? ""),
    to: String(formData.get("to") ?? ""),
    changeNote: String(formData.get("changeNote") ?? ""),
  };
}

/** 判定結果を日常語の一文にする（画面に文言ロジックを散らさない） */
function warningText(date: string, key: string, actual: number, limit: number): string {
  const value = key === "rest_split" ? `${actual}回` : fmtMinutes(actual);
  const bound = key === "rest_split" ? `${limit}回` : fmtMinutes(limit);
  return `${fmtDateLabel(date)} ${checkLabel(key)}: この計画だと ${value}（基準 ${bound}）になります`;
}

/**
 * 新しい当直シフトを作成して配信する。
 * `mode=check` は**事前判定だけ**を行い、`mode=create` で配信する。
 * 配信時も判定を再実行し、警告があればそのまま結果に載せる（黙って作らない）。
 */
export async function publishNewShiftAction(
  _prev: NewShiftFormState,
  formData: FormData,
): Promise<NewShiftFormState> {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) {
    return { ...NEW_SHIFT_INITIAL, message: "シフトを作成する権限がありません" };
  }
  const mode = String(formData.get("mode") ?? "check");
  try {
    const input = readShiftInput(formData);
    const compliance = checkShiftPlanCompliance(input);
    const warnings = compliance.warnings.map((w) =>
      warningText(w.date, w.check.key, w.check.actual, w.check.limit),
    );

    if (mode !== "create") {
      return {
        ok: warnings.length === 0,
        phase: "checked",
        message:
          warnings.length === 0
            ? `${compliance.dates.length}日分を作れます。基準を外れる日はありません（適用ルール版 ${compliance.appliedRuleVersion}）`
            : `${warnings.length}件の注意があります。内容を確認してから配信してください`,
        warnings,
      };
    }

    const created = publishNewShift(input);
    revalidatePath("/shore/shifts");
    revalidatePath("/shore");
    return {
      ok: true,
      phase: "published",
      message: `${created.length}日分の当直を配信しました（船内の次回同期で表示されます）`,
      warnings,
    };
  } catch (e) {
    return {
      ...NEW_SHIFT_INITIAL,
      message: e instanceof Error ? e.message : String(e),
    };
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
