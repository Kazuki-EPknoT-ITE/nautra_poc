import { describe, expect, it } from "vitest";
import { can, canSwitchCrew, PERMISSIONS, ROLE_PERMISSIONS, VESSEL_ROLES, type Permission } from "../roles";

/**
 * 権限マトリクス（基本設計書 11.2）のテーブル駆動テスト。
 * この表がそのまま仕様であり、権限の変更はここの更新とセットで行う。
 */
describe("船内ロールの権限（基本設計書 11.2）", () => {
  const cases: [Permission, Record<string, boolean>][] = [
    // 打刻は本人の権利（全ロール）
    ["punch", { captain: true, deck_officer: true, chief_engineer: true, deck_rating: true }],
    ["view_own_ledger", { captain: true, deck_officer: true, chief_engineer: true, deck_rating: true }],
    // 事後入力・差戻し再入力は自分の記録に対して全ロールが行える
    ["punch_after_entry", { captain: true, deck_officer: true, chief_engineer: true, deck_rating: true }],
    // 他船員の打刻の調整（差戻し依頼）は船長のみ。直接修正は誰もできない
    ["adjust_crew_punch", { captain: true, deck_officer: false, chief_engineer: false, deck_rating: false }],
    // 日次労務の承認・差戻しは船長のみ（修正は本人差戻しのみ）
    ["approve_labor", { captain: true, deck_officer: false, chief_engineer: false, deck_rating: false }],
    // 他船員の記録参照・対象船員の切替は船長のみ
    ["view_all_crew", { captain: true, deck_officer: false, chief_engineer: false, deck_rating: false }],
    // 航海日誌は船長・航海士が記入（他は参照のみ）
    ["write_logbook", { captain: true, deck_officer: true, chief_engineer: false, deck_rating: false }],
    // 日常点検・保守は船長・機関長が記入（他は参照のみ）
    ["write_maintenance", { captain: true, deck_officer: false, chief_engineer: true, deck_rating: false }],
    // 記録項目テンプレートの追加は船長のみ（陸上からも配信される）
    ["manage_record_templates", { captain: true, deck_officer: false, chief_engineer: false, deck_rating: false }],
    // 点検・作業記録・シフト参照・同期は全ロール
    ["write_checklist", { captain: true, deck_officer: true, chief_engineer: true, deck_rating: true }],
    ["write_work_report", { captain: true, deck_officer: true, chief_engineer: true, deck_rating: true }],
    ["view_shift", { captain: true, deck_officer: true, chief_engineer: true, deck_rating: true }],
    ["view_sync", { captain: true, deck_officer: true, chief_engineer: true, deck_rating: true }],
  ];

  for (const [permission, expected] of cases) {
    it(`${permission}: ${Object.entries(expected)
      .map(([r, v]) => `${r}=${v ? "可" : "不可"}`)
      .join(" / ")}`, () => {
      for (const role of VESSEL_ROLES) {
        expect(can(role, permission)).toBe(expected[role]);
      }
    });
  }

  it("権限一覧（PERMISSIONS）は表に出てくる権限をすべて含む（陸上の権限表の抜け防止）", () => {
    const used = new Set<Permission>();
    for (const role of VESSEL_ROLES) for (const p of ROLE_PERMISSIONS[role]) used.add(p);
    for (const p of used) expect(PERMISSIONS).toContain(p);
    // 一覧に重複がない
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    // 表のテストケースも一覧を網羅している
    for (const p of PERMISSIONS) expect(cases.map(([k]) => k)).toContain(p);
  });

  it("船長だけが対象船員を切り替えられる（他は本人固定）", () => {
    expect(canSwitchCrew("captain")).toBe(true);
    expect(canSwitchCrew("deck_officer")).toBe(false);
    expect(canSwitchCrew("chief_engineer")).toBe(false);
    expect(canSwitchCrew("deck_rating")).toBe(false);
  });

  it("すべてのロールに権限表が定義され、打刻を含む（記録できないロールを作らない）", () => {
    for (const role of VESSEL_ROLES) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
      expect(can(role, "punch")).toBe(true);
    }
  });
});
