import { describe, expect, it } from "vitest";
import { encodeShiftJis } from "@/server/shift-jis";

/**
 * Shift_JIS（CP932）への符号化。
 * 表は Node の復号器から組み立てるので、**往復して元に戻ること**で正しさを見る
 * （期待値をこちらで書き写すと、写し間違いのほうを検証してしまう）。
 */
const decode = (b: Buffer) => new TextDecoder("shift_jis").decode(b);

describe("Shift_JIS への符号化（3.2.2 帳票出力）", () => {
  it.each([
    ["ASCII", "crew-takamatsu,2026-09-12,08:00"],
    ["漢字・かな", "高松 誠／第一昭運丸／航海当直"],
    ["記号とカナ", "船員ID・氏名（ﾌﾘｶﾞﾅ）"],
    ["CSV の区切りと改行", "日付,船名\r\n2026-09-12,第七豊洋丸\r\n"],
  ])("%s は往復しても変わらない", (_label, text) => {
    const { bytes, replaced } = encodeShiftJis(text);
    expect(replaced).toBe(0);
    expect(decode(bytes)).toBe(text);
  });

  it("CP932 に無い文字は ? に落とし、件数を返す（黙って消さない）", () => {
    const { bytes, replaced } = encodeShiftJis("晴れ🚢のち曇り");
    expect(replaced).toBe(1);
    expect(decode(bytes)).toBe("晴れ?のち曇り");
  });

  it("日本語は1文字2バイトになる（UTF-8 の3バイトではない）", () => {
    expect(encodeShiftJis("あ").bytes).toHaveLength(2);
    expect(encodeShiftJis("A").bytes).toHaveLength(1);
  });
});
