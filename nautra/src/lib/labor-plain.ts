import type { CheckLevel, LaborCheck } from "@/domain/labor-law/types";
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

/** チェック項目の平易な名前 */
export const CHECK_PLAIN_LABEL: Record<string, string> = {
  daily_max: "1日に働いた時間",
  weekly_max: "この7日間に働いた時間",
  rest_total: "休んだ時間の合計",
  rest_split: "休みが分かれた回数",
  rest_longest: "いちばん長く休んだ時間",
};

/** 実績値の表示（分 or 回） */
export function formatCheckActual(c: LaborCheck): string {
  return c.key === "rest_split" ? `${c.actual}回` : fmtMinutes(c.actual);
}

/** 基準値の表示（分 or 回） */
export function formatCheckLimit(c: LaborCheck): string {
  return c.key === "rest_split" ? `${c.limit}回` : fmtMinutes(c.limit);
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
    default:
      return "";
  }
}

/** 承認状況の平易な表示（本人向け） */
export function describeApproval(decision: "approved" | "remanded" | undefined): {
  icon: string;
  label: string;
  note: string;
  tone: "ok" | "warn" | "bad";
} {
  if (decision === "approved")
    return { icon: "✓", label: "承認されました", note: "船長の承認が済んでいます", tone: "ok" };
  if (decision === "remanded")
    return {
      icon: "✕",
      label: "差戻しされました",
      note: "打刻を正しい時刻で入れ直してください（01 打刻の履歴から再入力）",
      tone: "bad",
    };
  return { icon: "⚠", label: "船長の承認待ちです", note: "記録は船長が確認します", tone: "warn" };
}
