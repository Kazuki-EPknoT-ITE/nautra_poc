import { describe, expect, it } from "vitest";
import {
  buildTemplateRevision,
  buildTemplateWithAddedItem,
  collectTemplateValues,
  CUSTOM_LOG_PREFIX,
  draftTemplate,
  effectiveTemplates,
  isCustomLogKey,
  isItemRequired,
  itemsToDrafts,
  nextTemplateVersion,
  parseChoiceOptions,
} from "../record-templates";
import { recordTemplatePayloadSchema, type RecordTemplatePayload } from "@/sync-protocol/records";

/**
 * 記録項目テンプレート（点検表・航海日誌の項目を上司・陸上が追加する）のテスト。
 * 追加は追記のみ = 新しい版が旧版を supersedes し、旧版は保持されることを検証する。
 */
const tpl = (over: Partial<RecordTemplatePayload> = {}): RecordTemplatePayload =>
  recordTemplatePayloadSchema.parse({
    id: "tpl-1",
    tenantId: "tenant-demo",
    vesselId: "vessel-001",
    occurredAt: "2026-08-01T00:00:00.000Z",
    recordedBy: "shore-yamamoto",
    deviceId: "shore-planner-device",
    usage: "checklist",
    templateKey: "pre_departure",
    name: "出港前点検",
    version: "2026-04.1",
    items: [{ key: "hull", label: "船体外観", group: "船体", inputType: "check" }],
    publishedAt: "2026-08-01T00:00:00.000Z",
    publishedBy: "shore-yamamoto",
    ...over,
  });

describe("記録項目テンプレートの解決", () => {
  it("同じ templateKey は最新の版のみが有効になり、旧版は入力配列に残る", () => {
    const v1 = tpl();
    const v2 = tpl({ id: "tpl-2", supersedesId: "tpl-1", version: "2026-04.2", publishedAt: "2026-08-05T00:00:00.000Z" });
    const input = [v1, v2];
    expect(effectiveTemplates(input, "checklist").map((x) => x.id)).toEqual(["tpl-2"]);
    expect(input).toHaveLength(2); // 非破壊（原本保持）
  });

  it("用途（点検表 / 航海日誌）で絞り込まれる", () => {
    const checklist = tpl();
    const voyage = tpl({ id: "tpl-v", usage: "voyage_log", templateKey: "departure", name: "出港" });
    expect(effectiveTemplates([checklist, voyage], "voyage_log").map((x) => x.templateKey)).toEqual(["departure"]);
  });

  it("版番号は末尾の数値を1つ進める", () => {
    expect(nextTemplateVersion("2026-04.1")).toBe("2026-04.2");
    expect(nextTemplateVersion("1")).toBe("2");
    expect(nextTemplateVersion("初版")).toBe("初版.2");
  });
});

describe("記録項目の追加（上司・陸上からの配信）", () => {
  it("項目を追加した新しい版は旧版を supersedes し、既存項目を保持する", () => {
    const next = buildTemplateWithAddedItem({
      template: tpl(),
      item: { label: "燃料タンク残量", group: "機関", inputType: "number", unit: "kL" },
      id: "tpl-2",
      recordedBy: "crew-takamatsu",
      deviceId: "dev-1",
      publishedBy: "crew-takamatsu",
    });
    expect(next.supersedesId).toBe("tpl-1");
    expect(next.version).toBe("2026-04.2");
    expect(next.items.map((i) => i.label)).toEqual(["船体外観", "燃料タンク残量"]);
    expect(next.items[1].inputType).toBe("number"); // 数値は利用者が入力する
    expect(next.items[1].unit).toBe("kL");
    expect(next.changeNote).toContain("燃料タンク残量");
  });

  it("追加項目のキーは既存と重複しない", () => {
    const base = tpl({ items: [{ key: "added_2", label: "既存", group: "機関", inputType: "check" }] });
    const next = buildTemplateWithAddedItem({
      template: base,
      item: { label: "追加", group: "機関", inputType: "check" },
      id: "tpl-2",
      recordedBy: "crew-takamatsu",
      deviceId: "dev-1",
      publishedBy: "crew-takamatsu",
    });
    expect(new Set(next.items.map((i) => i.key)).size).toBe(next.items.length);
  });

  it("未配信の種別には第1版として作られ、置き換え対象を持たない", () => {
    const next = buildTemplateWithAddedItem({
      template: draftTemplate({
        usage: "voyage_log",
        templateKey: "remark",
        name: "航海日誌: 特記",
        tenantId: "tenant-demo",
        vesselId: "vessel-001",
      }),
      item: { label: "気圧", group: "特記", inputType: "number", unit: "hPa" },
      id: "tpl-new",
      recordedBy: "crew-takamatsu",
      deviceId: "dev-1",
      publishedBy: "crew-takamatsu",
    });
    expect(next.supersedesId).toBeUndefined();
    expect(next.version).toBe("1");
    expect(next.items).toHaveLength(1);
  });

  it("項目名の未入力・数値項目の単位なしは拒否する", () => {
    const call = (item: { label: string; group: string; inputType: "check" | "number"; unit?: string }) =>
      buildTemplateWithAddedItem({
        template: tpl(),
        item,
        id: "tpl-2",
        recordedBy: "crew-takamatsu",
        deviceId: "dev-1",
        publishedBy: "crew-takamatsu",
      });
    expect(() => call({ label: "  ", group: "機関", inputType: "check" })).toThrow(/項目名/);
    expect(() => call({ label: "残量", group: "機関", inputType: "number" })).toThrow(/単位/);
  });
});

describe("航海日誌の項目を自由に直す（足す・直す・外す・並べ替え・種類を作る）", () => {
  const base = tpl({
    usage: "voyage_log",
    templateKey: "departure",
    name: "航海日誌: 出港",
    version: "3",
    items: [
      { key: "fuel", label: "燃料残量", group: "出港", inputType: "number", unit: "kL" },
      { key: "ballast", label: "バラスト水量", group: "出港", inputType: "number", unit: "t" },
    ],
  });
  const common = { id: "tpl-9", recordedBy: "crew-takamatsu", deviceId: "dev", publishedBy: "crew-takamatsu", group: "出港", now: new Date("2026-10-14T05:00:00Z") };

  it("並べ替え・名前の変更・外す・足すを1つの新しい版にまとめ、既存の項目は key を引き継ぐ", () => {
    const next = buildTemplateRevision({
      ...common,
      template: base,
      items: [
        { key: "ballast", label: "バラスト水", inputType: "number", unit: "t", required: false },
        { label: "喫水", inputType: "choice", options: ["満載", "半載", "空船"], required: true },
      ],
    });
    expect(next.supersedesId).toBe("tpl-1");
    expect(next.version).toBe("4");
    expect(next.items[0].key).toBe("ballast");
    expect(next.items[1].key).toMatch(/^item_/);
    expect(next.items[0]).toMatchObject({ label: "バラスト水", required: false });
    expect(next.items[1]).toMatchObject({ inputType: "choice", options: ["満載", "半載", "空船"], required: true });
    expect(next.changeNote).toContain("追加: 喫水");
    expect(next.changeNote).toContain("外した: 燃料残量");
  });

  it("外した項目の key は、あとで足した別の項目に使い回さない（古い記録の訂正で値が別の項目へ入らない）", () => {
    const removed = buildTemplateRevision({ ...common, id: "01JA0000000000000000000001", template: base, items: [{ key: "ballast", label: "バラスト水量", inputType: "number", unit: "t" }] });
    const readded = buildTemplateRevision({ ...common, id: "01JA0000000000000000000002", template: removed, items: [...removed.items, { label: "天候", inputType: "text" }] });
    const keys = readded.items.map((it) => it.key);
    expect(keys).not.toContain("fuel");
    expect(new Set(keys).size).toBe(keys.length);
    // 船長と陸上が同じ版へ同時に足しても、版の ID が違うので key は重ならない
    const other = buildTemplateRevision({ ...common, id: "01JA0000000000000000000003", template: removed, items: [...removed.items, { label: "視程", inputType: "text" }] });
    expect(other.items[1].key).not.toBe(readded.items[1].key);
  });

  it("空の項目名・重なる項目名・選択肢が2つ未満は配信しない", () => {
    expect(() => buildTemplateRevision({ ...common, template: base, items: [{ label: " ", inputType: "text" }] })).toThrow("項目名が入っていない行");
    expect(() =>
      buildTemplateRevision({ ...common, template: base, items: [{ label: "A", inputType: "text" }, { label: "A", inputType: "number" }] }),
    ).toThrow("項目名が2つあります");
    expect(() =>
      buildTemplateRevision({ ...common, template: base, items: [{ label: "風向", inputType: "choice", options: ["北"] }] }),
    ).toThrow("2つ以上");
  });

  it("船長が作った種類はしまうと有効な一覧から消える（旧版は入力配列に残る）", () => {
    const custom = buildTemplateRevision({
      ...common,
      template: draftTemplate({ usage: "voyage_log", templateKey: `${CUSTOM_LOG_PREFIX}01X`, name: "投錨", tenantId: "t", vesselId: "v" }),
      items: [],
      group: "投錨",
    });
    expect(custom.version).toBe("1");
    expect(isCustomLogKey(custom.templateKey)).toBe(true);
    const retired = buildTemplateRevision({ ...common, id: "tpl-10", template: custom, items: [], retired: true, group: "投錨", now: new Date("2026-10-14T06:00:00Z") });
    expect(effectiveTemplates([custom], "voyage_log").map((x) => x.name)).toEqual(["投錨"]);
    expect(effectiveTemplates([custom, retired], "voyage_log")).toEqual([]);
  });

  it("必須の空欄・数値でない値・選択肢にない値は記録しない。任意の空欄は記録に載せない", () => {
    const items = [
      { key: "fuel", label: "燃料残量", group: "出港", inputType: "number" as const, unit: "kL" },
      { key: "memo", label: "メモ", group: "出港", inputType: "text" as const },
      { key: "draft", label: "喫水", group: "出港", inputType: "choice" as const, options: ["満載", "空船"], required: true },
      { key: "lines", label: "係留索解放", group: "出港", inputType: "time" as const, required: false },
    ];
    expect(() => collectTemplateValues(items, { draft: "満載" })).toThrow("「燃料残量」が空欄です"); // 旧版の数値は必須のまま
    expect(() => collectTemplateValues(items, { fuel: "abc", draft: "満載" })).toThrow("数字を入れてください");
    expect(() => collectTemplateValues(items, { fuel: "12", draft: "半載" })).toThrow("選べる答えの中から");
    const out = collectTemplateValues(items, { fuel: "12.5", draft: "満載", lines: "08:30" });
    expect(out.map((v) => [v.key, v.value])).toEqual([
      ["fuel", 12.5],
      ["draft", "満載"],
      ["lines", "08:30"],
    ]);
  });

  it("選択肢の入力は読点・カンマ・改行で区切り、空と重複を除く", () => {
    expect(parseChoiceOptions("良好、やや不良,不良\n良好、 ")).toEqual(["良好", "やや不良", "不良"]);
    expect(isItemRequired({ inputType: "number" })).toBe(true);
    expect(isItemRequired({ inputType: "number", required: false })).toBe(false);
    expect(isItemRequired({ inputType: "check", required: true })).toBe(false);
  });
});

describe("日誌の種類と項目を削除する・元に戻す（利用者の依頼 2026-10-19）", () => {
  const base = tpl({
    usage: "voyage_log",
    templateKey: "departure",
    name: "航海日誌: 出港",
    version: "3",
    items: [
      // required の無い旧版の数値項目は「必須」と読む
      { key: "fuel", label: "燃料残量", group: "出港", inputType: "number", unit: "kL" },
      { key: "wx", label: "天候", group: "出港", inputType: "choice", options: ["晴", "雨"], required: false },
    ],
  });
  const common = { recordedBy: "crew-takamatsu", deviceId: "dev", publishedBy: "crew-takamatsu", group: "出港", now: new Date("2026-10-19T05:00:00Z") };

  it("項目を1つ削除すると、その項目を載せない新しい版になり、残す項目は key・必須・選択肢を保つ", () => {
    const next = buildTemplateRevision({ ...common, id: "01JB0000000000000000000001", template: base, items: itemsToDrafts(base.items.filter((it) => it.key !== "wx")) });
    expect(next.supersedesId).toBe("tpl-1");
    expect(next.items).toEqual([expect.objectContaining({ key: "fuel", unit: "kL", required: true })]);
    expect(next.changeNote).toContain("外した: 天候");
  });

  it("削除のあと元に戻すと、同じ key の項目が戻る（これまでの記録の値と同じ項目として読める）", () => {
    const removed = buildTemplateRevision({ ...common, id: "01JB0000000000000000000002", template: base, items: [] });
    const restored = buildTemplateRevision({ ...common, id: "01JB0000000000000000000003", template: removed, items: itemsToDrafts(base.items), retired: false });
    expect(restored.supersedesId).toBe(removed.id);
    expect(restored.items.map((it) => it.key)).toEqual(["fuel", "wx"]);
    expect(restored.items[1].options).toEqual(["晴", "雨"]);
  });

  it("作った種類を削除すると retired の版になって選べなくなり、元に戻すとまた選べる", () => {
    const custom = tpl({ id: "tpl-c", usage: "voyage_log", templateKey: `${CUSTOM_LOG_PREFIX}01JB`, name: "投錨", version: "1", items: [] });
    const retired = buildTemplateRevision({ ...common, id: "01JB0000000000000000000004", template: custom, items: [], retired: true });
    expect(effectiveTemplates([custom, retired], "voyage_log")).toEqual([]);
    const back = buildTemplateRevision({ ...common, id: "01JB0000000000000000000005", template: retired, items: [], retired: false, name: "投錨" });
    expect(back.retired).toBeUndefined();
    expect(effectiveTemplates([custom, retired, back], "voyage_log").map((x) => x.name)).toEqual(["投錨"]);
  });
});
