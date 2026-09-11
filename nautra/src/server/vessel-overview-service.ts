import type { CheckLevel } from "@/domain/labor-law/types";
import { buildDeadlineBoard, buildShoreDashboard, type DeadlineItem } from "@/server/labor-service";
import { buildVesselManning, type CrewManningRow } from "@/server/manning-service";
import { effective, vesselMasterOf } from "@/server/master-service";
import type { VesselMasterPayload } from "@/sync-protocol/masters";

/**
 * 船ごとのひとまとめ（S-01 の「船ごとの状況」と S-11D 「船の管理ページ」で共用）。
 *
 * デザイン正本 `design/poc_design` は、船のカードを押すとその船の管理ページへ入る導線を
 * 持つ。**同じ数字が2画面で違って見えないよう**、カードの要約とページの明細は
 * この1か所から取る（画面ごとに集計し直さない）。
 */
export interface VesselOverview {
  vesselId: string;
  name: string;
  master?: VesselMasterPayload;
  /** 「499GT ／ 石灰石船 ／ 2012年竣工」のような一行 */
  spec: string;
  /** 運航の状態（短い語。カードの札に収まる長さにする） */
  state: string;
  /** 航路（「水島 → 坂出」）。状態とは分けて置き、札を長くしない */
  route: string | null;
  stateLevel: CheckLevel | "none";
  onBoard: CrewManningRow[];
  requiredCrew: number | null;
  /** 直近7日の労務（この船に乗っている船員ぶん） */
  cautionDays: number;
  violationDays: number;
  pendingApprovals: number;
  /** この船に関係する期限のうち、いちばん急ぐもの */
  nextDeadline: DeadlineItem | null;
  deadlines: DeadlineItem[];
}

function specOf(m: VesselMasterPayload | undefined): string {
  if (!m) return "船舶マスタ未登録";
  const parts: string[] = [];
  if (m.grossTonnage) parts.push(`${m.grossTonnage}GT`);
  if (m.vesselType) parts.push(m.vesselType);
  if (m.navigationArea) parts.push(m.navigationArea);
  if (m.builtOn) parts.push(`${m.builtOn.slice(0, 4)}年竣工`);
  return parts.length > 0 ? parts.join(" ／ ") : "諸元の登録がありません";
}

export function buildVesselOverviews(now = new Date()): VesselOverview[] {
  const manning = buildVesselManning(now);
  const dashboard = buildShoreDashboard(now);
  const deadlines = buildDeadlineBoard(now);
  const positions = effective("vessel_position");
  const schedules = effective("voyage_schedule");

  return manning.map((v) => {
    const master = vesselMasterOf(v.vesselId);
    const onBoardIds = new Set(v.onBoard.map((r) => r.crewMemberId));

    let cautionDays = 0;
    let violationDays = 0;
    let pendingApprovals = 0;
    for (const row of dashboard.rows) {
      if (!onBoardIds.has(row.crew.id)) continue;
      for (const d of row.days) {
        if (!d.hasRecords) continue;
        if (d.level === "violation") violationDays += 1;
        else if (d.level === "caution") cautionDays += 1;
        if (!row.approvalByDate[d.date]) pendingApprovals += 1;
      }
    }

    /**
     * 期限は「この船そのもの」と「この船に乗っている船員」の両方を拾う。
     * 船の管理ページを開いた人が、船の検査と乗組員の証書を別々に探さずに済むようにする。
     */
    const names = new Set<string>([v.vesselName, ...v.onBoard.map((r) => r.name)]);
    const mine = deadlines.filter((d) => names.has(d.subject));

    const pos = positions
      .filter((p) => p.targetVesselId === v.vesselId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
    const sch = schedules
      .filter((s) => s.targetVesselId === v.vesselId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))[0];

    /**
     * 状態は**短い語**にする。カードの札は船名と同じ行に並ぶので、
     * ここに航路まで入れると船名が折り返して読めなくなる。
     */
    const SCHEDULE_STATE: Record<string, string> = {
      planned: "配船計画",
      fixed: "出港予定",
      in_progress: "航行中",
      done: "入港済み",
      canceled: "取り消し",
    };
    const state = master?.managedExternally
      ? "管理委託中"
      : sch
        ? (SCHEDULE_STATE[sch.status] ?? "配船計画")
        : pos
          ? "位置情報のみ"
          : "運航情報なし";
    const route = sch ? `${sch.departurePort ?? "—"} → ${sch.arrivalPort ?? "—"}` : null;

    return {
      vesselId: v.vesselId,
      name: v.vesselName,
      master,
      spec: specOf(master),
      state,
      route,
      stateLevel: master?.managedExternally
        ? "none"
        : v.onBoard.length === 0
          ? "caution"
          : "ok",
      onBoard: v.onBoard,
      requiredCrew: v.requiredCrew,
      cautionDays,
      violationDays,
      pendingApprovals,
      nextDeadline: mine[0] ?? null,
      deadlines: mine,
    };
  });
}

export function buildVesselOverview(vesselId: string, now = new Date()): VesselOverview | null {
  return buildVesselOverviews(now).find((v) => v.vesselId === vesselId) ?? null;
}
