import { describe, expect, it } from "vitest";
import {
  evaluateDockPlan,
  evaluateEnvironmentFreshness,
  evaluateMaintenancePlan,
  evaluateMaintenancePlans,
  evaluatePartStock,
  evaluatePartStocks,
  findingLevel,
  nextOrderStatus,
} from "../fleet-plain";
import type { DockPlanPayload, MaintenancePlanPayload, PartStockPayload } from "@/sync-protocol/masters";
import type { MaintenanceRecordPayload } from "@/sync-protocol/records";

/**
 * S-11 の導出（要件定義書 3.4.1 / 3.4.2 / 3.5.3）のテスト。
 * 次回予定日・不足・進捗はいずれも保存せず、計画と実績から算出することを確かめる（12.3）。
 */

const TODAY = "2026-09-01";

const plan = (over: Partial<MaintenancePlanPayload> = {}): MaintenancePlanPayload => ({
  id: "mp-1",
  tenantId: "tenant-demo",
  vesselId: "vessel-001",
  occurredAt: "2026-06-01T00:00:00.000Z",
  recordedBy: "shore-yamamoto",
  deviceId: "seed-shore-device",
  publishedAt: "2026-06-01T00:00:00.000Z",
  publishedBy: "shore-yamamoto",
  targetVesselId: "vessel-001",
  equipment: "main_engine",
  task: "潤滑油・オイルフィルタ交換",
  intervalDays: 90,
  lastDoneOn: "2026-06-08",
  active: true,
  ...over,
});

const stock = (over: Partial<PartStockPayload> = {}): PartStockPayload => ({
  id: "ps-1",
  tenantId: "tenant-demo",
  vesselId: "vessel-001",
  occurredAt: "2026-06-01T00:00:00.000Z",
  recordedBy: "shore-yamamoto",
  deviceId: "seed-shore-device",
  publishedAt: "2026-06-01T00:00:00.000Z",
  publishedBy: "shore-yamamoto",
  targetVesselId: "vessel-001",
  partName: "主機 潤滑油フィルタ",
  unit: "個",
  quantity: 2,
  minQuantity: 3,
  orderStatus: "none",
  ...over,
});

const dock = (over: Partial<DockPlanPayload> = {}): DockPlanPayload => ({
  id: "dk-1",
  tenantId: "tenant-demo",
  vesselId: "vessel-001",
  occurredAt: "2026-08-01T00:00:00.000Z",
  recordedBy: "shore-yamamoto",
  deviceId: "seed-shore-device",
  publishedAt: "2026-08-01T00:00:00.000Z",
  publishedBy: "shore-yamamoto",
  targetVesselId: "vessel-001",
  kind: "intermediate",
  title: "中間検査（第2回）",
  plannedFrom: "2026-11-28",
  status: "planned",
  ...over,
});

describe("定期保守計画の次回予定日（3.4.1）", () => {
  it("次回予定日は「前回実施日 + 周期」で算出する（保存しない導出値）", () => {
    const s = evaluateMaintenancePlan(plan({ lastDoneOn: "2026-06-08", intervalDays: 90 }), TODAY);
    expect(s.nextDueOn).toBe("2026-09-06");
    expect(s.daysToDue).toBe(5);
    expect(s.daysSinceDone).toBe(85);
  });

  it("予定日を過ぎている計画は警告になり、超過日数を文言で示す", () => {
    const s = evaluateMaintenancePlan(plan({ lastDoneOn: "2026-06-18", intervalDays: 60 }), TODAY);
    expect(s.nextDueOn).toBe("2026-08-17");
    expect(s.level).toBe("violation");
    expect(s.message).toContain("15日 過ぎています");
  });

  it("予定日が近い計画は注意になる（既定は14日以内）", () => {
    const s = evaluateMaintenancePlan(plan({ lastDoneOn: "2026-06-08", intervalDays: 90 }), TODAY);
    expect(s.level).toBe("caution");
  });

  it("前回実施日が無ければ次回を出さず、注意として理由を示す", () => {
    const s = evaluateMaintenancePlan(plan({ lastDoneOn: undefined }), TODAY);
    expect(s.nextDueOn).toBeNull();
    expect(s.level).toBe("caution");
    expect(s.message).toContain("前回の実施日");
  });

  it("同じ機器の実績（日常点検を除く）を突き合わせる", () => {
    const record: MaintenanceRecordPayload = {
      id: "mr-1",
      tenantId: "tenant-demo",
      vesselId: "vessel-001",
      occurredAt: "2026-08-30T00:00:00.000Z",
      recordedBy: "crew-suzuki",
      deviceId: "vessel-device",
      equipment: "main_engine",
      recordType: "maintenance",
      crewMemberId: "crew-suzuki",
      condition: "good",
    };
    const daily: MaintenanceRecordPayload = {
      ...record,
      id: "mr-2",
      occurredAt: "2026-08-31T00:00:00.000Z",
      recordType: "daily_inspection",
    };
    const s = evaluateMaintenancePlan(plan(), TODAY, [record, daily]);
    expect(s.lastRecord?.id).toBe("mr-1");
  });

  it("一覧は超過 → まもなく → 余裕あり の順に並ぶ", () => {
    const rows = evaluateMaintenancePlans(
      [
        plan({ id: "a", lastDoneOn: "2026-08-30", intervalDays: 365 }),
        plan({ id: "b", lastDoneOn: "2026-06-18", intervalDays: 60 }),
        plan({ id: "c", lastDoneOn: "2026-06-08", intervalDays: 90 }),
      ],
      TODAY,
    );
    expect(rows.map((r) => r.plan.id)).toEqual(["b", "c", "a"]);
  });
});

describe("部品・消耗品の在庫（3.4.1）", () => {
  it("発注点を下回ると注意になり、手配を促す文言を出す", () => {
    const s = evaluatePartStock(stock({ quantity: 2, minQuantity: 3 }));
    expect(s.belowReorder).toBe(true);
    expect(s.level).toBe("caution");
    expect(s.message).toContain("手配してください");
  });

  it("在庫ゼロで手配もしていなければ警告になる", () => {
    const s = evaluatePartStock(stock({ quantity: 0, minQuantity: 1, orderStatus: "none" }));
    expect(s.outOfStock).toBe(true);
    expect(s.level).toBe("violation");
  });

  it("在庫ゼロでも手配中なら注意に留める（次の一手が既にある）", () => {
    const s = evaluatePartStock(stock({ quantity: 0, minQuantity: 1, orderStatus: "requested" }));
    expect(s.level).toBe("caution");
    expect(s.message).toContain("手配中");
  });

  it("足りているものは適合になる", () => {
    expect(evaluatePartStock(stock({ quantity: 6, minQuantity: 2 })).level).toBe("ok");
  });

  it("一覧は不足しているものを先頭に出す", () => {
    const rows = evaluatePartStocks([
      stock({ id: "ok", partName: "あ", quantity: 6, minQuantity: 2 }),
      stock({ id: "zero", partName: "い", quantity: 0, minQuantity: 1, orderStatus: "none" }),
      stock({ id: "low", partName: "う", quantity: 2, minQuantity: 3 }),
    ]);
    expect(rows.map((r) => r.stock.id)).toEqual(["zero", "low", "ok"]);
  });

  it("発注は 手配なし → 手配依頼中 → 発注済 → 入荷済 と進み、入荷済からは進まない", () => {
    expect(nextOrderStatus("none")).toBe("requested");
    expect(nextOrderStatus(undefined)).toBe("requested");
    expect(nextOrderStatus("requested")).toBe("ordered");
    expect(nextOrderStatus("ordered")).toBe("delivered");
    expect(nextOrderStatus("delivered")).toBeNull();
  });
});

describe("入渠・検査（3.4.2）", () => {
  it("準備タスクの進捗と未対応の指摘件数を数える", () => {
    const s = evaluateDockPlan(
      dock({
        prepTasks: [
          { key: "p1", label: "申請", done: true },
          { key: "p2", label: "計測手配", done: true },
          { key: "p3", label: "清掃", done: false },
        ],
        findings: [
          { key: "f1", content: "腐食", status: "open" },
          { key: "f2", content: "電池切れ", status: "closed" },
        ],
      }),
      TODAY,
    );
    expect(s.prepDone).toBe(2);
    expect(s.prepTotal).toBe(3);
    expect(s.openFindings).toBe(1);
    expect(s.daysToStart).toBe(88);
    expect(s.level).toBe("caution");
    expect(s.message).toContain("入渠まで あと 88日");
  });

  it("入渠の予定日を過ぎたまま完了していなければ警告になる", () => {
    const s = evaluateDockPlan(dock({ plannedFrom: "2026-08-20", status: "planned" }), TODAY);
    expect(s.level).toBe("violation");
    expect(s.message).toContain("12日 過ぎています");
  });

  it("指摘は期限切れを警告、期限が近いものを注意として示す", () => {
    expect(findingLevel({ key: "f", content: "x", status: "open", dueOn: "2026-08-25" }, TODAY).level).toBe(
      "violation",
    );
    expect(findingLevel({ key: "f", content: "x", status: "open", dueOn: "2026-09-05" }, TODAY).level).toBe(
      "caution",
    );
    expect(findingLevel({ key: "f", content: "x", status: "closed" }, TODAY).level).toBe("ok");
  });
});

describe("船内環境の確認日（3.5.3 求人の的確表示）", () => {
  it("確認から鮮度の閾値を超えると、求人票に使う前の確認を促す", () => {
    const r = evaluateEnvironmentFreshness("2026-01-01", TODAY);
    expect(r.level).toBe("caution");
    expect(r.message).toContain("求人票に使う前に確認してください");
  });

  it("確認日が無ければ注意にする（最新性が確かめられないため）", () => {
    expect(evaluateEnvironmentFreshness(undefined, TODAY).level).toBe("caution");
  });

  it("閾値内なら適合として経過日数を示す", () => {
    const r = evaluateEnvironmentFreshness("2026-08-02", TODAY);
    expect(r.level).toBe("ok");
    expect(r.daysSince).toBe(30);
  });
});
