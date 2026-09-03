import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { addDays, ymdLocal } from "@/domain/labor-law/evaluate";

/**
 * 3.2.2「国交省公表の労務管理記録簿 Excel マクロデータのインポート」の書き込み経路。
 * 取り込んだ勤務は**打刻レコードとして追記**され、既存の記録を書き換えない（12.3）。
 */

type LedgerService = typeof import("@/server/ledger-service");
type Store = typeof import("@/server/store");

let ledger: LedgerService;
let store: Store;

const ACTOR = "shore-yamamoto";
const DATE = addDays(ymdLocal(new Date()), -3);

const CSV = [
  "労務管理記録簿（第16号の5書式）",
  "日付,船員氏名,作業種別,開始,終了,備考",
  `${DATE},加藤 大和,航海当直,08:00,12:00,`,
  `${DATE},佐藤 海斗,荷役,13:00,17:00,名古屋港`,
  `${DATE},山田 太郎,航海当直,08:00,12:00,`,
].join("\n");

beforeAll(async () => {
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "nautra-import-")));
  ledger = await import("@/server/ledger-service");
  store = await import("@/server/store");
});

describe("Excel様式（CSV）の取込", () => {
  it("プレビューでは書き込まず、取り込める行と弾いた行を返す", () => {
    const before = store.getTimeRecords().length;
    const preview = ledger.previewLedgerImport(CSV);
    expect(preview.rows).toHaveLength(2);
    expect(preview.issues).toHaveLength(1); // 登録されていない船員
    expect(preview.crewNames["crew-kato"]).toBe("加藤 大和");
    expect(store.getTimeRecords()).toHaveLength(before);
  });

  it("確定すると開始・終了の打刻として追記される（事後入力・取込の証跡つき）", () => {
    const before = store.getTimeRecords().length;
    const outcome = ledger.commitLedgerImport(CSV, ACTOR);
    expect(outcome.imported).toBe(2);
    expect(outcome.issues).toBe(1);

    const records = store.getTimeRecords();
    expect(records).toHaveLength(before + 4); // 2勤務 × 開始/終了
    const added = records.filter((r) => r.note?.includes("Excel様式から取込"));
    expect(added).toHaveLength(4);
    for (const r of added) {
      expect(r.entryType).toBe("after");
      expect(r.recordedBy).toBe(ACTOR);
    }
    expect(added.some((r) => r.workCategory === "cargo")).toBe(true);
  });

  it("同じファイルを取り込み直しても打刻は増えない（冪等）", () => {
    const before = store.getTimeRecords().length;
    const again = ledger.commitLedgerImport(CSV, ACTOR);
    expect(again.imported).toBe(0);
    expect(store.getTimeRecords()).toHaveLength(before);
    // 2回目は「取込済み」として弾かれる
    expect(again.preview.issues.some((i) => i.reason.includes("取込済み"))).toBe(true);
  });

  it("取り込んだ勤務は記録簿の集計に入る", () => {
    const period = ledger.buildLedger("crew-kato", DATE.slice(0, 7));
    const day = period.days.find((d) => d.date === DATE);
    expect(day?.summary.hasRecords).toBe(true);
    expect(day?.summary.workedMinutes).toBeGreaterThanOrEqual(4 * 60);
  });

  it("出力は監査ログに残る（12.6）", async () => {
    const ms = await import("@/server/master-service");
    ledger.publishLedgerDocument("crew-kato", DATE.slice(0, 7), ACTOR);
    const log = ms.listAuditLogs(50).find((l) => l.action === "export" && l.actor === ACTOR);
    expect(log).toBeDefined();
    expect(log?.entityKind).toBe("generated_document");
    const docs = ms.effective("generated_document").filter((d) => d.kind === "labor_ledger");
    expect(docs.length).toBeGreaterThanOrEqual(1);
  });
});
