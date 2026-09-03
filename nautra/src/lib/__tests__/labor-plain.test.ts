import { describe, expect, it } from "vitest";
import type { LaborCheck } from "@/domain/labor-law/types";
import type { PeriodLaborSummary } from "@/domain/labor-law/evaluate";
import {
  checkPlainLabelFor,
  describeCheck,
  describeExceptionalMinutes,
  describePeriodTotal,
  formatCheckActual,
  formatCheckLimit,
} from "../labor-plain";

/**
 * 期間集計（4週・基準労働期間・月）の言い換え（要件定義書 3.2.1 / 3.2.5③⑥）。
 * 判定そのものは domain（evaluatePeriod）が行い、ここは表示文言だけを検証する。
 */
describe("期間の判定を日常語にする", () => {
  const check = (key: LaborCheck["key"], level: LaborCheck["level"], actual: number, limit: number): LaborCheck => ({
    key,
    level,
    actual,
    limit,
  });

  it("4週間の上限（3.2.5③）: 超過時は超えた分を示す", () => {
    expect(describeCheck(check("four_week_max", "violation", 15000, 14400))).toBe(
      "目安（240時間）を 10時間 超えています",
    );
  });

  it("4週間の上限: 適合時は残りの余裕を示す", () => {
    expect(describeCheck(check("four_week_max", "ok", 12000, 14400))).toBe(
      "目安（240時間）まで あと 40時間 余裕があります",
    );
  });

  it("基準労働期間の週平均（3.2.4）: 注意は上限に近づいた旨を示す", () => {
    expect(describeCheck(check("reference_period", "caution", 2300, 2400))).toBe(
      "1週あたりの目安（40時間）に近づいています",
    );
  });

  it("1月の時間外上限（労使協定）: 残りを示す", () => {
    expect(describeCheck(check("monthly_overtime", "ok", 600, 2700))).toBe(
      "今月の残業の目安（45時間）まで あと 35時間 余裕があります",
    );
  });

  it("休日付与（3.2.5⑤）は分ではなく日数で表示する", () => {
    const c = check("rest_day", "violation", 2, 4);
    expect(formatCheckActual(c)).toBe("2日");
    expect(formatCheckLimit(c)).toBe("4日");
    expect(describeCheck(c)).toBe("休んだ日が 2日 で、4日 に足りていません");
  });

  it("期間の合計は「◯働きました。目安は◯です」の一文にする", () => {
    const summary = { workedMinutes: 12000, countableWorkedMinutes: 12000 } as PeriodLaborSummary;
    expect(describePeriodTotal("この4週間", summary, check("four_week_max", "ok", 12000, 14400))).toBe(
      "この4週間で 200時間 働きました。目安は 240時間 です。",
    );
  });

  it("目安が無い期間は合計だけを示す", () => {
    const summary = { workedMinutes: 600, countableWorkedMinutes: 600 } as PeriodLaborSummary;
    expect(describePeriodTotal("今月", summary, undefined)).toBe("今月で 10時間 働きました。");
  });
});

/** 安全臨時労働・緊急作業の別枠（3.2.5⑥）は「上限の計算から外した」ことを明示する */
describe("別枠（緊急作業）の説明", () => {
  it("別枠がある日は除外した時間を文言で示す", () => {
    expect(describeExceptionalMinutes(90)).toBe(
      "うち 1時間30分 は緊急作業のため上限の計算から外しています。",
    );
  });

  it("別枠が無ければ何も表示しない", () => {
    expect(describeExceptionalMinutes(0)).toBeNull();
  });
});

/** 多言語UI（10.2）: 未翻訳のキーは日本語へフォールバックする */
describe("チェック項目名の表示言語", () => {
  it("日本語では日常語の名前を返す", () => {
    expect(checkPlainLabelFor("ja", "four_week_max")).toBe("この4週間に働いた時間");
  });

  it("英語では英語の名前を返す", () => {
    expect(checkPlainLabelFor("en", "four_week_max")).toBe("Hours worked in these 4 weeks");
  });

  it("辞書に無いキーはキーそのものを返す（表示が空欄にならない）", () => {
    expect(checkPlainLabelFor("en", "unknown_key")).toBe("unknown_key");
  });
});
