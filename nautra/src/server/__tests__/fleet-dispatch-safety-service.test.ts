import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * S-11 船舶・保守 / S-12 配船・位置情報 / 安全管理・事故報告のサービス層。
 *
 * デモデータが**画面に出る形で**組み上がることを、サービスの戻り値で確認する
 * （要件定義書 3.4.1 / 3.4.2 / 3.5.1 / 3.5.2 / 3.7.1 / 3.7.2 / 6.5）。
 * ストアは `process.cwd()/.data/store.json` に永続化されるため、
 * **一時ディレクトリへ移ってから**サービスを読み込み、開発用のデモストアを汚さない。
 */

type FleetService = typeof import("@/server/fleet-service");
type PositionService = typeof import("@/server/position-service");
type SafetyService = typeof import("@/server/safety-service");
type MasterService = typeof import("@/server/master-service");

let fleet: FleetService;
let position: PositionService;
let safety: SafetyService;
let ms: MasterService;
const VESSEL = "vessel-001";
const ACTOR = "shore-okada";

beforeAll(async () => {
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "nautra-fleet-")));
  ms = await import("@/server/master-service");
  fleet = await import("@/server/fleet-service");
  position = await import("@/server/position-service");
  safety = await import("@/server/safety-service");
});

describe("S-11 船舶・保守・検査の集約（3.4）", () => {
  it("船舶マスタと船内環境（3.5.3）が読める", () => {
    const board = fleet.buildFleetBoard(VESSEL);
    expect(board.master?.name).toBe("第一のーとら丸");
    expect(board.master?.grossTonnage).toBe(499);
    expect(board.master?.wifiAvailable).toBe(true);
    expect(board.environment.level).toBe("ok"); // 30日前に確認済み
  });

  it("検査証書は「着手時期」として注意になる（満了95日・リードタイム120日）", () => {
    const board = fleet.buildFleetBoard(VESSEL);
    const survey = board.credentials.find((c) => c.credential.category === "vessel_survey");
    expect(survey?.expiry).toBe("start_due");
    expect(survey?.level).toBe("caution");
    expect(survey?.message).toContain("更新の手続きを始める時期です");
    // 無線局免許はまだ余裕がある
    const radio = board.credentials.find((c) => c.credential.category === "radio_station");
    expect(radio?.expiry).toBe("valid");
  });

  it("保守計画は6件で、ウインチ点検が予定日超過として先頭に出る", () => {
    const board = fleet.buildFleetBoard(VESSEL);
    expect(board.plans).toHaveLength(6);
    expect(board.plans[0].plan.equipment).toBe("deck_machinery");
    expect(board.plans[0].level).toBe("violation");
    expect(board.plans[0].daysToDue).toBeLessThan(0);
    // 次回予定日は保存せず「前回 + 周期」で導出している
    expect(board.plans[0].nextDueOn).not.toBeNull();
    // 主機の潤滑油交換は予定日が目前（注意）
    const engine = board.plans.find((p) => p.plan.equipment === "main_engine");
    expect(engine?.level).toBe("caution");
  });

  it("部品在庫は4件で、在庫ゼロ・発注点割れが先頭に出る", () => {
    const board = fleet.buildFleetBoard(VESSEL);
    expect(board.stocks).toHaveLength(4);
    expect(board.stocks[0].stock.partName).toContain("ブレーキライニング");
    expect(board.stocks[0].outOfStock).toBe(true);
    expect(board.stocks[1].belowReorder).toBe(true);
    expect(board.stocks.filter((s) => s.level === "ok")).toHaveLength(2);
  });

  it("入渠は中間検査が先に出て、準備2/5件・前回検査の指摘1件が未対応", () => {
    const board = fleet.buildFleetBoard(VESSEL);
    expect(board.docks[0].dock.kind).toBe("intermediate");
    expect(board.docks[0].prepDone).toBe(2);
    expect(board.docks[0].prepTotal).toBe(5);
    expect(board.docks[0].daysToStart).toBe(88);
    const previous = board.docks.find((d) => d.dock.kind === "periodic");
    expect(previous?.openFindings).toBe(1);
  });

  it("発注を進めても原本は残り、有効な最新だけが変わる（12.3 追記型）", () => {
    const before = fleet.buildFleetBoard(VESSEL).stocks.find((s) => s.stock.partNo === "LF-3000-A")!;
    expect(before.stock.orderStatus).toBe("none");
    const historyBefore = ms.history("part_stock").length;

    const published = fleet.advancePartOrder(before.stock.id, ACTOR);
    expect(published.orderStatus).toBe("requested");
    expect(published.supersedesId).toBe(before.stock.id);
    expect(ms.history("part_stock").length).toBe(historyBefore + 1);

    const after = fleet.buildFleetBoard(VESSEL).stocks.find((s) => s.stock.partNo === "LF-3000-A")!;
    expect(after.stock.orderStatus).toBe("requested");
    expect(after.stock.quantity).toBe(before.stock.quantity); // 数量は変わらない
  });

  it("入荷を登録すると在庫が増え、発注状態が入荷済になる", () => {
    const before = fleet.buildFleetBoard(VESSEL).stocks.find((s) => s.stock.partNo === "WB-220-L")!;
    const published = fleet.receiveParts(before.stock.id, 2, ACTOR);
    expect(published.quantity).toBe(before.stock.quantity + 2);
    expect(published.orderStatus).toBe("delivered");
    const after = fleet.buildFleetBoard(VESSEL).stocks.find((s) => s.stock.partNo === "WB-220-L")!;
    expect(after.level).toBe("ok");
  });

  it("準備タスクの消し込みと指摘の追加ができる（3.4.2）", () => {
    const dock = fleet.buildFleetBoard(VESSEL).docks[0].dock;
    fleet.setPrepTaskDone(dock.id, "p3", true, ACTOR);
    const afterPrep = fleet.buildFleetBoard(VESSEL).docks[0];
    expect(afterPrep.prepDone).toBe(3);

    fleet.upsertFinding(
      { dockId: afterPrep.dock.id, content: "舵板の遊隙を計測すること", status: "open" },
      ACTOR,
    );
    const afterFinding = fleet.buildFleetBoard(VESSEL).docks[0];
    expect(afterFinding.openFindings).toBe(1);
    expect(afterFinding.dock.findings?.[0].content).toContain("舵板の遊隙");
  });

  it("2隻目にも切り替えられる（船ごとの集約になっている）", () => {
    const board = fleet.buildFleetBoard("vessel-002");
    expect(board.master?.name).toBe("第二のーとら丸");
    expect(board.master?.wifiAvailable).toBe(false);
    expect(board.plans).toHaveLength(0); // 2隻目の保守計画はデモに無い
  });
});

describe("S-12 配船・位置情報（3.7）", () => {
  it("位置は取得アダプタ経由で読み、船ごとの最新と航跡になる", () => {
    expect(position.fetchPositions().length).toBeGreaterThan(0);
    const views = position.buildPositionViews();
    const first = views.find((v) => v.vesselId === VESSEL)!;
    expect(first.latest?.source).toBe("ais");
    expect(first.latest?.navStatus).toBe("moored");
    expect(first.track.length).toBeGreaterThan(1);
    // 航跡は古い順（図の折れ線がそのまま通った順になる）
    expect(first.track[0].observedAt < first.track[first.track.length - 1].observedAt).toBe(true);
    expect(first.freshness).not.toBeNull();
  });

  it("配船スケジュールは出港の早い順に並ぶ", () => {
    const views = position.buildScheduleViews();
    expect(views.length).toBeGreaterThanOrEqual(4);
    const departures = views.map((v) => v.schedule.departureAt);
    expect([...departures].sort()).toEqual(departures);
  });

  it("下船予定に重なる期間で登録すると警告の材料が返る（3.7.2③）", () => {
    // デモでは佐藤が21日後に下船予定
    const from = new Date();
    from.setDate(from.getDate() + 19);
    const to = new Date();
    to.setDate(to.getDate() + 23);
    const hits = position.crewChangesFor(from.toISOString(), to.toISOString());
    expect(hits.map((h) => h.crewName)).toContain("佐藤 海斗");
    expect(hits[0].eventType).toBe("off");
  });

  it("配船を登録でき、状態も進められる", () => {
    const created = position.createVoyageSchedule(
      {
        targetVesselId: VESSEL,
        voyageNo: "V-TEST-001",
        departurePort: "水島港",
        arrivalPort: "横浜港",
        departureAt: "2026-12-01T06:00",
        arrivalAt: "2026-12-02T18:00",
        status: "planned",
      },
      ACTOR,
    );
    expect(created.departurePort).toBe("水島港");
    const updated = position.updateScheduleStatus(created.id, "fixed", ACTOR);
    expect(updated.status).toBe("fixed");
    expect(updated.supersedesId).toBe(created.id);
  });

  it("入港が出港より前なら登録できない", () => {
    expect(() =>
      position.createVoyageSchedule(
        {
          targetVesselId: VESSEL,
          departurePort: "A",
          arrivalPort: "B",
          departureAt: "2026-12-02T06:00",
          arrivalAt: "2026-12-01T06:00",
          status: "planned",
        },
        ACTOR,
      ),
    ).toThrow(/入港日時/);
  });

  it("手入力の位置は取得元が manual として残る（3.7.1 AIS 非搭載の補完）", () => {
    const published = position.publishManualPosition(
      { targetVesselId: "vessel-002", lat: 34.4, lon: 133.2, navStatus: "underway" },
      ACTOR,
    );
    expect(published.source).toBe("manual");
    const view = position.buildPositionViews().find((v) => v.vesselId === "vessel-002")!;
    expect(view.latest?.source).toBe("manual");
  });

  it("緯度経度が範囲外なら登録できない", () => {
    expect(() =>
      position.publishManualPosition({ targetVesselId: VESSEL, lat: 999, lon: 133 }, ACTOR),
    ).toThrow(/緯度/);
  });
});

describe("安全管理・事故報告（3.5 / 6.5）", () => {
  it("SMS は4件で、種別ごとに分かれる", () => {
    const board = safety.buildSafetyBoard();
    expect(board.policies).toHaveLength(1);
    expect(board.risks).toHaveLength(1);
    expect(board.nonconformities).toHaveLength(1);
    expect(board.audits).toHaveLength(1);
    expect(board.nonconformities[0].status).toBe("in_progress");
    expect(board.riskMatrix[3][1].documents).toHaveLength(1); // 影響度4 × 発生度2
  });

  it("事故は2件で、調査中のものが先頭に出る", () => {
    const board = safety.buildSafetyBoard();
    expect(board.incidents).toHaveLength(2);
    expect(board.incidents[0].status).toBe("investigating");
    expect(board.incidents[0].title).toContain("ウインチ");
    expect(board.incidents[1].status).toBe("closed");
  });

  it("ヒヤリハットの件数推移が出る（重点施策の月2件以上に対する達成状況）", () => {
    const board = safety.buildSafetyBoard();
    expect(board.nearMiss).toHaveLength(6);
    expect(board.nearMissTarget).toBe(2);
    expect(board.nearMiss.reduce((a, m) => a + m.count, 0)).toBe(1);
  });

  it("陸上から原因分析・再発防止策を追記できる（origin=both の追記型）", () => {
    const target = safety.buildSafetyBoard().incidents[0];
    const published = safety.appendIncidentAnalysis(
      {
        incidentId: target.id,
        cause: "ライニングの摩耗が想定より早い",
        preventiveAction: "周期を60日から45日へ短縮する",
        status: "closed",
        notifiedNearbyShips: true,
        notifiedNearbyShipsAt: "2026-09-01T10:00",
      },
      ACTOR,
    );
    expect(published.supersedesId).toBe(target.id);
    expect(published.cause).toContain("摩耗");
    expect(safety.notifiedAtOf(published)).toBe("2026-09-01T10:00");
    // 発生日時と最初の報告者は追記で動かさない（業務データを陸上の操作時刻で上書きしない）
    expect(published.occurredAt).toBe(target.occurredAt);
    expect(published.recordedBy).toBe(target.recordedBy);
    // 原本は物理保持される
    expect(ms.history("incident_report").some((i) => i.id === target.id)).toBe(true);
  });

  it("不適合の対応状況を更新できる", () => {
    const target = safety.buildSafetyBoard().nonconformities[0];
    const published = safety.updateSmsStatus(target.id, { status: "closed" }, ACTOR);
    expect(published.status).toBe("closed");
    expect(safety.buildSafetyBoard().nonconformities[0].status).toBe("closed");
  });

  it("SMS を新規登録できる。リスクアセスメントは影響度・発生度が要る", () => {
    const before = safety.buildSafetyBoard().risks.length;
    safety.publishSmsDocument(
      { kind: "risk_assessment", title: "係船作業のリスクアセスメント", severity: 5, likelihood: 3 },
      ACTOR,
    );
    expect(safety.buildSafetyBoard().risks).toHaveLength(before + 1);
    expect(() =>
      safety.publishSmsDocument({ kind: "risk_assessment", title: "不備" }, ACTOR),
    ).toThrow(/影響度・発生度/);
  });

  it("事故と当日の航海日誌から報告書ドラフトを作り、生成物として保存する（6.5）", () => {
    const target = safety.buildSafetyBoard().incidents.find((i) => i.title.includes("ウインチ"))!;
    const result = safety.generateIncidentReportDraft(target.id, ACTOR);
    expect(result.quotedLogs).toBeGreaterThan(0);
    expect(result.body).toContain("海難等の報告書（ドラフト）");
    expect(result.body).toContain("第一のーとら丸");
    expect(result.body).toContain("11. 航海日誌の記載（引用）");
    // 生成時点のスナップショットが保存され、一覧に出る
    const board = safety.buildSafetyBoard();
    expect(board.drafts.length).toBeGreaterThan(0);
    expect(safety.draftBodyOf(board.drafts[0])).toBe(result.body);
  });
});
