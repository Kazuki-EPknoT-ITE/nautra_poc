import { applyRuleOverrides } from "@/domain/labor-law/evaluate";
import type { LaborRuleSet, LaborRuleValues } from "@/domain/labor-law/types";
import { fmtMinutes } from "@/lib/format";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";
import type { AgreementPayload } from "@/sync-protocol/records";
import {
  COMPANY_SCOPE_ID,
  effective,
  publishMaster,
  todayLocal,
  writeAuditLog,
} from "./master-service";

/**
 * 労使協定・就業規則 → 判定閾値の反映（要件定義書 6.5
 * 「協定内容→アラート閾値への自動反映／協定・規則の版管理と届出書生成」）。
 *
 * 労働時間の判定はすべてこの関数が返すルールセットで行う。
 * 画面・サービスから `DEFAULT_LABOR_RULE_SET` を直接参照すると、協定を登録しても
 * 判定に効かない（＝画面の表示と判定が食い違う）ため、**入口をここに一本化する**。
 *
 * 上書きの結果は `applyRuleOverrides` が版識別子に協定版を織り込むので、
 * 判定結果の `appliedRuleVersion` に「どの協定で判定したか」が残る（12.6 監査証跡）。
 */

/** その日に効力のある協定・就業規則（適用期間内のもの。適用開始が古い順） */
export function activeAgreements(now = new Date()): AgreementPayload[] {
  const today = todayLocal(now);
  return effective("agreement")
    .filter((a) => a.effectiveFrom <= today && (!a.effectiveTo || a.effectiveTo >= today))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/** 協定・就業規則の全件（適用期間外・失効分も含む。版管理の一覧表示用。新しい順） */
export function listAgreements(): AgreementPayload[] {
  return [...effective("agreement")].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}

/** 閾値を上書きしている（＝判定に効いている）協定だけを返す */
export function overridingAgreements(now = new Date()): AgreementPayload[] {
  return activeAgreements(now).filter(
    (a) => a.overrideValues && Object.keys(a.overrideValues).length > 0,
  );
}

/**
 * いま適用すべき労働時間ルールセット。
 * 適用期間中の労使協定の `overrideValues` を既定ルールに重ねて返す
 * （複数ある場合は適用開始が新しいものが後勝ち）。
 */
export function currentLaborRuleSet(now = new Date()): LaborRuleSet {
  const agreements = overridingAgreements(now);
  if (agreements.length === 0) return DEFAULT_LABOR_RULE_SET;
  const merged: Record<string, unknown> = {};
  for (const a of agreements) Object.assign(merged, a.overrideValues);
  const label = agreements.map((a) => `${a.version}`).join("+");
  return applyRuleOverrides(
    DEFAULT_LABOR_RULE_SET,
    merged as Partial<LaborRuleValues>,
    `協定${label}`,
  );
}

/* ═══════════════ 表示（S-15 設定・権限で「既定値 → 上書き後」を並べる） ═══════════════ */

export type RuleValueUnit = "minutes" | "count" | "days" | "ratio";

/** 閾値の単位。値の意味づけはここだけに置き、画面で単位を書き分けない */
export const RULE_VALUE_UNIT: Record<keyof LaborRuleValues, RuleValueUnit> = {
  dailyMaxMinutes: "minutes",
  weeklyMaxMinutes: "minutes",
  restMinDailyMinutes: "minutes",
  restLongestMinMinutes: "minutes",
  restSplitMax: "count",
  cautionRatio: "ratio",
  // 休日は「回」ではなく「日」で数える（3.2.5⑤ 週1日以上）
  restDaysPerWeek: "days",
  referencePeriodDays: "days",
  referenceWeeklyAverageMinutes: "minutes",
  fourWeekMaxMinutes: "minutes",
  monthlyOvertimeMaxMinutes: "minutes",
  dailyStandardMinutes: "minutes",
};

export const RULE_VALUE_KEYS = Object.keys(RULE_VALUE_UNIT) as (keyof LaborRuleValues)[];

export function formatRuleValue(key: keyof LaborRuleValues, value: number): string {
  switch (RULE_VALUE_UNIT[key]) {
    case "minutes":
      return fmtMinutes(value);
    case "count":
      return `${value}回`;
    case "days":
      return `${value}日`;
    case "ratio":
      return `上限の ${Math.round(value * 100)}%`;
  }
}

/* ═══════════════ 協定・就業規則の版を登録する（6.5 版管理） ═══════════════ */

export interface PublishAgreementInput {
  kind: "labor_agreement" | "work_rules";
  title: string;
  /** 版（2026.2 など）。判定結果の適用ルール版にこの文字列が載る */
  version: string;
  /** 運輸局への届出日 */
  filedOn?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  /** 判定閾値の上書き（空欄の項目は法令の既定値のまま） */
  overrideValues?: Partial<LaborRuleValues>;
  body?: string;
  actor: string;
  /** 既存の版を差し替える場合（訂正・改定） */
  supersedesId?: string;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 新しい協定・就業規則の版を配信する（追記のみ。旧版は履歴として残る）。
 * 適用期間に入ると `currentLaborRuleSet` が拾い、その日から判定閾値が変わる。
 */
export function publishAgreement(
  input: PublishAgreementInput,
  now = new Date(),
): AgreementPayload {
  const title = input.title.trim();
  const version = input.version.trim();
  if (!title) throw new Error("標題を入力してください");
  if (!version) throw new Error("版を入力してください（例: 2026.2）");
  if (!YMD.test(input.effectiveFrom)) throw new Error("適用開始日は YYYY-MM-DD で指定してください");
  if (input.effectiveTo && !YMD.test(input.effectiveTo)) {
    throw new Error("適用終了日は YYYY-MM-DD で指定してください");
  }
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
    throw new Error("適用終了日は適用開始日以降にしてください");
  }
  const overrides: Record<string, number> = {};
  for (const [k, v] of Object.entries(input.overrideValues ?? {})) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) overrides[k] = v;
  }

  const payload = publishMaster(
    "agreement",
    {
      kind: input.kind,
      title,
      version,
      filedOn: input.filedOn || undefined,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo || undefined,
      overrideValues: Object.keys(overrides).length > 0 ? overrides : undefined,
      body: input.body?.trim() || undefined,
    },
    {
      vesselId: COMPANY_SCOPE_ID,
      actor: input.actor,
      supersedesId: input.supersedesId,
      now,
    },
  );

  writeAuditLog({
    action: input.supersedesId ? "update" : "create",
    entityKind: "agreement",
    entityId: payload.id,
    actor: input.actor,
    after: `${title} 版${version}（${input.effectiveFrom}〜）`,
    summary:
      Object.keys(overrides).length > 0
        ? `協定の締結内容を判定閾値へ反映（${Object.keys(overrides).length}項目）`
        : "協定・就業規則の版を登録",
    now,
  });

  return payload;
}

export interface RuleValueRow {
  key: keyof LaborRuleValues;
  unit: RuleValueUnit;
  /** 法令の既定値（src/rules） */
  base: number;
  /** 協定を反映した後の値（判定に使われる値） */
  applied: number;
  /** 協定がこの項目を定めているか（値が既定と同じでも「協定で決まっている」ことを示す） */
  overridden: boolean;
  /** 実際に値が既定から変わったか（画面で変更マークを出すかの判断） */
  changed: boolean;
  /** 上書き元の協定（標題と版） */
  sourceTitle?: string;
  sourceVersion?: string;
}

/**
 * 「既定値」と「協定で上書きした後の値」を並べた表を作る。
 * 上書きされた行だけでなく全項目を返し、いまの判定に効いている値を一覧で確認できるようにする。
 */
export function buildRuleValueRows(now = new Date()): RuleValueRow[] {
  const applied = currentLaborRuleSet(now);
  const agreements = overridingAgreements(now);
  const sourceOf = new Map<string, AgreementPayload>();
  for (const a of agreements) {
    for (const k of Object.keys(a.overrideValues ?? {})) sourceOf.set(k, a); // 後勝ち
  }
  return RULE_VALUE_KEYS.map((key) => {
    const base = DEFAULT_LABOR_RULE_SET.values[key];
    const value = applied.values[key];
    const src = sourceOf.get(key);
    return {
      key,
      unit: RULE_VALUE_UNIT[key],
      base,
      applied: value,
      overridden: src !== undefined,
      changed: src !== undefined && value !== base,
      sourceTitle: src?.title,
      sourceVersion: src?.version,
    };
  });
}
