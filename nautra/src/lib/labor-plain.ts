import type { PeriodLaborSummary } from "@/domain/labor-law/evaluate";
import type { CheckLevel, LaborCheck } from "@/domain/labor-law/types";
import { translate, type Locale } from "@/i18n";
import { t } from "@/i18n/ja";
import { fmtMinutes } from "./format";

/**
 * 労務判定の「平易な言い換え」（表示専用）。
 * 法令用語のままでは初めて使う船員に伝わらないため、判定結果を日常語の一文にする。
 * 判定そのものは domain/labor-law が行い、ここでは言い換えだけを担う
 * （閾値の再計算・独自判定はしない）。
 */

/** 判定レベルの見出し・記号（色だけに依存しない。要件定義書 3.2.5） */
export const LEVEL_PLAIN: Record<
  CheckLevel | "none",
  { icon: string; title: string; summary: string }
> = {
  ok: { icon: "✓", title: "問題ありません", summary: "法令の基準を満たしています" },
  caution: { icon: "⚠", title: "注意してください", summary: "上限・基準に近づいています" },
  violation: { icon: "✕", title: "基準を超えています", summary: "船長に報告し、勤務を調整してください" },
  none: { icon: "－", title: "記録がありません", summary: "本日の打刻がまだありません" },
};

/**
 * チェック項目の平易な名前（語彙は i18n に持ち、ここでは参照だけを行う）。
 * 多言語表示は `checkPlainLabelFor(locale, key)` を使う（未翻訳は日本語へフォールバック）。
 */
export const CHECK_PLAIN_LABEL: Record<string, string> = t.checkPlain;

/** チェック項目の平易な名前（表示言語つき。要件定義書 10.2） */
export function checkPlainLabelFor(locale: Locale, key: string): string {
  return translate(locale, "checkPlain", key);
}

/** 回数で数える項目（分ではなく「回」「日」で表示する） */
const COUNT_UNIT: Record<string, string> = { rest_split: "回", rest_day: "日" };

/** 実績値の表示（分 or 回 or 日） */
export function formatCheckActual(c: LaborCheck): string {
  const unit = COUNT_UNIT[c.key];
  return unit ? `${c.actual}${unit}` : fmtMinutes(c.actual);
}

/** 基準値の表示（分 or 回 or 日） */
export function formatCheckLimit(c: LaborCheck): string {
  const unit = COUNT_UNIT[c.key];
  return unit ? `${c.limit}${unit}` : fmtMinutes(c.limit);
}

/**
 * チェック1件を「いま何が起きているか」の一文にする。
 * 文面は判定レベルから決める（進行中の日は見込みで判定されるため、
 * 実績値の単純比較で文を作ると判定と食い違う）。
 */
export function describeCheck(c: LaborCheck): string {
  const limit = formatCheckLimit(c);
  switch (c.key) {
    case "daily_max":
    case "weekly_max": {
      const remain = fmtMinutes(Math.max(0, c.limit - c.actual));
      if (c.level === "violation") return `上限（${limit}）を ${fmtMinutes(c.actual - c.limit)} 超えています`;
      if (c.level === "caution") return `上限（${limit}）まで あと ${remain} です`;
      return `上限（${limit}）まで あと ${remain} 余裕があります`;
    }
    case "rest_total": {
      if (c.level === "violation")
        return `基準（${limit}）より ${fmtMinutes(Math.max(0, c.limit - c.actual))} 不足する見込みです`;
      if (c.level === "caution") return `基準（${limit}）ぎりぎりです`;
      return `基準（${limit}）を満たす見込みです`;
    }
    case "rest_split": {
      if (c.level === "violation") return `休みが ${c.actual}回に分かれています（上限 ${limit}）`;
      return `分かれた回数は ${c.actual}回です（上限 ${limit}）`;
    }
    case "rest_longest": {
      if (c.level === "violation")
        return `いちばん長い休みが ${formatCheckActual(c)} で、基準（${limit}以上）に届いていません`;
      if (c.level === "caution") return `いちばん長い休みが 基準（${limit}以上）ぎりぎりです`;
      return `いちばん長い休みは ${formatCheckActual(c)} です（基準 ${limit}以上）`;
    }
    /* ── 期間（4週間・基準労働期間・今月）の判定。要件定義書 3.2.1 / 3.2.5③ ── */
    case "four_week_max": {
      const remain = fmtMinutes(Math.max(0, c.limit - c.actual));
      if (c.level === "violation")
        return `目安（${limit}）を ${fmtMinutes(c.actual - c.limit)} 超えています`;
      if (c.level === "caution") return `目安（${limit}）まで あと ${remain} です`;
      return `目安（${limit}）まで あと ${remain} 余裕があります`;
    }
    case "reference_period": {
      const remain = fmtMinutes(Math.max(0, c.limit - c.actual));
      if (c.level === "violation")
        return `1週あたりの目安（${limit}）を ${fmtMinutes(c.actual - c.limit)} 超えています`;
      if (c.level === "caution") return `1週あたりの目安（${limit}）に近づいています`;
      return `1週あたりの目安（${limit}）まで あと ${remain} 余裕があります`;
    }
    case "monthly_overtime": {
      const remain = fmtMinutes(Math.max(0, c.limit - c.actual));
      if (c.level === "violation")
        return `今月の残業の目安（${limit}）を ${fmtMinutes(c.actual - c.limit)} 超えています`;
      if (c.level === "caution") return `今月の残業の目安（${limit}）まで あと ${remain} です`;
      return `今月の残業の目安（${limit}）まで あと ${remain} 余裕があります`;
    }
    case "rest_day": {
      if (c.level === "violation")
        return `休んだ日が ${formatCheckActual(c)} で、${formatCheckLimit(c)} に足りていません`;
      return `休んだ日は ${formatCheckActual(c)} です（必要 ${formatCheckLimit(c)}）`;
    }
    default:
      return "";
  }
}

/**
 * 期間の集計を「◯時間働きました。目安は◯時間です」の一文にする（要件定義書 3.2.1）。
 * 上限判定そのものは domain（evaluatePeriod）が行い、ここは言い換えだけを担う。
 */
export function describePeriodTotal(
  periodLabel: string,
  summary: PeriodLaborSummary,
  check: LaborCheck | undefined,
): string {
  // 「働きました」は**実績**（別枠を含む）。上限との比較は別枠を除いた値で行われ、
  // その差は describeExceptionalMinutes の一文で説明する（3.2.5⑥）
  const worked = fmtMinutes(summary.workedMinutes);
  if (!check) return `${periodLabel}で ${worked} 働きました。`;
  return `${periodLabel}で ${worked} 働きました。目安は ${formatCheckLimit(check)} です。`;
}

/**
 * 別枠（安全臨時労働・緊急作業）の説明（要件定義書 3.2.5⑥）。
 * 実績としては記録簿に残しつつ、上限の計算から外していることを利用者に明示する。
 */
export function describeExceptionalMinutes(minutes: number): string | null {
  if (minutes <= 0) return null;
  return `うち ${fmtMinutes(minutes)} は緊急作業のため上限の計算から外しています。`;
}

/** 承認状況の平易な表示（本人向け） */
/**
 * 承認の状況を平易な一文にする。
 * 承認は船長と陸上の労務管理責任者の双方が行うため（役割優先は domain 側で解決）、
 * 「誰が」承認・差戻ししたのかを文言に出す。
 */
export function describeApproval(
  decision: "approved" | "remanded" | undefined,
  approverRole?: "captain" | "labor_manager",
): {
  icon: string;
  label: string;
  note: string;
  tone: "ok" | "warn" | "bad";
} {
  const who = approverRole === "labor_manager" ? "陸上の労務管理責任者" : "船長";
  if (decision === "approved")
    return { icon: "✓", label: "承認されました", note: `${who}の承認が済んでいます`, tone: "ok" };
  if (decision === "remanded")
    return {
      icon: "✕",
      label: "差戻しされました",
      note: `${who}から差戻しです。打刻を正しい時刻で入れ直してください（01 打刻の履歴から再入力）`,
      tone: "bad",
    };
  return {
    icon: "⚠",
    label: "承認待ちです",
    note: "記録は船長と陸上の労務管理責任者が確認します",
    tone: "warn",
  };
}
