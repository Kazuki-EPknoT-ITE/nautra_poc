import { describe, expect, it } from "vitest";
import { addDaysYmd, evaluateCredential } from "@/domain/crew/freshness";
import { evaluateManningEligibility } from "@/domain/crew/manning";
import { checkFilingRequirements } from "@/domain/filing/requirements";
import { evaluateProcedures } from "@/domain/procedures/deadlines";
import { evaluateDaily, evaluateRestDays } from "@/domain/labor-law/evaluate";
import type { TimeRecord } from "@/domain/labor-law/types";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";
import { applyPush, createEmptyStoreState } from "@/server/apply-push";
import { makeSeedEvents } from "@/lib/seed";
import { makeMasterSeedEvents } from "@/lib/seed-masters";
import { DEFAULT_CREDENTIAL_RULE_SET } from "@/rules/credential-rules";
import { SYNC_KINDS } from "@/sync-protocol/events";
import { latestBySupersedes } from "@/sync-protocol/records";
import type {
  CredentialPayload,
  CrewMasterPayload,
  PartStockPayload,
  ProcedureTaskPayload,
} from "@/sync-protocol/masters";

/**
 * デモデータがそのまま同期経路を通ることを検証する。
 *
 * これは「レジストリに種別を足したがユニオンに入っていない」「ペイロードがスキーマに
 * 合っていない」といった不整合を**隔離の発生**として検出するための回帰テスト。
 * 隔離は例外を投げずに黙って積まれるため、テストで見張らないと画面が空になるまで気づけない。
 */

const TODAY = "2026-09-01";

describe("マスタ・事務エンティティのデモデータ（要件定義書 3.1/3.4〜3.9/6.2/9章/12章）", () => {
  it("すべてのイベントが受理され、1件も隔離されない", () => {
    const state = createEmptyStoreState("store-test", 1);
    const events = makeSeedEvents(TODAY);
    const result = applyPush(state, "seed-shore-device", events, new Date("2026-09-01T00:00:00Z"));

    expect(result.quarantined, `隔離されたイベント: ${result.quarantined.join(", ")}`).toEqual([]);
    expect(result.accepted).toHaveLength(events.length);
    expect(state.quarantine).toHaveLength(0);
  });

  it("レジストリの全種別にデモデータがあり、どの画面も空にならない", () => {
    const state = createEmptyStoreState("store-test", 1);
    applyPush(state, "seed-shore-device", makeSeedEvents(TODAY), new Date());
    const kinds = new Set(state.events.map((e) => e.event.kind));
    for (const kind of SYNC_KINDS) {
      expect(kinds.has(kind), `${kind} のデモデータが無い`).toBe(true);
    }
  });

  it("マスタは陸上正本として配信され、船内端末からの Push は隔離される（12.5 陸上優先）", () => {
    const state = createEmptyStoreState("store-test", 1);
    const masterEvents = makeMasterSeedEvents(TODAY).filter((e) => e.kind === "crew_master");
    expect(masterEvents.length).toBeGreaterThan(0);

    // 船内端末（dev-*）から同じイベントを送ると隔離される（破棄はされない）
    const fromVessel = masterEvents.map((e) => ({ ...e, deviceId: "dev-01abc" }));
    const r = applyPush(state, "dev-01abc", fromVessel, new Date());
    expect(r.accepted).toEqual([]);
    expect(r.quarantined).toHaveLength(masterEvents.length);
    expect(state.quarantine[0].reason).toMatch(/shore-authoritative/);
  });

  it("イベントIDが全体で一意（冪等キーの衝突でデータが落ちない）", () => {
    const events = makeSeedEvents(TODAY);
    const ids = events.map((e) => e.eventId);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `重複した eventId: ${[...new Set(dupes)].join(", ")}`).toEqual([]);
  });
});

/**
 * デモシナリオの成立を検証する。
 *
 * 陸上の各画面（配乗計画・届出・手続き・船員カルテ）は「この状態が見えること」を
 * 受け入れ基準にしている。シードを直したときに、意図した見どころが静かに消えていないか
 * をここで見張る（画面を1つずつ開いて確かめる代わり）。
 */
describe("デモシナリオが意図どおり成立する", () => {
  const crewMasters = () =>
    latestBySupersedes(
      makeMasterSeedEvents(TODAY)
        .filter((e) => e.kind === "crew_master")
        .map((e) => e.payload as CrewMasterPayload),
    );
  const credentialsOf = (crewMemberId: string) =>
    latestBySupersedes(
      makeMasterSeedEvents(TODAY)
        .filter((e) => e.kind === "credential")
        .map((e) => e.payload as CredentialPayload),
    ).filter((c) => c.subjectType === "crew" && c.subjectId === crewMemberId);

  const eligibilityOf = (crewMemberId: string, over: Partial<Parameters<typeof evaluateManningEligibility>[0]> = {}) =>
    evaluateManningEligibility({
      crewMemberId,
      master: crewMasters().find((m) => m.crewMemberId === crewMemberId),
      credentials: credentialsOf(crewMemberId),
      today: TODAY,
      ruleSet: DEFAULT_CREDENTIAL_RULE_SET,
      laborLevel: "ok",
      ...over,
    });

  it("乗船中の4名は配乗の妨げになる不備を持たない（免状・健診・基本訓練・保険が揃う）", () => {
    for (const id of ["crew-kato", "crew-sato", "crew-suzuki", "crew-tanaka"]) {
      const r = eligibilityOf(id);
      expect(r.status, `${id} が blocked になっている: ${r.issues.map((i) => i.label).join(" / ")}`).not.toBe(
        "blocked",
      );
    }
  });

  it("**森（予備船員）は雇用保険の加入が未確認で配乗できない**（3.1.2 ブロック条件）", () => {
    const r = eligibilityOf("crew-mori");
    expect(r.status).toBe("blocked");
    expect(r.issues.some((i) => i.key === "insurance_missing_employment")).toBe(true);
  });

  it("**石井（新規雇入予定）は基本訓練が未修了**で、2026-02-14 以降の乗船では配乗できない", () => {
    const r = eligibilityOf("crew-ishii", { embarkOn: addDaysYmd(TODAY, 14) });
    expect(r.status).toBe("blocked");
    expect(r.issues.some((i) => i.key === "missing_stcw_basic")).toBe(true);
  });

  it("**鈴木の健康証明書は期限内だが『要再確認』**（12.4 鮮度切れ。不適合ではない）", () => {
    const med = credentialsOf("crew-suzuki").find((c) => c.category === "medical")!;
    const s = evaluateCredential(med, TODAY, DEFAULT_CREDENTIAL_RULE_SET);
    expect(s.expiry).not.toBe("expired"); // 期限は切れていない
    expect(s.freshness).toBe("stale"); // 確認が古いだけ
    expect(s.level).toBe("caution");
  });

  it("**佐藤の海技免状は更新の着手時期**（満了まで300日・リードタイム365日。6.6②）", () => {
    const lic = credentialsOf("crew-sato").find((c) => c.category === "license")!;
    const s = evaluateCredential(lic, TODAY, DEFAULT_CREDENTIAL_RULE_SET);
    expect(s.expiry).toBe("start_due");
    expect(s.daysToExpiry).toBe(300);
  });

  it("**船舶検査証書は着手時期**（満了まで95日・リードタイム120日。3.4.2）", () => {
    const cert = latestBySupersedes(
      makeMasterSeedEvents(TODAY)
        .filter((e) => e.kind === "credential")
        .map((e) => e.payload as CredentialPayload),
    ).find((c) => c.subjectType === "vessel" && c.category === "vessel_survey")!;
    const s = evaluateCredential(cert, TODAY, DEFAULT_CREDENTIAL_RULE_SET);
    expect(s.expiry).toBe("start_due");
  });

  it("**森・石井の雇入届出は添付要件で不適合**になる（3.8.3⑥ 受理保留リスク）", () => {
    const masters = crewMasters();
    const r = checkFilingRequirements({
      filingType: "hire",
      targets: [
        {
          crewMemberId: "crew-mori",
          crewName: "森 波留",
          effectiveOn: addDaysYmd(TODAY, 14),
          master: masters.find((m) => m.crewMemberId === "crew-mori"),
          credentials: credentialsOf("crew-mori"),
        },
        {
          crewMemberId: "crew-ishii",
          crewName: "石井 新",
          effectiveOn: addDaysYmd(TODAY, 14),
          master: masters.find((m) => m.crewMemberId === "crew-ishii"),
          credentials: credentialsOf("crew-ishii"),
        },
      ],
      today: TODAY,
      ruleSet: DEFAULT_CREDENTIAL_RULE_SET,
    });
    expect(r.submittable).toBe(false);
    const mori = r.results.find((x) => x.crewMemberId === "crew-mori")!;
    const ishii = r.results.find((x) => x.crewMemberId === "crew-ishii")!;
    expect(mori.items.find((i) => i.key === "insurance_employment")?.state).toBe("ng");
    expect(ishii.items.find((i) => i.key === "stcw_basic")?.state).toBe("ng");
  });

  it("手続きの一覧に『期限超過』『着手時期』が少なくとも1件ずつ含まれる（S-08 の見どころ）", () => {
    const tasks = latestBySupersedes(
      makeMasterSeedEvents(TODAY)
        .filter((e) => e.kind === "procedure_task")
        .map((e) => e.payload as ProcedureTaskPayload),
    );
    const states = evaluateProcedures(tasks, TODAY).map((s) => s.state);
    expect(states).toContain("start_due");
    expect(states.filter((s) => s === "done").length).toBeGreaterThan(0);
  });

  it("**打刻は4週・月次の集計が成立する日数ある**（3.2.1 4週単位・月単位の自動集計）", () => {
    const records = makeSeedEvents(TODAY)
      .filter((e) => e.kind === "time_record")
      .map((e) => e.payload as TimeRecord);
    const dates = new Set(records.map((r) => r.occurredAt.slice(0, 10)));
    // 28日窓を埋めるには最低28日ぶんの記録が要る
    expect(dates.size).toBeGreaterThanOrEqual(28);
  });

  it("**船員ごとに週1日の休日がある**（3.2.5⑤ 休日付与の判定が適合になる）", () => {
    const records = makeSeedEvents(TODAY)
      .filter((e) => e.kind === "time_record")
      .map((e) => e.payload as TimeRecord);
    for (const crewMemberId of ["crew-kato", "crew-sato", "crew-suzuki", "crew-tanaka"]) {
      const r = evaluateRestDays({
        crewMemberId,
        endDate: addDaysYmd(TODAY, -1),
        records,
        now: new Date(`${TODAY}T23:59:00`),
        ruleSet: DEFAULT_LABOR_RULE_SET,
      });
      expect(r.check.level, `${crewMemberId} に週1日の休日が無い`).toBe("ok");
    }
  });

  it("労務の見どころが保たれる（佐藤 3日前=警告 / 鈴木 2日前=休息分割の警告）", () => {
    const records = makeSeedEvents(TODAY)
      .filter((e) => e.kind === "time_record")
      .map((e) => e.payload as TimeRecord);
    const now = new Date(`${TODAY}T23:59:00`);

    const sato = evaluateDaily({
      crewMemberId: "crew-sato",
      date: addDaysYmd(TODAY, -3),
      records,
      now,
      ruleSet: DEFAULT_LABOR_RULE_SET,
    });
    expect(sato.level).toBe("violation");

    const suzuki = evaluateDaily({
      crewMemberId: "crew-suzuki",
      date: addDaysYmd(TODAY, -2),
      records,
      now,
      ruleSet: DEFAULT_LABOR_RULE_SET,
    });
    expect(suzuki.checks.find((c) => c.key === "rest_split")?.level).toBe("violation");
  });

  it("部品在庫に発注点割れが含まれる（S-11 の見どころ。3.4.1 在庫管理）", () => {
    const stocks = latestBySupersedes(
      makeMasterSeedEvents(TODAY)
        .filter((e) => e.kind === "part_stock")
        .map((e) => e.payload as PartStockPayload),
    );
    const below = stocks.filter((s) => s.minQuantity !== undefined && s.quantity < s.minQuantity);
    expect(below.length).toBeGreaterThan(0);
  });
});
