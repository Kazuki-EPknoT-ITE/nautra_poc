import { describe, expect, it } from "vitest";
import { evaluateCredential } from "@/domain/crew/freshness";
import { checkFilingRequirements } from "@/domain/filing/requirements";
import { evaluateProcedures } from "@/domain/procedures/deadlines";
import { evaluateDrills } from "@/domain/training/drills";
import { addDays } from "@/domain/labor-law/evaluate";
import { DEFAULT_CREDENTIAL_RULE_SET } from "@/rules/credential-rules";
import { DEFAULT_DRILL_RULE_SET } from "@/rules/drill-rules";
import { makeMasterSeedEvents } from "@/lib/seed-masters";
import { makeSeedEvents } from "@/lib/seed";
import type {
  CredentialPayload,
  CrewMasterPayload,
  DrillRecordPayload,
  ProcedureTaskPayload,
  RecordKind,
  RecordPayloadByKind,
} from "@/sync-protocol/records";

/**
 * デモデータが S-07 / S-08 / S-09 の画面で「意図した見え方」になることの回帰テスト。
 *
 * 画面は判定を持たずドメイン純関数の結果をそのまま描くため、ここで純関数の入出力を押さえれば
 * 画面の表示内容を担保できる（サーバ・DB を起動せずデモデータだけで検証する）。
 */

const TODAY = "2026-09-01";

/** デモデータ（同期イベント）から種別ごとのペイロードを取り出す */
function seedOf<K extends RecordKind>(kind: K): RecordPayloadByKind[K][] {
  return [...makeSeedEvents(TODAY), ...makeMasterSeedEvents(TODAY)]
    .filter((e) => e.kind === kind)
    .map((e) => e.payload as RecordPayloadByKind[K]);
}

const crewMasters = seedOf("crew_master") as CrewMasterPayload[];
const credentials = seedOf("credential") as CredentialPayload[];

function masterOf(id: string): CrewMasterPayload | undefined {
  return crewMasters.find((c) => c.crewMemberId === id);
}
function credentialsOf(id: string): CredentialPayload[] {
  return credentials.filter((c) => c.subjectType === "crew" && c.subjectId === id && !c.revoked);
}

describe("S-07 届出の添付要件チェッカー（3.8.3⑥）がデモデータで不備を検出する", () => {
  const check = checkFilingRequirements({
    filingType: "hire",
    today: TODAY,
    ruleSet: DEFAULT_CREDENTIAL_RULE_SET,
    targets: [
      {
        crewMemberId: "crew-mori",
        crewName: "森 波留",
        effectiveOn: addDays(TODAY, 14),
        master: masterOf("crew-mori"),
        credentials: credentialsOf("crew-mori"),
        practicalTrainingRequired: true,
      },
      {
        crewMemberId: "crew-ishii",
        crewName: "石井 新",
        effectiveOn: addDays(TODAY, 14),
        master: masterOf("crew-ishii"),
        credentials: credentialsOf("crew-ishii"),
        practicalTrainingRequired: true,
      },
    ],
  });

  it("森は雇用保険の加入が確認できず「不適合」になる", () => {
    const mori = check.results.find((r) => r.crewMemberId === "crew-mori");
    const employment = mori?.items.find((i) => i.key === "insurance_employment");
    expect(employment?.state).toBe("ng");
    expect(mori?.submittable).toBe(false);
  });

  it("石井は基本訓練が未修了で「不適合」になる（2026-02-14 以降の雇入）", () => {
    const ishii = check.results.find((r) => r.crewMemberId === "crew-ishii");
    const basic = ishii?.items.find((i) => i.key === "stcw_basic");
    expect(basic?.state).toBe("ng");
    expect(basic?.detail).toContain("受理が保留");
  });

  it("届出全体が「そのままでは出せない」と判定され、不適合の件数が出る", () => {
    expect(check.submittable).toBe(false);
    expect(check.ngCount).toBeGreaterThan(0);
  });

  it("不適合（ng）と要再確認（recheck）は別の状態として返る（12.4 描き分けの前提）", () => {
    const states = new Set(check.results.flatMap((r) => r.items.map((i) => i.state)));
    expect(states.has("ng")).toBe(true);
    expect([...states].every((s) => ["ok", "recheck", "ng"].includes(s))).toBe(true);
  });
});

describe("S-08 手続きの期限（6.6② 着手期限）がデモデータで正しく並ぶ", () => {
  const statuses = evaluateProcedures(seedOf("procedure_task") as ProcedureTaskPayload[], TODAY);

  it("佐藤の海技免状の更新は「着手時期」になる（満了300日・リードタイム365日）", () => {
    const sato = statuses.find((s) => s.task.title.includes("海技免状の更新"));
    expect(sato?.state).toBe("start_due");
    expect(sato?.message).toContain("準備を始める時期");
    // 着手期限は保持せず dueOn − leadTimeDays から導出する
    expect(sato?.startOn).toBe(addDays(sato!.task.dueOn!, -365));
  });

  it("完了済みの手続きは緊急度の一番うしろに来る", () => {
    const doneIndex = statuses.findIndex((s) => s.state === "done");
    const openIndex = statuses.findIndex((s) => s.state !== "done" && s.state !== "canceled");
    expect(doneIndex).toBeGreaterThan(openIndex);
  });
});

describe("S-08 の「証書の期限・鮮度」節（6.5）で期限切れと要再確認を描き分けられる", () => {
  it("船舶検査証書は満了95日前・リードタイム120日で「更新の着手時期」になる", () => {
    const survey = credentials.find(
      (c) => c.subjectType === "vessel" && c.category === "vessel_survey" && c.number === "V-499-001",
    );
    const status = evaluateCredential(survey!, TODAY, DEFAULT_CREDENTIAL_RULE_SET);
    expect(status.expiry).toBe("start_due");
    expect(status.level).toBe("caution");
  });

  it("鈴木の健康証明書は期限内でも確認が古く「要再確認」になる（不適合とは別）", () => {
    const medical = credentialsOf("crew-suzuki").find((c) => c.category === "medical");
    const status = evaluateCredential(medical!, TODAY, DEFAULT_CREDENTIAL_RULE_SET);
    expect(status.expiry).not.toBe("expired");
    expect(status.freshness).toBe("stale");
  });
});

describe("S-09 船内操練の次回期日がデモデータで出る（3.9 主要機能③）", () => {
  const statuses = evaluateDrills(
    seedOf("drill_record") as DrillRecordPayload[],
    TODAY,
    DEFAULT_DRILL_RULE_SET,
  );

  it("実施済みの防火操練は最終実施日と次回期日を持つ", () => {
    const fire = statuses.find((s) => s.drillType === "fire");
    expect(fire?.lastDoneOn).not.toBeNull();
    expect(fire?.nextDueOn).not.toBeNull();
  });

  it("記録の無い操練は「未実施」として警告に出る（隠さない）", () => {
    const never = statuses.filter((s) => s.state === "never");
    expect(never.length).toBeGreaterThan(0);
    expect(never.every((s) => s.level === "violation")).toBe(true);
  });
});
