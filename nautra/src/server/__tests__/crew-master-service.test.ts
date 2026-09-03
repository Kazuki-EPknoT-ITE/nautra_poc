import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * S-04 の書き込み経路（要件定義書 12.3 追記型・単一経路 / 12.4 鮮度管理 / 12.6 監査証跡）。
 *
 * ストアは `process.cwd()/.data/store.json` に永続化されるため、
 * **一時ディレクトリへ移ってから**サービスを読み込み、開発用のデモストアを汚さない。
 */

type MasterService = typeof import("@/server/master-service");
type CrewMasterService = typeof import("@/server/crew-master-service");

let ms: MasterService;
let svc: CrewMasterService;
const ACTOR = "shore-admin";

beforeAll(async () => {
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "nautra-store-")));
  ms = await import("@/server/master-service");
  svc = await import("@/server/crew-master-service");
});

describe("船員マスタの更新（12.3 単一経路・追記型）", () => {
  it("更新しても原本は残り、有効なレコードだけが新しくなる", () => {
    const before = ms.crewMasterOf("crew-mori");
    expect(before?.address).toBe("広島県呉市中通2-4");
    const historyBefore = svc.buildCrewMasterHistory("crew-mori").length;

    const { published, changes } = svc.updateCrewMaster({
      crewMemberId: "crew-mori",
      actor: ACTOR,
      canEditSensitive: true,
      form: {
        name: before!.name,
        birthDate: before!.birthDate,
        address: "広島県呉市中通9-9",
        insurances: (before!.insurances ?? []).map((i) => ({
          kind: i.kind,
          number: i.number,
          acquiredOn: i.acquiredOn,
          lastVerifiedOn: i.lastVerifiedOn,
          verifyMethod: i.verifyMethod,
        })),
      },
    });

    expect(published.supersedesId).toBe(before!.id);
    expect(ms.crewMasterOf("crew-mori")?.address).toBe("広島県呉市中通9-9");
    expect(changes.map((c) => c.label)).toContain("住所");
    // 原本は物理保持される（履歴が1件増える）
    expect(svc.buildCrewMasterHistory("crew-mori")).toHaveLength(historyBefore + 1);
  });

  it("雇用保険の記号番号を登録すると配乗のブロック事由が解ける（3.1.2）", async () => {
    const { buildManningRow } = await import("@/server/manning-service");
    const beforeRow = buildManningRow("crew-mori");
    expect(beforeRow?.eligibility.issues.map((i) => i.key)).toContain(
      "insurance_missing_employment",
    );

    const current = ms.crewMasterOf("crew-mori")!;
    svc.updateCrewMaster({
      crewMemberId: "crew-mori",
      actor: ACTOR,
      canEditSensitive: true,
      form: {
        name: current.name,
        birthDate: current.birthDate,
        address: current.address,
        insurances: [
          { kind: "seamen", number: "SI-8830-01", lastVerifiedOn: ms.todayLocal() },
          { kind: "workers_accident", number: "RS-8830-01", lastVerifiedOn: ms.todayLocal() },
          { kind: "employment", number: "KY-8830-01", lastVerifiedOn: ms.todayLocal() },
        ],
      },
    });

    const afterRow = buildManningRow("crew-mori");
    expect(afterRow?.eligibility.issues.map((i) => i.key)).not.toContain(
      "insurance_missing_employment",
    );
  });

  it("要配慮情報を見られない担当者が保存しても、既往歴は消えない（10.3）", () => {
    const before = ms.crewMasterOf("crew-suzuki")!;
    expect(before.medicalHistory).toBeTruthy();

    svc.updateCrewMaster({
      crewMemberId: "crew-suzuki",
      actor: "shore-okada",
      canEditSensitive: false,
      form: {
        name: before.name,
        birthDate: before.birthDate,
        phone: "090-3333-7777",
        // 権限が無い画面は送ってこない
        medicalHistory: undefined,
        insurances: (before.insurances ?? []).map((i) => ({
          kind: i.kind,
          number: i.number,
          acquiredOn: i.acquiredOn,
          lastVerifiedOn: i.lastVerifiedOn,
          verifyMethod: i.verifyMethod,
        })),
      },
    });

    expect(ms.crewMasterOf("crew-suzuki")?.medicalHistory).toBe(before.medicalHistory);
    expect(ms.crewMasterOf("crew-suzuki")?.phone).toBe("090-3333-7777");
  });

  it("監査ログに要配慮情報の値を書かない（12.6）", () => {
    const before = ms.crewMasterOf("crew-kato")!;
    svc.updateCrewMaster({
      crewMemberId: "crew-kato",
      actor: ACTOR,
      canEditSensitive: true,
      form: {
        name: before.name,
        birthDate: before.birthDate,
        medicalHistory: "高血圧・不整脈（要通院）",
        insurances: (before.insurances ?? []).map((i) => ({ kind: i.kind, number: i.number })),
      },
    });

    const log = ms
      .listAuditLogs(50)
      .find((l) => l.entityKind === "crew_master" && l.entityId === "crew-kato");
    expect(log?.action).toBe("update");
    expect(log?.after).toContain("既往歴: (変更あり)");
    expect(`${log?.before} ${log?.after} ${log?.summary}`).not.toContain("不整脈");
  });

  it("変更がなければ保存しない（無意味な版を増やさない）", () => {
    const current = ms.crewMasterOf("crew-tanaka")!;
    expect(() =>
      svc.updateCrewMaster({
        crewMemberId: "crew-tanaka",
        actor: ACTOR,
        canEditSensitive: true,
        form: {
          name: current.name,
          nameKana: current.nameKana,
          birthDate: current.birthDate,
          seamanBookNo: current.seamanBookNo,
          address: current.address,
          bloodType: current.bloodType,
          phone: current.phone,
          position: current.position,
          employmentType: current.employmentType,
          hiredOn: current.hiredOn,
          emergencyContactName: current.emergencyContactName,
          emergencyContactRelation: current.emergencyContactRelation,
          emergencyContactPhone: current.emergencyContactPhone,
          familyNote: current.familyNote,
          medicalHistory: current.medicalHistory,
          medication: current.medication,
          insurances: (current.insurances ?? []).map((i) => ({
            kind: i.kind,
            number: i.number,
            acquiredOn: i.acquiredOn,
            lastVerifiedOn: i.lastVerifiedOn,
            verifyMethod: i.verifyMethod,
          })),
        },
      }),
    ).toThrow(/変更された項目がありません/);
  });
});

describe("証書の原本確認（12.4 鮮度管理）", () => {
  it("「原本を確認した」で要再確認が解け、期限の判定は変わらない", () => {
    const stale = svc
      .crewCredentialStatuses("crew-suzuki")
      .find((s) => s.credential.category === "medical")!;
    expect(stale.freshness).toBe("stale");
    expect(stale.expiry).not.toBe("expired");

    const published = svc.verifyCredentialOriginal({
      credentialId: stale.credential.id,
      actor: ACTOR,
      verifyMethod: "original",
    });
    expect(published.supersedesId).toBe(stale.credential.id);
    expect(published.lastVerifiedOn).toBe(ms.todayLocal());

    const after = svc
      .crewCredentialStatuses("crew-suzuki")
      .find((s) => s.credential.category === "medical")!;
    expect(after.freshness).toBe("fresh");
    expect(after.expiry).toBe(stale.expiry);
    expect(after.level).toBe("ok");
  });

  it("期限切れの証書は確認しても不適合のまま（不適合と鮮度切れは別物）", () => {
    const expired = svc.createCredential({
      crewMemberId: "crew-ishii",
      actor: ACTOR,
      form: {
        category: "small_craft",
        name: "二級小型船舶操縦士",
        expiresOn: "2020-01-01",
      },
    });

    svc.verifyCredentialOriginal({ credentialId: expired.id, actor: ACTOR });
    const after = svc
      .crewCredentialStatuses("crew-ishii")
      .find((s) => s.credential.name === "二級小型船舶操縦士")!;
    expect(after.freshness).toBe("fresh");
    expect(after.expiry).toBe("expired");
    expect(after.level).toBe("violation");
  });

  it("基本訓練修了証を登録すると石井の配乗ブロックが解ける（3.1.2 / 3.8.1）", async () => {
    const { buildManningRow } = await import("@/server/manning-service");
    expect(buildManningRow("crew-ishii")?.eligibility.issues.map((i) => i.key)).toContain(
      "missing_stcw_basic",
    );

    svc.createCredential({
      crewMemberId: "crew-ishii",
      actor: ACTOR,
      form: {
        category: "stcw_basic",
        name: "STCW 基本訓練修了証",
        issuedOn: ms.todayLocal(),
        issuer: "海技教育機構 清水校",
        lastVerifiedOn: ms.todayLocal(),
        verifyMethod: "original",
      },
    });

    expect(buildManningRow("crew-ishii")?.eligibility.issues.map((i) => i.key)).not.toContain(
      "missing_stcw_basic",
    );
  });
});

describe("要配慮情報の参照ログ（10.3 / 12.6）", () => {
  it("カルテで表示したことが view_sensitive として残り、値は載らない", () => {
    svc.logSensitiveView({
      crewMemberId: "crew-kato",
      crewName: "加藤 大和",
      actor: "shore-yamamoto",
      screen: "船員カルテ（S-03）",
    });
    const log = ms.listAuditLogs(20).find((l) => l.action === "view_sensitive");
    expect(log?.entityId).toBe("crew-kato");
    expect(log?.actor).toBe("shore-yamamoto");
    expect(log?.after).toBe("既往歴・服薬状況");
    expect(log?.summary).not.toContain("アムロジピン");
  });
});
