import { describe, expect, it } from "vitest";
import {
  describeActual,
  describeShiftChange,
  describeWatchStatus,
  shiftWindow,
  watchStatus,
} from "../shift-plain";
import type { ShiftPlanPayload } from "@/sync-protocol/records";

/**
 * 当直の「いまの状態」と平易な言い換えのテスト。
 * 判定は計画データからの導出のみで、閾値や独自ルールを持たないことを確認する。
 */
const watch = (over: Partial<ShiftPlanPayload> = {}): ShiftPlanPayload => ({
  id: "s-1",
  tenantId: "tenant-demo",
  vesselId: "vessel-001",
  occurredAt: "2026-08-28T03:00:00.000Z",
  recordedBy: "shore-yamamoto",
  deviceId: "shore-planner-device",
  planType: "watch",
  crewMemberId: "crew-sato",
  date: "2026-08-28",
  shiftType: "navigation_watch",
  from: "12:00",
  to: "18:00",
  publishedAt: "2026-08-27T00:00:00.000Z",
  publishedBy: "shore-yamamoto",
  ...over,
});

const at = (hm: string) => new Date(`2026-08-28T${hm}:00`);

describe("当直の時間帯（shiftWindow）", () => {
  it("日付 + HH:MM から実時刻を組み立てる", () => {
    const w = shiftWindow(watch());
    expect(w?.[0].getHours()).toBe(12);
    expect(w?.[1].getHours()).toBe(18);
  });

  it("終了が開始以前なら日跨ぎとして翌日に送る（00:00–04:00 の夜間当直）", () => {
    const w = shiftWindow(watch({ from: "20:00", to: "04:00" }));
    expect(w?.[1].getDate()).toBe((w?.[0].getDate() ?? 0) + 1);
    expect((w![1].getTime() - w![0].getTime()) / 3_600_000).toBe(8);
  });

  it("日付・時刻が欠けた計画（配置表など）は時間帯を持たない", () => {
    expect(shiftWindow(watch({ planType: "station", date: undefined, from: undefined, to: undefined }))).toBeNull();
  });
});

describe("いまの状態（watchStatus）", () => {
  const plans = [watch({ id: "a", from: "08:00", to: "12:00" }), watch({ id: "b", from: "16:00", to: "20:00" })];

  it("当直中は on_duty で、終わりまでの残り時間を返す", () => {
    const s = watchStatus(plans, at("09:30"));
    expect(s.state).toBe("on_duty");
    expect(s.current?.plan.id).toBe("a");
    expect(s.minutesUntilEnd).toBe(150);
    expect(s.next?.plan.id).toBe("b"); // 次の予定も併せて返す
    expect(describeWatchStatus(s).title).toContain("航海当直");
  });

  it("開始前は upcoming で、始まりまでの残り時間を返す", () => {
    const s = watchStatus(plans, at("07:00"));
    expect(s.state).toBe("upcoming");
    expect(s.next?.plan.id).toBe("a");
    expect(s.minutesUntilStart).toBe(60);
    expect(describeWatchStatus(s).detail).toContain("あと 1時間");
  });

  it("すべて終わっていれば finished、予定がなければ none", () => {
    expect(watchStatus(plans, at("22:00")).state).toBe("finished");
    expect(watchStatus([], at("09:00")).state).toBe("none");
    expect(describeWatchStatus({ state: "none" }).title).toBe("本日の当直はありません");
  });

  it("当直中の判定は開始時刻を含み、終了時刻を含まない（境界）", () => {
    expect(watchStatus(plans, at("08:00")).state).toBe("on_duty");
    expect(watchStatus(plans, at("12:00")).state).toBe("upcoming"); // 終了と同時に外れる
  });
});

describe("平易な言い換え", () => {
  it("打刻の状況は「できている / まだない / しないまま終わった / これから」で示す", () => {
    expect(describeActual(1, true, true)).toBe("打刻できています");
    expect(describeActual(0, true, true)).toContain("まだ打刻がありません");
    expect(describeActual(0, true, false)).toBe("打刻がないまま終わりました");
    expect(describeActual(0, false, false)).toBe("まだ始まっていません");
  });

  it("当直の変更は「何時から何時に変わったか」を一文で示す", () => {
    const prev = watch({ id: "a", from: "12:00", to: "18:00" });
    const next = watch({ id: "b", from: "13:00", to: "19:00", supersedesId: "a" });
    expect(describeShiftChange(next, prev)).toBe("航海当直の時間が 12:00–18:00 から 13:00–19:00 に変わりました");
  });

  it("配置の変更は「持ち場がどこに変わったか」を示す", () => {
    const next = watch({
      planType: "station",
      scenario: "emergency",
      station: "第1消火班",
      date: undefined,
      from: undefined,
      to: undefined,
    });
    expect(describeShiftChange(next)).toContain("第1消火班");
    expect(describeShiftChange(next)).toContain("非常配置");
  });
});
