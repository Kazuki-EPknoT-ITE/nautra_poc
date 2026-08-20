import { describe, expect, it } from "vitest";
import type { LaborRuleSet, TimeRecord, WorkCategory } from "../types";
import { evaluateDaily, evaluateWeekly, startOfLocalDay } from "../evaluate";
import { buildIntervals, effectiveRecords } from "../intervals";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";

/** テスト用打刻レコード生成（day: YYYY-MM-DD, hm: HH:MM ローカル時刻） */
let seq = 0;
function rec(
  crew: string,
  category: WorkCategory,
  action: "start" | "end",
  day: string,
  hm: string,
  extra: Partial<TimeRecord> = {},
): TimeRecord {
  const [h, m] = hm.split(":").map(Number);
  const d = startOfLocalDay(day);
  d.setHours(h, m, 0, 0);
  seq += 1;
  return {
    id: extra.id ?? `t-${String(seq).padStart(4, "0")}`,
    tenantId: "tenant-demo",
    vesselId: "vessel-001",
    crewMemberId: crew,
    workCategory: category,
    action,
    occurredAt: d.toISOString(),
    entryType: "realtime",
    recordedBy: crew,
    deviceId: "dev-test",
    ...extra,
  };
}

const DAY = "2026-08-10";
const NOW = (() => {
  const d = startOfLocalDay("2026-08-12");
  d.setHours(12, 0, 0, 0);
  return d;
})();
const rules: LaborRuleSet = DEFAULT_LABOR_RULE_SET;

function check(summary: ReturnType<typeof evaluateDaily>, key: string) {
  const c = summary.checks.find((c) => c.key === key);
  if (!c) throw new Error(`check not found: ${key}`);
  return c;
}

describe("労働時間上限（1日14時間・要件定義書 3.2.5 ①）", () => {
  it("1日の労働時間が14時間を超えると警告（赤）", () => {
    const records = [
      rec("c1", "navigation_watch", "start", DAY, "00:00"),
      rec("c1", "navigation_watch", "end", DAY, "14:30"),
    ];
    const s = evaluateDaily({ crewMemberId: "c1", date: DAY, records, now: NOW, ruleSet: rules });
    expect(s.workedMinutes).toBe(870);
    expect(check(s, "daily_max").level).toBe("violation");
    expect(s.level).toBe("violation");
  });

  it("1日の労働時間が上限の9割（12.6時間）以上で注意（黄）", () => {
    const records = [
      rec("c1", "navigation_watch", "start", DAY, "00:00"),
      rec("c1", "navigation_watch", "end", DAY, "13:00"),
    ];
    const s = evaluateDaily({ crewMemberId: "c1", date: DAY, records, now: NOW, ruleSet: rules });
    expect(check(s, "daily_max").level).toBe("caution");
  });

  it("8時間労働は適合", () => {
    const records = [
      rec("c1", "maintenance", "start", DAY, "08:00"),
      rec("c1", "maintenance", "end", DAY, "16:00"),
    ];
    const s = evaluateDaily({ crewMemberId: "c1", date: DAY, records, now: NOW, ruleSet: rules });
    expect(check(s, "daily_max").level).toBe("ok");
  });

  it("スタンバイ（荷役待ち待機）も労働時間に算入する（令和5年4月改正）", () => {
    const records = [
      rec("c1", "cargo", "start", DAY, "08:00"),
      rec("c1", "cargo", "end", DAY, "10:00"),
      rec("c1", "standby", "start", DAY, "10:00"),
      rec("c1", "standby", "end", DAY, "13:00"),
    ];
    const s = evaluateDaily({ crewMemberId: "c1", date: DAY, records, now: NOW, ruleSet: rules });
    expect(s.workedMinutes).toBe(300);
    expect(s.workedByCategory.standby).toBe(180);
  });
});

describe("連続1週間の上限（72時間・要件定義書 3.2.5 ②）", () => {
  function weekRecords(hoursPerDay: number): TimeRecord[] {
    const records: TimeRecord[] = [];
    for (let i = 0; i < 7; i++) {
      const d = startOfLocalDay("2026-08-04");
      d.setDate(d.getDate() + i);
      const day = `2026-08-${String(4 + i).padStart(2, "0")}`;
      const endH = Math.floor(hoursPerDay);
      const endM = Math.round((hoursPerDay - endH) * 60);
      records.push(rec("c1", "navigation_watch", "start", day, "00:00"));
      records.push(
        rec("c1", "navigation_watch", "end", day, `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`),
      );
    }
    return records;
  }

  it("連続する任意の1週間で72時間を超過すると警告", () => {
    const { check: c, totalMinutes } = evaluateWeekly({
      crewMemberId: "c1",
      endDate: DAY,
      records: weekRecords(10.5),
      now: NOW,
      ruleSet: rules,
    });
    expect(totalMinutes).toBe(10.5 * 60 * 7);
    expect(c.level).toBe("violation");
  });

  it("週合計が上限の9割（64.8時間）以上で注意", () => {
    const { check: c } = evaluateWeekly({
      crewMemberId: "c1",
      endDate: DAY,
      records: weekRecords(9.5),
      now: NOW,
      ruleSet: rules,
    });
    expect(c.level).toBe("caution");
  });

  it("週合計56時間は適合", () => {
    const { check: c } = evaluateWeekly({
      crewMemberId: "c1",
      endDate: DAY,
      records: weekRecords(8),
      now: NOW,
      ruleSet: rules,
    });
    expect(c.level).toBe("ok");
  });
});

describe("休息時間（回数・長さ・分割。要件定義書 3.2.5 ④）", () => {
  it("休息時間が1日合計10時間未満で警告", () => {
    const records = [
      rec("c1", "navigation_watch", "start", DAY, "00:00"),
      rec("c1", "navigation_watch", "end", DAY, "14:30"),
    ];
    const s = evaluateDaily({ crewMemberId: "c1", date: DAY, records, now: NOW, ruleSet: rules });
    expect(s.restTotalMinutes).toBe(570);
    expect(check(s, "rest_total").level).toBe("violation");
  });

  it("休息が3分割以上（分割回数上限2を超過）で警告", () => {
    const records = [
      rec("c1", "maintenance", "start", DAY, "06:00"),
      rec("c1", "maintenance", "end", DAY, "08:00"),
      rec("c1", "maintenance", "start", DAY, "10:00"),
      rec("c1", "maintenance", "end", DAY, "12:00"),
      rec("c1", "maintenance", "start", DAY, "14:00"),
      rec("c1", "maintenance", "end", DAY, "18:00"),
    ];
    const s = evaluateDaily({ crewMemberId: "c1", date: DAY, records, now: NOW, ruleSet: rules });
    expect(s.restPeriods.length).toBe(4);
    expect(check(s, "rest_split").level).toBe("violation");
  });

  it("休息2分割以内は適合", () => {
    const records = [
      rec("c1", "navigation_watch", "start", DAY, "00:00"),
      rec("c1", "navigation_watch", "end", DAY, "04:00"),
      rec("c1", "cargo", "start", DAY, "12:00"),
      rec("c1", "cargo", "end", DAY, "18:00"),
    ];
    const s = evaluateDaily({ crewMemberId: "c1", date: DAY, records, now: NOW, ruleSet: rules });
    expect(s.restPeriods.length).toBe(2);
    expect(check(s, "rest_split").level).toBe("ok");
    expect(check(s, "rest_total").level).toBe("ok");
  });

  it("最長の休息が6時間未満で警告", () => {
    const records = [
      rec("c1", "navigation_watch", "start", DAY, "00:00"),
      rec("c1", "navigation_watch", "end", DAY, "05:00"),
      rec("c1", "cargo", "start", DAY, "10:30"),
      rec("c1", "cargo", "end", DAY, "15:00"),
      rec("c1", "navigation_watch", "start", DAY, "20:00"),
      rec("c1", "navigation_watch", "end", DAY, "23:59"),
      // 翌日未明に次の当直があるため、深夜の休息も短い
      rec("c1", "navigation_watch", "start", "2026-08-11", "00:30"),
      rec("c1", "navigation_watch", "end", "2026-08-11", "04:00"),
    ];
    const s = evaluateDaily({ crewMemberId: "c1", date: DAY, records, now: NOW, ruleSet: rules });
    expect(check(s, "rest_longest").actual).toBeLessThan(360);
    expect(check(s, "rest_longest").level).toBe("violation");
  });

  it("当直2交代（04-08/16-20）の日跨ぎ休息は1回に連結し、分割違反としない", () => {
    const records: TimeRecord[] = [];
    for (const day of ["2026-08-09", DAY, "2026-08-11"]) {
      records.push(
        rec("c1", "navigation_watch", "start", day, "04:00"),
        rec("c1", "navigation_watch", "end", day, "08:00"),
        rec("c1", "navigation_watch", "start", day, "16:00"),
        rec("c1", "navigation_watch", "end", day, "20:00"),
      );
    }
    const s = evaluateDaily({ crewMemberId: "c1", date: DAY, records, now: NOW, ruleSet: rules });
    expect(check(s, "rest_split").actual).toBe(2); // 08-16 と 20:00→翌04:00
    expect(check(s, "rest_split").level).toBe("ok");
    expect(check(s, "rest_longest").actual).toBe(480);
    expect(check(s, "rest_longest").level).toBe("ok");
    expect(check(s, "rest_total").level).toBe("ok");
    expect(s.level).toBe("ok");
  });

  it("進行中の日は残り時間を休息と見なし、休息不足の早期誤警告を出さない", () => {
    const records = [
      rec("c1", "maintenance", "start", "2026-08-12", "00:00"),
      rec("c1", "maintenance", "end", "2026-08-12", "08:00"),
    ];
    // now = 2026-08-12 12:00（経過休息は4hだが、残り12hを休める見込み）
    const s = evaluateDaily({
      crewMemberId: "c1",
      date: "2026-08-12",
      records,
      now: NOW,
      ruleSet: rules,
    });
    expect(check(s, "rest_total").level).toBe("ok");
    expect(check(s, "rest_longest").level).toBe("ok"); // 進行中の日は確定判定しない
  });
});

describe("一次記録のイミュータブル性（差戻し・冪等。要件定義書 12.5）", () => {
  it("差戻し再入力（supersedesId）で無効化されたレコードは集計から除外し、元は物理保持する", () => {
    const wrong = rec("c1", "cargo", "start", DAY, "08:00", { id: "t-wrong" });
    const records = [
      wrong,
      rec("c1", "cargo", "end", DAY, "17:00", { id: "t-end" }),
      rec("c1", "cargo", "start", DAY, "09:00", {
        id: "t-fixed",
        entryType: "resubmit",
        supersedesId: "t-wrong",
      }),
    ];
    const effective = effectiveRecords(records);
    expect(effective.some((r) => r.id === "t-wrong")).toBe(false);
    expect(records.some((r) => r.id === "t-wrong")).toBe(true); // 元レコードは残る
    const s = evaluateDaily({ crewMemberId: "c1", date: DAY, records, now: NOW, ruleSet: rules });
    expect(s.workedMinutes).toBe(480); // 09:00-17:00
  });

  it("同一IDの重複（同期の再送）は二重集計しない（冪等）", () => {
    const a = rec("c1", "cargo", "start", DAY, "08:00", { id: "dup-1" });
    const b = rec("c1", "cargo", "end", DAY, "12:00", { id: "dup-2" });
    const s = evaluateDaily({
      crewMemberId: "c1",
      date: DAY,
      records: [a, b, { ...a }, { ...b }],
      now: NOW,
      ruleSet: rules,
    });
    expect(s.workedMinutes).toBe(240);
  });
});

describe("区間構成（intervals）", () => {
  it("終了打刻のない進行中区間は now までを労働として扱い、フラグを立てる", () => {
    const records = [rec("c1", "navigation_watch", "start", "2026-08-12", "08:00")];
    const s = evaluateDaily({
      crewMemberId: "c1",
      date: "2026-08-12",
      records,
      now: NOW, // 2026-08-12 12:00
      ruleSet: rules,
    });
    expect(s.hasOpenInterval).toBe(true);
    expect(s.workedMinutes).toBe(240);
  });

  it("作業切替（開始打刻の連続）は前の作業を暗黙終了する", () => {
    const records = [
      rec("c1", "navigation_watch", "start", DAY, "00:00"),
      rec("c1", "cargo", "start", DAY, "04:00"),
      rec("c1", "cargo", "end", DAY, "08:00"),
    ];
    const intervals = buildIntervals(records);
    expect(intervals.length).toBe(2);
    const s = evaluateDaily({ crewMemberId: "c1", date: DAY, records, now: NOW, ruleSet: rules });
    expect(s.workedByCategory.navigation_watch).toBe(240);
    expect(s.workedByCategory.cargo).toBe(240);
  });

  it("日跨ぎ区間は日ごとにクリップして集計する", () => {
    const records = [
      rec("c1", "navigation_watch", "start", "2026-08-09", "22:00"),
      rec("c1", "navigation_watch", "end", DAY, "02:00"),
    ];
    const d1 = evaluateDaily({ crewMemberId: "c1", date: "2026-08-09", records, now: NOW, ruleSet: rules });
    const d2 = evaluateDaily({ crewMemberId: "c1", date: DAY, records, now: NOW, ruleSet: rules });
    expect(d1.workedMinutes).toBe(120);
    expect(d2.workedMinutes).toBe(120);
  });
});

describe("ルール注入（rule_sets 版管理。基本設計書 5.3(6) / ガードレール⑪）", () => {
  it("判定結果に適用ルール版（applied_rule_version）を記録する", () => {
    const s = evaluateDaily({ crewMemberId: "c1", date: DAY, records: [], now: NOW, ruleSet: rules });
    expect(s.appliedRuleVersion).toBe(rules.version);
  });

  it("閾値は引数のルールセット由来（労使協定で日10時間に強化すると11時間労働が警告になる）", () => {
    const agreement: LaborRuleSet = {
      ...rules,
      id: "ruleset-agreement-x",
      version: "agreement-1",
      values: { ...rules.values, dailyMaxMinutes: 10 * 60 },
    };
    const records = [
      rec("c1", "cargo", "start", DAY, "00:00"),
      rec("c1", "cargo", "end", DAY, "11:00"),
    ];
    const byLaw = evaluateDaily({ crewMemberId: "c1", date: DAY, records, now: NOW, ruleSet: rules });
    const byAgreement = evaluateDaily({ crewMemberId: "c1", date: DAY, records, now: NOW, ruleSet: agreement });
    expect(check(byLaw, "daily_max").level).toBe("ok");
    expect(check(byAgreement, "daily_max").level).toBe("violation");
    expect(byAgreement.appliedRuleVersion).toBe("agreement-1");
  });
});
