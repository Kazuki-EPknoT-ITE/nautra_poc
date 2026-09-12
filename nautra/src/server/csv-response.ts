import { encodeShiftJis } from "@/server/shift-jis";

/**
 * CSV の応答を作る（文字コードの扱いを1か所に閉じる）。
 *
 * 現場の Excel は文字コードを選べないことがあるので、**どの CSV 出力でも同じ3択**を出す:
 * - `utf8-bom`（既定）… 日本語 Windows の Excel でそのまま開ける
 * - `sjis` … 古い Excel でも化けない。CP932 に無い文字は `?` に落ちる
 * - `utf8` … 他システムへの取り込み向け
 *
 * 落ちた文字数はヘッダ（`X-Nautra-Replaced-Chars`）で返す。黙って消すと、
 * 開いた人が化けに気づけないため。
 */
export type CsvEncoding = "utf8-bom" | "utf8" | "sjis";

export const CSV_ENCODING_LABEL: Record<CsvEncoding, string> = {
  "utf8-bom": "UTF-8（BOM 付き）",
  utf8: "UTF-8",
  sjis: "Shift_JIS",
};

/** クエリ文字列から文字コードを読む（不正な値は既定に落とす） */
export function csvEncodingOf(value: string | null): CsvEncoding {
  return value === "sjis" || value === "utf8" ? value : "utf8-bom";
}

export function csvResponse(
  csv: string,
  fileName: string,
  encoding: CsvEncoding = "utf8-bom",
): { response: Response; replaced: number } {
  let body: Buffer;
  let charset: string;
  let replaced = 0;

  if (encoding === "sjis") {
    const encoded = encodeShiftJis(csv);
    body = encoded.bytes;
    replaced = encoded.replaced;
    charset = "shift_jis";
  } else {
    body = Buffer.from(`${encoding === "utf8-bom" ? "﻿" : ""}${csv}`, "utf8");
    charset = "utf-8";
  }

  return {
    replaced,
    response: new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": `text/csv; charset=${charset}`,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
        "X-Nautra-Replaced-Chars": String(replaced),
      },
    }),
  };
}
