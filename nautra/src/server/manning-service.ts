import { evaluateCredentials, type CredentialStatus } from "@/domain/crew/freshness";
import {
  evaluateManningEligibility,
  type ManningEligibility,
} from "@/domain/crew/manning";
import { evaluateWeekly, ymdLocal } from "@/domain/labor-law/evaluate";
import type { CheckLevel } from "@/domain/labor-law/types";
import { DEFAULT_CREDENTIAL_RULE_SET } from "@/rules/credential-rules";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";
import type { CrewMasterPayload, EmbarkationPayload } from "@/sync-protocol/records";
import {
  ageOf,
  credentialsOf,
  crewMasterOf,
  effective,
  listCrewMasters,
  todayLocal,
  vesselNameOf,
} from "./master-service";
import { getTimeRecords } from "./store";

/**
 * 配乗（S-05）・船員カルテ（S-03）・届出（S-07）が共用する判定サービス。
 *
 * **配乗可否は導出値**であり、どこにも保存しない（要件定義書 12.3）。
 * 判定そのものは `domain/crew/manning.ts` の純関数が行い、ここは
 * 「その船員の証書・保険・直近の労務」を集めて渡すだけの組み立て層に徹する。
 */

export interface CrewManningRow {
  crewMemberId: string;
  name: string;
  position: string;
  age: number | null;
  photo?: string;
  master?: CrewMasterPayload;
  eligibility: ManningEligibility;
  credentialStatuses: CredentialStatus[];
  /** いま乗っている船（実績の乗船イベントから導出） */
  currentVesselId?: string;
  currentVesselName?: string;
  boardedOn?: string;
  /** 予定されている乗下船 */
  plannedEvents: EmbarkationPayload[];
  /** 直近7日の労務判定 */
  laborLevel: CheckLevel;
  weeklyMinutes: number;
}

/**
 * 実技講習（登録実技講習機関での生存・消火）が必要な船員か。
 *
 * 要件定義書 3.9 / 3.1.3: 「**特定の船員**には登録実技講習機関での実技講習の受講が
 * 義務付けられた」。誰が「特定の船員」に当たるかは船種・航行区域・職務で決まるため、
 * 本番では船舶マスタと職務から判定する。PoC は甲板部・航海士を対象とする暫定規則。
 *
 * **配乗判定（S-05）と届出の添付要件チェック（S-07）と訓練管理（S-09）が同じ判断を使う**ため、
 * ここを唯一の情報源として公開する（同じ規則を各サービスに書き写さない）。
 */
export function needsPracticalTraining(master: CrewMasterPayload | undefined): boolean {
  return master?.role === "deck_rating" || master?.role === "deck_officer";
}

/**
 * 船員1人分の配乗判定を組み立てる。
 * 労務の判定結果（直近7日）を配乗ブロック条件に渡すため、労働時間の計算をここで再実装しない。
 */
export function buildManningRow(crewMemberId: string, now = new Date()): CrewManningRow | null {
  const master = crewMasterOf(crewMemberId);
  if (!master) return null;
  const today = ymdLocal(now);
  const records = getTimeRecords();

  const weekly = evaluateWeekly({
    crewMemberId,
    endDate: today,
    records,
    now,
    ruleSet: DEFAULT_LABOR_RULE_SET,
  });
  const dayLevels = weekly.days.filter((d) => d.hasRecords).map((d) => d.level);
  const laborLevel: CheckLevel = dayLevels.includes("violation")
    ? "violation"
    : dayLevels.includes("caution") || weekly.check.level !== "ok"
      ? "caution"
      : "ok";
  const laborNote =
    laborLevel === "violation"
      ? "直近7日に基準を外れた日があります。解消してから配乗してください。"
      : laborLevel === "caution"
        ? "直近7日の労働時間が上限に近づいています。"
        : undefined;

  const credentials = credentialsOf("crew", crewMemberId);
  const embarkations = effective("embarkation").filter((e) => e.crewMemberId === crewMemberId);
  const actual = embarkations
    .filter((e) => e.status === "actual")
    .sort((a, b) => b.date.localeCompare(a.date));
  const lastActual = actual[0];
  const onBoard = lastActual?.eventType === "on" ? lastActual : undefined;
  const planned = embarkations
    .filter((e) => e.status === "planned")
    .sort((a, b) => a.date.localeCompare(b.date));

  const eligibility = evaluateManningEligibility({
    crewMemberId,
    master,
    credentials,
    today,
    ruleSet: DEFAULT_CREDENTIAL_RULE_SET,
    laborLevel,
    laborNote,
    embarkOn: planned.find((p) => p.eventType === "on")?.date,
    practicalTrainingRequired: needsPracticalTraining(master),
  });

  return {
    crewMemberId,
    name: master.name,
    position: master.position ?? "",
    age: ageOf(master.birthDate, today),
    photo: master.photo,
    master,
    eligibility,
    credentialStatuses: evaluateCredentials(credentials, today, DEFAULT_CREDENTIAL_RULE_SET),
    currentVesselId: onBoard?.targetVesselId,
    currentVesselName: onBoard ? vesselNameOf(onBoard.targetVesselId) : undefined,
    boardedOn: onBoard?.date,
    plannedEvents: planned,
    laborLevel,
    weeklyMinutes: weekly.totalMinutes,
  };
}

/** 全船員の配乗判定（S-02 / S-05） */
export function buildManningBoard(now = new Date()): CrewManningRow[] {
  return listCrewMasters()
    .map((m) => buildManningRow(m.crewMemberId, now))
    .filter((r): r is CrewManningRow => r !== null);
}

/** 船ごとの配乗状況（S-05 配乗計画ボード） */
export interface VesselManningSummary {
  vesselId: string;
  vesselName: string;
  requiredCrew: number | null;
  onBoard: CrewManningRow[];
  /** 予定されている乗下船（この船に対するもの） */
  planned: { row: CrewManningRow; event: EmbarkationPayload }[];
}

export function buildVesselManning(now = new Date()): VesselManningSummary[] {
  const rows = buildManningBoard(now);
  const vessels = new Map<string, VesselManningSummary>();
  const ensure = (vesselId: string) => {
    if (!vessels.has(vesselId)) {
      const vm = effective("vessel_master").find((v) => v.targetVesselId === vesselId);
      vessels.set(vesselId, {
        vesselId,
        vesselName: vesselNameOf(vesselId),
        requiredCrew: vm?.requiredCrew ?? null,
        onBoard: [],
        planned: [],
      });
    }
    return vessels.get(vesselId)!;
  };
  for (const v of effective("vessel_master")) ensure(v.targetVesselId);
  for (const row of rows) {
    if (row.currentVesselId) ensure(row.currentVesselId).onBoard.push(row);
    for (const ev of row.plannedEvents) ensure(ev.targetVesselId).planned.push({ row, event: ev });
  }
  return [...vessels.values()];
}

/** 配乗待ち（どの船にも乗っていない船員） */
export function buildAshoreCrew(now = new Date()): CrewManningRow[] {
  return buildManningBoard(now).filter((r) => !r.currentVesselId);
}

/** 証書の期限・鮮度アラート（S-01 ダッシュボードの「期限接近一覧」/ S-08） */
export interface CredentialAlert {
  subjectType: "crew" | "vessel";
  subjectId: string;
  subjectName: string;
  status: CredentialStatus;
}

export function buildCredentialAlerts(now = new Date()): CredentialAlert[] {
  const today = todayLocal(now);
  const alerts: CredentialAlert[] = [];
  for (const master of listCrewMasters()) {
    const statuses = evaluateCredentials(
      credentialsOf("crew", master.crewMemberId),
      today,
      DEFAULT_CREDENTIAL_RULE_SET,
    );
    for (const s of statuses) {
      if (s.level !== "ok")
        alerts.push({
          subjectType: "crew",
          subjectId: master.crewMemberId,
          subjectName: master.name,
          status: s,
        });
    }
  }
  for (const v of effective("vessel_master")) {
    const statuses = evaluateCredentials(
      credentialsOf("vessel", v.targetVesselId),
      today,
      DEFAULT_CREDENTIAL_RULE_SET,
    );
    for (const s of statuses) {
      if (s.level !== "ok")
        alerts.push({
          subjectType: "vessel",
          subjectId: v.targetVesselId,
          subjectName: v.name,
          status: s,
        });
    }
  }
  const order: Record<CheckLevel, number> = { violation: 0, caution: 1, ok: 2 };
  return alerts.sort((a, b) => {
    if (order[a.status.level] !== order[b.status.level])
      return order[a.status.level] - order[b.status.level];
    return (a.status.daysToExpiry ?? 99999) - (b.status.daysToExpiry ?? 99999);
  });
}
