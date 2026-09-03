import { describe, expect, it } from "vitest";
import { addDaysYmd } from "@/domain/crew/freshness";
import type { ProcedureTaskPayload } from "@/sync-protocol/masters";
import { chainProceduresFor, EVENT_PROCEDURE_CHAINS } from "../chain";
import { evaluateProcedure, evaluateProcedures, startDeadlineOf } from "../deadlines";

/**
 * 手続きの期限判定（要件定義書 6.6②「期限は提出期限でなく**着手期限**で管理」）と
 * イベント駆動の連鎖生成（6.6①「手続き単位ではなくイベント単位で設計する」）のテスト。
 */

const TODAY = "2026-09-01";

function task(over: Partial<ProcedureTaskPayload> = {}): ProcedureTaskPayload {
  return {
    id: "pt-1",
    tenantId: "tenant-demo",
    vesselId: "company-demo",
    occurredAt: `${TODAY}T00:00:00.000Z`,
    recordedBy: "shore-yamamoto",
    deviceId: "shore-planner-device",
    publishedAt: `${TODAY}T00:00:00.000Z`,
    publishedBy: "shore-yamamoto",
    group: "C",
    title: "テスト手続き",
    subjectType: "company",
    status: "open",
    ...over,
  } as ProcedureTaskPayload;
}

describe("着手期限（要件定義書 6.6②）", () => {
  it("着手期限 = 提出期限 − 準備リードタイム", () => {
    expect(startDeadlineOf("2026-12-01", 30)).toBe("2026-11-01");
  });

  it("提出期限が無ければ着手期限も無い", () => {
    expect(startDeadlineOf(undefined, 30)).toBeNull();
  });

  it.each([
    // [説明, 期限までの日数, リードタイム, 期待する状態, 期待するレベル]
    ["提出期限を過ぎた", -1, 14, "overdue", "violation"],
    ["提出期限まで7日 → 期限間近", 7, 14, "due_soon", "violation"],
    ["着手期限を過ぎた（提出期限にはまだ余裕）", 20, 30, "start_due", "caution"],
    ["着手期限もまだ先", 60, 14, "scheduled", "ok"],
  ] as const)("%s", (_name, dueOffset, leadTimeDays, state, level) => {
    const s = evaluateProcedure(
      task({ dueOn: addDaysYmd(TODAY, dueOffset), leadTimeDays }),
      TODAY,
    );
    expect(s.state).toBe(state);
    expect(s.level).toBe(level);
  });

  it("**満了日アラートでは遅い手続き**は、着手期限で先に注意が出る（免状更新の例）", () => {
    // 海技免状: 満了まで300日でも、リードタイム365日なので「準備を始める時期」
    const s = evaluateProcedure(
      task({ title: "海技免状の更新", dueOn: addDaysYmd(TODAY, 300), leadTimeDays: 365 }),
      TODAY,
    );
    expect(s.state).toBe("start_due");
    expect(s.message).toContain("準備を始める時期です");
    expect(s.daysToDue).toBe(300);
  });

  it("完了・取り消しの手続きは期限判定の対象外", () => {
    expect(evaluateProcedure(task({ status: "done", doneOn: TODAY }), TODAY).state).toBe("done");
    expect(evaluateProcedure(task({ status: "canceled" }), TODAY).state).toBe("canceled");
  });

  it("一覧は緊急度順に並ぶ（期限超過 → 期限間近 → 着手時期 → 予定）", () => {
    const tasks = [
      task({ id: "a", dueOn: addDaysYmd(TODAY, 60), leadTimeDays: 14 }), // scheduled
      task({ id: "b", dueOn: addDaysYmd(TODAY, -5), leadTimeDays: 14 }), // overdue
      task({ id: "c", dueOn: addDaysYmd(TODAY, 20), leadTimeDays: 30 }), // start_due
      task({ id: "d", dueOn: addDaysYmd(TODAY, 3), leadTimeDays: 14 }), // due_soon
    ];
    expect(evaluateProcedures(tasks, TODAY).map((s) => s.task.id)).toEqual(["b", "d", "c", "a"]);
  });
});

describe("イベント駆動の連鎖生成（要件定義書 6.6①）", () => {
  it("乗船イベントから、届出・保険・記帳・チェックが一式で生える", () => {
    const chained = chainProceduresFor("embark", "2026-09-15", "crew-mori");
    const keys = chained.map((c) => c.key);
    expect(keys).toContain("hire_filing"); // 届出
    expect(keys).toContain("insurance_acquire"); // 保険
    expect(keys).toContain("seaman_book_entry"); // 記帳
    expect(keys).toContain("attachment_check"); // チェック
    expect(keys).toContain("crew_list");
  });

  it("提出期限は起点日からの相対で決まる", () => {
    const chained = chainProceduresFor("embark", "2026-09-15");
    const filing = chained.find((c) => c.key === "hire_filing");
    expect(filing?.dueOn).toBe("2026-09-18"); // +3日
  });

  it("下船イベントは雇止・資格喪失・下船記帳を生む", () => {
    const keys = chainProceduresFor("disembark", "2026-09-20").map((c) => c.key);
    expect(keys).toContain("discharge_filing");
    expect(keys).toContain("insurance_lose");
    expect(keys).toContain("seaman_book_off");
  });

  it("決算期末からは事業概況報告書（100日以内）が生える", () => {
    const chained = chainProceduresFor("fiscal_year_end", "2026-03-31");
    const report = chained.find((c) => c.key === "business_report");
    expect(report?.dueOn).toBe("2026-07-09"); // 3/31 + 100日
    expect(report?.group).toBe("A");
  });

  it("すべての連鎖テンプレートがリードタイムを持つ（着手期限が必ず出せる）", () => {
    for (const templates of Object.values(EVENT_PROCEDURE_CHAINS)) {
      for (const t of templates) {
        expect(t.leadTimeDays, `${t.key} にリードタイムが無い`).toBeGreaterThan(0);
      }
    }
  });

  it("対象IDは連鎖した各手続きへ引き継がれる", () => {
    const chained = chainProceduresFor("embark", "2026-09-15", "crew-mori");
    expect(chained.every((c) => c.subjectId === "crew-mori")).toBe(true);
  });
});
