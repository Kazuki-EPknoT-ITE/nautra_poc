import { describe, expect, it } from "vitest";
import { DEFAULT_CREDENTIAL_RULE_SET } from "@/rules/credential-rules";
import type { CredentialPayload, CrewMasterPayload } from "@/sync-protocol/masters";
import { addDaysYmd, daysBetween, evaluateCredential, freshnessOf } from "../freshness";
import { evaluateManningEligibility, STCW_BASIC_REQUIRED_FROM } from "../manning";

/**
 * 証書の期限・鮮度（要件定義書 12.4）と配乗ブロック条件（3.1.2）のテスト。
 *
 * 12.4 の要点は「**有効期限切れ（不適合）**」と「**最終確認日が古い（要再確認）**」を
 * 別種のアラートとして扱うこと。ここではその区別が崩れていないことを検証する。
 */

const TODAY = "2026-09-01";
const RULES = DEFAULT_CREDENTIAL_RULE_SET;

function credential(over: Partial<CredentialPayload> & { category: CredentialPayload["category"] }): CredentialPayload {
  return {
    id: `cr-${over.category}`,
    tenantId: "tenant-demo",
    vesselId: "company-demo",
    occurredAt: `${TODAY}T00:00:00.000Z`,
    recordedBy: "shore-yamamoto",
    deviceId: "shore-planner-device",
    publishedAt: `${TODAY}T00:00:00.000Z`,
    publishedBy: "shore-yamamoto",
    subjectType: "crew",
    subjectId: "crew-x",
    name: "テスト証書",
    ...over,
  } as CredentialPayload;
}

function master(over: Partial<CrewMasterPayload> = {}): CrewMasterPayload {
  return {
    id: "cm-x",
    tenantId: "tenant-demo",
    vesselId: "company-demo",
    occurredAt: `${TODAY}T00:00:00.000Z`,
    recordedBy: "shore-yamamoto",
    deviceId: "shore-planner-device",
    publishedAt: `${TODAY}T00:00:00.000Z`,
    publishedBy: "shore-yamamoto",
    crewMemberId: "crew-x",
    name: "テスト 太郎",
    birthDate: "1990-01-01",
    seamanBookNo: "SB-0001",
    insurances: [
      { kind: "seamen", number: "S-1", lastVerifiedOn: addDaysYmd(TODAY, -10) },
      { kind: "workers_accident", number: "R-1", lastVerifiedOn: addDaysYmd(TODAY, -10) },
      { kind: "employment", number: "K-1", lastVerifiedOn: addDaysYmd(TODAY, -10) },
    ],
    ...over,
  } as CrewMasterPayload;
}

/** ブロックされない標準セット（免状・健診・基本訓練すべて有効・確認済み） */
function healthyCredentials(): CredentialPayload[] {
  return [
    credential({
      category: "license",
      name: "四級海技士（航海）",
      expiresOn: addDaysYmd(TODAY, 800),
      lastVerifiedOn: addDaysYmd(TODAY, -10),
    }),
    credential({
      category: "medical",
      name: "健康証明書",
      expiresOn: addDaysYmd(TODAY, 200),
      lastVerifiedOn: addDaysYmd(TODAY, -10),
    }),
    credential({
      category: "stcw_basic",
      name: "STCW 基本訓練修了証",
      issuedOn: addDaysYmd(TODAY, -500),
      lastVerifiedOn: addDaysYmd(TODAY, -10),
    }),
  ];
}

describe("日付ユーティリティ", () => {
  it("daysBetween は暦日の差を返す（月跨ぎ・年跨ぎでも狂わない）", () => {
    expect(daysBetween("2026-09-01", "2026-09-02")).toBe(1);
    expect(daysBetween("2026-09-01", "2026-08-31")).toBe(-1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1); // 2026年は平年
  });

  it("addDaysYmd は日付を加減算する", () => {
    expect(addDaysYmd("2026-09-01", 30)).toBe("2026-10-01");
    expect(addDaysYmd("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("鮮度管理（要件定義書 12.4: 既定180日で『未確認』を検知）", () => {
  it.each([
    ["確認から179日 → 確認済み", -179, "fresh"],
    ["確認から180日ちょうど → まだ確認済み（超過していない）", -180, "fresh"],
    ["確認から181日 → 要再確認", -181, "stale"],
  ] as const)("%s", (_name, offset, expected) => {
    const { state } = freshnessOf(addDaysYmd(TODAY, offset), TODAY, 180);
    expect(state).toBe(expected);
  });

  it("一度も確認していない場合は never（未確認）", () => {
    expect(freshnessOf(undefined, TODAY, 180).state).toBe("never");
  });
});

describe("証書の判定（12.4: 不適合と要再確認を区別する / 6.6②: 着手期限で発報）", () => {
  it("期限内かつ確認が新しければ適合（警告なし）", () => {
    const s = evaluateCredential(
      credential({
        category: "license",
        expiresOn: addDaysYmd(TODAY, 800),
        lastVerifiedOn: addDaysYmd(TODAY, -10),
      }),
      TODAY,
      RULES,
    );
    expect(s.expiry).toBe("valid");
    expect(s.freshness).toBe("fresh");
    expect(s.level).toBe("ok");
  });

  it("期限切れは『不適合』= 警告（赤）", () => {
    const s = evaluateCredential(
      credential({
        category: "medical",
        expiresOn: addDaysYmd(TODAY, -1),
        lastVerifiedOn: addDaysYmd(TODAY, -10),
      }),
      TODAY,
      RULES,
    );
    expect(s.expiry).toBe("expired");
    expect(s.level).toBe("violation");
    expect(s.message).toContain("期限が 1日 過ぎています");
  });

  it("**期限内でも最終確認が古ければ『要再確認』**（不適合とは区別され、警告にならない）", () => {
    const s = evaluateCredential(
      credential({
        category: "license",
        expiresOn: addDaysYmd(TODAY, 800), // 期限は十分先
        lastVerifiedOn: addDaysYmd(TODAY, -200), // 確認は180日超
      }),
      TODAY,
      RULES,
    );
    expect(s.expiry).toBe("valid"); // 不適合ではない
    expect(s.freshness).toBe("stale"); // 鮮度だけが問題
    expect(s.level).toBe("caution"); // 注意（黄）であって警告（赤）ではない
    expect(s.message).toContain("要再確認");
  });

  it("海技免状は満了1年前が着手期限（6.6②: 満了日アラートでは遅い）", () => {
    // リードタイム365日。満了まで300日 → 着手期限を過ぎている
    const due = evaluateCredential(
      credential({
        category: "license",
        expiresOn: addDaysYmd(TODAY, 300),
        lastVerifiedOn: addDaysYmd(TODAY, -10),
      }),
      TODAY,
      RULES,
    );
    expect(due.expiry).toBe("start_due");
    expect(due.startOn).toBe(addDaysYmd(addDaysYmd(TODAY, 300), -365));
    expect(due.message).toContain("更新の手続きを始める時期です");

    // 満了まで400日 → まだ着手時期ではない
    const notYet = evaluateCredential(
      credential({
        category: "license",
        expiresOn: addDaysYmd(TODAY, 400),
        lastVerifiedOn: addDaysYmd(TODAY, -10),
      }),
      TODAY,
      RULES,
    );
    expect(notYet.expiry).toBe("valid");
  });

  it("修了証など期限のない証書は期限判定をしない", () => {
    const s = evaluateCredential(
      credential({ category: "stcw_basic", lastVerifiedOn: addDaysYmd(TODAY, -10) }),
      TODAY,
      RULES,
    );
    expect(s.expiry).toBe("no_expiry");
    expect(s.level).toBe("ok");
  });
});

describe("配乗ブロック条件（要件定義書 3.1.2）", () => {
  it("証書・保険・労務がすべて整っていれば配乗できる", () => {
    const r = evaluateManningEligibility({
      crewMemberId: "crew-x",
      master: master(),
      credentials: healthyCredentials(),
      today: TODAY,
      ruleSet: RULES,
      laborLevel: "ok",
    });
    expect(r.status).toBe("eligible");
    expect(r.issues).toEqual([]);
  });

  it("免状の期限切れは配乗不可（block）", () => {
    const credentials = healthyCredentials();
    credentials[0] = credential({
      category: "license",
      expiresOn: addDaysYmd(TODAY, -5),
      lastVerifiedOn: addDaysYmd(TODAY, -10),
    });
    const r = evaluateManningEligibility({
      crewMemberId: "crew-x",
      master: master(),
      credentials,
      today: TODAY,
      ruleSet: RULES,
      laborLevel: "ok",
    });
    expect(r.status).toBe("blocked");
    expect(r.issues.some((i) => i.key === "expired_license" && i.severity === "block")).toBe(true);
  });

  it("健康診断の期限切れは配乗不可（block）", () => {
    const credentials = healthyCredentials();
    credentials[1] = credential({
      category: "medical",
      expiresOn: addDaysYmd(TODAY, -1),
      lastVerifiedOn: addDaysYmd(TODAY, -10),
    });
    const r = evaluateManningEligibility({
      crewMemberId: "crew-x",
      master: master(),
      credentials,
      today: TODAY,
      ruleSet: RULES,
      laborLevel: "ok",
    });
    expect(r.status).toBe("blocked");
    expect(r.issues.some((i) => i.key === "expired_medical")).toBe(true);
  });

  it("**保険の加入が未確認**なら配乗不可（3.8.1: 届出の受理保留リスク）", () => {
    const r = evaluateManningEligibility({
      crewMemberId: "crew-x",
      master: master({
        insurances: [
          { kind: "seamen", number: "S-1", lastVerifiedOn: addDaysYmd(TODAY, -10) },
          { kind: "workers_accident", number: "R-1", lastVerifiedOn: addDaysYmd(TODAY, -10) },
          { kind: "employment" }, // 記号番号なし = 加入が確認できない
        ],
      }),
      credentials: healthyCredentials(),
      today: TODAY,
      ruleSet: RULES,
      laborLevel: "ok",
    });
    expect(r.status).toBe("blocked");
    expect(r.issues.some((i) => i.key === "insurance_missing_employment")).toBe(true);
  });

  it("保険の確認が古いだけなら注意にとどまり、配乗自体は止めない", () => {
    const r = evaluateManningEligibility({
      crewMemberId: "crew-x",
      master: master({
        insurances: [
          { kind: "seamen", number: "S-1", lastVerifiedOn: addDaysYmd(TODAY, -250) },
          { kind: "workers_accident", number: "R-1", lastVerifiedOn: addDaysYmd(TODAY, -10) },
          { kind: "employment", number: "K-1", lastVerifiedOn: addDaysYmd(TODAY, -10) },
        ],
      }),
      credentials: healthyCredentials(),
      today: TODAY,
      ruleSet: RULES,
      laborLevel: "ok",
    });
    expect(r.status).toBe("caution");
    expect(r.issues.some((i) => i.key === "insurance_stale_seamen" && i.severity === "warn")).toBe(true);
  });

  it("**基本訓練が未修了**なら 2026-02-14 以降の乗船予定で配乗不可", () => {
    const credentials = healthyCredentials().filter((c) => c.category !== "stcw_basic");
    const after = evaluateManningEligibility({
      crewMemberId: "crew-x",
      master: master(),
      credentials,
      today: TODAY,
      ruleSet: RULES,
      laborLevel: "ok",
      embarkOn: STCW_BASIC_REQUIRED_FROM, // 施行日ちょうど
    });
    expect(after.status).toBe("blocked");
    expect(after.issues.some((i) => i.key === "missing_stcw_basic")).toBe(true);

    // 施行日より前の乗船なら注意にとどめる（過剰な警告で作業を止めない）
    const before = evaluateManningEligibility({
      crewMemberId: "crew-x",
      master: master(),
      credentials,
      today: TODAY,
      ruleSet: RULES,
      laborLevel: "ok",
      embarkOn: "2026-02-13",
    });
    expect(before.status).toBe("caution");
  });

  it("直近の労働時間・休息が基準を外れていれば配乗不可（3.1.2 最終条件）", () => {
    const r = evaluateManningEligibility({
      crewMemberId: "crew-x",
      master: master(),
      credentials: healthyCredentials(),
      today: TODAY,
      ruleSet: RULES,
      laborLevel: "violation",
    });
    expect(r.status).toBe("blocked");
    expect(r.issues.some((i) => i.key === "labor_violation")).toBe(true);
  });

  it("退職・登録抹消された船員は配乗不可", () => {
    const r = evaluateManningEligibility({
      crewMemberId: "crew-x",
      master: master({ retiredOn: addDaysYmd(TODAY, -1) }),
      credentials: healthyCredentials(),
      today: TODAY,
      ruleSet: RULES,
      laborLevel: "ok",
    });
    expect(r.status).toBe("blocked");
    expect(r.issues.some((i) => i.key === "retired")).toBe(true);
  });

  it("ブロック事由は理由つきで返る（黙って候補から消さない。3.1.2『警告付きで除外・注意表示』）", () => {
    const r = evaluateManningEligibility({
      crewMemberId: "crew-x",
      master: master({ insurances: [{ kind: "employment" }] }),
      credentials: [],
      today: TODAY,
      ruleSet: RULES,
      laborLevel: "ok",
      embarkOn: TODAY,
    });
    expect(r.status).toBe("blocked");
    // すべての事由に、利用者向けの説明が付いている
    for (const issue of r.issues) {
      expect(issue.label.length).toBeGreaterThan(0);
      expect(issue.detail.length).toBeGreaterThan(0);
    }
  });
});
