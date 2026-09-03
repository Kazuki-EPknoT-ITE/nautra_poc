import { describe, expect, it } from "vitest";
import {
  CHART_BOUNDS,
  CHART_SIZE,
  chartLatLines,
  chartLonLines,
  crewChangesInPeriod,
  describeAge,
  evaluatePositionFreshness,
  fmtLatLon,
  projectToChart,
  type CrewChangeWarning,
} from "../position-plain";

/**
 * S-12 の導出（要件定義書 3.7.1 / 3.7.2）のテスト。
 * 無償 AIS は SLA がないため「参考情報」として扱い、古い観測に注意を出せることを確かめる。
 */

describe("位置の鮮度（3.7.1 参考情報としての扱い）", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");

  it("既定の目安（180分）より古い観測には「情報が古い可能性があります」と出す", () => {
    const r = evaluatePositionFreshness("2026-09-01T05:00:00.000Z", now);
    expect(r.stale).toBe(true);
    expect(r.level).toBe("caution");
    expect(r.message).toContain("情報が古い可能性があります");
  });

  it("目安の内側なら注意を出さない", () => {
    const r = evaluatePositionFreshness("2026-09-01T11:00:00.000Z", now);
    expect(r.stale).toBe(false);
    expect(r.level).toBe("ok");
    expect(r.ageMinutes).toBe(60);
  });

  it("目安は差し替えられる（商用 API に切り替えたら短くできる）", () => {
    const r = evaluatePositionFreshness("2026-09-01T11:00:00.000Z", now, 30);
    expect(r.stale).toBe(true);
  });

  it("経過時間は日常語で表す", () => {
    expect(describeAge(0)).toBe("たった今");
    expect(describeAge(45)).toBe("45分前");
    expect(describeAge(90)).toBe("1時間30分前");
    expect(describeAge(120)).toBe("2時間前");
    expect(describeAge(60 * 30)).toBe("1日前");
  });
});

describe("簡易海図への写像（3.7.1 地図表示）", () => {
  it("矩形の左上（北緯46度・東経128度）が原点になる", () => {
    const p = projectToChart(CHART_BOUNDS.maxLat, CHART_BOUNDS.minLon);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(p.outside).toBe(false);
  });

  it("矩形の右下（北緯30度・東経146度）が図の右下になる", () => {
    const p = projectToChart(CHART_BOUNDS.minLat, CHART_BOUNDS.maxLon);
    expect(p.x).toBeCloseTo(CHART_SIZE.width);
    expect(p.y).toBeCloseTo(CHART_SIZE.height);
  });

  it("緯度が上がるほど図では上（y が小さい）に来る", () => {
    const north = projectToChart(40, 135);
    const south = projectToChart(34, 135);
    expect(north.y).toBeLessThan(south.y);
  });

  it("範囲外の位置は端に丸めたうえで印を返す（描画が壊れない）", () => {
    const p = projectToChart(20, 120);
    expect(p.outside).toBe(true);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(CHART_SIZE.height);
  });

  it("グリッド線は範囲の内側だけを返す", () => {
    expect(chartLatLines()[0]).toBe(CHART_BOUNDS.minLat);
    expect(chartLatLines().at(-1)).toBe(CHART_BOUNDS.maxLat);
    expect(chartLonLines()[0]).toBe(CHART_BOUNDS.minLon);
    expect(chartLonLines().at(-1)).toBe(CHART_BOUNDS.maxLon);
  });

  it("緯度経度は日常語で表す", () => {
    expect(fmtLatLon(35.05, 136.87)).toBe("北緯35.050度 東経136.870度");
  });
});

describe("配乗との突き合わせ（3.7.2③）", () => {
  const changes: CrewChangeWarning[] = [
    { crewMemberId: "crew-sato", date: "2026-09-22", eventType: "off", duty: "一等航海士" },
    { crewMemberId: "crew-mori", date: "2026-09-15", eventType: "on", duty: "一等航海士" },
  ];

  it("航海の期間に重なる乗下船の予定だけを返す", () => {
    const hit = crewChangesInPeriod(changes, "2026-09-20", "2026-09-25");
    expect(hit.map((c) => c.crewMemberId)).toEqual(["crew-sato"]);
  });

  it("期間外なら何も返さない", () => {
    expect(crewChangesInPeriod(changes, "2026-10-01", "2026-10-05")).toEqual([]);
  });

  it("期間の指定が逆でも同じ結果になる", () => {
    const hit = crewChangesInPeriod(changes, "2026-09-25", "2026-09-20");
    expect(hit.map((c) => c.crewMemberId)).toEqual(["crew-sato"]);
  });
});
