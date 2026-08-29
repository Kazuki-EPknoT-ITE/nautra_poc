import { startOfLocalDay } from "@/domain/labor-law/evaluate";
import { t } from "@/i18n/ja";
import type { ShiftPlanPayload } from "@/sync-protocol/records";
import { fmtMinutes } from "./format";

/**
 * 当直・配置の「平易な言い換え」（表示専用の純関数）。
 * 初めて使う船員が一目で「いま当直か / 次はいつか / 自分の持ち場はどこか」を
 * つかめるようにする。計画データそのものは陸上正本（8.3）で、ここでは判定・生成をしない。
 */

/** 計画（日付 + HH:MM）の実時刻。終了が開始以前なら日跨ぎとして翌日に送る */
export function shiftWindow(p: ShiftPlanPayload): [Date, Date] | null {
  if (!p.date || !p.from || !p.to) return null;
  const s = startOfLocalDay(p.date);
  const e = startOfLocalDay(p.date);
  const [sh, sm] = p.from.split(":").map(Number);
  const [eh, em] = p.to.split(":").map(Number);
  s.setHours(sh, sm, 0, 0);
  e.setHours(eh, em, 0, 0);
  if (e <= s) e.setDate(e.getDate() + 1);
  return [s, e];
}

export interface WatchWindow {
  plan: ShiftPlanPayload;
  start: Date;
  end: Date;
}

export interface WatchStatus {
  /** on_duty: 当直中 / upcoming: この後に予定あり / finished: 本日分は終了 / none: 予定なし */
  state: "on_duty" | "upcoming" | "finished" | "none";
  current?: WatchWindow;
  next?: WatchWindow;
  /** 開始まで / 終了まで の残り分（該当する場合のみ） */
  minutesUntilStart?: number;
  minutesUntilEnd?: number;
}

/** 予定一覧から「いまの状態」を求める（当直中を優先し、なければ次の予定） */
export function watchStatus(plans: ShiftPlanPayload[], now: Date): WatchStatus {
  const windows = plans
    .map((plan) => {
      const w = shiftWindow(plan);
      return w ? { plan, start: w[0], end: w[1] } : null;
    })
    .filter((w): w is WatchWindow => w !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  if (windows.length === 0) return { state: "none" };

  const current = windows.find((w) => w.start <= now && now < w.end);
  if (current) {
    return {
      state: "on_duty",
      current,
      next: windows.find((w) => w.start > now),
      minutesUntilEnd: Math.max(0, Math.round((current.end.getTime() - now.getTime()) / 60000)),
    };
  }
  const next = windows.find((w) => w.start > now);
  if (next) {
    return {
      state: "upcoming",
      next,
      minutesUntilStart: Math.max(0, Math.round((next.start.getTime() - now.getTime()) / 60000)),
    };
  }
  return { state: "finished" };
}

/** 状態の見出し（記号 + 一文）。色だけに依存しない（要件定義書 3.2.5） */
export function describeWatchStatus(s: WatchStatus): { icon: string; title: string; detail: string } {
  switch (s.state) {
    case "on_duty": {
      const name = s.current?.plan.shiftType ? t.shiftType[s.current.plan.shiftType] : "当直";
      return {
        icon: "●",
        title: `いま ${name} 中です`,
        detail:
          s.minutesUntilEnd !== undefined
            ? `終わりまで あと ${fmtMinutes(s.minutesUntilEnd)}（${s.current?.plan.to} まで）`
            : "",
      };
    }
    case "upcoming": {
      const name = s.next?.plan.shiftType ? t.shiftType[s.next.plan.shiftType] : "当直";
      return {
        icon: "○",
        title: `次は ${name} です`,
        detail:
          s.minutesUntilStart !== undefined
            ? `始まりまで あと ${fmtMinutes(s.minutesUntilStart)}（${s.next?.plan.from} から）`
            : "",
      };
    }
    case "finished":
      return { icon: "✓", title: "本日の当直は終わりました", detail: "次の予定は明日以降です" };
    default:
      return { icon: "－", title: "本日の当直はありません", detail: "予定が入ると、ここに表示されます" };
  }
}

/** 実績（打刻）の状況を一文にする。当直の時間帯に打刻があるかを平易に示す */
export function describeActual(matched: number, started: boolean, onDuty: boolean): string {
  if (matched > 0) return "打刻できています";
  if (onDuty) return "まだ打刻がありません（打刻してください）";
  if (started) return "打刻がないまま終わりました";
  return "まだ始まっていません";
}

/** 変更通知の一文（誰の何がどう変わったか） */
export function describeShiftChange(next: ShiftPlanPayload, prev?: ShiftPlanPayload): string {
  const name = next.shiftType ? t.shiftType[next.shiftType] : "当直";
  if (next.planType === "station") {
    return `${t.stationScenario[next.scenario ?? ""] ?? "配置"}の持ち場が「${next.station}」に変わりました`;
  }
  if (prev?.from && prev.to && (prev.from !== next.from || prev.to !== next.to)) {
    return `${name}の時間が ${prev.from}–${prev.to} から ${next.from}–${next.to} に変わりました`;
  }
  return `${name} ${next.from}–${next.to} に変わりました`;
}
