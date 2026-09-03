import { addDaysYmd } from "@/domain/crew/freshness";
import { chainProceduresFor, type BusinessEvent } from "@/domain/procedures/chain";
import type { CrewManningRow } from "@/server/manning-service";
import { buildManningRow } from "@/server/manning-service";
import {
  COMPANY_SCOPE_ID,
  crewNameOf,
  effective,
  listVessels,
  publishMaster,
  todayLocal,
  vesselNameOf,
  writeAuditLog,
} from "@/server/master-service";
import type { EmbarkationPayload, ProcedureTaskPayload } from "@/sync-protocol/records";

/**
 * S-05 配乗計画ボードの組み立てと、乗下船イベントの登録（要件定義書 3.1.2 / 4.1 / 6.6①）。
 *
 * 配乗可否そのものは `domain/crew/manning.ts` が判定し、ここでは判定しない（12.3 単一実体）。
 * このサービスの役割は次の3つだけ:
 *   ① 船×期間の見通し（ガント）を一次記録から**導出**する（導出値は保持しない・12.3）
 *   ② 乗下船イベントを追記で登録する（ブロック事由は登録時点の証跡として書き添える）
 *   ③ 6.6①「イベント駆動の連鎖生成」— 登録を起点に手続き一式をまとめて起票する
 */

/* ═══════════════ ① 船×期間の見通し（60日ガント） ═══════════════ */

export interface ManningGanttRow {
  vesselId: string;
  vesselName: string;
  requiredCrew: number | null;
  /** dates と同じ長さ。その日にその船に乗っている人数（予定を含む） */
  counts: number[];
  /** その日が法定定員を満たすか（requiredCrew 未登録なら null） */
  shortages: (boolean | null)[];
}

export interface ManningGantt {
  dates: string[];
  rows: ManningGanttRow[];
}

/**
 * 今日から `days` 日ぶんの配乗見通し。
 * 乗下船イベント（実績＋予定）の並びから「その日その船に誰が乗っているか」を導く。
 * 人数・過不足はどこにも保存しない（都度算出。ガードレール④）。
 */
export function buildManningGantt(now = new Date(), days = 60): ManningGantt {
  const today = todayLocal(now);
  const dates = Array.from({ length: days }, (_, i) => addDaysYmd(today, i));

  // 船員ごとの乗下船イベントを日付順に並べる（同日は記録時刻の遅いほうを後にする）
  const byCrew = new Map<string, EmbarkationPayload[]>();
  for (const e of effective("embarkation")) {
    const list = byCrew.get(e.crewMemberId) ?? [];
    list.push(e);
    byCrew.set(e.crewMemberId, list);
  }
  for (const list of byCrew.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date) || a.occurredAt.localeCompare(b.occurredAt));
  }

  const vessels = listVessels();
  const index = new Map(vessels.map((v, i) => [v.id, i]));
  const counts = vessels.map(() => dates.map(() => 0));

  for (const list of byCrew.values()) {
    let cursor = 0;
    let vesselId: string | null = null;
    // 期間の開始時点で乗っている船（今日より前のイベントを先に消化する）
    while (cursor < list.length && list[cursor].date < dates[0]) {
      vesselId = list[cursor].eventType === "on" ? list[cursor].targetVesselId : null;
      cursor += 1;
    }
    for (let d = 0; d < dates.length; d += 1) {
      while (cursor < list.length && list[cursor].date <= dates[d]) {
        vesselId = list[cursor].eventType === "on" ? list[cursor].targetVesselId : null;
        cursor += 1;
      }
      if (vesselId === null) continue;
      const vi = index.get(vesselId);
      if (vi !== undefined) counts[vi][d] += 1;
    }
  }

  const masters = effective("vessel_master");
  const rows: ManningGanttRow[] = vessels.map((v, i) => {
    const requiredCrew = masters.find((m) => m.targetVesselId === v.id)?.requiredCrew ?? null;
    return {
      vesselId: v.id,
      vesselName: v.name,
      requiredCrew,
      counts: counts[i],
      shortages: counts[i].map((c) => (requiredCrew === null ? null : c < requiredCrew)),
    };
  });
  return { dates, rows };
}

/* ═══════════════ ② 乗下船イベントの登録 ═══════════════ */

export interface RegisterEmbarkationInput {
  crewMemberId: string;
  targetVesselId: string;
  eventType: "on" | "off";
  date: string;
  duty?: string;
  contractType?: "start" | "renew" | "change" | "end";
  status?: "planned" | "actual";
  /** ブロック事由を承知のうえで登録する（画面のチェックボックス） */
  acknowledgeBlock?: boolean;
  actor?: string;
  now?: Date;
}

export interface RegisterEmbarkationResult {
  embarkation: EmbarkationPayload;
  /** この登録で起票された手続き（6.6①） */
  procedures: ProcedureTaskPayload[];
  /** 登録時点で残っていたブロック事由（証跡として記録した文言） */
  blockNote?: string;
}

/** 乗下船イベントを1件登録し、続けて手続き一式を起票する */
export function registerEmbarkation(input: RegisterEmbarkationInput): RegisterEmbarkationResult {
  const now = input.now ?? new Date();
  const today = todayLocal(now);

  if (!input.crewMemberId) throw new Error("船員を選んでください");
  if (!input.targetVesselId) throw new Error("船を選んでください");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("日付を入力してください");

  const row = buildManningRow(input.crewMemberId, now);
  if (!row) throw new Error("この船員は登録されていません");

  const blockingIssues = row.eligibility.issues.filter((i) => i.severity === "block");
  const blockNote = blockingIssues.length > 0 ? blockingIssues.map((i) => i.label).join(" / ") : undefined;

  // 乗船（配乗）はブロック事由があるまま黙って登録させない。下船は乗せる判断ではないため通す。
  if (input.eventType === "on" && blockingIssues.length > 0 && !input.acknowledgeBlock) {
    throw new Error(
      `${row.name} は配乗できない事由が残っています（${blockNote}）。事由を確認し、承知のうえで予定として登録する場合はチェックを入れてください。`,
    );
  }

  const embarkation = publishMaster(
    "embarkation",
    {
      crewMemberId: input.crewMemberId,
      eventType: input.eventType,
      targetVesselId: input.targetVesselId,
      date: input.date,
      duty: input.duty?.trim() || undefined,
      contractType: input.contractType,
      status: input.status ?? "planned",
      blockNoteAtPlanning: blockNote,
    },
    { vesselId: COMPANY_SCOPE_ID, actor: input.actor, now },
  );

  const event: BusinessEvent = input.eventType === "on" ? "embark" : "disembark";
  const procedures = createChainedProcedures({
    event,
    eventDate: input.date,
    subjectId: input.crewMemberId,
    sourceEventId: embarkation.id,
    actor: input.actor,
    now,
  });

  writeAuditLog({
    action: "create",
    entityKind: "embarkation",
    entityId: embarkation.id,
    after: `${row.name} / ${vesselNameOf(input.targetVesselId)} / ${input.eventType === "on" ? "乗船" : "下船"} ${input.date}`,
    actor: input.actor,
    summary: `配乗計画に乗下船を登録し、手続き ${procedures.length}件 を起票（基準日 ${today}）${blockNote ? ` / 事由を承知のうえ登録: ${blockNote}` : ""}`,
    now,
  });

  return { embarkation, procedures, blockNote };
}

/* ═══════════════ ③ 6.6① イベント駆動の連鎖生成 ═══════════════ */

export interface CreateChainedProceduresInput {
  event: BusinessEvent;
  eventDate: string;
  subjectId?: string;
  sourceEventId?: string;
  actor?: string;
  now?: Date;
}

/**
 * 業務イベントから手続き一式を起票する（S-05 の登録と S-08 の「業務イベントから起こす」で共用）。
 * 「どの手続きが・いつを期限に生えるか」は純関数 `chainProceduresFor` が決め、
 * ここは採番と配信だけを行う。
 */
export function createChainedProcedures(
  input: CreateChainedProceduresInput,
): ProcedureTaskPayload[] {
  const now = input.now ?? new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate)) throw new Error("日付を入力してください");

  return chainProceduresFor(input.event, input.eventDate, input.subjectId).map((c) =>
    publishMaster(
      "procedure_task",
      {
        group: c.group,
        title: c.title,
        basis: c.basis,
        subjectType: c.subjectType,
        subjectId: c.subjectType === "company" ? undefined : c.subjectId,
        dueOn: c.dueOn,
        leadTimeDays: c.leadTimeDays,
        status: "open",
        responsible: input.actor,
        sourceEventId: input.sourceEventId,
      },
      { vesselId: COMPANY_SCOPE_ID, actor: input.actor, now },
    ),
  );
}

/* ═══════════════ 画面へ渡す一覧（Server Component から Client へ） ═══════════════ */

export interface ManningCandidate {
  crewMemberId: string;
  name: string;
  position: string;
  status: CrewManningRow["eligibility"]["status"];
  /** ブロック事由（黙って隠さず、理由を添えて出す。3.1.2） */
  issues: { key: string; severity: "block" | "warn"; label: string; detail: string }[];
  currentVesselName?: string;
}

/** 配乗の候補（全船員）。フォームがブロック事由を表示できるよう素の値で渡す */
export function buildManningCandidates(rows: CrewManningRow[]): ManningCandidate[] {
  return rows.map((r) => ({
    crewMemberId: r.crewMemberId,
    name: r.name,
    position: r.position,
    status: r.eligibility.status,
    issues: r.eligibility.issues.map((i) => ({
      key: i.key,
      severity: i.severity,
      label: i.label,
      detail: i.detail,
    })),
    currentVesselName: r.currentVesselName,
  }));
}

/** 直近に登録された乗下船イベント（新しい順。登録結果の確認用） */
export function recentEmbarkations(limit = 12) {
  return [...effective("embarkation")]
    .sort((a, b) => b.date.localeCompare(a.date) || b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, limit)
    .map((e) => ({
      ...e,
      crewName: crewNameOf(e.crewMemberId),
      vesselName: vesselNameOf(e.targetVesselId),
    }));
}
