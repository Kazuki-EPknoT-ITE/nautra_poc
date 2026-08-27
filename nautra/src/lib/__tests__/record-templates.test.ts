import { describe, expect, it } from "vitest";
import {
  buildTemplateWithAddedItem,
  draftTemplate,
  effectiveTemplates,
  nextTemplateVersion,
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
      recordedBy: "crew-kato",
      deviceId: "dev-1",
      publishedBy: "crew-kato",
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
      recordedBy: "crew-kato",
      deviceId: "dev-1",
      publishedBy: "crew-kato",
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
      recordedBy: "crew-kato",
      deviceId: "dev-1",
      publishedBy: "crew-kato",
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
        recordedBy: "crew-kato",
        deviceId: "dev-1",
        publishedBy: "crew-kato",
      });
    expect(() => call({ label: "  ", group: "機関", inputType: "check" })).toThrow(/項目名/);
    expect(() => call({ label: "残量", group: "機関", inputType: "number" })).toThrow(/単位/);
  });
});
