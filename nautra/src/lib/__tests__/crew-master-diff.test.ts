import { describe, expect, it } from "vitest";
import {
  describeChanges,
  diffCrewMaster,
  EMPTY_PLACEHOLDER,
  normalizeField,
  SENSITIVE_PLACEHOLDER,
} from "@/lib/crew-master-diff";

/**
 * 要件定義書 12.6「変更前後の値を保持する」と
 * 10.3 / 12.6「要配慮個人情報は値を残さない」を同時に満たしているかを固定する。
 */

const base = {
  crewMemberId: "crew-mori",
  name: "森 波留",
  birthDate: "1983-03-30",
  address: "広島県呉市中通2-4",
  phone: "090-5555-0005",
  medicalHistory: "腰痛（経過観察）",
  insurances: [
    { kind: "seamen" as const, number: "SI-8830-01", lastVerifiedOn: "2026-01-05" },
    { kind: "workers_accident" as const, number: "RS-8830-01", lastVerifiedOn: "2026-01-05" },
    { kind: "employment" as const },
  ],
};

describe("船員マスタの変更点（12.6 監査証跡）", () => {
  it("変わっていない項目は変更点に出ない", () => {
    expect(diffCrewMaster(base, { ...base })).toEqual([]);
  });

  it("住所を変えると『住所: 旧 → 新』が値つきで残る", () => {
    const changes = diffCrewMaster(base, { ...base, address: "広島県呉市中通3-1" });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      label: "住所",
      before: "広島県呉市中通2-4",
      after: "広島県呉市中通3-1",
      sensitive: false,
    });
  });

  it("既往歴を変えても値は残さず『既往歴: (変更あり)』だけになる（10.3 / 12.6）", () => {
    const changes = diffCrewMaster(base, { ...base, medicalHistory: "腰椎椎間板ヘルニア（術後）" });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      label: "既往歴",
      before: SENSITIVE_PLACEHOLDER,
      after: SENSITIVE_PLACEHOLDER,
      sensitive: true,
    });
    const text = describeChanges(changes, "after");
    expect(text).toBe("既往歴: (変更あり)");
    expect(text).not.toContain("椎間板");
  });

  it("服薬状況を新しく入れた場合も値を残さない", () => {
    const changes = diffCrewMaster(base, { ...base, medication: "ロキソプロフェン 頓用" });
    expect(changes).toHaveLength(1);
    expect(changes[0].sensitive).toBe(true);
    expect(describeChanges(changes, "before")).not.toContain("ロキソプロフェン");
  });

  it("雇用保険の記号番号を登録すると『雇用保険の記号番号』が変更点になる（3.1.2 ブロック解消）", () => {
    const changes = diffCrewMaster(base, {
      ...base,
      insurances: [
        base.insurances[0],
        base.insurances[1],
        { kind: "employment" as const, number: "KY-8830-01", lastVerifiedOn: "2026-09-01" },
      ],
    });
    const labels = changes.map((c) => c.label);
    expect(labels).toContain("雇用保険の記号番号");
    expect(labels).toContain("雇用保険の最終確認日");
    const number = changes.find((c) => c.label === "雇用保険の記号番号");
    expect(number?.before).toBe(EMPTY_PLACEHOLDER);
    expect(number?.after).toBe("KY-8830-01");
  });

  it("保険の確認方法は日本語の表示名で残る（12.4 確認方法）", () => {
    const changes = diffCrewMaster(base, {
      ...base,
      insurances: [
        { ...base.insurances[0], verifyMethod: "notice" as const },
        base.insurances[1],
        base.insurances[2],
      ],
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      label: "船員保険の確認方法",
      before: EMPTY_PLACEHOLDER,
      after: "通知書を受領",
    });
  });

  it("空文字と未入力は同じ扱いで、変更点にしない", () => {
    expect(normalizeField("  ")).toBeUndefined();
    expect(normalizeField(undefined)).toBeUndefined();
    const changes = diffCrewMaster({ ...base, familyNote: undefined }, { ...base, familyNote: "  " });
    expect(changes).toEqual([]);
  });
});
