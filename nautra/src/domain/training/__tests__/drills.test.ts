import { describe, expect, it } from "vitest";
import { evaluateDrills } from "@/domain/training/drills";
import { DEFAULT_DRILL_RULE_SET, type DrillRuleSet } from "@/rules/drill-rules";
import { DRILL_TYPES, type DrillRecordPayload, type DrillType } from "@/sync-protocol/records";

/**
 * 船内操練の次回期日判定（要件定義書 3.9 主要機能③）。
 * 閾値はルールセットから注入するため、テストも**版を差し替えて**期待値を確かめる。
 */

const TODAY = "2026-09-01";

/** ローカル日 YYYY-MM-DD の 14:00 を ISO で返す（記録は occurredAt の ISO で届く） */
function at14(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 14, 0, 0, 0).toISOString();
}

function drill(drillType: DrillType, ymd: string, id = `d-${drillType}-${ymd}`): DrillRecordPayload {
  return {
    id,
    tenantId: "tenant-demo",
    vesselId: "vessel-001",
    occurredAt: at14(ymd),
    recordedAt: at14(ymd),
    recordedBy: "crew-kato",
    deviceId: "dev-test",
    drillType,
    leader: "crew-kato",
    participants: ["crew-kato", "crew-sato"],
    durationMinutes: 45,
  };
}

const rules = DEFAULT_DRILL_RULE_SET;

describe("船内操練の次回期日（3.9 主要機能③・実施間隔はルールセットから注入）", () => {
  it("記録が1件も無い種別も必ず1行返し、「まだ一度も実施していない」と警告する", () => {
    const statuses = evaluateDrills([], TODAY, rules);
    expect(statuses).toHaveLength(DRILL_TYPES.length);
    for (const s of statuses) {
      expect(s.state).toBe("never");
      expect(s.level).toBe("violation");
      expect(s.message).toContain("まだ一度も実施していません");
    }
  });

  it("最終実施から間隔（92日）以内なら期日に余裕あり（ok）", () => {
    const [fire] = evaluateDrills([drill("fire", "2026-08-25")], TODAY, rules).filter(
      (s) => s.drillType === "fire",
    );
    expect(fire.lastDoneOn).toBe("2026-08-25");
    expect(fire.daysSinceLast).toBe(7);
    expect(fire.nextDueOn).toBe("2026-11-25");
    expect(fire.state).toBe("ok");
    expect(fire.level).toBe("ok");
  });

  it("次回期日まで 14日 以内なら「まもなく期日」（注意）", () => {
    // 92日 - 14日 = 78日前の実施 → 期日まで あと14日
    const [fire] = evaluateDrills([drill("fire", "2026-06-15")], TODAY, rules).filter(
      (s) => s.drillType === "fire",
    );
    expect(fire.daysToNextDue).toBe(14);
    expect(fire.state).toBe("due_soon");
    expect(fire.level).toBe("caution");
    expect(fire.message).toContain("あと 14日");
  });

  it("次回期日を過ぎたら超過（警告）とし、超過日数を日常語で示す", () => {
    const [fire] = evaluateDrills([drill("fire", "2026-05-01")], TODAY, rules).filter(
      (s) => s.drillType === "fire",
    );
    expect(fire.state).toBe("overdue");
    expect(fire.level).toBe("violation");
    expect(fire.daysToNextDue).toBeLessThan(0);
    expect(fire.message).toContain("過ぎています");
  });

  it("同じ種別に複数の記録があれば最新の実施日で判定する", () => {
    const [fire] = evaluateDrills(
      [drill("fire", "2026-01-10", "old"), drill("fire", "2026-08-20", "new")],
      TODAY,
      rules,
    ).filter((s) => s.drillType === "fire");
    expect(fire.lastDoneOn).toBe("2026-08-20");
    expect(fire.state).toBe("ok");
    expect(fire.lastRecord?.id).toBe("new");
  });

  it("緊急度の高い順（超過 → 未実施 → まもなく → 余裕あり）に並ぶ", () => {
    const statuses = evaluateDrills(
      [
        drill("fire", "2026-08-25"), // ok
        drill("abandon_ship", "2026-05-01"), // overdue
        drill("man_overboard", "2026-06-15"), // due_soon
      ],
      TODAY,
      rules,
    );
    expect(statuses.map((s) => s.state).slice(0, 2)).toEqual(["overdue", "never"]);
    expect(statuses[statuses.length - 1].state).toBe("ok");
  });

  it("実施間隔はルール版で変わる（判定に法令閾値を直書きしていない）", () => {
    const monthly: DrillRuleSet = {
      ...rules,
      id: "ruleset-drill-test-monthly",
      version: "test.1",
      values: {
        ...rules.values,
        intervalDaysByType: { ...rules.values.intervalDaysByType, fire: 30 },
      },
    };
    const records = [drill("fire", "2026-07-01")];
    const [byDefault] = evaluateDrills(records, TODAY, rules).filter((s) => s.drillType === "fire");
    const [byMonthly] = evaluateDrills(records, TODAY, monthly).filter(
      (s) => s.drillType === "fire",
    );
    expect(byDefault.state).toBe("ok");
    expect(byMonthly.state).toBe("overdue");
    expect(byMonthly.appliedRuleVersion).toBe("test.1");
    expect(byMonthly.intervalDays).toBe(30);
  });
});
