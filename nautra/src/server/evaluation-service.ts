import { EVALUATION_ITEMS, type EvaluationPayload } from "@/sync-protocol/masters";
import {
  COMPANY_SCOPE_ID,
  crewNameOf,
  effective,
  history,
  publishMaster,
  writeAuditLog,
} from "./master-service";
import { SHORE_STAFF_ACCOUNTS } from "./shore-session";

/**
 * S-13 評価・人事考課のドメインサービス（要件定義書 3.1.5）。
 *
 * 運用上の留意（3.1.5）:
 *   「評価情報はハラスメントの温床とならないよう**本人開示ルール**を定め、
 *    **評価者・閲覧者を限定**する」
 *
 * 実装への反映:
 * - 閲覧・記入の権限は管理者だけが持つ（`domain/authz/shore-roles.ts`）。
 *   このサービスを呼ぶ画面・Server Action は必ず requireShore で再確認する。
 * - **本人開示の可否**を評価ごとに保持し、一覧・詳細の双方で明示する。
 * - 総合点は5項目の平均で、**保存しない導出値**（12.3）。ここで都度算出する。
 * - 訂正は supersedesId 付きの追記で行い、元の評価は物理保持する（12.6 監査証跡）。
 */

/** 評価の1件（表示用に名前と導出値を添えたもの） */
export interface EvaluationRow {
  record: EvaluationPayload;
  crewName: string;
  evaluatorName: string;
  /** 5項目の平均（導出値。保存しない） */
  average: number | null;
}

/** 記録者ID → 表示名（船員マスタ → 陸上スタッフ → ID の順で解決する） */
export function personLabel(id: string | undefined): string {
  if (!id) return "—";
  const staff = SHORE_STAFF_ACCOUNTS.find((s) => s.id === id);
  if (staff) return staff.name;
  return crewNameOf(id);
}

/** 5項目の平均（未入力の項目があれば入力済みのぶんだけで平均する） */
export function averageScore(scores: Record<string, number> | undefined): number | null {
  if (!scores) return null;
  const values = EVALUATION_ITEMS.map((k) => scores[k]).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function toRow(record: EvaluationPayload): EvaluationRow {
  return {
    record,
    crewName: crewNameOf(record.crewMemberId),
    evaluatorName: personLabel(record.evaluatedBy),
    average: averageScore(record.scores),
  };
}

/** 有効な評価（訂正済みを除く）を新しい順に */
export function listEvaluations(): EvaluationRow[] {
  return effective("evaluation")
    .slice()
    .sort((a, b) => b.periodTo.localeCompare(a.periodTo) || b.occurredAt.localeCompare(a.occurredAt))
    .map(toRow);
}

/** 1件の取得（詳細・訂正フォーム用） */
export function evaluationById(id: string): EvaluationRow | undefined {
  const found = effective("evaluation").find((e) => e.id === id);
  return found ? toRow(found) : undefined;
}

/**
 * 船員ごとの評価を**古い順**に並べる（3.1.5 DX効果「履歴蓄積による育成計画立案」）。
 * 項目ごとの推移を読むため、時系列は古い→新しいで返す。
 */
export function evaluationHistoryByCrew(): { crewMemberId: string; crewName: string; rows: EvaluationRow[] }[] {
  const byCrew = new Map<string, EvaluationRow[]>();
  for (const row of listEvaluations()) {
    byCrew.set(row.record.crewMemberId, [...(byCrew.get(row.record.crewMemberId) ?? []), row]);
  }
  return [...byCrew.entries()]
    .map(([crewMemberId, rows]) => ({
      crewMemberId,
      crewName: crewNameOf(crewMemberId),
      rows: rows.slice().sort((a, b) => a.record.periodTo.localeCompare(b.record.periodTo)),
    }))
    .sort((a, b) => a.crewMemberId.localeCompare(b.crewMemberId));
}

/** 訂正・取り消しを含む全履歴（監査用。新しい順） */
export function evaluationAuditTrail(): EvaluationPayload[] {
  return history("evaluation");
}

export interface PublishEvaluationInput {
  crewMemberId: string;
  periodFrom: string;
  periodTo: string;
  /** 5項目それぞれ 1〜5 */
  scores: Record<string, number>;
  comment?: string;
  evaluatedBy: string;
  /** 本人に開示してよいか（3.1.5 本人開示ルール） */
  disclosedToCrew: boolean;
  /** 訂正のとき、置き換える既存の評価ID */
  supersedesId?: string;
}

/**
 * 評価を1件配信する（追記のみ）。
 * 入力の妥当性はここで検証し、画面に判定を散らさない。
 */
export function publishEvaluation(
  input: PublishEvaluationInput,
  actor: string,
  now = new Date(),
): EvaluationPayload {
  if (!input.crewMemberId) throw new Error("評価する船員を選んでください");
  if (!input.periodFrom || !input.periodTo) throw new Error("評価の対象期間を入力してください");
  if (input.periodFrom > input.periodTo) {
    throw new Error("対象期間の開始日が終了日より後になっています");
  }
  if (!input.evaluatedBy) throw new Error("評価者を選んでください");

  const scores: Record<string, number> = {};
  for (const key of EVALUATION_ITEMS) {
    const value = input.scores[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
      throw new Error("5つの項目すべてを1〜5から選んでください");
    }
    scores[key] = value;
  }

  const published = publishMaster(
    "evaluation",
    {
      crewMemberId: input.crewMemberId,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      scores,
      comment: input.comment?.trim() || undefined,
      evaluatedBy: input.evaluatedBy,
      disclosedToCrew: input.disclosedToCrew,
    },
    { supersedesId: input.supersedesId, vesselId: COMPANY_SCOPE_ID, actor, now },
  );

  // 12.6 監査証跡: 誰がいつ誰の評価を書いたかを残す（点数そのものは載せない）
  writeAuditLog({
    action: input.supersedesId ? "update" : "create",
    entityKind: "evaluation",
    entityId: published.id,
    before: input.supersedesId,
    actor,
    now,
    summary:
      `${crewNameOf(input.crewMemberId)} の人事考課を` +
      `${input.supersedesId ? "訂正" : "記入"}（本人開示: ${input.disclosedToCrew ? "する" : "しない"}）`,
  });

  return published;
}
