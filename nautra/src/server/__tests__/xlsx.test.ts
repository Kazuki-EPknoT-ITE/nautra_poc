import { describe, expect, it } from "vitest";
import { buildXlsx, columnName, crc32 } from "../xlsx";

/** 無圧縮 zip を読み戻す（ローカルヘッダを順にたどる）。CRC も確かめる */
function unzipStored(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8);
    const crc = buf.readUInt32LE(p + 14);
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extraLen = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString("utf8");
    const data = buf.subarray(p + 30 + nameLen + extraLen, p + 30 + nameLen + extraLen + size);
    expect(method).toBe(0);
    expect(crc32(new Uint8Array(data))).toBe(crc);
    out.set(name, data.toString("utf8"));
    p += 30 + nameLen + extraLen + size;
  }
  expect(buf.readUInt32LE(buf.length - 22)).toBe(0x06054b50);
  return out;
}

describe("Excel ブック（.xlsx）の組み立て", () => {
  it("CRC32 は既知の値と一致する（'123456789' → CBF43926）", () => {
    expect(crc32(new Uint8Array(Buffer.from("123456789"))).toString(16)).toBe("cbf43926");
  });

  it.each([
    [0, "A"],
    [25, "Z"],
    [26, "AA"],
    [701, "ZZ"],
    [702, "AAA"],
  ])("列番号 %i は %s", (i, name) => {
    expect(columnName(i)).toBe(name);
  });

  it("xlsx に必要な6ファイルが入り、中身を読み戻せる", () => {
    const files = unzipStored(
      buildXlsx("船員名簿", ["船員ID", "氏名", "人数", "メモ"], [["0012", "高松 誠", "12", "<A&B>"]]),
    );
    expect([...files.keys()].sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    // 見出しは太字（s="1"）の文字
    expect(sheet).toContain(`<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">船員ID</t></is></c>`);
    // 先頭 0 の ID は文字のまま、数字だけの値は数値
    expect(sheet).toContain(`<c r="A2" t="inlineStr"><is><t xml:space="preserve">0012</t></is></c>`);
    expect(sheet).toContain(`<c r="C2"><v>12</v></c>`);
    // XML の特殊文字は逃がす
    expect(sheet).toContain("&lt;A&amp;B&gt;");
    expect(files.get("xl/workbook.xml")).toContain(`name="船員名簿"`);
  });

  it("シート名に使えない文字は空白に置き換え、31文字に切る", () => {
    const files = unzipStored(buildXlsx("手続き/提出:記録".padEnd(40, "あ"), ["a"], []));
    const m = files.get("xl/workbook.xml")!.match(/sheet name="([^"]+)"/);
    expect(m?.[1]).toHaveLength(31);
    expect(m?.[1]).not.toMatch(/[/:]/);
  });
});
