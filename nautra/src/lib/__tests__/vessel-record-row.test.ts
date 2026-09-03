import { describe, expect, it } from "vitest";
import { toRecordRow } from "../vessel-db";

/**
 * 汎用記録テーブルの行組み立て（基本設計書 8.6 のレジストリ方式）。
 * `kind` 列は Dexie の索引としてエンティティ種別に固定されるため、
 * ペイロード自身が `kind` を持つ種別（incident_report = 事故の区分）で
 * 値が失われないことを担保する。
 */
describe("toRecordRow（汎用記録行の組み立て）", () => {
  const base = {
    id: "r-1",
    tenantId: "t-1",
    vesselId: "v-1",
    occurredAt: "2026-09-01T00:00:00.000Z",
    recordedBy: "crew-1",
    deviceId: "dev-1",
  };

  it("kind 列にはエンティティ種別（incident_report）が入る", () => {
    const row = toRecordRow("incident_report", {
      ...base,
      kind: "near_miss",
      title: "工具につまずきかけた",
      description: "通路に工具が置かれていた",
      status: "open",
    });
    expect(row.kind).toBe("incident_report");
  });

  it("ペイロード自身の区分（near_miss）は payloadKind に退避され失われない", () => {
    const row = toRecordRow("incident_report", {
      ...base,
      kind: "container_loss",
      title: "コンテナ1本を海中に落とした",
      description: "荒天により固縛が外れた",
      status: "open",
    });
    expect(row.payloadKind).toBe("container_loss");
    expect(row.title).toBe("コンテナ1本を海中に落とした");
  });

  it("ペイロードに kind が無い種別では payloadKind を作らない", () => {
    const row = toRecordRow("wellbeing_response", {
      ...base,
      recordedBy: "anonymous",
      formType: "health_survey",
      anonymous: true,
      answers: { sleep: 3 },
      status: "submitted",
    });
    expect(row.kind).toBe("wellbeing_response");
    expect(row.payloadKind).toBeUndefined();
    expect(row.recordedBy).toBe("anonymous");
  });
});
