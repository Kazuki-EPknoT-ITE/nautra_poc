import { describe, expect, it } from "vitest";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";
import {
  addDays,
  applyRuleOverrides,
  evaluateDaily,
  evaluatePeriod,
  evaluateRestDays,
  evaluateWeekly,
  monthRange,
} from "../evaluate";
import type { ExceptionalWorkKind, TimeRecord } from "../types";

/**
 * 3.2.5 で追加した法令チェックのテスト。
 *
 * - ③ 4週間・基準労働期間の時間外上限（`four_week_max` / `reference_period` / `monthly_overtime`）
 * - ⑤ 休日付与（週1日以上。`rest_day`）
 * - ⑥ **安全臨時労働・緊急作業の別枠管理（上限算定からの除外）**
 * - 6.5 労使協定による閾値の上書き（`applyRuleOverrides`）
 *
 * 閾値はすべて ruleSet 経由で注入する（ドメインが法令定数を持たないことの担保）。
 */

const RULES = DEFAULT_LABOR_RULE_SET;
const CREW = "crew-x";

let seq = 0;
function punch(
  date: string,
  hm: string,
  action: "start" | "end",
  exceptionKind?: ExceptionalWorkKind,
): TimeRecord {
  const [h, m] = hm.split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  return {
    id: `tr-${seq++}`,
    tenantId: "tenant-demo",
    vesselId: "vessel-001",
    crewMemberId: CREW,
    // 緊急作業は通常業務と別の作業種別として打刻される（並列打刻を成立させるため。
    // 同一種別で開始が続くと buildIntervals が前の区間を閉じてしまう）
    workCategory: exceptionKind ? "other" : "cargo",
    action,
    occurredAt: new Date(y, mo - 1, d, h, m, 0, 0).toISOString(),
    entryType: "realtime",
    recordedBy: CREW,
    deviceId: "dev-1",
    exceptionKind,
  };
}

/** 1日ぶんの労働（開始・終了のペア） */
function day(date: string, from: string, to: string, exceptionKind?: ExceptionalWorkKind): TimeRecord[] {
  return [punch(date, from, "start", exceptionKind), punch(date, to, "end", exceptionKind)];
}

/** now は判定日の終わり（進行中扱いを避けるため翌日 00:00 とする） */
function endOf(date: string): Date {
  const [y, m, d] = addDays(date, 1).split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

describe("安全臨時労働・緊急作業の別枠管理（要件定義書 3.2.5⑥ 上限算定からの除外）", () => {
  it("通常作業だけなら、実績と上限算定の対象時間は一致する", () => {
    const records = day("2026-09-01", "08:00", "18:00");
    const s = evaluateDaily({
      crewMemberId: CREW,
      date: "2026-09-01",
      records,
      now: endOf("2026-09-01"),
      ruleSet: RULES,
    });
    expect(s.workedMinutes).toBe(600);
    expect(s.countableWorkedMinutes).toBe(600);
    expect(s.exceptionalMinutes).toBe(0);
  });

  it("**緊急作業は記録簿には残るが、上限算定からは外れる**", () => {
    // 通常 08:00-18:00（10h）＋ 緊急 20:00-23:00（3h）= 実績13h、算定対象は10h
    const records = [
      ...day("2026-09-01", "08:00", "18:00"),
      ...day("2026-09-01", "20:00", "23:00", "safety_emergency"),
    ];
    const s = evaluateDaily({
      crewMemberId: CREW,
      date: "2026-09-01",
      records,
      now: endOf("2026-09-01"),
      ruleSet: RULES,
    });
    expect(s.workedMinutes).toBe(780); // 13h: 実績としては記録に残る
    expect(s.countableWorkedMinutes).toBe(600); // 10h: 上限判定はこちら
    expect(s.exceptionalMinutes).toBe(180); // 3h を別枠として除外
  });

  it("別枠を除けば上限内に収まる日は、警告にならない（14h 上限）", () => {
    // 通常 06:00-19:00（13h）＋ 緊急 19:00-23:00（4h）= 実績17h だが算定対象は13h
    const records = [
      ...day("2026-09-01", "06:00", "19:00"),
      ...day("2026-09-01", "19:00", "23:00", "safety_emergency"),
    ];
    const s = evaluateDaily({
      crewMemberId: CREW,
      date: "2026-09-01",
      records,
      now: endOf("2026-09-01"),
      ruleSet: RULES,
    });
    const dailyMax = s.checks.find((c) => c.key === "daily_max");
    expect(dailyMax?.actual).toBe(13 * 60);
    expect(dailyMax?.level).not.toBe("violation");
  });

  it("別枠が通常作業と時間帯で重なる場合、重なりは通常作業として数える（過小計上を防ぐ）", () => {
    // 通常 08:00-18:00 と 緊急 16:00-20:00 が 16-18 で重なる
    // 実績 = 08-20 の12h、算定対象 = 通常の 08-18 の10h、別枠 = 差の2h（18-20）
    const records = [
      ...day("2026-09-01", "08:00", "18:00"),
      ...day("2026-09-01", "16:00", "20:00", "safety_emergency"),
    ];
    const s = evaluateDaily({
      crewMemberId: CREW,
      date: "2026-09-01",
      records,
      now: endOf("2026-09-01"),
      ruleSet: RULES,
    });
    expect(s.workedMinutes).toBe(720);
    expect(s.countableWorkedMinutes).toBe(600);
    expect(s.exceptionalMinutes).toBe(120);
  });

  it("週の上限判定も別枠を除いた時間で行う", () => {
    const records: TimeRecord[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays("2026-09-01", -i);
      records.push(...day(d, "08:00", "18:00")); // 10h × 7 = 70h（上限72h内）
      records.push(...day(d, "20:00", "23:00", "safety_emergency")); // +3h × 7 = 21h
    }
    const w = evaluateWeekly({
      crewMemberId: CREW,
      endDate: "2026-09-01",
      records,
      now: endOf("2026-09-01"),
      ruleSet: RULES,
    });
    expect(w.totalMinutes).toBe(70 * 60); // 別枠 21h は算入しない
    expect(w.check.level).not.toBe("violation"); // 91h あるが判定は 70h
  });
});

describe("休日付与のチェック（要件定義書 3.2.5⑤ 週1日以上）", () => {
  it("7日すべてに労働記録があり休日の付与も無ければ違反", () => {
    const records: TimeRecord[] = [];
    for (let i = 0; i < 7; i++) records.push(...day(addDays("2026-09-07", -i), "08:00", "16:00"));
    const r = evaluateRestDays({
      crewMemberId: CREW,
      endDate: "2026-09-07",
      records,
      now: endOf("2026-09-07"),
      ruleSet: RULES,
    });
    expect(r.restDates).toEqual([]);
    expect(r.check.level).toBe("violation");
    expect(r.check.limit).toBe(1);
  });

  it("労働記録の無い日が1日あれば休日として数え、適合になる", () => {
    const records: TimeRecord[] = [];
    for (let i = 0; i < 7; i++) {
      if (i === 3) continue; // 1日休む
      records.push(...day(addDays("2026-09-07", -i), "08:00", "16:00"));
    }
    const r = evaluateRestDays({
      crewMemberId: CREW,
      endDate: "2026-09-07",
      records,
      now: endOf("2026-09-07"),
      ruleSet: RULES,
    });
    expect(r.restDates).toHaveLength(1);
    expect(r.check.level).toBe("ok");
  });

  it("**休日として付与された日**は、労働記録があっても休日に数える（補償休日の運用）", () => {
    const records: TimeRecord[] = [];
    for (let i = 0; i < 7; i++) records.push(...day(addDays("2026-09-07", -i), "08:00", "16:00"));
    const r = evaluateRestDays({
      crewMemberId: CREW,
      endDate: "2026-09-07",
      records,
      leaveDates: new Set(["2026-09-04"]),
      now: endOf("2026-09-07"),
      ruleSet: RULES,
    });
    expect(r.restDates).toEqual(["2026-09-04"]);
    expect(r.check.level).toBe("ok");
  });
});

describe("期間集計（要件定義書 3.2.1 4週単位・月単位 / 3.2.5③）", () => {
  it("月の範囲を求める（月末日は月ごとに変わる）", () => {
    expect(monthRange("2026-09")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("28日間の集計で、4週上限・週平均・時間外・休日日数が同時に求まる", () => {
    const records: TimeRecord[] = [];
    // 28日のうち 24日勤務（1日9h）、4日休み
    for (let i = 0; i < 28; i++) {
      const d = addDays("2026-09-01", i);
      if (i % 7 === 6) continue; // 週1日休む
      records.push(...day(d, "08:00", "17:00")); // 9h
    }
    const p = evaluatePeriod({
      crewMemberId: CREW,
      from: "2026-09-01",
      to: addDays("2026-09-01", 27),
      records,
      now: endOf(addDays("2026-09-01", 27)),
      ruleSet: RULES,
    });
    expect(p.days).toHaveLength(28);
    expect(p.workedDays).toBe(24);
    expect(p.restDays).toBe(4);
    expect(p.countableWorkedMinutes).toBe(24 * 9 * 60); // 216h
    // 時間外 = 所定8h を超えた分 = 1h × 24日
    expect(p.overtimeMinutes).toBe(24 * 60);
    // 週平均 = 216h / 4週 = 54h → 40h 上限を超える
    expect(p.weeklyAverageMinutes).toBe(54 * 60);
    expect(p.checks.find((c) => c.key === "reference_period")?.level).toBe("violation");
    // 4週上限 160h に対し 216h → 超過
    expect(p.checks.find((c) => c.key === "four_week_max")?.level).toBe("violation");
    // 休日は 4週で4日 → 必要数（4）を満たす
    expect(p.checks.find((c) => c.key === "rest_day")?.level).toBe("ok");
  });

  it("所定内に収まる働き方では、期間判定がすべて適合になる", () => {
    const records: TimeRecord[] = [];
    for (let i = 0; i < 28; i++) {
      const d = addDays("2026-09-01", i);
      if (i % 7 >= 5) continue; // 週2日休む
      records.push(...day(d, "08:00", "15:00")); // 7h（所定8h内）
    }
    const p = evaluatePeriod({
      crewMemberId: CREW,
      from: "2026-09-01",
      to: addDays("2026-09-01", 27),
      records,
      now: endOf(addDays("2026-09-01", 27)),
      ruleSet: RULES,
    });
    expect(p.overtimeMinutes).toBe(0);
    expect(p.weeklyAverageMinutes).toBe(35 * 60); // 週平均35h（40h 上限の9割未満）
    expect(p.level).toBe("ok");
  });

  it("週平均が上限ちょうどのときは『注意』になる（上限接近＝黄。3.2.5 の2段階アラート）", () => {
    const records: TimeRecord[] = [];
    for (let i = 0; i < 28; i++) {
      const d = addDays("2026-09-01", i);
      if (i % 7 >= 5) continue;
      records.push(...day(d, "08:00", "16:00")); // 8h × 週5日 = 週40h ちょうど
    }
    const p = evaluatePeriod({
      crewMemberId: CREW,
      from: "2026-09-01",
      to: addDays("2026-09-01", 27),
      records,
      now: endOf(addDays("2026-09-01", 27)),
      ruleSet: RULES,
    });
    expect(p.weeklyAverageMinutes).toBe(40 * 60);
    // 超過はしていないが上限に達しているので警告(赤)ではなく注意(黄)
    expect(p.checks.find((c) => c.key === "reference_period")?.level).toBe("caution");
  });

  it("月の時間外が協定の上限を超えると警告になる", () => {
    const records: TimeRecord[] = [];
    // 30日間、毎日 13h 勤務 → 時間外 5h × 30 = 150h（上限80h超）
    for (let i = 0; i < 30; i++) records.push(...day(addDays("2026-09-01", i), "06:00", "19:00"));
    const p = evaluatePeriod({
      crewMemberId: CREW,
      from: "2026-09-01",
      to: "2026-09-30",
      records,
      now: endOf("2026-09-30"),
      ruleSet: RULES,
    });
    expect(p.overtimeMinutes).toBe(150 * 60);
    expect(p.checks.find((c) => c.key === "monthly_overtime")?.level).toBe("violation");
  });

  it("別枠の緊急作業は期間集計でも上限算定から外れる（実績には残る）", () => {
    const records: TimeRecord[] = [];
    for (let i = 0; i < 28; i++) {
      const d = addDays("2026-09-01", i);
      records.push(...day(d, "08:00", "16:00")); // 8h 通常
      if (i === 0) records.push(...day(d, "20:00", "23:00", "safety_emergency")); // 3h 別枠
    }
    const p = evaluatePeriod({
      crewMemberId: CREW,
      from: "2026-09-01",
      to: addDays("2026-09-01", 27),
      records,
      now: endOf(addDays("2026-09-01", 27)),
      ruleSet: RULES,
    });
    expect(p.workedMinutes).toBe(28 * 8 * 60 + 180);
    expect(p.countableWorkedMinutes).toBe(28 * 8 * 60);
    expect(p.exceptionalMinutes).toBe(180);
  });

  it("判定結果には適用したルール版が記録される（基本設計書 5.3(6)）", () => {
    const p = evaluatePeriod({
      crewMemberId: CREW,
      from: "2026-09-01",
      to: "2026-09-07",
      records: day("2026-09-01", "08:00", "16:00"),
      now: endOf("2026-09-07"),
      ruleSet: RULES,
    });
    expect(p.appliedRuleVersion).toBe(RULES.version);
  });
});

describe("労使協定による閾値の上書き（要件定義書 6.5）", () => {
  it("上書きした値が判定に効き、適用版に協定が現れる", () => {
    const overridden = applyRuleOverrides(RULES, { monthlyOvertimeMaxMinutes: 200 * 60 }, "2026.1");
    expect(overridden.values.monthlyOvertimeMaxMinutes).toBe(200 * 60);
    // 上書きしていない値は既定のまま
    expect(overridden.values.dailyMaxMinutes).toBe(RULES.values.dailyMaxMinutes);
    expect(overridden.version).toBe(`${RULES.version}+2026.1`);

    const records: TimeRecord[] = [];
    for (let i = 0; i < 30; i++) records.push(...day(addDays("2026-09-01", i), "06:00", "19:00"));
    const base = evaluatePeriod({
      crewMemberId: CREW,
      from: "2026-09-01",
      to: "2026-09-30",
      records,
      now: endOf("2026-09-30"),
      ruleSet: RULES,
    });
    const withAgreement = evaluatePeriod({
      crewMemberId: CREW,
      from: "2026-09-01",
      to: "2026-09-30",
      records,
      now: endOf("2026-09-30"),
      ruleSet: overridden,
    });
    // 実績は同じでも、協定の上限が違えば判定が変わる
    expect(base.checks.find((c) => c.key === "monthly_overtime")?.limit).toBe(80 * 60);
    expect(withAgreement.checks.find((c) => c.key === "monthly_overtime")?.limit).toBe(200 * 60);
    expect(withAgreement.appliedRuleVersion).toContain("2026.1");
  });

  it("上書きが無ければ元のルールセットをそのまま返す（無用な版の派生を作らない）", () => {
    expect(applyRuleOverrides(RULES, undefined)).toBe(RULES);
    expect(applyRuleOverrides(RULES, {})).toBe(RULES);
  });
});
