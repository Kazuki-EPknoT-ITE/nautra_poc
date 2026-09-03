import { describe, expect, it } from "vitest";
import { carryOverFields } from "../master-fields";
import {
  buildIncidentReportDraft,
  buildRiskMatrix,
  nearMissByMonth,
  recentMonths,
  riskLevelOf,
  sortByOpenFirst,
  sortIncidents,
  voyageLogsForIncident,
} from "../safety-plain";
import type { IncidentReportPayload, SmsDocumentPayload } from "@/sync-protocol/masters";
import type { VoyageLogPayload } from "@/sync-protocol/records";

/**
 * 安全管理・事故報告（要件定義書 3.5.1 / 3.5.2 / 6.5）のテスト。
 */

const sms = (over: Partial<SmsDocumentPayload> = {}): SmsDocumentPayload => ({
  id: "sms-1",
  tenantId: "tenant-demo",
  vesselId: "company-demo",
  occurredAt: "2026-08-01T00:00:00.000Z",
  recordedBy: "shore-yamamoto",
  deviceId: "seed-shore-device",
  publishedAt: "2026-08-01T00:00:00.000Z",
  publishedBy: "shore-yamamoto",
  kind: "risk_assessment",
  title: "荷役作業のリスクアセスメント",
  ...over,
});

const incident = (over: Partial<IncidentReportPayload> = {}): IncidentReportPayload => ({
  id: "inc-1",
  tenantId: "tenant-demo",
  vesselId: "vessel-001",
  occurredAt: "2026-08-31T09:00:00.000Z",
  recordedBy: "crew-tanaka",
  deviceId: "vessel-device",
  kind: "near_miss",
  title: "通路の工具につまずきかけた",
  description: "通路に工具箱が置かれており、通行時につまずきかけた。",
  status: "closed",
  ...over,
});

const log = (over: Partial<VoyageLogPayload> = {}): VoyageLogPayload => ({
  id: "vl-1",
  tenantId: "tenant-demo",
  vesselId: "vessel-001",
  occurredAt: "2026-08-31T06:00:00.000Z",
  recordedBy: "crew-sato",
  deviceId: "vessel-device",
  logType: "departure",
  port: "名古屋港",
  weather: "晴",
  ...over,
});

describe("リスクアセスメントのマトリクス（3.5.1）", () => {
  it("影響度 × 発生度 の 5×5 に件数を配る", () => {
    const matrix = buildRiskMatrix([sms({ severity: 4, likelihood: 2 })]);
    expect(matrix).toHaveLength(5);
    expect(matrix[0]).toHaveLength(5);
    expect(matrix[3][1].documents).toHaveLength(1);
    expect(matrix[0][0].documents).toHaveLength(0);
  });

  it("重みが大きい区画ほど強い印になる（区分けは自社の運用値）", () => {
    expect(riskLevelOf(5, 4)).toBe("violation");
    expect(riskLevelOf(4, 2)).toBe("caution");
    expect(riskLevelOf(1, 2)).toBe("ok");
    expect(riskLevelOf(undefined, 2)).toBe("none");
  });
});

describe("未完了を先頭に出す並び（3.5.1 / 3.5.2）", () => {
  it("不適合は 未対応 → 対応中 → 完了 の順、同じ状態なら期限の近い順", () => {
    const rows = sortByOpenFirst([
      sms({ id: "c", status: "closed" }),
      sms({ id: "b", status: "open", dueOn: "2026-09-20" }),
      sms({ id: "a", status: "open", dueOn: "2026-09-05" }),
      sms({ id: "p", status: "in_progress" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "p", "c"]);
  });

  it("事故は 未対応 → 調査中 → 完了 の順、同じ状態なら新しい順", () => {
    const rows = sortIncidents([
      incident({ id: "done", status: "closed" }),
      incident({ id: "old", status: "investigating", occurredAt: "2026-08-01T00:00:00.000Z" }),
      incident({ id: "new", status: "investigating", occurredAt: "2026-08-30T00:00:00.000Z" }),
      incident({ id: "open", status: "open" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["open", "new", "old", "done"]);
  });
});

describe("ヒヤリハットの件数推移（3.5.2 重点施策の達成状況）", () => {
  it("月別に数え、目標に届いたかを返す", () => {
    const rows = nearMissByMonth(
      [
        incident({ id: "a", occurredAt: "2026-08-05T00:00:00.000Z" }),
        incident({ id: "b", occurredAt: "2026-08-20T00:00:00.000Z" }),
        incident({ id: "c", occurredAt: "2026-07-10T00:00:00.000Z" }),
        incident({ id: "d", kind: "equipment", occurredAt: "2026-08-25T00:00:00.000Z" }),
      ],
      ["2026-07", "2026-08"],
      2,
    );
    expect(rows).toEqual([
      { month: "2026-07", count: 1, meetsTarget: false },
      { month: "2026-08", count: 2, meetsTarget: true },
    ]);
  });

  it("直近の月は古い順に並ぶ", () => {
    expect(recentMonths(new Date(2026, 8, 1), 3)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });
});

describe("報告書ドラフトの生成（6.5 航海日誌からの下書き）", () => {
  it("事故に紐づく航海日誌と当日の記載を引用対象にする", () => {
    const logs = voyageLogsForIncident(incident({ voyageLogId: "vl-9" }), [
      log({ id: "vl-1" }), // 同じ日
      log({ id: "vl-9", occurredAt: "2026-08-20T00:00:00.000Z" }), // 別の日だが紐づけ済み
      log({ id: "vl-2", occurredAt: "2026-08-10T00:00:00.000Z" }), // 対象外
      log({ id: "vl-3", vesselId: "vessel-002" }), // 別の船
    ]);
    expect(logs.map((l) => l.id)).toEqual(["vl-9", "vl-1"]);
  });

  it("状況・被害・原因・再発防止・通報・航海日誌の引用が本文に入る", () => {
    const body = buildIncidentReportDraft({
      incident: incident({
        kind: "container_loss",
        title: "コンテナ1個が海中へ転落",
        location: "備讃瀬戸東航路",
        damage: "コンテナ1個",
        cause: "固縛不良",
        preventiveAction: "固縛の相互確認を追加",
        notifiedNearbyShips: true,
      }),
      vesselName: "第一のーとら丸",
      voyageLogs: [log()],
      nameOf: (id) => (id === "crew-sato" ? "佐藤 海斗" : id),
      generatedOn: "2026-09-01",
    });
    expect(body).toContain("海難等の報告書（ドラフト）");
    expect(body).toContain("第一のーとら丸");
    expect(body).toContain("コンテナ海中転落");
    expect(body).toContain("固縛不良");
    expect(body).toContain("固縛の相互確認を追加");
    expect(body).toContain("付近船舶等への通報: 実施済み");
    expect(body).toContain("名古屋港");
    expect(body).toContain("佐藤 海斗");
  });

  it("原因・再発防止が未記入なら「調査中」と明示し、空欄のまま提出させない", () => {
    const body = buildIncidentReportDraft({
      incident: incident({ cause: undefined, preventiveAction: undefined }),
      vesselName: "第一のーとら丸",
      voyageLogs: [],
      nameOf: (id) => id,
      generatedOn: "2026-09-01",
    });
    expect(body).toContain("（調査中");
    expect(body).toContain("（検討中");
    expect(body).toContain("当日の航海日誌に該当する記載はありません");
  });
});

describe("追記型の訂正で引き継ぐ項目（12.3 / 12.6）", () => {
  it("発行元の列（ID・配信日時・記録者・端末）は引き継がない", () => {
    const fields = carryOverFields({
      id: "old-1",
      tenantId: "tenant-demo",
      vesselId: "vessel-001",
      occurredAt: "2026-08-01T00:00:00.000Z",
      recordedAt: "2026-08-01T00:00:00.000Z",
      recordedBy: "seed",
      deviceId: "seed-shore-device",
      supersedesId: "older-1",
      publishedAt: "2026-08-01T00:00:00.000Z",
      publishedBy: "seed",
      title: "中間検査",
      note: "メモは業務の中身なので引き継ぐ",
      quantity: 3,
    });
    expect(fields).toEqual({ title: "中間検査", note: "メモは業務の中身なので引き継ぐ", quantity: 3 });
  });

  it("undefined の項目は落とす（Zod の既定値を壊さない）", () => {
    expect(carryOverFields({ a: 1, b: undefined })).toEqual({ a: 1 });
  });
});
