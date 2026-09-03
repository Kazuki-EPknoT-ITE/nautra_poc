import { freshnessOf, type FreshnessState } from "@/domain/crew/freshness";
import { t } from "@/i18n/ja";
import { DEFAULT_OFFICE_RULE_SET } from "@/rules/office-rules";
import type { VesselMasterPayload, WellbeingResponsePayload } from "@/sync-protocol/masters";
import { effective, publishMaster, todayLocal, writeAuditLog } from "./master-service";

/**
 * 3.5.3 船員健康・快適な労働環境・ハラスメント対応の陸上受付側。
 *
 * 匿名性の扱い（このサービスの最重要事項）:
 * - 健康アンケート・ストレスチェックは**個人を特定しない集計だけ**を返す。
 *   回答が少ないと集計から個人が推測できるため、既定 3 件未満は集計自体を返さない
 *   （しきい値は `src/rules/office-rules.ts`）。
 * - 相談・通報は `recordedBy` が "anonymous" のとき氏名を一切組み立てない
 *   （画面に渡す型に氏名フィールドを持たせない形で、うっかり表示できないようにする）。
 * - 陸上からの回答は追記（supersedesId 付き）で、元の相談は物理保持する。
 */

const rules = DEFAULT_OFFICE_RULE_SET.values;

/* ═══════════════ 健康アンケート・ストレスチェックの集計 ═══════════════ */

export interface WellbeingItemSummary {
  key: string;
  label: string;
  /** 平均（小数第1位まで） */
  average: number;
  /** 1〜5 それぞれの回答数 */
  distribution: number[];
  answeredCount: number;
}

export interface WellbeingSummary {
  formType: "health_survey" | "stress_check";
  responseCount: number;
  /** 回答が少ないため集計を出さない（個人の特定を避ける） */
  suppressed: boolean;
  minResponses: number;
  items: WellbeingItemSummary[];
  /** 直近の回答日（YYYY-MM-DD）。件数だけなので個人は特定されない */
  latestOn: string | null;
}

/** 設問キー → 表示名（船内の入力画面と同じ語彙。未知のキーはそのまま出す） */
export function answerItemLabel(key: string): string {
  return t.wellbeingAnswerItem[key] ?? key;
}

export function buildWellbeingSummary(
  formType: "health_survey" | "stress_check",
): WellbeingSummary {
  const responses = effective("wellbeing_response").filter((r) => r.formType === formType);
  const responseCount = responses.length;
  const latestOn =
    responses.length > 0
      ? responses
          .map((r) => r.occurredAt.slice(0, 10))
          .sort()
          .at(-1) ?? null
      : null;

  if (responseCount < rules.wellbeingMinResponses) {
    return {
      formType,
      responseCount,
      suppressed: true,
      minResponses: rules.wellbeingMinResponses,
      items: [],
      latestOn,
    };
  }

  const keys: string[] = [];
  for (const r of responses) {
    for (const k of Object.keys(r.answers ?? {})) if (!keys.includes(k)) keys.push(k);
  }

  const items = keys.map((key) => {
    const values = responses
      .map((r) => r.answers?.[key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const distribution = [1, 2, 3, 4, 5].map(
      (score) => values.filter((v) => Math.round(v) === score).length,
    );
    const average =
      values.length > 0
        ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
        : 0;
    return { key, label: answerItemLabel(key), average, distribution, answeredCount: values.length };
  });

  return {
    formType,
    responseCount,
    suppressed: false,
    minResponses: rules.wellbeingMinResponses,
    items,
    latestOn,
  };
}

/* ═══════════════ 相談・通報（匿名） ═══════════════ */

/**
 * 画面へ渡す相談の型。
 * **氏名・船員IDを持たせない**（匿名の相談で誰が書いたかを画面から辿れないようにする）。
 * 匿名でない相談だけ `displayName` に名前が入る。
 */
export interface ConsultationRow {
  id: string;
  occurredAt: string;
  message: string;
  status: WellbeingResponsePayload["status"];
  respondedAt?: string;
  response?: string;
  anonymous: boolean;
  /** 匿名でない場合のみ名前が入る（匿名なら null） */
  displayName: string | null;
}

export function listConsultations(): ConsultationRow[] {
  return effective("wellbeing_response")
    .filter((r) => r.formType === "consultation")
    .slice()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .map((r) => {
      const anonymous = r.anonymous !== false || r.recordedBy === "anonymous";
      return {
        id: r.id,
        occurredAt: r.occurredAt,
        message: r.message ?? "（本文なし）",
        status: r.status,
        respondedAt: r.respondedAt,
        response: r.response,
        anonymous,
        // 匿名の相談は recordedBy が "anonymous" なので、そもそも名前を組み立てない
        displayName: anonymous ? null : r.recordedBy,
      } satisfies ConsultationRow;
    });
}

/**
 * 相談へ陸上から回答する（追記。元の相談は物理保持する）。
 * wellbeing_response は origin が both のため、陸上からも追記できる。
 */
export function respondToConsultation(
  input: { responseId: string; response: string },
  actor: string,
  now = new Date(),
): WellbeingResponsePayload {
  const target = effective("wellbeing_response").find((r) => r.id === input.responseId);
  if (!target) throw new Error("対象の相談が見つかりません（画面を開き直してください）");
  if (!input.response.trim()) throw new Error("回答の内容を入力してください");

  const published = publishMaster(
    "wellbeing_response",
    {
      formType: target.formType,
      // 匿名の相談は匿名のまま返す（回答時に記録者を書き換えない）
      anonymous: target.anonymous,
      recordedBy: target.recordedBy,
      answers: target.answers,
      message: target.message,
      status: "responded",
      response: input.response.trim(),
      respondedAt: now.toISOString(),
    },
    { supersedesId: target.id, vesselId: target.vesselId, actor, now },
  );

  writeAuditLog({
    action: "update",
    entityKind: "wellbeing_response",
    entityId: published.id,
    before: target.id,
    // 相談の本文・回答本文は監査ログに載せない（要配慮情報を二重に保持しない。12.3）
    after: "状態 responded",
    actor,
    now,
    summary: "匿名の相談へ陸上から回答",
  });
  return published;
}

/** 受付だけを記録する（回答前に「見ています」を返す） */
export function markConsultationReceived(
  responseId: string,
  actor: string,
  now = new Date(),
): WellbeingResponsePayload {
  const target = effective("wellbeing_response").find((r) => r.id === responseId);
  if (!target) throw new Error("対象の相談が見つかりません（画面を開き直してください）");
  if (target.status !== "submitted") throw new Error("この相談はすでに受付・回答済みです");
  const published = publishMaster(
    "wellbeing_response",
    {
      formType: target.formType,
      anonymous: target.anonymous,
      recordedBy: target.recordedBy,
      answers: target.answers,
      message: target.message,
      status: "received",
    },
    { supersedesId: target.id, vesselId: target.vesselId, actor, now },
  );
  writeAuditLog({
    action: "update",
    entityKind: "wellbeing_response",
    entityId: published.id,
    before: target.id,
    after: "状態 received",
    actor,
    now,
    summary: "匿名の相談を受付",
  });
  return published;
}

/* ═══════════════ 船内環境の整備状況・求人媒体向けの出力 ═══════════════ */

export interface VesselEnvironmentRow {
  vesselId: string;
  name: string;
  wifiAvailable: boolean | undefined;
  wifiNote: string | undefined;
  cabinType: string | undefined;
  amenities: string | undefined;
  verifiedOn: string | undefined;
  freshness: FreshnessState;
  daysSinceVerified: number | null;
  /** 求人票の設備欄に貼れるテキスト */
  jobPostingText: string;
}

/**
 * 求人媒体向けのテキスト。
 * 船員職業安定法の求人情報の**的確表示義務**（虚偽・誤解を招く表示の禁止、最新性の維持）に
 * 対応するため、「あり／なし」を曖昧にせず、確認日を必ず添える。
 */
export function wifiLabel(wifiAvailable: boolean | undefined): string {
  if (wifiAvailable === undefined) return "未登録";
  return wifiAvailable ? "船内 Wi-Fi あり" : "船内 Wi-Fi なし";
}

function buildJobPostingText(v: VesselMasterPayload): string {
  const lines = [
    `【船名】${v.name}${v.grossTonnage ? `（${v.grossTonnage}総トン）` : ""}`,
    `【航行区域】${v.navigationArea ?? "未登録"}`,
    // 「あり／なし」は必ず単独で言い切り、補足は別行にする（誤解を招く書き方を避ける）
    `【通信環境】${wifiLabel(v.wifiAvailable)}`,
    ...(v.wifiNote ? [`【通信環境の補足】${v.wifiNote}`] : []),
    `【居住環境】${v.cabinType ?? "未登録"}`,
    `【設備】${v.amenities ?? "未登録"}`,
    `【この情報の確認日】${v.environmentVerifiedOn ?? "未確認"}`,
  ];
  return lines.join("\n");
}

export function buildVesselEnvironments(now = new Date()): VesselEnvironmentRow[] {
  const today = todayLocal(now);
  return effective("vessel_master")
    .filter((v) => !v.retiredOn)
    .slice()
    .sort((a, b) => a.targetVesselId.localeCompare(b.targetVesselId))
    .map((v) => {
      const { state, daysSinceVerified } = freshnessOf(
        v.environmentVerifiedOn,
        today,
        rules.jobPostingFreshnessDays,
      );
      return {
        vesselId: v.targetVesselId,
        name: v.name,
        wifiAvailable: v.wifiAvailable,
        wifiNote: v.wifiNote,
        cabinType: v.cabinType,
        amenities: v.amenities,
        verifiedOn: v.environmentVerifiedOn,
        freshness: state,
        daysSinceVerified,
        jobPostingText: buildJobPostingText(v),
      } satisfies VesselEnvironmentRow;
    });
}

export { rules as wellbeingRules };
