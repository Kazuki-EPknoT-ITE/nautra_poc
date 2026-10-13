import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { validateCustomFields, type CrewFieldView } from "@/lib/crew-fields";
import { diffCrewMaster } from "@/lib/crew-master-diff";

/**
 * 船員マスタの追加項目（レビュー CREWEDIT-04）。
 * 管理者が枠ごとに項目を足し、必須・入力例を決め、直し、外せる。値はマスタの唯一の更新経路で保存される。
 */

type FieldSvc = typeof import("@/server/crew-field-service");
type CrewSvc = typeof import("@/server/crew-master-service");
type Master = typeof import("@/server/master-service");

let fields: FieldSvc;
let crew: CrewSvc;
let master: Master;
const ADMIN = "shore-yamaguchi";

const formOf = (m: NonNullable<ReturnType<Master["crewMasterOf"]>>, customFields: Record<string, string>) => ({
  name: m.name,
  nameKana: m.nameKana,
  birthDate: m.birthDate,
  seamanBookNo: m.seamanBookNo,
  address: m.address,
  bloodType: m.bloodType,
  phone: m.phone,
  position: m.position,
  employmentType: m.employmentType,
  hiredOn: m.hiredOn,
  emergencyContactName: m.emergencyContactName,
  emergencyContactRelation: m.emergencyContactRelation,
  emergencyContactPhone: m.emergencyContactPhone,
  familyNote: m.familyNote,
  medicalHistory: m.medicalHistory,
  medication: m.medication,
  insurances: (m.insurances ?? []).map((i) => ({ ...i })),
  customFields,
});

beforeAll(async () => {
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "nautra-crewfield-")));
  fields = await import("@/server/crew-field-service");
  crew = await import("@/server/crew-master-service");
  master = await import("@/server/master-service");
});

describe("入力値の検査（純関数）", () => {
  const defs: CrewFieldView[] = [
    { fieldKey: "a", category: "basic", label: "作業服のサイズ", inputType: "text", required: true },
    { fieldKey: "b", category: "basic", label: "靴のサイズ", inputType: "number", required: false },
    { fieldKey: "c", category: "health", label: "アレルギー", inputType: "text", required: true },
  ];
  it.each([
    ["必須が空なら断る", { b: "26" }, true, /作業服のサイズ/],
    ["数字の欄に文字なら断る", { a: "L", b: "大きい", c: "なし" }, true, /靴のサイズ」は数字/],
  ])("%s", (_n, values, sensitive, error) => {
    expect(() => validateCustomFields(defs, values, sensitive)).toThrow(error);
  });
  it("権限の無い人には健康の枠の必須を求めない（その人は入力できないため）", () => {
    expect(validateCustomFields(defs, { a: "L" }, false)).toEqual({ a: "L" });
  });
  it("健康の枠の項目は差分に値を載せない", () => {
    const changes = diffCrewMaster(
      { insurances: [], customFields: { c: "そば" } },
      { insurances: [], customFields: { c: "なし" } },
      [{ fieldKey: "c", label: "アレルギー", sensitive: true }],
    );
    expect(changes).toEqual([{ label: "アレルギー", before: "(変更あり)", after: "(変更あり)", sensitive: true }]);
  });
});

describe("項目の追加・変更・削除と、値の保存", () => {
  it("項目を足すと一覧に出て、同じ枠に同じ名前は足せない", () => {
    const f = fields.addCrewField(
      { category: "emergency", label: "第二連絡先", inputType: "text", required: false, placeholder: "090-0000-0000" },
      ADMIN,
    );
    expect(fields.listCrewFields().some((x) => x.fieldKey === f.fieldKey && x.placeholder === "090-0000-0000")).toBe(true);
    expect(() =>
      fields.addCrewField({ category: "emergency", label: "第二連絡先", inputType: "text", required: false, placeholder: "" }, ADMIN),
    ).toThrow(/既にあります/);
    expect(master.listAuditLogs(20).some((l) => l.summary?.includes("船員の項目を追加"))).toBe(true);
  });

  it("値は船員マスタの保存で入り、変更点に項目名で出る。必須にすると空では保存できない", () => {
    const f = fields.listCrewFields().find((x) => x.label === "第二連絡先")!;
    const m = master.crewMasterOf("crew-takamatsu")!;
    const { changes } = crew.updateCrewMaster({
      crewMemberId: "crew-takamatsu",
      form: formOf(m, { [f.fieldKey]: "090-1111-2222" }),
      actor: ADMIN,
      canEditSensitive: true,
    });
    expect(changes.map((c) => c.label)).toContain("第二連絡先");
    expect(master.crewMasterOf("crew-takamatsu")!.customFields?.[f.fieldKey]).toBe("090-1111-2222");

    fields.updateCrewField(f.fieldKey, { category: "emergency", label: "第二連絡先", inputType: "text", required: true, placeholder: "" }, ADMIN);
    const m2 = master.crewMasterOf("crew-takamatsu")!;
    expect(() =>
      crew.updateCrewMaster({
        crewMemberId: "crew-takamatsu",
        form: formOf(m2, { [f.fieldKey]: "" }),
        actor: ADMIN,
        canEditSensitive: true,
      }),
    ).toThrow(/第二連絡先」を入力/);
  });

  it("項目を外しても、入力済みの値は船員マスタの履歴に残る（追記で表す）", () => {
    const f = fields.listCrewFields().find((x) => x.label === "第二連絡先")!;
    fields.removeCrewField(f.fieldKey, ADMIN);
    expect(fields.listCrewFields().some((x) => x.fieldKey === f.fieldKey)).toBe(false);
    expect(master.crewMasterOf("crew-takamatsu")!.customFields?.[f.fieldKey]).toBe("090-1111-2222");
    expect(() => fields.removeCrewField(f.fieldKey, ADMIN)).toThrow(/既に外された/);
  });
});
