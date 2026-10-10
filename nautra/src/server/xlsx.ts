/**
 * Excel ブック（.xlsx）を組み立てる（レビュー EXPORT-03。書き出しの形式に Excel を選べるようにする）。
 *
 * 外部ライブラリを増やさない方針（CLAUDE.md「PoC の簡略化」）なので、xlsx の最小構成を自前で書く。
 * xlsx は「決まった名前の XML を zip に詰めたもの」で、1枚のシートだけなら6ファイルで足りる。
 * zip は**無圧縮（stored）**で詰める。数千行の表なら大きさは問題にならず、圧縮の実装が要らない。
 *
 * - 文字は inlineStr で持つ（共有文字列表を作らない）。文字コードの選択が要らないのが利点
 *   （区切りテキストで起きる Excel の文字化けが起きない）
 * - 数字だけの値は数値として入れる。ただし先頭が 0 の値（船員ID・電話番号）は文字のまま
 * - 見出し行は太字にし、ウィンドウ枠を固定する
 */

// ── zip（stored） ─────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** zip の日時（DOS 形式）。中身の検証に影響しないので固定値でよいが、開いたときの表示用に今日を入れる */
function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function zipStored(files: { name: string; data: Uint8Array }[], now = new Date()): Buffer {
  const { time, date } = dosDateTime(now);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data);
    const size = f.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // 展開に要る版
    local.writeUInt16LE(0x0800, 6); // 名前は UTF-8
    local.writeUInt16LE(0, 8); // 無圧縮
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, Buffer.from(f.data));

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += 30 + name.length + size;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// ── SpreadsheetML ─────────────────────────────────────────────

function xmlEscape(s: string): string {
  // XML 1.0 で使えない制御文字は落とす（Excel が「壊れている」と言って開かなくなる）
  // eslint-disable-next-line no-control-regex
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 列番号（0始まり）→ A, B, …, Z, AA … */
export function columnName(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 数値として入れてよい値か（先頭 0 の ID や桁区切り付きは文字のまま） */
function isPlainNumber(v: string): boolean {
  return /^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(v);
}

function cellXml(ref: string, value: string, style: number): string {
  const s = style ? ` s="${style}"` : "";
  if (value === "") return `<c r="${ref}"${s}/>`;
  if (style === 0 && isPlainNumber(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

/** シート名に使えない文字を除き、31 文字に切る（Excel の制約） */
function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1";
}

export function buildXlsx(sheetName: string, columns: string[], rows: string[][], now = new Date()): Buffer {
  const all = [columns, ...rows];
  // 列幅は中身の長さから決める（全角は2文字ぶん）。開いた直後に「####」にならないように
  const widths = columns.map((_, ci) => {
    const longest = Math.max(
      ...all.map((r) => [...(r[ci] ?? "")].reduce((n, ch) => n + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0)),
    );
    return Math.min(60, Math.max(8, longest + 2));
  });
  const sheetRows = all
    .map(
      (r, ri) =>
        `<row r="${ri + 1}">${r.map((v, ci) => cellXml(`${columnName(ci)}${ri + 1}`, v ?? "", ri === 0 ? 1 : 0)).join("")}</row>`,
    )
    .join("");

  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` +
    `<sheetData>${sheetRows}</sheetData>` +
    `</worksheet>`;

  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2"><font><sz val="11"/><name val="Yu Gothic"/></font><font><b/><sz val="11"/><name val="Yu Gothic"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
    `</styleSheet>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${xmlEscape(safeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const enc = (s: string) => new Uint8Array(Buffer.from(s, "utf8"));
  return zipStored(
    [
      { name: "[Content_Types].xml", data: enc(contentTypes) },
      { name: "_rels/.rels", data: enc(rootRels) },
      { name: "xl/workbook.xml", data: enc(workbook) },
      { name: "xl/_rels/workbook.xml.rels", data: enc(workbookRels) },
      { name: "xl/styles.xml", data: enc(styles) },
      { name: "xl/worksheets/sheet1.xml", data: enc(sheet) },
    ],
    now,
  );
}

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
