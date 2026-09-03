import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { addDays, ymdLocal } from "@/domain/labor-law/evaluate";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";

/**
 * 6.5「協定内容 → アラート閾値への自動反映」と 3.2.4「休日・有給・補償休日」の回帰テスト。
 *
 * ストアは `process.cwd()/.data/store.json` に永続化されるため、
 * **一時ディレクトリへ移ってから**サービスを読み込み、開発用のデモストアを汚さない。
 */

type LaborRules = typeof import("@/server/labor-rules");
type LeaveService = typeof import("@/server/leave-service");
type LedgerService = typeof import("@/server/ledger-service");
type MasterService = typeof import("@/server/master-service");

let rules: LaborRules;
let leave: LeaveService;
let ledger: LedgerService;
let ms: MasterService;

const ACTOR = "shore-admin";
const TODAY = ymdLocal(new Date());

beforeAll(async () => {
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "nautra-rules-")));
  rules = await import("@/server/labor-rules");
  leave = await import("@/server/leave-service");
  ledger = await import("@/server/ledger-service");
  ms = await import("@/server/master-service");
});

describe("労使協定が判定閾値に反映される（要件定義書 6.5）", () => {
  it("適用期間中の協定だけを拾う", () => {
    const active = rules.activeAgreements();
    expect(active.map((a) => a.version)).toContain("2026.1"); // 時間外労働の労使協定
    for (const a of active) {
      expect(a.effectiveFrom <= TODAY).toBe(true);
      expect(!a.effectiveTo || a.effectiveTo >= TODAY).toBe(true);
    }
  });

  it("協定の上書き値がルールセットに乗り、適用版に協定版が残る", () => {
    const set = rules.currentLaborRuleSet();
    expect(set.values.monthlyOvertimeMaxMinutes).toBe(80 * 60);
    expect(set.values.restSplitMax).toBe(2);
    // 上書きしていない項目は法令の既定値のまま
    expect(set.values.dailyMaxMinutes).toBe(DEFAULT_LABOR_RULE_SET.values.dailyMaxMinutes);
    expect(set.version).toContain(DEFAULT_LABOR_RULE_SET.version);
    expect(set.version).toContain("協定2026.1");
  });

  it("既定値と上書き後の値を並べた表を作れる（上書き元も分かる）", () => {
    const rows = rules.buildRuleValueRows();
    const daily = rows.find((r) => r.key === "dailyMaxMinutes");
    expect(daily?.overridden).toBe(false);
    expect(daily?.base).toBe(daily?.applied);
    expect(rows).toHaveLength(Object.keys(DEFAULT_LABOR_RULE_SET.values).length);

    // 協定が定めているが値は既定と同じ項目は「協定で決まっている」と分かるようにする
    const split = rows.find((r) => r.key === "restSplitMax");
    expect(split?.overridden).toBe(true);
    expect(split?.changed).toBe(false);
    expect(split?.sourceVersion).toBe("2026.1");
  });

  it("新しい協定版を登録すると、その日から判定の基準が変わる", () => {
    const before = rules.currentLaborRuleSet().values.dailyMaxMinutes;
    rules.publishAgreement({
      kind: "labor_agreement",
      title: "テスト用の協定",
      version: "9999.1",
      effectiveFrom: addDays(TODAY, -1),
      effectiveTo: addDays(TODAY, 30),
      overrideValues: { dailyMaxMinutes: 12 * 60 },
      actor: ACTOR,
    });
    const after = rules.currentLaborRuleSet();
    expect(before).toBe(14 * 60);
    expect(after.values.dailyMaxMinutes).toBe(12 * 60);
    expect(after.version).toContain("9999.1");

    const row = rules.buildRuleValueRows().find((r) => r.key === "dailyMaxMinutes");
    expect(row?.overridden).toBe(true);
    expect(row?.changed).toBe(true);
    expect(row?.sourceVersion).toBe("9999.1");
  });

  it("閾値の変更は監査ログに残る（12.6）", () => {
    const log = ms
      .listAuditLogs(50)
      .find((l) => l.entityKind === "agreement" && l.after?.includes("9999.1"));
    expect(log).toBeDefined();
    expect(log?.action).toBe("create");
    expect(log?.actor).toBe(ACTOR);
  });

  it("適用期間が逆さまの協定は登録できない", () => {
    expect(() =>
      rules.publishAgreement({
        kind: "labor_agreement",
        title: "不正な期間",
        version: "9999.2",
        effectiveFrom: addDays(TODAY, 10),
        effectiveTo: addDays(TODAY, 1),
        actor: ACTOR,
      }),
    ).toThrow(/適用終了日/);
  });
});

describe("休日・有給・補償休日の残日数は導出値（要件定義書 3.2.4 / 12.3）", () => {
  it("付与から取得を引いた残りを算出する", () => {
    const balance = leave.buildLeaveBalance("crew-kato");
    const paid = balance.kinds.find((k) => k.kind === "paid_leave");
    expect(paid).toMatchObject({ granted: 20, taken: 5, remaining: 15 });
    expect(balance.paidRemaining).toBe(15);

    const comp = balance.kinds.find((k) => k.kind === "compensatory");
    expect(comp).toMatchObject({ granted: 1, taken: 0, remaining: 1 });
  });

  it("全船員ぶんの残日数を一覧にできる", () => {
    const board = leave.buildLeaveBoard();
    expect(board.length).toBeGreaterThanOrEqual(4);
    const tanaka = board.find((b) => b.crewMemberId === "crew-tanaka");
    expect(tanaka?.paidRemaining).toBe(12 - 3);
  });

  it("休日に数えるのは「取得した日」と「法定休日・補償休日を与えた日」だけ", () => {
    const dates = leave.leaveDatesOf("crew-kato");
    expect(dates.has(addDays(TODAY, -20))).toBe(true); // 補償休日の付与日
    expect(dates.has(addDays(TODAY, -45))).toBe(true); // 有給の取得日
    expect(dates.has(addDays(TODAY, -200))).toBe(false); // 有給の年次付与日は休みではない
  });

  it("付与を登録すると残日数が増える（記録は追記のみ）", () => {
    const before = leave.buildLeaveBalance("crew-sato").paidRemaining;
    leave.publishLeaveRecord({
      crewMemberId: "crew-sato",
      kind: "paid_leave",
      action: "grant",
      date: TODAY,
      days: 2,
      expiresOn: addDays(TODAY, 730),
      reason: "追加付与",
      actor: ACTOR,
    });
    expect(leave.buildLeaveBalance("crew-sato").paidRemaining).toBe(before + 2);
  });

  it("時効を過ぎた付与は残日数に数えない", () => {
    const before = leave.buildLeaveBalance("crew-suzuki");
    leave.publishLeaveRecord({
      crewMemberId: "crew-suzuki",
      kind: "paid_leave",
      action: "grant",
      date: addDays(TODAY, -400),
      days: 5,
      expiresOn: addDays(TODAY, -10),
      actor: ACTOR,
    });
    const after = leave.buildLeaveBalance("crew-suzuki");
    const paid = after.kinds.find((k) => k.kind === "paid_leave");
    expect(paid?.expired).toBe(5);
    expect(after.paidRemaining).toBe(before.paidRemaining);
  });

  it("日数・日付が不正な登録は受け付けない", () => {
    expect(() =>
      leave.publishLeaveRecord({
        crewMemberId: "crew-kato",
        kind: "paid_leave",
        action: "grant",
        date: "2026/04/01",
        days: 1,
        actor: ACTOR,
      }),
    ).toThrow(/YYYY-MM-DD/);
    expect(() =>
      leave.publishLeaveRecord({
        crewMemberId: "crew-kato",
        kind: "paid_leave",
        action: "take",
        date: TODAY,
        days: 0,
        actor: ACTOR,
      }),
    ).toThrow(/日数/);
  });
});

describe("4週単位・月単位の自動集計（要件定義書 3.2.1 / 3.2.5③⑤）", () => {
  it("4週の窓は28日で、4週上限と週平均を判定する", () => {
    const agg = ledger.buildLedgerAggregates("crew-kato", TODAY.slice(0, 7));
    expect(agg.fourWeek.days).toHaveLength(28);
    expect(agg.fourWeek.checks.map((c) => c.key)).toEqual(
      expect.arrayContaining(["four_week_max", "reference_period"]),
    );
  });

  it("月の集計は時間外の上限（労使協定の値）で判定する", () => {
    const agg = ledger.buildLedgerAggregates("crew-kato", TODAY.slice(0, 7));
    const overtime = agg.monthly.checks.find((c) => c.key === "monthly_overtime");
    // 直前のテストで日上限を上書きしているが、時間外上限は協定 2026.1 の 80時間のまま
    expect(overtime?.limit).toBe(80 * 60);
  });

  it("休日の判定には休暇記録の日付も数える（3.2.5⑤）", () => {
    const agg = ledger.buildLedgerAggregates("crew-kato", TODAY.slice(0, 7));
    expect(agg.restDay.key).toBe("rest_day");
    expect(agg.leaveDates).toContain(addDays(TODAY, -20));
  });
});
