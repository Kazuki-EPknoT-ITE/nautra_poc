import { STCW_BASIC_REQUIRED_FROM } from "@/domain/crew/manning";
import { evaluateDrills, type DrillStatus } from "@/domain/training/drills";
import type { CheckLevel } from "@/domain/labor-law/types";
import { DEFAULT_DRILL_RULE_SET } from "@/rules/drill-rules";
import { practicalTrainingRequiredFor } from "@/server/filing-service";
import {
  COMPANY_SCOPE_ID,
  credentialsOf,
  crewMasterOf,
  crewNameOf,
  effective,
  listCrewMasters,
  publishMaster,
  todayLocal,
  writeAuditLog,
} from "@/server/master-service";
import { getRecordsOfKind } from "@/server/store";
import type {
  CredentialCategory,
  CredentialPayload,
  TrainingKind,
  TrainingPlanPayload,
} from "@/sync-protocol/records";

/**
 * S-09 訓練管理（要件定義書 3.9 / 4.4）。
 *
 * 令和7年改正船員法（2026-02-14 施行）により、雇入契約を結んだ際は基本訓練の実施・修了確認が
 * 義務となり、雇入届出時にも修了が確認される。未修了のまま届け出ると受理が保留されうる。
 *
 * 修了の有無は**証書（credential）の有無から導出**し、訓練計画に二重に持たない（12.3）。
 * 操練の次回期日は `domain/training/drills.ts` が `rules/drill-rules.ts` の間隔で判定する。
 */

/* ═══════════════ ① 船員ごとの修了状況一覧（3.9 主要機能①） ═══════════════ */

export interface TrainingItemStatus {
  category: CredentialCategory;
  /** この船員に必要な訓練か（実技講習は特定の船員のみ） */
  required: boolean;
  /** 修了済みか（証書の有無で判定する） */
  completed: boolean;
  credential?: CredentialPayload;
  /** 手配済みの受講予定（未修了のときの次の一手） */
  plan?: TrainingPlanPayload;
  level: CheckLevel;
  message: string;
}

export interface CrewTrainingRow {
  crewMemberId: string;
  name: string;
  position: string;
  /** 基本訓練 / 実技講習 / 更新講習 */
  items: TrainingItemStatus[];
  level: CheckLevel;
  /** 未修了があり、2026-02-14 以降の雇入で受理保留のリスクがあるか */
  hireRisk: boolean;
}

const ITEM_LABELS: { category: CredentialCategory; kind: TrainingKind }[] = [
  { category: "stcw_basic", kind: "stcw_basic" },
  { category: "stcw_practical", kind: "stcw_practical" },
  { category: "license", kind: "license_renewal" },
];

export function buildCrewTrainingRows(now = new Date()): CrewTrainingRow[] {
  const today = todayLocal(now);
  const plans = effective("training_plan");

  return listCrewMasters().map((master) => {
    const credentials = credentialsOf("crew", master.crewMemberId);
    const practicalRequired = practicalTrainingRequiredFor(master);

    const items: TrainingItemStatus[] = ITEM_LABELS.map(({ category, kind }) => {
      const credential = credentials.find((c) => c.category === category);
      const plan = plans.find(
        (p) =>
          p.crewMemberId === master.crewMemberId &&
          p.trainingKind === kind &&
          p.status !== "canceled" &&
          p.status !== "completed",
      );
      // 更新講習（license）は「免状を持っている＝受講対象」。持っていなければ対象外
      const required =
        category === "stcw_basic"
          ? true
          : category === "stcw_practical"
            ? practicalRequired
            : credentials.some((c) => c.category === "license");
      const completed =
        category === "license"
          ? // 更新講習は「免状が期限内にある」ことをもって当面の受講不要とする
            Boolean(credential?.expiresOn && credential.expiresOn >= today)
          : Boolean(credential);

      let level: CheckLevel = "ok";
      let message: string;
      if (!required) {
        message = "この船員は対象ではありません";
      } else if (completed) {
        message =
          category === "license"
            ? `${credential?.name ?? "海技免状"}（${credential?.expiresOn} まで有効）`
            : `${credential?.name ?? "修了証"}${credential?.issuedOn ? `（${credential.issuedOn} 修了）` : ""}`;
      } else if (plan) {
        level = "caution";
        message = plan.scheduledOn
          ? `未修了。${plan.scheduledOn} に受講予定（${plan.institution ?? "機関未定"}）`
          : `未修了。受講の手配中（${plan.institution ?? "機関未定"}）`;
      } else {
        level = "violation";
        message = "未修了で、受講の手配もありません。受講先を手配してください。";
      }

      return { category, required, completed, credential, plan, level, message };
    });

    const level: CheckLevel = items.some((i) => i.level === "violation")
      ? "violation"
      : items.some((i) => i.level === "caution")
        ? "caution"
        : "ok";
    const hireRisk = items.some(
      (i) => i.required && !i.completed && (i.category === "stcw_basic" || i.category === "stcw_practical"),
    );

    return {
      crewMemberId: master.crewMemberId,
      name: master.name,
      position: master.position ?? "",
      items,
      level,
      hireRisk,
    };
  });
}

/** 基本訓練の修了確認が届出で求められるようになった日（画面の説明文で使う） */
export { STCW_BASIC_REQUIRED_FROM };

/* ═══════════════ ② 受講手配（4.4 ②） ═══════════════ */

export interface ArrangeTrainingInput {
  crewMemberId: string;
  trainingKind: TrainingKind;
  title: string;
  institution?: string;
  scheduledOn?: string;
  actor?: string;
  now?: Date;
}

export function arrangeTraining(input: ArrangeTrainingInput): TrainingPlanPayload {
  const now = input.now ?? new Date();
  if (!input.crewMemberId) throw new Error("船員を選んでください");
  const title = input.title.trim();
  if (!title) throw new Error("訓練の名前を入力してください");
  if (input.scheduledOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledOn))
    throw new Error("受講予定日は日付で入力してください");

  const plan = publishMaster(
    "training_plan",
    {
      crewMemberId: input.crewMemberId,
      trainingKind: input.trainingKind,
      title,
      institution: input.institution?.trim() || undefined,
      scheduledOn: input.scheduledOn || undefined,
      status: input.scheduledOn ? "arranged" : "needed",
    },
    { vesselId: COMPANY_SCOPE_ID, actor: input.actor, now },
  );

  writeAuditLog({
    action: "create",
    entityKind: "training_plan",
    entityId: plan.id,
    after: `${crewNameOf(input.crewMemberId)} / ${title}`,
    actor: input.actor,
    summary: "訓練の受講を手配",
    now,
  });
  return plan;
}

/* ═══════════════ ③ 修了の登録（4.4 ③→④ 届出への自動連携） ═══════════════ */

/** 訓練種別 → 発行される証書の区分（更新講習は海技免状そのものの更新） */
const CREDENTIAL_CATEGORY_BY_KIND: Record<TrainingKind, CredentialCategory> = {
  stcw_basic: "stcw_basic",
  stcw_practical: "stcw_practical",
  license_renewal: "license",
  internal: "other",
  other: "other",
};

export interface CompleteTrainingInput {
  planId: string;
  /** 修了日（証書の交付日） */
  completedOn: string;
  /** 証書の表示名。省略時は訓練の名前を使う */
  credentialName?: string;
  /** 登録実技講習機関名など */
  issuer?: string;
  number?: string;
  /** 更新講習で新しい有効期限が出る場合 */
  expiresOn?: string;
  actor?: string;
  now?: Date;
}

export interface CompleteTrainingResult {
  plan: TrainingPlanPayload;
  credential: CredentialPayload;
}

/**
 * 手配済みの訓練に修了を登録する。
 * 修了証（credential）を新規に作り、訓練計画を `completed` + `credentialId` で置き換える。
 * これで S-07 の添付要件チェッカーが自動的に「適合」に変わる（3.9 主要機能②）。
 */
export function completeTraining(input: CompleteTrainingInput): CompleteTrainingResult {
  const now = input.now ?? new Date();
  const current = effective("training_plan").find((p) => p.id === input.planId);
  if (!current) throw new Error("この訓練は見つかりません（画面を開き直してください）");
  if (current.status === "completed") throw new Error("この訓練はすでに修了として登録済みです");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.completedOn)) throw new Error("修了日を入力してください");
  if (input.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn))
    throw new Error("新しい有効期限は日付で入力してください");

  const category = CREDENTIAL_CATEGORY_BY_KIND[current.trainingKind];
  const credential = publishMaster(
    "credential",
    {
      subjectType: "crew",
      subjectId: current.crewMemberId,
      category,
      name: input.credentialName?.trim() || current.title,
      number: input.number?.trim() || undefined,
      issuedOn: input.completedOn,
      expiresOn: input.expiresOn || undefined,
      issuer: input.issuer?.trim() || current.institution,
      // 修了の登録は原本（修了証）の確認を伴う。12.4 の鮮度は今日で更新される
      lastVerifiedOn: todayLocal(now),
      verifyMethod: "original",
      verifiedBy: input.actor,
    },
    { vesselId: COMPANY_SCOPE_ID, actor: input.actor, now },
  );

  const plan = publishMaster(
    "training_plan",
    {
      crewMemberId: current.crewMemberId,
      trainingKind: current.trainingKind,
      title: current.title,
      institution: input.issuer?.trim() || current.institution,
      scheduledOn: current.scheduledOn,
      materialName: current.materialName,
      materialBody: current.materialBody,
      status: "completed",
      credentialId: credential.id,
    },
    { vesselId: COMPANY_SCOPE_ID, supersedesId: current.id, actor: input.actor, now },
  );

  writeAuditLog({
    action: "create",
    entityKind: "credential",
    entityId: credential.id,
    after: `${crewNameOf(current.crewMemberId)} / ${credential.name}（${input.completedOn} 修了）`,
    actor: input.actor,
    summary: "訓練の修了を登録し、修了証を作成（届出の添付要件チェックへ反映）",
    now,
  });

  return { plan, credential };
}

/* ═══════════════ ④ 船内操練の実施記録と次回期日（3.9 主要機能③） ═══════════════ */

export interface DrillBoard {
  statuses: DrillStatus[];
  /** 判定に適用したルール版（画面に出して根拠を示す） */
  ruleSetId: string;
  ruleVersion: string;
  ruleSource: string;
  /** 直近の実施記録（新しい順） */
  recent: ReturnType<typeof recentDrills>;
}

function recentDrills(limit = 10) {
  return [...getRecordsOfKind("drill_record")]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      drillType: r.drillType,
      occurredAt: r.occurredAt,
      leaderName: crewNameOf(r.leader),
      participantCount: r.participants.length,
      durationMinutes: r.durationMinutes,
      remarks: r.remarks,
    }));
}

export function buildDrillBoard(now = new Date()): DrillBoard {
  const rules = DEFAULT_DRILL_RULE_SET;
  return {
    statuses: evaluateDrills(getRecordsOfKind("drill_record"), todayLocal(now), rules),
    ruleSetId: rules.id,
    ruleVersion: rules.version,
    ruleSource: rules.source,
    recent: recentDrills(),
  };
}

/* ═══════════════ ⑤ 教材・手順書の配信（3.9 主要機能④） ═══════════════ */

export interface PublishMaterialInput {
  crewMemberId: string;
  trainingKind: TrainingKind;
  title: string;
  materialName: string;
  materialBody: string;
  actor?: string;
  now?: Date;
}

export function publishTrainingMaterial(input: PublishMaterialInput): TrainingPlanPayload {
  const now = input.now ?? new Date();
  if (!input.crewMemberId) throw new Error("配信先の船員を選んでください");
  const materialName = input.materialName.trim();
  if (!materialName) throw new Error("教材・手順書の名前を入力してください");
  const materialBody = input.materialBody.trim();
  if (!materialBody) throw new Error("教材・手順書の内容を入力してください");

  const plan = publishMaster(
    "training_plan",
    {
      crewMemberId: input.crewMemberId,
      trainingKind: input.trainingKind,
      title: input.title.trim() || materialName,
      status: "needed",
      materialName,
      materialBody,
    },
    { vesselId: COMPANY_SCOPE_ID, actor: input.actor, now },
  );

  writeAuditLog({
    action: "create",
    entityKind: "training_plan",
    entityId: plan.id,
    after: `${crewNameOf(input.crewMemberId)} / ${materialName}`,
    actor: input.actor,
    summary: "訓練教材・手順書を配信",
    now,
  });
  return plan;
}

/* ═══════════════ 画面へ渡す一覧 ═══════════════ */

export interface TrainingPlanRow extends TrainingPlanPayload {
  crewName: string;
}

export function listTrainingPlans(): TrainingPlanRow[] {
  return [...effective("training_plan")]
    .sort((a, b) => (b.scheduledOn ?? "").localeCompare(a.scheduledOn ?? "") || b.occurredAt.localeCompare(a.occurredAt))
    .map((p) => ({ ...p, crewName: crewNameOf(p.crewMemberId) }));
}

/** 教材・手順書が付いた配信のみ */
export function listTrainingMaterials(): TrainingPlanRow[] {
  return listTrainingPlans().filter((p) => p.materialName || p.materialBody);
}

/** 修了を登録できる訓練（手配済み・受講が必要なもの） */
export function listOpenTrainingPlans(): TrainingPlanRow[] {
  return listTrainingPlans().filter((p) => p.status === "needed" || p.status === "arranged");
}

export function trainingFormOptions() {
  return {
    crew: listCrewMasters().map((c) => ({
      id: c.crewMemberId,
      name: c.name,
      position: c.position ?? "",
    })),
  };
}

/** 船員1人の在籍確認（フォームの検証で使う） */
export function crewExists(crewMemberId: string): boolean {
  return Boolean(crewMasterOf(crewMemberId));
}
