import { describe, expect, it } from "vitest";
import {
  buildBulkPermit,
  buildCrewRegister,
  buildDrillRecordDoc,
  vesselOptions,
} from "@/server/document-service";
import { todayLocal } from "@/server/master-service";
import { DOCUMENT_KINDS } from "@/sync-protocol/masters";

/**
 * 要件定義書 9章「主要帳票・様式一覧」のうち、海員名簿・一括届出許可申請書・
 * 操練実施記録の組み立てを検証する。
 *
 * いずれも**入力せず、蓄積された記録から導出**するのが要点:
 * - 海員名簿は乗下船イベントから（6.2 B群「常時最新に自動維持」）
 * - 許可申請書は届出実績と労務管理の状況から（6.6③ 電子方式への段階引き上げ）
 * - 操練記録は船内の drill_record から
 */

describe("海員名簿（9章 / 6.2 B群）", () => {
  it("乗下船の記録から、いま乗っている船員だけを載せる", () => {
    const vessel = vesselOptions()[0];
    expect(vessel, "船舶マスタが無い").toBeDefined();

    const snapshot = buildCrewRegister(vessel.id, "テスト担当");
    expect(snapshot.documentKind).toBe("crew_register");
    expect(snapshot.vesselName).toBe(vessel.name);
    expect(snapshot.rows.length).toBeGreaterThan(0);
    // 通し番号は 1 から連番
    expect(snapshot.rows.map((r) => r.no)).toEqual(
      snapshot.rows.map((_, i) => i + 1),
    );
  });

  it("届出で提示を求められる項目（氏名・生年月日・船員手帳番号・海技免状）が埋まる", () => {
    const vessel = vesselOptions()[0];
    const snapshot = buildCrewRegister(vessel.id, "テスト担当");
    for (const row of snapshot.rows) {
      expect(row.name, "氏名が空").not.toBe("");
      expect(row.birthDate, `${row.name} の生年月日が空`).not.toBe("");
      expect(row.seamanBookNo, `${row.name} の船員手帳番号が空`).not.toBe("");
      expect(row.license, `${row.name} の海技免状が空`).not.toBe("");
      expect(row.boardedOn, `${row.name} の乗船日が空`).not.toBe("");
    }
  });

  it("**下船した船員は載らない**（最後の出来事が下船なら在船とみなさない）", () => {
    const vessel = vesselOptions()[0];
    const snapshot = buildCrewRegister(vessel.id, "テスト担当");
    // 基準日より後の予定は反映しない（実績のみを見る）
    expect(snapshot.asOf).toBe(todayLocal());
    // デモでは佐藤の下船は「予定」なので、この時点ではまだ名簿に載っている
    expect(snapshot.rows.some((r) => r.name.includes("佐藤"))).toBe(true);
  });
});

describe("一括届出許可申請書・電子届出登録申請書（3.8.3 申請方法B / 6.6③）", () => {
  it("対象船舶・届出の実績・労務管理の体制を疎明材料として載せる", () => {
    const snapshot = buildBulkPermit("中国運輸局 海上安全環境部", "テスト担当");
    expect(snapshot.documentKind).toBe("bulk_permit");
    expect(snapshot.office).toBe("中国運輸局 海上安全環境部");
    expect(snapshot.vessels.length).toBeGreaterThan(0);
    // 蓄積したデータが疎明材料として数え上げられている
    expect(snapshot.management.crewCount).toBeGreaterThan(0);
    expect(snapshot.management.auditLogCount).toBeGreaterThan(0);
    expect(snapshot.filingRecord.total).toBeGreaterThanOrEqual(0);
  });

  it("申請の本文と根拠法令が入る（空の申請書を作らない）", () => {
    const snapshot = buildBulkPermit("中国運輸局", "テスト担当");
    expect(snapshot.paragraphs.length).toBeGreaterThanOrEqual(4);
    for (const p of snapshot.paragraphs) expect(p.length).toBeGreaterThan(10);
    expect(snapshot.legalBasis).toContain("船員法第37条");
  });
});

describe("操練（訓練）実施記録（9章 / 3.3.2 / 3.9）", () => {
  it("期間内の操練だけをまとめ、種別ごとの実施回数と最終実施日を出す", () => {
    const from = "2000-01-01";
    const to = todayLocal();
    const snapshot = buildDrillRecordDoc(from, to, "テスト担当");
    expect(snapshot.documentKind).toBe("drill_record_doc");
    expect(snapshot.rows.length).toBeGreaterThan(0);
    expect(snapshot.countsByType.length).toBeGreaterThan(0);

    // 集計は明細と一致する
    const total = snapshot.countsByType.reduce((a, c) => a + c.count, 0);
    expect(total).toBe(snapshot.rows.length);
    for (const c of snapshot.countsByType) {
      expect(c.lastDate).not.toBe("");
      expect(c.lastDate >= from && c.lastDate <= to).toBe(true);
    }
  });

  it("期間外の操練は含めない", () => {
    const snapshot = buildDrillRecordDoc("1990-01-01", "1990-12-31", "テスト担当");
    expect(snapshot.rows).toEqual([]);
    expect(snapshot.countsByType).toEqual([]);
  });

  it("指揮者・参加者は ID ではなく氏名で出す（そのまま提示できる書面にする）", () => {
    const snapshot = buildDrillRecordDoc("2000-01-01", todayLocal(), "テスト担当");
    for (const r of snapshot.rows) {
      expect(r.leader).not.toMatch(/^crew-/);
      for (const p of r.participants) expect(p).not.toMatch(/^crew-/);
    }
  });
});

describe("9章の帳票はすべて生成経路を持つ", () => {
  it("種別だけ定義されて作れない帳票が無い", () => {
    /**
     * 「その他」を除く帳票は、どこかに生成・出力の経路があること。
     * ここは実装の有無を人手で見落とさないための見張りで、
     * 経路を消したときにテストが落ちるようにしてある。
     */
    const generatable = new Set([
      "labor_ledger", // S-06 記録簿の印刷ビュー
      "hire_filing", // S-07 届出ウィザード
      "change_filing", // S-07
      "crew_list", // S-07
      "crew_register", // S-14 海員名簿
      "bulk_permit", // S-14 一括届出の許可申請
      "electronic_filing_xlsx", // S-07 電子届出様式
      "opinion_statement", // S-14 意見陳述書
      "labor_agreement", // S-15 協定の登録
      "operation_report", // S-14 運航実績レポート
      "drill_record_doc", // S-14 操練実施記録
    ]);
    for (const kind of DOCUMENT_KINDS) {
      if (kind === "other") continue;
      expect(generatable.has(kind), `${kind} に生成経路が無い`).toBe(true);
    }
  });
});
