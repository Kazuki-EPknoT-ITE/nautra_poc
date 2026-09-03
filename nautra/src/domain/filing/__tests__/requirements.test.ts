import { describe, expect, it } from "vitest";
import { addDaysYmd } from "@/domain/crew/freshness";
import { DEFAULT_CREDENTIAL_RULE_SET } from "@/rules/credential-rules";
import type { CredentialPayload, CrewMasterPayload } from "@/sync-protocol/masters";
import { checkFilingRequirements, type FilingCheckTarget } from "../requirements";

/**
 * 添付要件チェッカー（要件定義書 3.8.3 実装機能⑥）のテスト。
 *
 * 12.4 の要請どおり、**「不適合(ng)」と「要再確認(recheck)」が別の状態**として返り、
 * 有効期限内で確認だけが古いものを不適合として扱わないことを検証する。
 * （不適合として扱うと、届け出られる書類まで止めてしまい現場が回らない）
 */

const TODAY = "2026-09-01";
const RULES = DEFAULT_CREDENTIAL_RULE_SET;

function credential(over: Partial<CredentialPayload> & { category: CredentialPayload["category"] }): CredentialPayload {
  return {
    id: `cr-${over.category}-${over.id ?? "1"}`,
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

function target(over: Partial<FilingCheckTarget> = {}): FilingCheckTarget {
  return {
    crewMemberId: "crew-x",
    crewName: "テスト 太郎",
    effectiveOn: addDaysYmd(TODAY, 14),
    master: master(),
    credentials: [
      credential({ category: "license", expiresOn: addDaysYmd(TODAY, 800), lastVerifiedOn: addDaysYmd(TODAY, -10) }),
      credential({ category: "medical", expiresOn: addDaysYmd(TODAY, 200), lastVerifiedOn: addDaysYmd(TODAY, -10) }),
      credential({ category: "stcw_basic", lastVerifiedOn: addDaysYmd(TODAY, -10) }),
    ],
    ...over,
  };
}

describe("添付要件チェッカー（要件定義書 3.8.3⑥）", () => {
  it("免状・健診・基本訓練・保険・手帳番号が揃っていれば届出できる", () => {
    const r = checkFilingRequirements({
      filingType: "hire",
      targets: [target()],
      today: TODAY,
      ruleSet: RULES,
    });
    expect(r.submittable).toBe(true);
    expect(r.ngCount).toBe(0);
    expect(r.recheckCount).toBe(0);
  });

  it("**基本訓練の修了証が無い**と不適合（2026-02-14 以降は受理保留のリスク）", () => {
    const r = checkFilingRequirements({
      filingType: "hire",
      targets: [
        target({
          credentials: target().credentials.filter((c) => c.category !== "stcw_basic"),
        }),
      ],
      today: TODAY,
      ruleSet: RULES,
    });
    expect(r.submittable).toBe(false);
    const item = r.results[0].items.find((i) => i.key === "stcw_basic");
    expect(item?.state).toBe("ng");
    expect(item?.detail).toContain("受理が保留");
  });

  it("施行日より前の効力発生日では、基本訓練の不足を不適合にしない", () => {
    const r = checkFilingRequirements({
      filingType: "hire",
      targets: [
        target({
          effectiveOn: "2026-02-13",
          credentials: target().credentials.filter((c) => c.category !== "stcw_basic"),
        }),
      ],
      today: TODAY,
      ruleSet: RULES,
    });
    expect(r.results[0].items.find((i) => i.key === "stcw_basic")?.state).toBe("recheck");
    expect(r.submittable).toBe(true);
  });

  it("**保険の記号番号が未登録**なら不適合（3.8.1: 加入が確認できないと受理保留）", () => {
    const r = checkFilingRequirements({
      filingType: "hire",
      targets: [target({ master: master({ insurances: [{ kind: "employment" }] }) })],
      today: TODAY,
      ruleSet: RULES,
    });
    expect(r.submittable).toBe(false);
    expect(r.results[0].items.find((i) => i.key === "insurance_employment")?.state).toBe("ng");
  });

  it("**期限内だが確認が古い証書は『要再確認』**であって不適合ではない（12.4）", () => {
    const r = checkFilingRequirements({
      filingType: "hire",
      targets: [
        target({
          credentials: [
            credential({
              category: "license",
              expiresOn: addDaysYmd(TODAY, 800), // 期限は十分先
              lastVerifiedOn: addDaysYmd(TODAY, -250), // 確認が古い
            }),
            credential({ category: "medical", expiresOn: addDaysYmd(TODAY, 200), lastVerifiedOn: addDaysYmd(TODAY, -10) }),
            credential({ category: "stcw_basic", lastVerifiedOn: addDaysYmd(TODAY, -10) }),
          ],
        }),
      ],
      today: TODAY,
      ruleSet: RULES,
    });
    const item = r.results[0].items.find((i) => i.key === "license");
    expect(item?.state).toBe("recheck");
    // 要再確認は届出をブロックしない（不適合と区別する）
    expect(r.submittable).toBe(true);
    expect(r.results[0].hasRecheck).toBe(true);
    expect(r.recheckCount).toBeGreaterThan(0);
  });

  it("期限切れの証書は不適合として届出をブロックする", () => {
    const r = checkFilingRequirements({
      filingType: "hire",
      targets: [
        target({
          credentials: [
            credential({ category: "license", expiresOn: addDaysYmd(TODAY, -1), lastVerifiedOn: addDaysYmd(TODAY, -10) }),
            credential({ category: "medical", expiresOn: addDaysYmd(TODAY, 200), lastVerifiedOn: addDaysYmd(TODAY, -10) }),
            credential({ category: "stcw_basic", lastVerifiedOn: addDaysYmd(TODAY, -10) }),
          ],
        }),
      ],
      today: TODAY,
      ruleSet: RULES,
    });
    expect(r.submittable).toBe(false);
    expect(r.results[0].items.find((i) => i.key === "license")?.state).toBe("ng");
  });

  it("船員手帳番号が無ければ不適合（届出書に転記できない）", () => {
    const r = checkFilingRequirements({
      filingType: "hire",
      targets: [target({ master: master({ seamanBookNo: undefined }) })],
      today: TODAY,
      ruleSet: RULES,
    });
    expect(r.results[0].items.find((i) => i.key === "seaman_book")?.state).toBe("ng");
  });

  it("**雇止（下船）では乗船資格の検証を求めない**（不要な警告で作業を止めない）", () => {
    const r = checkFilingRequirements({
      filingType: "discharge",
      targets: [target({ credentials: [] })], // 証書が1件も無くても
      today: TODAY,
      ruleSet: RULES,
    });
    expect(r.submittable).toBe(true);
    expect(r.results[0].items.some((i) => i.key === "license")).toBe(false);
  });

  it("実技講習が必要な船員では、修了証の有無も検証される", () => {
    const r = checkFilingRequirements({
      filingType: "hire",
      targets: [target({ practicalTrainingRequired: true })],
      today: TODAY,
      ruleSet: RULES,
    });
    expect(r.results[0].items.find((i) => i.key === "stcw_practical")?.state).toBe("ng");
    expect(r.submittable).toBe(false);
  });

  it("複数船員の一括届出では、1人でも不適合なら全体が届出不可になる", () => {
    const r = checkFilingRequirements({
      filingType: "hire",
      targets: [
        target({ crewMemberId: "crew-a", crewName: "適合 太郎" }),
        target({
          crewMemberId: "crew-b",
          crewName: "不備 次郎",
          master: master({ seamanBookNo: undefined }),
        }),
      ],
      today: TODAY,
      ruleSet: RULES,
    });
    expect(r.results).toHaveLength(2);
    expect(r.results[0].submittable).toBe(true);
    expect(r.results[1].submittable).toBe(false);
    expect(r.submittable).toBe(false);
  });
});
