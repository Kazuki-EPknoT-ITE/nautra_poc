import { describe, expect, it } from "vitest";
import {
  ledgerRowKey,
  normalizeLedgerDate,
  normalizeLedgerTime,
  parseCsvRecords,
  parseLedgerCsv,
  resolveLedgerColumns,
  type LedgerImportOptions,
} from "../ledger-import";

/**
 * 3.2.2「国交省公表の労務管理記録簿 Excel マクロデータのインポート」の取込判定。
 * 事業者ごとに列名・表記が揺れるため、**別名の解決**と**不正行の切り分け**を表で確かめる。
 */

const OPTIONS: LedgerImportOptions = {
  crewIds: ["crew-kato", "crew-sato"],
  crewAliases: { "加藤 大和": "crew-kato", "佐藤 海斗": "crew-sato" },
  categoryAliases: {
    航海当直: "navigation_watch",
    荷役: "cargo",
    "スタンバイ（待機）": "standby",
    保守整備: "maintenance",
    その他作業: "other",
  },
};

const HEADER = "日付,船員氏名,作業種別,開始時刻,終了時刻,備考";

function csv(...lines: string[]): string {
  return [HEADER, ...lines].join("\n");
}

describe("日付の正規化", () => {
  it.each([
    ["2026-04-01", "2026-04-01"],
    ["2026/4/1", "2026-04-01"],
    ["2026年4月1日", "2026-04-01"],
    ["２０２６/４/１", "2026-04-01"],
  ])("%s を %s として読む", (raw, expected) => {
    expect(normalizeLedgerDate(raw)).toBe(expected);
  });

  it.each(["2026-02-30", "2026-13-01", "四月一日", "", "20260401"])(
    "%s は日付として読み取れない",
    (raw) => {
      expect(normalizeLedgerDate(raw)).toBeNull();
    },
  );
});

describe("時刻の正規化", () => {
  it.each([
    ["9:00", "09:00"],
    ["09:00", "09:00"],
    ["0900", "09:00"],
    ["9時00分", "09:00"],
    ["24:00", "24:00"],
  ])("%s を %s として読む", (raw, expected) => {
    expect(normalizeLedgerTime(raw)).toBe(expected);
  });

  it.each(["25:00", "24:30", "9:70", "朝", ""])("%s は時刻として読み取れない", (raw) => {
    expect(normalizeLedgerTime(raw)).toBeNull();
  });
});

describe("見出し行の列解決", () => {
  it("列名が揺れても 日付・船員・作業種別・開始・終了 を解決する", () => {
    const columns = resolveLedgerColumns(["年月日", "氏名", "業務内容", "始業", "終業", "摘要"]);
    expect(columns).toEqual({ date: 0, crew: 1, category: 2, start: 3, end: 4, note: 5 });
  });

  it("必要な列が無ければ解決しない", () => {
    expect(resolveLedgerColumns(["船舶名", "第一のーとら丸"])).toEqual({});
  });
});

describe("CSV の読み取り", () => {
  it("引用符の中のカンマと改行を1つの値として読む", () => {
    const records = parseCsvRecords('a,"b,c"\n"d\ne",f\n');
    expect(records).toHaveLength(2);
    expect(records[0].cells).toEqual(["a", "b,c"]);
    expect(records[1].cells).toEqual(["d\ne", "f"]);
  });

  it("BOM と CRLF を取り除いて読む", () => {
    const records = parseCsvRecords("﻿日付,船員\r\n2026-04-01,加藤 大和\r\n");
    expect(records[0].cells).toEqual(["日付", "船員"]);
    expect(records[1].cells).toEqual(["2026-04-01", "加藤 大和"]);
  });
});

describe("労務管理記録簿の取込", () => {
  it("正しい行だけを取り込み、様式の説明行は読み飛ばす", () => {
    const text = ["労務管理記録簿（第16号の5書式）", "船舶名,第一のーとら丸", "", HEADER,
      "2026-04-01,加藤 大和,航海当直,08:00,12:00,",
      "2026/4/1,佐藤 海斗,荷役,13:00,17:30,名古屋港",
    ].join("\n");
    const result = parseLedgerCsv(text, OPTIONS);
    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      date: "2026-04-01",
      crewMemberId: "crew-kato",
      workCategory: "navigation_watch",
      start: "08:00",
      end: "12:00",
    });
    expect(result.rows[1].note).toBe("名古屋港");
  });

  it("船員IDそのものが書かれていても取り込める", () => {
    const result = parseLedgerCsv(csv("2026-04-01,crew-kato,航海当直,08:00,12:00,"), OPTIONS);
    expect(result.rows[0].crewMemberId).toBe("crew-kato");
  });

  it("見出し行が無いファイルは理由を返して取り込まない", () => {
    const result = parseLedgerCsv("2026-04-01,加藤 大和,航海当直,08:00,12:00", OPTIONS);
    expect(result.rows).toHaveLength(0);
    expect(result.issues[0].reason).toContain("見出し行が見つかりません");
  });

  it("登録されていない船員の行は理由つきで弾く", () => {
    const result = parseLedgerCsv(csv("2026-04-01,山田 太郎,航海当直,08:00,12:00,"), OPTIONS);
    expect(result.rows).toHaveLength(0);
    expect(result.issues[0].reason).toContain("登録されていない船員");
  });

  it("作業種別を読み取れない行は理由つきで弾く", () => {
    const result = parseLedgerCsv(csv("2026-04-01,加藤 大和,見張り,08:00,12:00,"), OPTIONS);
    expect(result.issues[0].reason).toContain("作業種別");
  });

  it("終了が開始より前・同じ行は弾く（日をまたぐ勤務は行を分ける）", () => {
    const result = parseLedgerCsv(
      csv(
        "2026-04-01,加藤 大和,航海当直,20:00,04:00,",
        "2026-04-02,加藤 大和,航海当直,08:00,08:00,",
      ),
      OPTIONS,
    );
    expect(result.rows).toHaveLength(0);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0].reason).toContain("終了が開始より後になっていません");
  });

  it("24:00 は その日の終わり として受け入れる", () => {
    const result = parseLedgerCsv(csv("2026-04-01,加藤 大和,航海当直,20:00,24:00,"), OPTIONS);
    expect(result.issues).toEqual([]);
    expect(result.rows[0].end).toBe("24:00");
  });

  it("ファイル内の重複行は2件目を弾く", () => {
    const result = parseLedgerCsv(
      csv(
        "2026-04-01,加藤 大和,航海当直,08:00,12:00,",
        "2026/4/1,加藤 大和,航海当直,8:00,12:00,書式ちがいの同じ勤務",
      ),
      OPTIONS,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.issues[0].reason).toContain("すでにあります");
  });

  it("取込済みの勤務は再取込しない（冪等）", () => {
    const key = ledgerRowKey({
      crewMemberId: "crew-kato",
      date: "2026-04-01",
      workCategory: "navigation_watch",
      start: "08:00",
      end: "12:00",
    });
    const result = parseLedgerCsv(csv("2026-04-01,加藤 大和,航海当直,08:00,12:00,"), {
      ...OPTIONS,
      existingKeys: new Set([key]),
    });
    expect(result.rows).toHaveLength(0);
    expect(result.issues[0].reason).toContain("取込済み");
  });

  it("空行は読み飛ばし、エラーとして数えない", () => {
    const result = parseLedgerCsv(
      csv("2026-04-01,加藤 大和,航海当直,08:00,12:00,", ",,,,,", ""),
      OPTIONS,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.issues).toEqual([]);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it("弾いた行には元ファイルの行番号が付く", () => {
    const result = parseLedgerCsv(
      csv("2026-04-01,加藤 大和,航海当直,08:00,12:00,", "2026-04-99,加藤 大和,荷役,08:00,12:00,"),
      OPTIONS,
    );
    expect(result.headerLine).toBe(1);
    expect(result.issues[0].line).toBe(3);
  });
});
