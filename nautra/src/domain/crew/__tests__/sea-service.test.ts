import { describe, expect, it } from "vitest";
import type { EmbarkationPayload } from "@/sync-protocol/masters";
import { addDaysYmd } from "../freshness";
import { buildSeaServicePeriods, evaluateSeaService } from "../sea-service";

/**
 * 乗船履歴の集計と免状更新要件の判定（要件定義書 6.2 C群「海技免状の更新」）。
 * 「乗船履歴（5年内1年以上）**または**更新講習」なので、
 * 足りない場合は「更新講習の経路になる」と示すのが正しい（更新不可ではない）。
 */

const TODAY = "2026-09-01";

let seq = 0;
function ev(
  eventType: "on" | "off",
  date: string,
  targetVesselId = "vessel-001",
  status: "actual" | "planned" = "actual",
): EmbarkationPayload {
  return {
    id: `emb-${seq++}`,
    tenantId: "tenant-demo",
    vesselId: "company-demo",
    occurredAt: `${date}T00:00:00.000Z`,
    recordedBy: "shore-yamamoto",
    deviceId: "shore-planner-device",
    publishedAt: `${date}T00:00:00.000Z`,
    publishedBy: "shore-yamamoto",
    crewMemberId: "crew-x",
    eventType,
    targetVesselId,
    date,
    status,
  } as EmbarkationPayload;
}

describe("乗船期間の組み立て", () => {
  it("乗船と下船の組から在船期間を作る", () => {
    const periods = buildSeaServicePeriods(
      [ev("on", "2026-01-01"), ev("off", "2026-04-01")],
      TODAY,
    );
    expect(periods).toHaveLength(1);
    expect(periods[0].days).toBe(90);
    expect(periods[0].to).toBe("2026-04-01");
  });

  it("下船が無ければ現在も乗船中として基準日まで数える", () => {
    const periods = buildSeaServicePeriods([ev("on", addDaysYmd(TODAY, -30))], TODAY);
    expect(periods[0].to).toBeNull();
    expect(periods[0].days).toBe(30);
  });

  it("**予定（planned）は履歴に数えない**（計画と実績を分ける）", () => {
    const periods = buildSeaServicePeriods(
      [ev("on", "2026-01-01", "vessel-001", "planned"), ev("off", "2026-04-01", "vessel-001", "planned")],
      TODAY,
    );
    expect(periods).toEqual([]);
  });

  it("対応する乗船の無い下船は無視する（片方だけの記録で履歴を作らない）", () => {
    expect(buildSeaServicePeriods([ev("off", "2026-04-01")], TODAY)).toEqual([]);
  });

  it("複数の船を跨いでも、船ごとに乗船・下船を対応づける", () => {
    const periods = buildSeaServicePeriods(
      [
        ev("on", "2026-01-01", "vessel-001"),
        ev("on", "2026-02-01", "vessel-002"),
        ev("off", "2026-03-01", "vessel-001"),
        ev("off", "2026-05-01", "vessel-002"),
      ],
      TODAY,
    );
    expect(periods).toHaveLength(2);
    expect(periods.find((p) => p.vesselId === "vessel-001")?.days).toBe(59);
    expect(periods.find((p) => p.vesselId === "vessel-002")?.days).toBe(89);
  });
});

describe("免状更新の乗船履歴要件（5年内1年以上）", () => {
  it("直近5年で1年以上乗っていれば要件を満たす", () => {
    const r = evaluateSeaService({
      crewMemberId: "crew-x",
      embarkations: [ev("on", addDaysYmd(TODAY, -400)), ev("off", addDaysYmd(TODAY, -20))],
      today: TODAY,
    });
    expect(r.totalDays).toBe(380);
    expect(r.meetsRequirement).toBe(true);
    expect(r.shortfallDays).toBe(0);
    expect(r.level).toBe("ok");
    expect(r.message).toContain("乗船履歴での更新ができます");
  });

  it("足りない場合は不足日数を示し、**更新講習の経路**を案内する（更新不可とは言わない）", () => {
    const r = evaluateSeaService({
      crewMemberId: "crew-x",
      embarkations: [ev("on", addDaysYmd(TODAY, -100)), ev("off", addDaysYmd(TODAY, -10))],
      today: TODAY,
    });
    expect(r.totalDays).toBe(90);
    expect(r.meetsRequirement).toBe(false);
    expect(r.shortfallDays).toBe(275);
    expect(r.message).toContain("更新講習");
    expect(r.message).not.toContain("更新できません");
  });

  it("**5年より前の乗船は数えない**（遡り期間の外）", () => {
    const r = evaluateSeaService({
      crewMemberId: "crew-x",
      embarkations: [ev("on", addDaysYmd(TODAY, -3000)), ev("off", addDaysYmd(TODAY, -2000))],
      today: TODAY,
    });
    expect(r.totalDays).toBe(0);
    expect(r.meetsRequirement).toBe(false);
  });

  it("遡り期間を跨ぐ乗船は、**窓に重なった分だけ**を数える", () => {
    // 5年前より前に乗船し、4年前に下船 → 窓（5年）に入るのは windowFrom〜下船日
    const r = evaluateSeaService({
      crewMemberId: "crew-x",
      embarkations: [ev("on", addDaysYmd(TODAY, -2000)), ev("off", addDaysYmd(TODAY, -1500))],
      today: TODAY,
    });
    // 窓の開始は today-1825。重なりは (today-1825) 〜 (today-1500) = 325日
    expect(r.totalDays).toBe(325);
  });

  it("複数回の乗船は合算される", () => {
    const r = evaluateSeaService({
      crewMemberId: "crew-x",
      embarkations: [
        ev("on", addDaysYmd(TODAY, -900)),
        ev("off", addDaysYmd(TODAY, -700)), // 200日
        ev("on", addDaysYmd(TODAY, -400)),
        ev("off", addDaysYmd(TODAY, -200)), // 200日
      ],
      today: TODAY,
    });
    expect(r.totalDays).toBe(400);
    expect(r.meetsRequirement).toBe(true);
  });

  it("あと少しで足りる場合は注意（黄）になる", () => {
    const r = evaluateSeaService({
      crewMemberId: "crew-x",
      embarkations: [ev("on", addDaysYmd(TODAY, -350)), ev("off", addDaysYmd(TODAY, -10))],
      today: TODAY,
    });
    expect(r.totalDays).toBe(340); // 365 の 9割以上
    expect(r.meetsRequirement).toBe(false);
    expect(r.level).toBe("caution");
  });

  it("閾値は引数で注入でき、協定・法改正に追従できる（ドメインが定数を持たない）", () => {
    const r = evaluateSeaService({
      crewMemberId: "crew-x",
      embarkations: [ev("on", addDaysYmd(TODAY, -100)), ev("off", addDaysYmd(TODAY, -10))],
      today: TODAY,
      rules: { lookbackDays: 365 * 3, requiredDays: 90, cautionRatio: 0.9 },
    });
    expect(r.requiredDays).toBe(90);
    expect(r.meetsRequirement).toBe(true);
  });
});
