"use server";

import { revalidatePath } from "next/cache";
import { parseOptionalNumber } from "@/lib/format";
import {
  createVoyageSchedule,
  crewChangesFor,
  publishManualPosition,
  updateScheduleStatus,
} from "@/server/position-service";
import { requireShore } from "@/server/shore-session";
import type { VesselPositionPayload, VoyageSchedulePayload } from "@/sync-protocol/masters";

/**
 * S-12 の書き込み（Server Action）。
 * 画面を隠すだけでは不十分なため、この中でも権限を再チェックする（10.3）。
 */

export interface DispatchFormState {
  ok: boolean;
  message: string;
  /** 3.7.2③ 配乗との突き合わせで見つかった注意（登録は行ったうえで知らせる） */
  warnings?: string[];
}

async function actorId(): Promise<string> {
  const guard = await requireShore("manage_dispatch");
  if (!guard.ok) {
    throw new Error(
      guard.reason === "signed_out"
        ? "サインインしてください"
        : "この操作を行う権限がありません（運航管理の担当者に依頼してください）",
    );
  }
  return guard.staff.id;
}

/** 配船スケジュールを登録する。期間に乗下船の予定が重なれば警告を返す */
export async function createScheduleAction(
  _prev: DispatchFormState,
  formData: FormData,
): Promise<DispatchFormState> {
  try {
    const actor = await actorId();
    const departureAt = String(formData.get("departureAt") ?? "");
    const arrivalAt = String(formData.get("arrivalAt") ?? "");
    const published = createVoyageSchedule(
      {
        targetVesselId: String(formData.get("targetVesselId") ?? ""),
        voyageNo: String(formData.get("voyageNo") ?? ""),
        departurePort: String(formData.get("departurePort") ?? ""),
        arrivalPort: String(formData.get("arrivalPort") ?? ""),
        departureAt,
        arrivalAt,
        cargoKind: String(formData.get("cargoKind") ?? ""),
        quantity: String(formData.get("quantity") ?? ""),
        counterparty: String(formData.get("counterparty") ?? ""),
        status: String(formData.get("status") ?? "planned") as VoyageSchedulePayload["status"],
        planningNote: String(formData.get("planningNote") ?? ""),
      },
      actor,
    );
    const warnings = crewChangesFor(published.departureAt, published.arrivalAt).map(
      (c) =>
        `${c.crewName}${c.duty ? `（${c.duty}）` : ""} が ${c.date} に${
          c.eventType === "off" ? "下船" : "乗船"
        }の予定です。交代の手配を確認してください`,
    );
    revalidatePath("/shore/dispatch");
    return {
      ok: true,
      message: `登録しました: ${published.departurePort} → ${published.arrivalPort}`,
      warnings,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 配船スケジュールの状態を進める */
export async function updateScheduleStatusAction(
  scheduleId: string,
  status: VoyageSchedulePayload["status"],
): Promise<DispatchFormState> {
  try {
    const actor = await actorId();
    const published = updateScheduleStatus(scheduleId, status, actor);
    revalidatePath("/shore/dispatch");
    return { ok: true, message: `状態を更新しました（${published.departurePort} → ${published.arrivalPort}）` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 位置を手入力で登録する（AIS 非搭載の小型船・受信が途切れた船の補完） */
export async function publishManualPositionAction(
  _prev: DispatchFormState,
  formData: FormData,
): Promise<DispatchFormState> {
  try {
    const actor = await actorId();
    const published = publishManualPosition(
      {
        targetVesselId: String(formData.get("targetVesselId") ?? ""),
        lat: Number(formData.get("lat") ?? Number.NaN),
        lon: Number(formData.get("lon") ?? Number.NaN),
        speedKnots: parseOptionalNumber(String(formData.get("speedKnots") ?? "")),
        courseDeg: parseOptionalNumber(String(formData.get("courseDeg") ?? "")),
        navStatus: String(formData.get("navStatus") ?? "unknown") as VesselPositionPayload["navStatus"],
        destination: String(formData.get("destination") ?? ""),
        eta: String(formData.get("eta") ?? ""),
        observedAt: String(formData.get("observedAt") ?? ""),
        note: String(formData.get("note") ?? ""),
      },
      actor,
    );
    revalidatePath("/shore/dispatch");
    return {
      ok: true,
      message: `位置を登録しました（北緯${published.lat}度 東経${published.lon}度・手入力）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
