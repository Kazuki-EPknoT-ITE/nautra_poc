/**
 * Shift_JIS（CP932）への符号化。
 *
 * 現場の Excel は文字コードを選べないことがあり、UTF-8 の CSV を開くと化ける端末が残る。
 * だから書き出しは Shift_JIS も選べるようにする（要件定義書 3.2.2 の帳票出力）。
 *
 * **変換表は外部ライブラリを足さずに作る**。Node は Shift_JIS の*復号*を持っている
 * （`TextDecoder("shift_jis")`）ので、CP932 として成立するバイト列を全部復号して
 * 「文字 → バイト列」の逆引きを1度だけ組み立てる。表は約7千語で、組み立ては数ミリ秒。
 * 依存を増やさずに済み、変換の根拠が Node の実装そのものになる（表を手で持たない）。
 *
 * 変換できない文字（CP932 に無い絵文字・一部の外字）は `?` に落とし、
 * 何文字落としたかを呼び出し側へ返す。黙って消すと、開いた人が気づけないため。
 */

let table: Map<string, number[]> | null = null;

/** CP932 として成立するバイト列を総当たりし、文字 → バイト列の表を作る */
function buildTable(): Map<string, number[]> {
  const decoder = new TextDecoder("shift_jis", { fatal: false });
  const map = new Map<string, number[]>();

  const put = (bytes: number[]) => {
    const text = decoder.decode(Uint8Array.from(bytes));
    // 置換文字（U+FFFD）や空になる並びは、その符号が無いということなので採らない
    if (!text || text.includes("�")) return;
    // 先に入った符号を優先する（重複定義の面は1つに寄せる）
    if (!map.has(text)) map.set(text, bytes);
  };

  // 1バイト: ASCII 互換部と半角カナ
  for (let b = 0x00; b <= 0x7f; b++) put([b]);
  for (let b = 0xa1; b <= 0xdf; b++) put([b]);

  // 2バイト: 先頭 0x81–0x9F / 0xE0–0xFC、後続 0x40–0x7E / 0x80–0xFC
  const leads = [
    ...range(0x81, 0x9f),
    ...range(0xe0, 0xfc),
  ];
  const trails = [...range(0x40, 0x7e), ...range(0x80, 0xfc)];
  for (const lead of leads) {
    for (const trail of trails) put([lead, trail]);
  }
  return map;
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

export interface ShiftJisResult {
  bytes: Buffer;
  /** 変換できず `?` に落とした文字数（0 なら完全に変換できた） */
  replaced: number;
}

/**
 * 文字列を Shift_JIS（CP932）のバイト列にする。
 * 改行は呼び出し側が CRLF に揃えておく（Excel が行を認識できるようにするため）。
 */
export function encodeShiftJis(text: string): ShiftJisResult {
  table ??= buildTable();
  const out: number[] = [];
  let replaced = 0;

  // コードポイント単位で回す（サロゲートペアを2文字に割らない）
  for (const ch of text) {
    const bytes = table.get(ch);
    if (bytes) {
      out.push(...bytes);
    } else {
      out.push(0x3f); // "?"
      replaced += 1;
    }
  }
  return { bytes: Buffer.from(out), replaced };
}
