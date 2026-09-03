import type { ProcedureGroup } from "@/sync-protocol/masters";

/**
 * イベント駆動の連鎖生成（要件定義書 6.6①）。
 *
 *   「『乗下船』『採用』『決算』という業務イベントを起点に、必要な手続き一式
 *    （届出＋保険＋記帳＋チェック）を自動で束ねて生成する。**手続き単位ではなく
 *    イベント単位で設計する**。」
 *
 * ここでは「どのイベントから、どの手続きが、いつを期限として生えるか」だけを純関数で定義する。
 * 実際のレコード生成（ID採番・同期イベント化）はサーバ側サービスが行う。
 */

export type BusinessEvent = "embark" | "disembark" | "hire" | "fiscal_year_end";

export interface ProcedureTemplate {
  key: string;
  group: ProcedureGroup;
  title: string;
  basis: string;
  subjectType: "crew" | "vessel" | "company";
  /** 起点日からの提出期限までの日数（負なら起点より前が期限） */
  dueOffsetDays: number;
  /** 準備リードタイム（日）。着手期限 = 期限 − この日数（6.6②） */
  leadTimeDays: number;
}

/**
 * イベント → 手続きテンプレートの束。
 * 6.2 の手続きインベントリ（B群＝乗下船の都度／A群＝事業関連／C群＝周期）に対応する。
 */
export const EVENT_PROCEDURE_CHAINS: Record<BusinessEvent, ProcedureTemplate[]> = {
  embark: [
    {
      key: "hire_filing",
      group: "B",
      title: "雇入契約成立の届出（第六号書式）",
      basis: "船員法第37条。遅滞なく届け出る",
      subjectType: "crew",
      dueOffsetDays: 3,
      leadTimeDays: 3,
    },
    {
      key: "crew_list",
      group: "B",
      title: "クルーリスト（海員名簿第六表）2通の作成",
      basis: "届出時に2通提出",
      subjectType: "crew",
      dueOffsetDays: 3,
      leadTimeDays: 3,
    },
    {
      key: "attachment_check",
      group: "B",
      title: "添付要件チェック（保険・基本訓練・免状・健診）",
      basis: "3.8.3⑥。未確認は受理保留のリスク",
      subjectType: "crew",
      dueOffsetDays: 0,
      leadTimeDays: 7,
    },
    {
      key: "insurance_acquire",
      group: "B",
      title: "船員保険・雇用保険・労災の資格取得届",
      basis: "船員保険法・雇用保険法・労災保険法",
      subjectType: "crew",
      dueOffsetDays: 5,
      leadTimeDays: 3,
    },
    {
      key: "seaman_book_entry",
      group: "B",
      title: "船員手帳への乗船記帳",
      basis: "船員法。2026-05-13 以降は電子書面・電子証書で代替可",
      subjectType: "crew",
      dueOffsetDays: 7,
      leadTimeDays: 3,
    },
  ],
  disembark: [
    {
      key: "discharge_filing",
      group: "B",
      title: "雇止（雇入契約終了）の届出",
      basis: "船員法第37条",
      subjectType: "crew",
      dueOffsetDays: 3,
      leadTimeDays: 3,
    },
    {
      key: "insurance_lose",
      group: "B",
      title: "船員保険・雇用保険・労災の資格喪失届",
      basis: "船員保険法・雇用保険法・労災保険法",
      subjectType: "crew",
      dueOffsetDays: 5,
      leadTimeDays: 3,
    },
    {
      key: "seaman_book_off",
      group: "B",
      title: "船員手帳への下船記帳",
      basis: "船員法",
      subjectType: "crew",
      dueOffsetDays: 7,
      leadTimeDays: 3,
    },
    {
      key: "evaluation",
      group: "D",
      title: "下船時の業務態度評価の記録",
      basis: "3.1.5（法令要件ではない社内手続）",
      subjectType: "crew",
      dueOffsetDays: 14,
      leadTimeDays: 7,
    },
  ],
  hire: [
    {
      key: "stcw_basic_check",
      group: "B",
      title: "基本訓練の実施・修了確認",
      basis: "船員法第81条の2等。雇入契約を結んだ際、遅滞なく実施",
      subjectType: "crew",
      dueOffsetDays: 14,
      leadTimeDays: 14,
    },
    {
      key: "medical_check",
      group: "C",
      title: "健康証明書の取得",
      basis: "船員法施行規則",
      subjectType: "crew",
      dueOffsetDays: 14,
      leadTimeDays: 14,
    },
  ],
  fiscal_year_end: [
    {
      key: "business_report",
      group: "A",
      title: "事業概況報告書の提出",
      basis: "内航海運業法。事業年度経過後100日以内",
      subjectType: "company",
      dueOffsetDays: 100,
      leadTimeDays: 30,
    },
  ],
};

export interface ChainedProcedure extends ProcedureTemplate {
  /** 提出期限（YYYY-MM-DD） */
  dueOn: string;
  subjectId?: string;
}

/** 起点日（YYYY-MM-DD）に日数を足す */
function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * 業務イベントから手続き一式を生成する（純関数）。
 * 手続き単位ではなくイベント単位で束ねるため、担当者は「乗船が決まった」だけを入力すれば
 * 届出・保険・記帳・チェックが同時に立ち上がる。
 */
export function chainProceduresFor(
  event: BusinessEvent,
  eventDate: string,
  subjectId?: string,
): ChainedProcedure[] {
  return (EVENT_PROCEDURE_CHAINS[event] ?? []).map((t) => ({
    ...t,
    dueOn: addDays(eventDate, t.dueOffsetDays),
    subjectId,
  }));
}

export const BUSINESS_EVENT_LABEL: Record<BusinessEvent, string> = {
  embark: "乗船（雇入契約の成立）",
  disembark: "下船（雇入契約の終了）",
  hire: "採用",
  fiscal_year_end: "決算期末",
};
