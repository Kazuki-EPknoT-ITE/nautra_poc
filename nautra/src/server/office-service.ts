import { daysBetween } from "@/domain/crew/freshness";
import { evaluatePeriod, monthRange, ymdLocal } from "@/domain/labor-law/evaluate";
import { roundingEffect, type RoundingEffect } from "@/domain/payroll/rounding";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";
import { DEFAULT_OFFICE_RULE_SET } from "@/rules/office-rules";
import type {
  CharterContractPayload,
  ExpenseKind,
  ExpensePayload,
  InvoicePayload,
  PayrollPayload,
  SubsidyPayload,
} from "@/sync-protocol/masters";
import {
  COMPANY_SCOPE_ID,
  crewNameOf,
  effective,
  publishMaster,
  todayLocal,
  vesselNameOf,
  writeAuditLog,
} from "./master-service";
import { getTimeRecords } from "./store";

/**
 * 陸上事務（傭船・請求・経費・給与・補助金）のドメインサービス。
 * 要件定義書 3.6.1 / 3.6.2 / 3.6.3。
 *
 * 設計の要点:
 * - すべて**追記のみ**。状態の変更（入金済み・確定・申請済み）は supersedesId 付きの
 *   新レコードで表し、元のレコードは物理保持する（12.3 / 12.6）。
 * - 期限が近い・入金が遅れているといった**判定は導出**し、保存しない（12.3）。
 *   しきい値は `src/rules/office-rules.ts` から注入する（ガードレール③）。
 * - 給与の時間外は打刻（一次記録）から都度求め、まるめは `domain/payroll/rounding` の
 *   純関数だけが行う。**確定した給与だけは例外的に確定値を保持する**（理由は confirmPayroll 参照）。
 */

const officeRules = DEFAULT_OFFICE_RULE_SET.values;

/* ═══════════════ 3.6.1 傭船契約 ═══════════════ */

export interface CharterRow {
  record: CharterContractPayload;
  vesselName: string;
  /** 満了までの日数（導出。期間の定めがなければ null） */
  daysToExpiry: number | null;
  /** 満了が近い（しきい値は office-rules） */
  expiringSoon: boolean;
  /** 満了日を過ぎている */
  expired: boolean;
}

export function listCharters(now = new Date()): CharterRow[] {
  const today = todayLocal(now);
  return effective("charter_contract")
    .slice()
    .sort((a, b) => (a.to ?? "9999-99-99").localeCompare(b.to ?? "9999-99-99"))
    .map((record) => {
      const daysToExpiry = record.to ? daysBetween(today, record.to) : null;
      return {
        record,
        vesselName: vesselNameOf(record.targetVesselId),
        daysToExpiry,
        expiringSoon:
          record.status === "active" &&
          daysToExpiry !== null &&
          daysToExpiry >= 0 &&
          daysToExpiry <= officeRules.charterExpiryCautionDays,
        expired: daysToExpiry !== null && daysToExpiry < 0,
      };
    });
}

/** 期限が近い／過ぎている契約だけ（画面上部の注意喚起用） */
export function chartersNeedingAttention(now = new Date()): CharterRow[] {
  return listCharters(now).filter(
    (c) => c.record.status === "active" && (c.expiringSoon || c.expired),
  );
}

export interface CharterInput {
  targetVesselId: string;
  counterparty: string;
  contractType: CharterContractPayload["contractType"];
  from: string;
  to?: string;
  rate?: number;
  rateUnit?: string;
  status: CharterContractPayload["status"];
  terms?: string;
  supersedesId?: string;
}

export function publishCharter(input: CharterInput, actor: string, now = new Date()) {
  if (!input.counterparty.trim()) throw new Error("相手先を入力してください");
  if (!input.from) throw new Error("契約の開始日を入力してください");
  if (input.to && input.from > input.to) {
    throw new Error("契約の開始日が終了日より後になっています");
  }
  const published = publishMaster(
    "charter_contract",
    {
      targetVesselId: input.targetVesselId,
      counterparty: input.counterparty.trim(),
      contractType: input.contractType,
      from: input.from,
      to: input.to || undefined,
      rate: input.rate,
      rateUnit: input.rateUnit?.trim() || undefined,
      status: input.status,
      terms: input.terms?.trim() || undefined,
    },
    { supersedesId: input.supersedesId, vesselId: input.targetVesselId, actor, now },
  );
  writeAuditLog({
    action: input.supersedesId ? "update" : "create",
    entityKind: "charter_contract",
    entityId: published.id,
    before: input.supersedesId,
    actor,
    now,
    summary: `傭船契約（${input.counterparty.trim()}）を${input.supersedesId ? "更新" : "登録"}`,
  });
  return published;
}

/* ═══════════════ 3.6.1 / 3.6.2 請求・入金 ═══════════════ */

export interface InvoiceRow {
  record: InvoicePayload;
  /** 支払期限までの日数（導出） */
  daysToDue: number | null;
  /** 支払期限を過ぎたまま入金がない（導出。保存された status とは別に判定する） */
  overdue: boolean;
  /** 支払期限が近い */
  dueSoon: boolean;
  /** 税込の請求額（導出値。保存しない） */
  totalAmount: number;
}

/** 入金遅延を先頭に、次いで支払期限の近い順 */
export function listInvoices(now = new Date()): InvoiceRow[] {
  const today = todayLocal(now);
  return effective("invoice")
    .map((record) => {
      const daysToDue = record.dueOn ? daysBetween(today, record.dueOn) : null;
      const unpaid = record.status !== "paid";
      return {
        record,
        daysToDue,
        overdue: unpaid && (record.status === "overdue" || (daysToDue !== null && daysToDue < 0)),
        dueSoon:
          unpaid &&
          daysToDue !== null &&
          daysToDue >= 0 &&
          daysToDue <= officeRules.invoiceDueCautionDays,
        totalAmount: record.amount + (record.taxAmount ?? 0),
      };
    })
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return (a.record.dueOn ?? "9999-99-99").localeCompare(b.record.dueOn ?? "9999-99-99");
    });
}

/** 入金を記録する（追記。請求の内容はそのまま引き継ぎ、状態と入金日だけを更新する） */
export function markInvoicePaid(
  input: { invoiceId: string; paidOn: string },
  actor: string,
  now = new Date(),
) {
  const target = effective("invoice").find((i) => i.id === input.invoiceId);
  if (!target) throw new Error("対象の請求が見つかりません（画面を開き直してください）");
  if (target.status === "paid") throw new Error("この請求はすでに入金済みです");
  const paidOn = input.paidOn || todayLocal(now);

  const published = publishMaster(
    "invoice",
    {
      invoiceNo: target.invoiceNo,
      counterparty: target.counterparty,
      contractId: target.contractId,
      periodFrom: target.periodFrom,
      periodTo: target.periodTo,
      issuedOn: target.issuedOn,
      dueOn: target.dueOn,
      amount: target.amount,
      taxAmount: target.taxAmount,
      archiveRef: target.archiveRef,
      status: "paid",
      paidOn,
    },
    { supersedesId: target.id, vesselId: COMPANY_SCOPE_ID, actor, now },
  );
  writeAuditLog({
    action: "update",
    entityKind: "invoice",
    entityId: published.id,
    before: `${target.invoiceNo} 状態 ${target.status}`,
    after: `${target.invoiceNo} 状態 paid / 入金日 ${paidOn}`,
    actor,
    now,
    summary: `${target.counterparty} からの入金を記録（${target.invoiceNo}）`,
  });
  return published;
}

/* ═══════════════ 3.6.2 経費 ═══════════════ */

export interface ExpenseRow {
  record: ExpensePayload;
  vesselName: string;
}

export function listExpenses(): ExpenseRow[] {
  return effective("expense")
    .slice()
    .sort((a, b) => b.spentOn.localeCompare(a.spentOn))
    .map((record) => ({
      record,
      vesselName: record.targetVesselId ? vesselNameOf(record.targetVesselId) : "船を指定しない支出",
    }));
}

/** 区分別・船別の集計（導出値。保存しない） */
export function expenseTotals(rows: ExpenseRow[]): {
  byKind: { key: string; amount: number; count: number }[];
  byVessel: { key: string; amount: number; count: number }[];
  total: number;
} {
  const add = (map: Map<string, { amount: number; count: number }>, key: string, amount: number) => {
    const cur = map.get(key) ?? { amount: 0, count: 0 };
    map.set(key, { amount: cur.amount + amount, count: cur.count + 1 });
  };
  const byKind = new Map<string, { amount: number; count: number }>();
  const byVessel = new Map<string, { amount: number; count: number }>();
  let total = 0;
  for (const r of rows) {
    add(byKind, r.record.kind, r.record.amount);
    add(byVessel, r.vesselName, r.record.amount);
    total += r.record.amount;
  }
  const toList = (m: Map<string, { amount: number; count: number }>) =>
    [...m.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.amount - a.amount);
  return { byKind: toList(byKind), byVessel: toList(byVessel), total };
}

export interface ExpenseInput {
  targetVesselId?: string;
  kind: ExpenseKind;
  title: string;
  amount: number;
  spentOn: string;
  supplier?: string;
  receiptRef?: string;
}

export function publishExpense(input: ExpenseInput, actor: string, now = new Date()) {
  if (!input.title.trim()) throw new Error("件名を入力してください");
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("金額を正しく入力してください");
  }
  if (!input.spentOn) throw new Error("支出日を入力してください");
  const published = publishMaster(
    "expense",
    {
      targetVesselId: input.targetVesselId || undefined,
      kind: input.kind,
      title: input.title.trim(),
      amount: Math.round(input.amount),
      spentOn: input.spentOn,
      supplier: input.supplier?.trim() || undefined,
      receiptRef: input.receiptRef?.trim() || undefined,
    },
    { vesselId: input.targetVesselId || COMPANY_SCOPE_ID, actor, now },
  );
  writeAuditLog({
    action: "create",
    entityKind: "expense",
    entityId: published.id,
    actor,
    now,
    summary: `経費を登録（${input.title.trim()} / ${Math.round(input.amount)}円）`,
  });
  return published;
}

/* ═══════════════ 3.6.2 船員給与（まるめ時間設定による給与連携） ═══════════════ */

export interface PayrollRow {
  record: PayrollPayload;
  crewName: string;
  /** 手当の合計（導出） */
  allowanceTotal: number;
  /** 控除の合計（導出） */
  deductionTotal: number;
  /** 支給額 = 基本給 + 手当 + 時間外手当 − 控除（導出値。保存しない） */
  netAmount: number;
  /** 打刻から求めた時間外とまるめ後（3.6.2 まるめ時間設定） */
  overtime: RoundingEffect;
  /** その月に打刻があるか（月初など記録がまだ無い月と「時間外0分」を取り違えないため） */
  hasRecords: boolean;
  appliedRuleVersion: string;
}

function sumValues(record: Record<string, number> | undefined): number {
  if (!record) return 0;
  return Object.values(record).reduce((a, b) => a + b, 0);
}

/**
 * 対象月の給与一覧。時間外は**打刻から都度算出**し、設定のまるめ単位を適用した値を添える。
 * 保存されている `overtimeMinutes` は「確定時に固定した値」で、実績とは別物として扱う。
 */
export function listPayrolls(month?: string, now = new Date()): PayrollRow[] {
  const records = getTimeRecords();
  const ruleSet = DEFAULT_LABOR_RULE_SET;
  return effective("payroll")
    .filter((p) => !month || p.month === month)
    .slice()
    .sort((a, b) => b.month.localeCompare(a.month) || a.crewMemberId.localeCompare(b.crewMemberId))
    .map((record) => {
      const { from, to } = monthRange(record.month);
      const period = evaluatePeriod({
        crewMemberId: record.crewMemberId,
        from,
        to,
        records,
        now,
        ruleSet,
      });
      const allowanceTotal = sumValues(record.allowances);
      const deductionTotal = sumValues(record.deductions);
      return {
        record,
        crewName: crewNameOf(record.crewMemberId),
        allowanceTotal,
        deductionTotal,
        netAmount: record.baseAmount + allowanceTotal + (record.overtimeAmount ?? 0) - deductionTotal,
        overtime: roundingEffect(
          period.overtimeMinutes,
          record.roundingUnitMinutes ?? officeRules.payrollRoundingUnitMinutes,
          officeRules.payrollRoundingMode,
        ),
        hasRecords: period.workedDays > 0,
        appliedRuleVersion: period.appliedRuleVersion,
      } satisfies PayrollRow;
    });
}

/** 給与の対象月の選択肢（登録済みの月。新しい順） */
export function payrollMonthOptions(): string[] {
  return [...new Set(effective("payroll").map((p) => p.month))].sort((a, b) => b.localeCompare(a));
}

/**
 * 給与を確定する。
 *
 * ここで **確定時点の時間外分数（まるめ後）を payroll に保存する**。
 * 導出値を保存しないという原則（12.3 / ガードレール④）の例外だが、
 * 給与は「支払った金額の根拠」であり、後から打刻の訂正で再計算されて金額が動くと
 * 支給済みの賃金と帳簿が合わなくなる。確定した給与は支払の証跡として値を固定する。
 * 実績の打刻は変わらず残るため、確定値と実績の差は後から検証できる。
 */
export function confirmPayroll(payrollId: string, actor: string, now = new Date()) {
  const target = effective("payroll").find((p) => p.id === payrollId);
  if (!target) throw new Error("対象の給与が見つかりません（画面を開き直してください）");
  if (target.status !== "draft") throw new Error("この給与はすでに確定しています");

  const row = listPayrolls(target.month, now).find((p) => p.record.id === payrollId);
  const overtimeMinutes = row?.overtime.roundedMinutes ?? target.overtimeMinutes ?? 0;
  const unit = target.roundingUnitMinutes ?? officeRules.payrollRoundingUnitMinutes;

  const published = publishMaster(
    "payroll",
    {
      crewMemberId: target.crewMemberId,
      month: target.month,
      baseAmount: target.baseAmount,
      allowances: target.allowances,
      deductions: target.deductions,
      overtimeAmount: target.overtimeAmount,
      overtimeMinutes,
      roundingUnitMinutes: unit,
      status: "confirmed",
    },
    { supersedesId: target.id, vesselId: COMPANY_SCOPE_ID, actor, now },
  );
  writeAuditLog({
    action: "update",
    entityKind: "payroll",
    entityId: published.id,
    before: `${target.month} 状態 draft`,
    after: `${target.month} 状態 confirmed / 時間外 ${overtimeMinutes}分（${unit}分単位でまるめ）`,
    actor,
    now,
    summary: `${crewNameOf(target.crewMemberId)} の ${target.month} 分の給与を確定`,
  });
  return published;
}

/* ═══════════════ 3.6.3 補助金・行政手続き ═══════════════ */

export interface SubsidyRow {
  record: SubsidyPayload;
  /** 期限までの日数（導出） */
  daysToDue: number | null;
  overdue: boolean;
}

export function listSubsidies(now = new Date()): SubsidyRow[] {
  const today = todayLocal(now);
  const openStatuses: SubsidyPayload["status"][] = ["preparing", "applied"];
  return effective("subsidy")
    .slice()
    .sort((a, b) => (a.dueOn ?? "9999-99-99").localeCompare(b.dueOn ?? "9999-99-99"))
    .map((record) => {
      const daysToDue = record.dueOn ? daysBetween(today, record.dueOn) : null;
      return {
        record,
        daysToDue,
        overdue: daysToDue !== null && daysToDue < 0 && openStatuses.includes(record.status),
      };
    });
}

export interface SubsidyInput {
  title: string;
  category: SubsidyPayload["category"];
  authority?: string;
  appliedOn?: string;
  dueOn?: string;
  amount?: number;
  status: SubsidyPayload["status"];
  body?: string;
  supersedesId?: string;
}

export function publishSubsidy(input: SubsidyInput, actor: string, now = new Date()) {
  if (!input.title.trim()) throw new Error("標題を入力してください");
  const published = publishMaster(
    "subsidy",
    {
      title: input.title.trim(),
      category: input.category,
      authority: input.authority?.trim() || undefined,
      appliedOn: input.appliedOn || undefined,
      dueOn: input.dueOn || undefined,
      amount: input.amount,
      status: input.status,
      body: input.body?.trim() || undefined,
    },
    { supersedesId: input.supersedesId, vesselId: COMPANY_SCOPE_ID, actor, now },
  );
  writeAuditLog({
    action: input.supersedesId ? "update" : "create",
    entityKind: "subsidy",
    entityId: published.id,
    before: input.supersedesId,
    after: `状態 ${input.status}`,
    actor,
    now,
    summary: `補助金・行政手続き「${input.title.trim()}」を${input.supersedesId ? "更新" : "登録"}`,
  });
  return published;
}

/** 状態だけを進める（内容はそのまま引き継ぐ） */
export function updateSubsidyStatus(
  input: { subsidyId: string; status: SubsidyPayload["status"] },
  actor: string,
  now = new Date(),
) {
  const target = effective("subsidy").find((s) => s.id === input.subsidyId);
  if (!target) throw new Error("対象の手続きが見つかりません（画面を開き直してください）");
  return publishSubsidy(
    {
      title: target.title,
      category: target.category,
      authority: target.authority,
      appliedOn:
        input.status === "applied" && !target.appliedOn ? todayLocal(now) : target.appliedOn,
      dueOn: target.dueOn,
      amount: target.amount,
      status: input.status,
      body: target.body,
      supersedesId: target.id,
    },
    actor,
    now,
  );
}

export { officeRules, ymdLocal };
