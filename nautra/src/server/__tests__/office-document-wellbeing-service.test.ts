import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * 帳票センター（S-14）・陸上事務（3.6）・健康相談窓口（3.5.3）の書き込み経路のテスト。
 *
 * 検証の主眼:
 * - すべて追記型で、状態の変更後も原本が残ること（12.3 / 12.6）
 * - 生成した書類が**生成時点のスナップショット**を持つこと（12.3 提出時点の証跡）
 * - 匿名の相談に回答しても匿名のままであること（3.5.3）
 * - 回答が少ないアンケートは集計を出さないこと（個人の特定を避ける）
 *
 * ストアは `process.cwd()/.data/store.json` に永続化されるため、
 * **一時ディレクトリへ移ってから**サービスを読み込み、開発用のデモストアを汚さない。
 */

type MasterService = typeof import("@/server/master-service");
type DocumentService = typeof import("@/server/document-service");
type OfficeService = typeof import("@/server/office-service");
type WellbeingService = typeof import("@/server/wellbeing-service");
type EvaluationService = typeof import("@/server/evaluation-service");

let ms: MasterService;
let docs: DocumentService;
let office: OfficeService;
let wellbeing: WellbeingService;
let evaluations: EvaluationService;
const ACTOR = "shore-admin";

beforeAll(async () => {
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "nautra-office-")));
  ms = await import("@/server/master-service");
  docs = await import("@/server/document-service");
  office = await import("@/server/office-service");
  wellbeing = await import("@/server/wellbeing-service");
  evaluations = await import("@/server/evaluation-service");
});

describe("待機時間・荷役時間の実績集計（3.6.4）", () => {
  it("作業記録から月別・港別に待機時間と荷役時間を集計する", () => {
    const rows = docs.buildStandbySummary();
    const totals = docs.standbyTotals(rows);
    // デモデータ: 荷役待ち 3時間（180分）1件 / 荷役 4時間（240分）1件
    expect(totals.standbyMinutes).toBe(180);
    expect(totals.standbyCount).toBe(1);
    expect(totals.cargoMinutes).toBe(240);
    expect(totals.cargoCount).toBe(1);
  });

  it("CSV は見出し・合計行を含み、期間の指定が記録される", () => {
    const rows = docs.buildStandbySummary();
    const csv = docs.standbyCsv(rows, "2026-01-01", "2026-12-31");
    expect(csv).toContain("月,港,待機の回数,待機時間(分)");
    expect(csv).toContain("期間,2026-01-01〜2026-12-31");
    expect(csv.split("\n").at(-1)).toMatch(/^合計,/);
  });

  it("期間を指定するとその範囲の記録だけを集計する", () => {
    expect(docs.buildStandbySummary("1900-01-01", "1900-12-31")).toHaveLength(0);
  });
});

describe("意見陳述書（3.6.4 / 9章）", () => {
  it("待機時間と労働時間の実績を自動で添え、意見尊重義務を書面に明示する", () => {
    const today = ms.todayLocal();
    const from = office.ymdLocal(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const published = docs.publishOpinionStatement(
      { counterparty: "瀬戸内海運株式会社", periodFrom: from, periodTo: today },
      ACTOR,
      "山本 陸（労務管理責任者）",
    );
    expect(published.kind).toBe("opinion_statement");
    // 生成時点のスナップショットを保持する（12.3）
    const snapshot = published.snapshot as ReturnType<typeof docs.buildOpinionStatement>;
    expect(snapshot.documentKind).toBe("opinion_statement");
    expect(snapshot.counterparty).toBe("瀬戸内海運株式会社");
    expect(snapshot.standbyTotals.standbyMinutes).toBe(180);
    expect(snapshot.laborRows.length).toBeGreaterThan(0);
    expect(snapshot.legalBasis).toContain("内航海運業法");
    expect(snapshot.legalBasis).toContain("尊重");
    // 作成直後は未提出
    expect(published.submittedOn).toBeUndefined();
  });

  it("対象期間が逆転していれば作らない", () => {
    expect(() =>
      docs.publishOpinionStatement(
        { counterparty: "瀬戸内海運株式会社", periodFrom: "2026-09-30", periodTo: "2026-09-01" },
        ACTOR,
        "山本 陸",
      ),
    ).toThrow(/開始日/);
  });
});

describe("提出記録（12.3 提出済み書類の保全）", () => {
  it("提出を記録しても中身は変わらず、原本は履歴に残る", () => {
    const target = docs.listDocuments().find((d) => !d.submitted);
    expect(target).toBeDefined();
    const beforeSnapshot = JSON.stringify(target!.record.snapshot);
    const historyBefore = ms.history("generated_document").length;

    const published = docs.recordSubmission(
      { documentId: target!.record.id, submittedOn: "2026-09-01", submittedTo: "瀬戸内海運株式会社" },
      ACTOR,
    );
    expect(published.supersedesId).toBe(target!.record.id);
    expect(published.submittedOn).toBe("2026-09-01");
    // 中身（スナップショット）は生成時のまま
    expect(JSON.stringify(published.snapshot)).toBe(beforeSnapshot);
    // 原本は物理保持される
    expect(ms.history("generated_document").length).toBe(historyBefore + 1);
  });
});

describe("運航実績レポート（3.3.3 / 3.6.4）", () => {
  it("対象月の航海・荷役・燃料・待機・労働時間をまとめる", () => {
    const month = docs.buildStandbySummary()[0].month;
    const snapshot = docs.buildOperationReport(month, "山本 陸（労務管理責任者）");
    expect(snapshot.month).toBe(month);
    expect(snapshot.cargoOps.length).toBeGreaterThan(0);
    expect(snapshot.fuelTotals.bunkeringL).toBe(12000);
    expect(snapshot.standbyTotals.standbyMinutes).toBe(180);
  });

  it("対象月の指定が不正なら作らない", () => {
    expect(() => docs.buildOperationReport("2026/09", "山本 陸")).toThrow(/YYYY-MM/);
  });
});

describe("請求・入金（3.6.1）", () => {
  it("入金遅延を先頭に並べる", () => {
    const rows = office.listInvoices();
    expect(rows[0].overdue).toBe(true);
    expect(rows[0].record.invoiceNo).toBe("INV-2026-0029");
  });

  it("入金を記録すると状態が入金済みになり、二重の記録はできない", () => {
    const overdue = office.listInvoices().find((i) => i.overdue)!;
    const published = office.markInvoicePaid(
      { invoiceId: overdue.record.id, paidOn: "2026-09-01" },
      ACTOR,
    );
    expect(published.status).toBe("paid");
    expect(published.paidOn).toBe("2026-09-01");
    expect(published.supersedesId).toBe(overdue.record.id);
    // 更新済みの旧レコードを再度更新しようとすると弾かれる（追記型の整合）
    expect(() =>
      office.markInvoicePaid({ invoiceId: overdue.record.id, paidOn: "2026-09-02" }, ACTOR),
    ).toThrow();
  });
});

describe("船員給与（3.6.2 まるめ時間設定による給与連携）", () => {
  it("確定するとまるめ後の時間外分数を保存する（支払の根拠として値を固定する）", () => {
    const draft = office.listPayrolls().find((p) => p.record.status === "draft")!;
    const expected = draft.overtime.roundedMinutes;
    const published = office.confirmPayroll(draft.record.id, ACTOR);
    expect(published.status).toBe("confirmed");
    expect(published.overtimeMinutes).toBe(expected);
    expect(published.roundingUnitMinutes).toBe(15);
    // 確定済みは再確定できない
    expect(() => office.confirmPayroll(draft.record.id, ACTOR)).toThrow();
  });

  it("支給額は保存せず、基本給・手当・時間外手当・控除から都度求める", () => {
    const row = office.listPayrolls()[0];
    expect(row.netAmount).toBe(
      row.record.baseAmount + row.allowanceTotal + (row.record.overtimeAmount ?? 0) - row.deductionTotal,
    );
  });
});

describe("経費（3.6.2）", () => {
  it("区分別・船別に集計する", () => {
    const rows = office.listExpenses();
    const totals = office.expenseTotals(rows);
    expect(totals.total).toBe(rows.reduce((a, r) => a + r.record.amount, 0));
    expect(totals.byKind.map((k) => k.key)).toContain("fuel");
    expect(totals.byVessel.length).toBeGreaterThan(0);
  });

  it("金額が0以下なら登録しない", () => {
    expect(() =>
      office.publishExpense(
        { kind: "other", title: "テスト", amount: 0, spentOn: "2026-09-01" },
        ACTOR,
      ),
    ).toThrow(/金額/);
  });
});

describe("補助金・行政手続き（3.6.3）", () => {
  it("状態を進めても内容は引き継がれ、申請日が入る", () => {
    const target = office.listSubsidies().find((s) => s.record.status === "preparing")!;
    const published = office.updateSubsidyStatus(
      { subsidyId: target.record.id, status: "applied" },
      ACTOR,
    );
    expect(published.status).toBe("applied");
    expect(published.title).toBe(target.record.title);
    expect(published.appliedOn).toBeTruthy();
  });
});

describe("健康アンケート・相談（3.5.3 匿名の保護）", () => {
  it("回答が3件に満たないうちは集計を出さない", () => {
    const summary = wellbeing.buildWellbeingSummary("health_survey");
    expect(summary.responseCount).toBe(2);
    expect(summary.suppressed).toBe(true);
    expect(summary.items).toHaveLength(0);
  });

  it("3件そろうと設問ごとの平均と分布を出す（個人は特定しない）", () => {
    ms.publishMaster(
      "wellbeing_response",
      {
        recordedBy: "anonymous",
        formType: "health_survey",
        anonymous: true,
        answers: { sleep: 4, fatigue: 2, appetite: 4, mood: 4, workload: 3 },
        status: "submitted",
      },
      { actor: ACTOR },
    );
    const summary = wellbeing.buildWellbeingSummary("health_survey");
    expect(summary.suppressed).toBe(false);
    expect(summary.responseCount).toBe(3);
    const sleep = summary.items.find((i) => i.key === "sleep")!;
    // 3 + 2 + 4 = 9 → 平均 3.0
    expect(sleep.average).toBe(3);
    expect(sleep.distribution.reduce((a, b) => a + b, 0)).toBe(3);
    // 集計の型に個人を特定できる項目を持たせない
    expect(Object.keys(sleep)).toEqual(["key", "label", "average", "distribution", "answeredCount"]);
  });

  it("陸上から回答しても匿名のまま（記録者を書き換えない）", () => {
    const target = wellbeing.listConsultations()[0];
    const published = wellbeing.respondToConsultation(
      { responseId: target.id, response: "全体に周知しました。" },
      ACTOR,
    );
    expect(published.status).toBe("responded");
    expect(published.recordedBy).toBe("anonymous");
    expect(published.anonymous).toBe(true);
    expect(wellbeing.listConsultations()[0].displayName).toBeNull();
  });

  it("空の回答は保存しない", () => {
    const target = wellbeing.listConsultations()[0];
    expect(() =>
      wellbeing.respondToConsultation({ responseId: target.id, response: "   " }, ACTOR),
    ).toThrow(/回答/);
  });

  it("船内環境は確認日から鮮度を判定し、求人票向けの文面を組み立てる", () => {
    const rows = wellbeing.buildVesselEnvironments();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].jobPostingText).toContain("【通信環境】");
    expect(rows[0].jobPostingText).toContain("【この情報の確認日】");
    expect(["fresh", "stale", "never"]).toContain(rows[0].freshness);
  });
});

describe("人事考課（3.1.5）", () => {
  it("総合は5項目の平均で、保存はしない", () => {
    const sato = evaluations.listEvaluations().find((r) => r.record.crewMemberId === "crew-sato")!;
    // 4 + 5 + 4 + 4 + 5 = 22 → 4.4
    expect(sato.average).toBeCloseTo(4.4, 5);
    expect(Object.keys(sato.record)).not.toContain("average");
  });

  it("1〜5の範囲外・未入力の項目があれば保存しない（テンプレートを満たす）", () => {
    expect(() =>
      evaluations.publishEvaluation(
        {
          crewMemberId: "crew-tanaka",
          periodFrom: "2026-01-01",
          periodTo: "2026-06-30",
          scores: { job_skill: 6, safety: 3, teamwork: 3, discipline: 3, growth: 3 },
          evaluatedBy: "crew-kato",
          disclosedToCrew: false,
        },
        ACTOR,
      ),
    ).toThrow(/1〜5/);
  });

  it("訂正しても原本は残り、有効なのは新しい版だけになる", () => {
    const before = evaluations.listEvaluations().find((r) => r.record.crewMemberId === "crew-sato")!;
    const historyBefore = ms.history("evaluation").length;
    const published = evaluations.publishEvaluation(
      {
        crewMemberId: "crew-sato",
        periodFrom: before.record.periodFrom,
        periodTo: before.record.periodTo,
        scores: { job_skill: 5, safety: 5, teamwork: 4, discipline: 4, growth: 5 },
        comment: "訂正: 荷役計画の精度をさらに評価",
        evaluatedBy: "crew-kato",
        disclosedToCrew: false,
        supersedesId: before.record.id,
      },
      ACTOR,
    );
    expect(published.supersedesId).toBe(before.record.id);
    expect(ms.history("evaluation").length).toBe(historyBefore + 1);
    const after = evaluations.listEvaluations().filter((r) => r.record.crewMemberId === "crew-sato");
    expect(after).toHaveLength(1);
    expect(after[0].average).toBeCloseTo(4.6, 5);
    expect(after[0].record.disclosedToCrew).toBe(false);
  });

  it("記入・訂正は監査ログに残る（点数そのものは載せない）", () => {
    const logs = ms.listAuditLogs(50).filter((l) => l.entityKind === "evaluation");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].summary).toContain("人事考課");
    expect(logs[0].summary).not.toMatch(/[1-5]点/);
  });
});
