import { evaluateCredentials, type CredentialStatus } from "@/domain/crew/freshness";
import { t } from "@/i18n/ja";
import {
  describeChanges,
  diffCrewMaster,
  normalizeField,
  SENSITIVE_CREW_FIELDS,
  type FieldChange,
} from "@/lib/crew-master-diff";
import { carryOverFields } from "@/lib/master-fields";
import { DEFAULT_CREDENTIAL_RULE_SET } from "@/rules/credential-rules";
import type {
  AuditLogPayload,
  CredentialCategory,
  CredentialPayload,
  CredentialVerifyMethod,
  CrewMasterPayload,
  InsuranceEntry,
  InsuranceKind,
} from "@/sync-protocol/records";
import { INSURANCE_KINDS } from "@/sync-protocol/records";
import {
  COMPANY_SCOPE_ID,
  credentialsOf,
  crewMasterOf,
  effective,
  history,
  listAuditLogs,
  publishMaster,
  todayLocal,
  writeAuditLog,
} from "./master-service";

/**
 * S-04 船員マスタ編集の業務サービス（要件定義書 3.1.1 / 3.1.3 / 12.2〜12.4 / 12.6）。
 *
 * ここが**船員マスタと資格・証書の唯一の更新経路**である（12.3「同一項目を複数画面から
 * 更新できる導線を設けない」）。S-02 一覧・S-03 カルテは参照のみで、この関数群を呼ばない。
 *
 * 書き込みはすべて `publishMaster`（追記型）を通し、訂正は `supersedesId` 付きの
 * 新規レコードで表す。原本は物理保持されるため、変更履歴がそのまま証跡になる（12.6）。
 * 併せて `writeAuditLog` を必ず1件積む。**要配慮個人情報は値を載せず項目名だけ**を記録する。
 */

/**
 * 変更点の組み立ては純関数（`@/lib/crew-master-diff`）に置き、ここでは呼ぶだけにする。
 * 要配慮個人情報を値ごと記録しない規則（12.6）を1か所で守るため。
 */
export { SENSITIVE_CREW_FIELDS, type FieldChange };

const norm = normalizeField;

/* ═══════════════ 参照（S-03 カルテ・S-04 の両方が使う） ═══════════════ */

/** その船員の証書の判定（12.4: 期限と鮮度を別軸で返す。判定は domain の純関数が行う） */
export function crewCredentialStatuses(crewMemberId: string, now = new Date()): CredentialStatus[] {
  return evaluateCredentials(
    credentialsOf("crew", crewMemberId),
    todayLocal(now),
    DEFAULT_CREDENTIAL_RULE_SET,
  );
}

/** 保険3種を区分の順に並べる（未登録の区分も欄として出すため空要素を補う） */
export function insuranceRowsOf(master: CrewMasterPayload | undefined): {
  kind: InsuranceKind;
  entry: InsuranceEntry | undefined;
}[] {
  return INSURANCE_KINDS.map((kind) => ({
    kind,
    entry: master?.insurances?.find((i) => i.kind === kind),
  }));
}

/* ═══════════════ 変更履歴（12.6 監査証跡） ═══════════════ */

export interface CrewMasterHistoryEntry {
  record: CrewMasterPayload;
  /** 同時に積まれた監査ログ（誰が・何を変えたか）。シード投入分は対応するログを持たない */
  audit?: AuditLogPayload;
  /** いま有効なレコードか */
  isCurrent: boolean;
}

/**
 * その船員の変更履歴（新しい順）。
 * 追記型ストアの crew_master レコードと監査ログを突き合わせ、
 * 「いつ・誰が・何を変えたか」を1つの並びで見せる。
 *
 * PoC の突き合わせ: 監査ログは publishMaster の直後に積まれるため、
 * 同じ船員あての監査ログのうち**発生時刻が最も近いもの**（既定 10 秒以内）を対応付ける。
 * 本番は監査ログにレコードIDを持たせて厳密に結ぶ。
 */
export function buildCrewMasterHistory(
  crewMemberId: string,
  matchWindowMs = 10_000,
): CrewMasterHistoryEntry[] {
  const records = history("crew_master").filter((r) => r.crewMemberId === crewMemberId);
  const currentId = crewMasterOf(crewMemberId)?.id;
  // 参照ログ（view_sensitive）は更新履歴ではないので突き合わせ対象から外す
  const logs = listAuditLogs(500).filter(
    (l) => l.entityKind === "crew_master" && l.entityId === crewMemberId && l.action === "update",
  );
  const used = new Set<string>();

  return records.map((record) => {
    const at = Date.parse(record.publishedAt ?? record.occurredAt);
    let best: AuditLogPayload | undefined;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const log of logs) {
      if (used.has(log.id)) continue;
      const diff = Math.abs(Date.parse(log.occurredAt) - at);
      if (diff <= matchWindowMs && diff < bestDiff) {
        best = log;
        bestDiff = diff;
      }
    }
    if (best) used.add(best.id);
    return { record, audit: best, isCurrent: record.id === currentId };
  });
}

/* ═══════════════ S-04 船員マスタの更新（唯一の更新経路） ═══════════════ */

export interface CrewMasterFormInput {
  name: string;
  nameKana?: string;
  birthDate: string;
  seamanBookNo?: string;
  address?: string;
  bloodType?: string;
  phone?: string;
  position?: string;
  employmentType?: string;
  hiredOn?: string;
  emergencyContactName?: string;
  emergencyContactRelation?: string;
  emergencyContactPhone?: string;
  familyNote?: string;
  /** 要配慮個人情報。権限が無い担当者の画面からは送られてこない */
  medicalHistory?: string;
  medication?: string;
  insurances: {
    kind: InsuranceKind;
    number?: string;
    acquiredOn?: string;
    lastVerifiedOn?: string;
    verifyMethod?: InsuranceEntry["verifyMethod"];
  }[];
}

export interface CrewMasterUpdateResult {
  published: CrewMasterPayload;
  changes: FieldChange[];
}

/**
 * 船員マスタを更新する（12.3 単一経路 / 12.6 監査証跡）。
 *
 * - 追記型のため**変更後の完全な姿**を配信し、原本は `supersedesId` で残す
 * - 年齢等の導出値は保存しない（12.3。画面が生年月日から算出して表示する）
 * - `canEditSensitive` が false のときは要配慮項目を**現在値のまま引き継ぐ**
 *   （権限の無い担当者の保存で値が消えないようにする）
 */
export function updateCrewMaster(input: {
  crewMemberId: string;
  form: CrewMasterFormInput;
  actor: string;
  canEditSensitive: boolean;
  now?: Date;
}): CrewMasterUpdateResult {
  const current = crewMasterOf(input.crewMemberId);
  if (!current) throw new Error("この船員のマスタが見つかりません。画面を開き直してください");
  const f = input.form;
  if (!norm(f.name)) throw new Error("氏名を入力してください");
  if (!norm(f.birthDate)) throw new Error("生年月日を入力してください");

  const insurances: InsuranceEntry[] = INSURANCE_KINDS.map((kind) => {
    const sent = f.insurances.find((i) => i.kind === kind);
    const kept = current.insurances?.find((i) => i.kind === kind);
    const number = norm(sent?.number);
    const lastVerifiedOn = norm(sent?.lastVerifiedOn);
    return {
      ...kept,
      kind,
      number,
      acquiredOn: norm(sent?.acquiredOn),
      lastVerifiedOn,
      verifyMethod: sent?.verifyMethod,
      // 確認日を入れ直したときは「誰が確認したか」も更新する（12.4）
      verifiedBy:
        lastVerifiedOn && lastVerifiedOn !== norm(kept?.lastVerifiedOn)
          ? input.actor
          : kept?.verifiedBy,
    };
  });

  const next: Record<string, unknown> = {
    ...carryOverFields(current as unknown as Record<string, unknown>),
    crewMemberId: input.crewMemberId,
    name: norm(f.name),
    nameKana: norm(f.nameKana),
    birthDate: norm(f.birthDate),
    seamanBookNo: norm(f.seamanBookNo),
    address: norm(f.address),
    bloodType: norm(f.bloodType),
    phone: norm(f.phone),
    position: norm(f.position),
    employmentType: norm(f.employmentType),
    hiredOn: norm(f.hiredOn),
    emergencyContactName: norm(f.emergencyContactName),
    emergencyContactRelation: norm(f.emergencyContactRelation),
    emergencyContactPhone: norm(f.emergencyContactPhone),
    familyNote: norm(f.familyNote),
    medicalHistory: input.canEditSensitive ? norm(f.medicalHistory) : current.medicalHistory,
    medication: input.canEditSensitive ? norm(f.medication) : current.medication,
    insurances,
  };

  const changes = diffCrewMaster(current, next);
  if (changes.length === 0) throw new Error("変更された項目がありません");

  const published = publishMaster("crew_master", next, {
    supersedesId: current.id,
    vesselId: COMPANY_SCOPE_ID,
    actor: input.actor,
    now: input.now,
  });

  writeAuditLog({
    action: "update",
    entityKind: "crew_master",
    entityId: input.crewMemberId,
    before: describeChanges(changes, "before"),
    after: describeChanges(changes, "after"),
    actor: input.actor,
    summary: `${current.name} の船員マスタを更新（${changes.length}項目: ${changes
      .map((c) => c.label)
      .join("・")}）`,
    now: input.now,
  });

  return { published, changes };
}

/* ═══════════════ 資格・証書（12.4 鮮度管理の解消操作を含む） ═══════════════ */

export interface CredentialFormInput {
  category: CredentialCategory;
  name: string;
  grade?: string;
  number?: string;
  issuedOn?: string;
  expiresOn?: string;
  issuer?: string;
  lastVerifiedOn?: string;
  verifyMethod?: CredentialVerifyMethod;
  attachmentName?: string;
}

/** 証書を1件登録する（新規。訂正は correctCredential） */
export function createCredential(input: {
  crewMemberId: string;
  form: CredentialFormInput;
  actor: string;
  now?: Date;
}): CredentialPayload {
  if (!norm(input.form.name)) throw new Error("証書の名称を入力してください");
  const published = publishMaster(
    "credential",
    {
      subjectType: "crew",
      subjectId: input.crewMemberId,
      category: input.form.category,
      name: norm(input.form.name),
      grade: norm(input.form.grade),
      number: norm(input.form.number),
      issuedOn: norm(input.form.issuedOn),
      expiresOn: norm(input.form.expiresOn),
      issuer: norm(input.form.issuer),
      lastVerifiedOn: norm(input.form.lastVerifiedOn),
      verifyMethod: input.form.verifyMethod,
      verifiedBy: norm(input.form.lastVerifiedOn) ? input.actor : undefined,
      attachmentName: norm(input.form.attachmentName),
    },
    { vesselId: COMPANY_SCOPE_ID, actor: input.actor, now: input.now },
  );

  writeAuditLog({
    action: "create",
    entityKind: "credential",
    entityId: published.id,
    after: `${t.credentialCategory[published.category] ?? published.category}: ${published.name}`,
    actor: input.actor,
    summary: `${published.name} を登録（対象: ${input.crewMemberId}）`,
    now: input.now,
  });
  return published;
}

/**
 * 「原本を確認した」操作（12.4 鮮度管理の解消）。
 *
 * 最終確認日を今日に更新した**新しいレコード**を配信し、旧レコードは訂正チェーンに残す。
 * これで `evaluateCredential` の freshness が "fresh" に戻り、
 * 期限（不適合）とは別軸の「要再確認」が解消される。
 */
export function verifyCredentialOriginal(input: {
  credentialId: string;
  actor: string;
  verifyMethod?: CredentialVerifyMethod;
  now?: Date;
}): CredentialPayload {
  const now = input.now ?? new Date();
  const current = effective("credential").find((c) => c.id === input.credentialId);
  if (!current) throw new Error("この証書は既に更新・取り消し済みです。画面を開き直してください");
  const today = todayLocal(now);
  const method = input.verifyMethod ?? "original";

  const published = publishMaster(
    "credential",
    {
      ...carryOverFields(current as unknown as Record<string, unknown>),
      lastVerifiedOn: today,
      verifyMethod: method,
      verifiedBy: input.actor,
    },
    { supersedesId: current.id, vesselId: COMPANY_SCOPE_ID, actor: input.actor, now },
  );

  writeAuditLog({
    action: "update",
    entityKind: "credential",
    entityId: published.id,
    before: `最終確認日: ${current.lastVerifiedOn ?? "（未確認）"}`,
    after: `最終確認日: ${today} / 確認方法: ${t.verifyMethod[method] ?? method}`,
    actor: input.actor,
    summary: `${current.name} の原本を確認（最終確認日を ${today} に更新）`,
    now,
  });
  return published;
}

/* ═══════════════ 10.3 要配慮個人情報の参照ログ ═══════════════ */

/**
 * 要配慮個人情報（既往歴・服薬状況）を**表示した**ことを記録する。
 * 10.3「アクセスログを必須とする」/ 12.6「更新だけでなく参照についても記録する」。
 * 値そのものはログに載せない。
 */
export function logSensitiveView(input: {
  crewMemberId: string;
  crewName: string;
  actor: string;
  screen: string;
  now?: Date;
}): void {
  writeAuditLog({
    action: "view_sensitive",
    entityKind: "crew_master",
    entityId: input.crewMemberId,
    after: SENSITIVE_CREW_FIELDS.map((k) => t.crewMasterField[k] ?? k).join("・"),
    actor: input.actor,
    summary: `${input.crewName} の要配慮情報（既往歴・服薬状況）を ${input.screen} で表示`,
    now: input.now,
  });
}
