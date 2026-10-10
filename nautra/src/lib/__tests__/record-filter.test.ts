import { describe, expect, it } from "vitest";
import { EMPTY_PAST_FILTER, filterPast, isFilterActive } from "../record-filter";

interface Row {
  at: string;
  text: string;
}

/** ローカル時刻で日付を作る（ymdLocal で判定するため、UTC にずらさない） */
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

const ROWS: Row[] = [
  { at: local(2026, 10, 1), text: "出港 名古屋港 金城埠頭" },
  { at: local(2026, 10, 5, 0), text: "定時記録 御前崎沖 ＥＮＧＩＮＥ 良好" },
  { at: local(2026, 10, 5, 23), text: "特記事項 主機 異音" },
  { at: local(2026, 10, 9), text: "入港 横浜港" },
];

const run = (f: Partial<typeof EMPTY_PAST_FILTER>) =>
  filterPast(ROWS, { ...EMPTY_PAST_FILTER, ...f }, (r) => r.at, (r) => r.text).map((r) => r.text.split(" ")[0]);

describe("過去の記録の絞り込み（期間 + キーワード）", () => {
  it.each([
    ["条件なしは全件", {}, ["出港", "定時記録", "特記事項", "入港"]],
    ["開始日はその日を含む（0時の記録も残る）", { from: "2026-10-05" }, ["定時記録", "特記事項", "入港"]],
    ["終了日はその日を含む（23時の記録も残る）", { to: "2026-10-05" }, ["出港", "定時記録", "特記事項"]],
    ["1日だけ", { from: "2026-10-05", to: "2026-10-05" }, ["定時記録", "特記事項"]],
    ["開始と終了を逆に入れても同じ期間", { from: "2026-10-05", to: "2026-10-01" }, ["出港", "定時記録", "特記事項"]],
    ["キーワード1語", { q: "港" }, ["出港", "入港"]],
    ["空白区切りはすべて含むものだけ", { q: "主機 異音" }, ["特記事項"]],
    ["全角半角・大文字小文字を区別しない", { q: "engine" }, ["定時記録"]],
    ["期間とキーワードの両方", { from: "2026-10-02", q: "港" }, ["入港"]],
    ["一致しなければ空", { q: "存在しない語" }, []],
  ])("%s", (_name, f, expected) => {
    expect(run(f)).toEqual(expected);
  });

  it("空白だけのキーワードは条件に数えない", () => {
    expect(isFilterActive({ ...EMPTY_PAST_FILTER, q: "  " })).toBe(false);
    expect(isFilterActive({ ...EMPTY_PAST_FILTER, from: "2026-10-01" })).toBe(true);
  });
});
