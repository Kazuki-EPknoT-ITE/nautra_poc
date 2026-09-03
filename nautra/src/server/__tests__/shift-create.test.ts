import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { addDays, ymdLocal } from "@/domain/labor-law/evaluate";

/**
 * S-10 シフトの**新規作成**（基本設計書 6.2「当直・停泊・荷役シフトの作成・配信」）と、
 * 作成時の法令チェック（要件定義書 3.2.5 ①②④）・公平な配分の可視化（3.2.3）。
 *
 * ストアは `process.cwd()/.data/store.json` に永続化されるため、
 * **一時ディレクトリへ移ってから**サービスを読み込み、開発用のデモストアを汚さない。
 */

type ShiftService = typeof import("@/server/shift-service");

let svc: ShiftService;
const TODAY = ymdLocal(new Date());
/** 既存の計画が無い将来日を使い、判定を決定的にする */
const FUTURE = addDays(TODAY, 60);

beforeAll(async () => {
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "nautra-shift-")));
  svc = await import("@/server/shift-service");
});

describe("作成対象の日付（範囲指定の一括作成）", () => {
  it("開始日だけなら1日分になる", () => {
    expect(
      svc.shiftDatesOf({
        crewMemberId: "crew-kato",
        fromDate: FUTURE,
        shiftType: "navigation_watch",
        from: "08:00",
        to: "12:00",
      }),
    ).toEqual([FUTURE]);
  });

  it("期間を指定すると日ごとに展開する", () => {
    const dates = svc.shiftDatesOf({
      crewMemberId: "crew-kato",
      fromDate: FUTURE,
      toDate: addDays(FUTURE, 4),
      shiftType: "navigation_watch",
      from: "08:00",
      to: "12:00",
    });
    expect(dates).toHaveLength(5);
    expect(dates[4]).toBe(addDays(FUTURE, 4));
  });

  it("終了日が開始日より前なら作らせない", () => {
    expect(() =>
      svc.shiftDatesOf({
        crewMemberId: "crew-kato",
        fromDate: FUTURE,
        toDate: addDays(FUTURE, -1),
        shiftType: "navigation_watch",
        from: "08:00",
        to: "12:00",
      }),
    ).toThrow(/終了日/);
  });

  it("長すぎる期間は安全弁で止める", () => {
    expect(() =>
      svc.shiftDatesOf({
        crewMemberId: "crew-kato",
        fromDate: FUTURE,
        toDate: addDays(FUTURE, 400),
        shiftType: "navigation_watch",
        from: "08:00",
        to: "12:00",
      }),
    ).toThrow(/期間を分けて/);
  });
});

describe("作成前の法令チェック（3.2.5）", () => {
  it("1日14時間を超える当直は警告になる", () => {
    const result = svc.checkShiftPlanCompliance({
      crewMemberId: "crew-tanaka",
      fromDate: FUTURE,
      shiftType: "navigation_watch",
      from: "06:00",
      to: "22:00",
    });
    const keys = result.warnings.map((w) => w.check.key);
    expect(keys).toContain("daily_max");
    // 16時間働くと休息が10時間に足りない
    expect(keys).toContain("rest_total");
    expect(result.appliedRuleVersion).toContain("2026-04.1");
  });

  it("基準の範囲に収まる当直では警告が出ない", () => {
    const result = svc.checkShiftPlanCompliance({
      crewMemberId: "crew-tanaka",
      fromDate: FUTURE,
      shiftType: "navigation_watch",
      from: "08:00",
      to: "12:00",
    });
    expect(result.warnings).toEqual([]);
  });

  it("時刻の書き方が不正なら判定に進まない", () => {
    expect(() =>
      svc.checkShiftPlanCompliance({
        crewMemberId: "crew-tanaka",
        fromDate: FUTURE,
        shiftType: "navigation_watch",
        from: "8時",
        to: "12:00",
      }),
    ).toThrow(/HH:MM/);
  });
});

describe("新規作成の配信（追記型・陸上正本）", () => {
  it("期間ぶんの当直を作ると当直表に載る", () => {
    const created = svc.publishNewShift({
      crewMemberId: "crew-sato",
      fromDate: TODAY,
      toDate: addDays(TODAY, 1),
      shiftType: "cargo_watch",
      from: "13:00",
      to: "17:00",
      changeNote: "荷役の応援",
    });
    expect(created).toHaveLength(2);

    const week = svc.getShiftWeek();
    const cell = week.cells[`crew-sato|${TODAY}`] ?? [];
    expect(cell.some((p) => p.from === "13:00" && p.shiftType === "cargo_watch")).toBe(true);
    // 新規作成は既存を置き換えない（supersedesId を持たない）
    expect(created.every((p) => p.supersedesId === undefined)).toBe(true);
  });

  it("配置表に新しい持ち場を追加できる", () => {
    const created = svc.publishNewStation({
      crewMemberId: "crew-sato",
      scenario: "emergency",
      station: "第2甲板 消火班",
      duty: "ホース展張",
    });
    expect(created.planType).toBe("station");
    const rows = svc.getStationPlans().emergency ?? [];
    expect(rows.some((p) => p.station === "第2甲板 消火班")).toBe(true);
  });

  it("持ち場が空欄なら配信しない", () => {
    expect(() =>
      svc.publishNewStation({
        crewMemberId: "crew-sato",
        scenario: "cargo",
        station: "   ",
        duty: "",
      }),
    ).toThrow(/持ち場/);
  });
});

describe("当直の配分（3.2.3 公平な配分の可視化）", () => {
  it("船員別の合計と平均との差を出す", () => {
    const load = svc.buildWatchLoad();
    expect(load.rows.length).toBeGreaterThanOrEqual(4);
    const sato = load.rows.find((r) => r.crewMemberId === "crew-sato");
    // 直前のテストで 4時間 × 2日を追加している
    expect(sato && sato.minutes).toBeGreaterThanOrEqual(4 * 60);
    const sum = load.rows.reduce((a, r) => a + r.minutes, 0);
    expect(load.averageMinutes).toBe(Math.round(sum / load.rows.length));
    for (const r of load.rows) {
      expect(r.diffFromAverage).toBe(r.minutes - load.averageMinutes);
    }
  });
});
