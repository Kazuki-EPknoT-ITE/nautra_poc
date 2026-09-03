import { z } from "zod";

/**
 * マスタ・計画・事務エンティティの同期ペイロード定義
 * （要件定義書 3.1 / 3.4 / 3.5 / 3.6 / 3.7 / 3.8 / 3.9 / 6.2 / 9章 / 12章）。
 *
 * 設計の要点:
 * - **すべて追記専用**。訂正は supersedesId 付きの新規レコードで表し、原本は物理保持する
 *   （要件定義書 12.3・12.6 監査証跡。マスタも「変更前後が追える」ことを満たす）。
 * - **正本の所在を型で表す**（12.2）。アプリが正本を持つもの（船員基本情報・船舶マスタ）と、
 *   外部に正本がある写し（免状・健診・修了証・保険・検査証書）を `credential` に分離し、
 *   写しには **最終確認日・確認方法・確認者** を持たせる（12.4 鮮度管理）。
 * - **導出値は持たない**（12.3）。年齢・配乗可否・残日数・期限接近・着手期限は保持せず、
 *   `src/domain/crew/manning.ts` ほかの純関数で算出する。
 * - 未知フィールドは passthrough で往復保全する（基本設計書 8.6）。
 */

/** マスタ系に共通する列（発行元・記録者・訂正チェーン） */
const masterBase = {
  id: z.string(),
  tenantId: z.string(),
  /** 船舶に紐づかないマスタ（船員・事業者）は事業者共通の擬似船舶IDを入れる */
  vesselId: z.string(),
  occurredAt: z.string(),
  recordedAt: z.string().optional(),
  recordedBy: z.string(),
  deviceId: z.string(),
  supersedesId: z.string().optional(),
  note: z.string().optional(),
  /** 配信日時・配信者（陸上正本のマスタは配信で船内へ届く） */
  publishedAt: z.string(),
  publishedBy: z.string(),
};

/* ═══════════════ 3.1.1 船員マスタ（アプリが正本） ═══════════════ */

export const INSURANCE_KINDS = ["seamen", "workers_accident", "employment"] as const;
export type InsuranceKind = (typeof INSURANCE_KINDS)[number];

/** 保険の加入状況（正本は日本年金機構・協会けんぽ・ハローワーク。写し＋最終確認日を持つ） */
export const insuranceEntrySchema = z
  .object({
    kind: z.enum(INSURANCE_KINDS),
    /** 記号番号 */
    number: z.string().optional(),
    /** 資格取得日 */
    acquiredOn: z.string().optional(),
    /** 最終確認日（12.4 鮮度管理。有効期限とは別に持つ） */
    lastVerifiedOn: z.string().optional(),
    verifyMethod: z.enum(["document", "notice", "external_link"]).optional(),
    verifiedBy: z.string().optional(),
  })
  .passthrough();
export type InsuranceEntry = z.infer<typeof insuranceEntrySchema>;

export const crewMasterPayloadSchema = z
  .object({
    ...masterBase,
    crewMemberId: z.string(),
    name: z.string(),
    nameKana: z.string().optional(),
    birthDate: z.string(),
    /** 船員手帳番号 */
    seamanBookNo: z.string().optional(),
    address: z.string().optional(),
    bloodType: z.string().optional(),
    phone: z.string().optional(),
    /** 顔写真（PoC はイニシャル文字。本番は署名付きURL） */
    photo: z.string().optional(),
    position: z.string().optional(),
    role: z.string().optional(),
    /** 雇入契約情報 */
    employmentType: z.string().optional(),
    hiredOn: z.string().optional(),
    /** 緊急連絡先 */
    emergencyContactName: z.string().optional(),
    emergencyContactRelation: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
    familyNote: z.string().optional(),
    /** ── 要配慮個人情報（10.3: 閲覧権限を細分化し、参照もアクセスログに残す） ── */
    medicalHistory: z.string().optional(),
    medication: z.string().optional(),
    /** 保険加入状況（写し。最終確認日つき） */
    insurances: z.array(insuranceEntrySchema).optional(),
    /** 退職・登録抹消 */
    retiredOn: z.string().optional(),
  })
  .passthrough();
export type CrewMasterPayload = z.infer<typeof crewMasterPayloadSchema>;

/* ═══════════════ 3.1.3 / 3.9 / 3.4.2 資格・証書の写し（外部に正本） ═══════════════ */

export const CREDENTIAL_CATEGORIES = [
  "license", // 海技免状（航海・機関）
  "small_craft", // 小型船舶操縦士免許
  "radio_operator", // 無線従事者資格
  "medical", // 健康証明書・健康診断
  "stcw_basic", // STCW 基本訓練修了証
  "stcw_practical", // 登録実技講習 修了証
  "endorsement", // 航海当直部員・危険物等取扱責任者・特定海域運航責任者の認定
  "vessel_survey", // 船舶検査証書（定期・中間）
  "radio_station", // 無線局免許
  "other",
] as const;
export type CredentialCategory = (typeof CREDENTIAL_CATEGORIES)[number];

export const CREDENTIAL_VERIFY_METHODS = ["original", "document", "notice", "external_link"] as const;
export type CredentialVerifyMethod = (typeof CREDENTIAL_VERIFY_METHODS)[number];

export const credentialPayloadSchema = z
  .object({
    ...masterBase,
    /** 資格の帰属先。船員の免状・健診と、船舶の検査証書を同じ「写し＋鮮度」で扱う */
    subjectType: z.enum(["crew", "vessel"]),
    subjectId: z.string(),
    category: z.enum(CREDENTIAL_CATEGORIES),
    /** 表示名（例: 四級海技士（航海）） */
    name: z.string(),
    /** 等級・種別 */
    grade: z.string().optional(),
    number: z.string().optional(),
    /** 交付・修了日 */
    issuedOn: z.string().optional(),
    /** 有効期限（修了証など期限のないものは省略） */
    expiresOn: z.string().optional(),
    /** 発行・登録機関（登録実技講習機関名を含む） */
    issuer: z.string().optional(),
    /** ── 12.4 鮮度管理: 有効期限とは別に「いつ・どうやって確認したか」を持つ ── */
    lastVerifiedOn: z.string().optional(),
    verifyMethod: z.enum(CREDENTIAL_VERIFY_METHODS).optional(),
    verifiedBy: z.string().optional(),
    /** 写しの添付（PoC はファイル名のみ。本番は署名付きURL） */
    attachmentName: z.string().optional(),
    /** 失効・返納した写しを無効にする（削除ではなく状態で表す） */
    revoked: z.boolean().optional(),
  })
  .passthrough();
export type CredentialPayload = z.infer<typeof credentialPayloadSchema>;

/* ═══════════════ 3.1.2 乗下船イベント ═══════════════ */

export const embarkationPayloadSchema = z
  .object({
    ...masterBase,
    crewMemberId: z.string(),
    /** 乗船 / 下船 */
    eventType: z.enum(["on", "off"]),
    /** 対象船舶（配乗の対象として明示する） */
    targetVesselId: z.string(),
    date: z.string(),
    /** 職務（船長・一等航海士 等） */
    duty: z.string().optional(),
    /** 雇入契約の種別（成立・更新・変更・終了） */
    contractType: z.enum(["start", "renew", "change", "end"]).optional(),
    /** 予定 / 実績 */
    status: z.enum(["planned", "actual"]).default("planned"),
    /** 配乗計画時に検出したブロック事由（記録時点の証跡。判定自体は導出） */
    blockNoteAtPlanning: z.string().optional(),
  })
  .passthrough();
export type EmbarkationPayload = z.infer<typeof embarkationPayloadSchema>;

/* ═══════════════ 3.1.5 業務態度評価・人事考課 ═══════════════ */

export const EVALUATION_ITEMS = [
  "job_skill", // 職務遂行能力（操船技術・機関管理・荷役技能）
  "safety", // 安全意識（点検実施・報告の正確性）
  "teamwork", // 協調性・コミュニケーション
  "discipline", // 責任感・規律遵守
  "growth", // 改善意欲・学習姿勢
] as const;
export type EvaluationItem = (typeof EVALUATION_ITEMS)[number];

export const evaluationPayloadSchema = z
  .object({
    ...masterBase,
    crewMemberId: z.string(),
    /** 評価対象期間 */
    periodFrom: z.string(),
    periodTo: z.string(),
    /** 5段階（1〜5）。テンプレート化により評価基準の属人性を下げる */
    scores: z.record(z.string(), z.number()),
    comment: z.string().optional(),
    evaluatedBy: z.string(),
    /** 本人開示の可否（3.1.5 運用上の留意: 本人開示ルールを定める） */
    disclosedToCrew: z.boolean().default(false),
  })
  .passthrough();
export type EvaluationPayload = z.infer<typeof evaluationPayloadSchema>;

/* ═══════════════ 3.2.4 休日・有給休暇・補償休日 ═══════════════ */

export const LEAVE_KINDS = ["statutory_holiday", "compensatory", "paid_leave", "special"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];

export const leaveRecordPayloadSchema = z
  .object({
    ...masterBase,
    crewMemberId: z.string(),
    kind: z.enum(LEAVE_KINDS),
    /** 付与 / 取得 */
    action: z.enum(["grant", "take"]),
    /** 取得日（付与の場合は付与日） */
    date: z.string(),
    /** 日数（半日取得を許すため小数） */
    days: z.number(),
    /** 付与の有効期限（有給の時効） */
    expiresOn: z.string().optional(),
    reason: z.string().optional(),
    /** 付与・編集は管理者権限のみ（3.2.4）。実施者を証跡として残す */
    grantedBy: z.string().optional(),
  })
  .passthrough();
export type LeaveRecordPayload = z.infer<typeof leaveRecordPayloadSchema>;

/* ═══════════════ 3.4 / 3.7 / 3.5.3 船舶マスタ ═══════════════ */

export const vesselMasterPayloadSchema = z
  .object({
    ...masterBase,
    targetVesselId: z.string(),
    name: z.string(),
    /** 総トン数 */
    grossTonnage: z.number().optional(),
    imoNumber: z.string().optional(),
    /** AIS の識別子（3.7.1） */
    mmsi: z.string().optional(),
    /** 航行区域（基準労働期間の決定に使う。3.2.4） */
    navigationArea: z.string().optional(),
    /** 基準労働期間の日数（1月〜1年。週平均40時間の算定単位。3.2.4） */
    referencePeriodDays: z.number().optional(),
    /** 法定定員 */
    requiredCrew: z.number().optional(),
    builtOn: z.string().optional(),
    /** ── 3.5.3 快適な船内職場環境（2026-05-13 施行の努力義務）＋ 求人の的確表示 ── */
    wifiAvailable: z.boolean().optional(),
    wifiNote: z.string().optional(),
    cabinType: z.string().optional(),
    amenities: z.string().optional(),
    /** 環境情報の確認日（求人の的確表示義務は「最新性の維持」を求めるため） */
    environmentVerifiedOn: z.string().optional(),
    retiredOn: z.string().optional(),
  })
  .passthrough();
export type VesselMasterPayload = z.infer<typeof vesselMasterPayloadSchema>;

/* ═══════════════ 3.4.1 定期保守計画・部品在庫 ═══════════════ */

export const maintenancePlanPayloadSchema = z
  .object({
    ...masterBase,
    targetVesselId: z.string(),
    /** 対象機器（records.ts の EQUIPMENT_KINDS と同じ語彙） */
    equipment: z.string(),
    /** 作業内容（注油・フィルター交換・塗装 等） */
    task: z.string(),
    /** 周期（日） */
    intervalDays: z.number(),
    /** 前回実施日（実績は maintenance_record 側。ここは計画の基準日） */
    lastDoneOn: z.string().optional(),
    /** 稼働時間基準の保守（時間で管理する機器） */
    intervalHours: z.number().optional(),
    responsible: z.string().optional(),
    active: z.boolean().default(true),
  })
  .passthrough();
export type MaintenancePlanPayload = z.infer<typeof maintenancePlanPayloadSchema>;

export const partStockPayloadSchema = z
  .object({
    ...masterBase,
    targetVesselId: z.string(),
    partName: z.string(),
    partNo: z.string().optional(),
    equipment: z.string().optional(),
    unit: z.string().optional(),
    /** 現在庫数 */
    quantity: z.number(),
    /** 発注点（下回ったら発注） */
    minQuantity: z.number().optional(),
    orderStatus: z.enum(["none", "requested", "ordered", "delivered"]).optional(),
    orderedOn: z.string().optional(),
    supplier: z.string().optional(),
  })
  .passthrough();
export type PartStockPayload = z.infer<typeof partStockPayloadSchema>;

/* ═══════════════ 3.4.2 ドック入渠・検査対応 ═══════════════ */

export const DOCK_KINDS = ["periodic", "intermediate", "occasional", "repair"] as const;
export type DockKind = (typeof DOCK_KINDS)[number];

export const dockPlanPayloadSchema = z
  .object({
    ...masterBase,
    targetVesselId: z.string(),
    kind: z.enum(DOCK_KINDS),
    title: z.string(),
    plannedFrom: z.string(),
    plannedTo: z.string().optional(),
    shipyard: z.string().optional(),
    status: z.enum(["planned", "in_progress", "done"]).default("planned"),
    /** 入渠前の準備タスク */
    prepTasks: z
      .array(z.object({ key: z.string(), label: z.string(), done: z.boolean() }).passthrough())
      .optional(),
    /** 検査の指摘事項と対応履歴 */
    findings: z
      .array(
        z
          .object({
            key: z.string(),
            content: z.string(),
            dueOn: z.string().optional(),
            status: z.enum(["open", "in_progress", "closed"]),
            action: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
export type DockPlanPayload = z.infer<typeof dockPlanPayloadSchema>;

/* ═══════════════ 3.5.1 安全管理システム（SMS） ═══════════════ */

export const SMS_DOC_KINDS = ["policy", "risk_assessment", "nonconformity", "internal_audit"] as const;
export type SmsDocKind = (typeof SMS_DOC_KINDS)[number];

export const smsDocumentPayloadSchema = z
  .object({
    ...masterBase,
    kind: z.enum(SMS_DOC_KINDS),
    title: z.string(),
    body: z.string().optional(),
    /** リスクアセスメント: 影響度 × 発生度（1〜5） */
    severity: z.number().optional(),
    likelihood: z.number().optional(),
    /** 不適合・監査所見の是正措置 */
    correctiveAction: z.string().optional(),
    dueOn: z.string().optional(),
    status: z.enum(["open", "in_progress", "closed"]).optional(),
    responsible: z.string().optional(),
    /** 内部監査の実施日・監査員 */
    auditedOn: z.string().optional(),
    auditor: z.string().optional(),
  })
  .passthrough();
export type SmsDocumentPayload = z.infer<typeof smsDocumentPayloadSchema>;

/* ═══════════════ 3.5.2 事故・インシデント報告（船内が正本＝一次記録） ═══════════════ */

export const INCIDENT_KINDS = [
  "accident", // 海難事故
  "near_miss", // ヒヤリハット
  "injury", // 死傷病
  "equipment", // 設備損傷
  "pollution", // 油濁・排出
  "container_loss", // コンテナ海中転落（付近船舶等への通報記録）
  "other",
] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export const incidentReportPayloadSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    vesselId: z.string(),
    occurredAt: z.string(),
    recordedAt: z.string().optional(),
    recordedBy: z.string(),
    deviceId: z.string(),
    supersedesId: z.string().optional(),
    note: z.string().optional(),
    kind: z.enum(INCIDENT_KINDS),
    title: z.string(),
    /** 発生場所・状況 */
    location: z.string().optional(),
    description: z.string(),
    /** 負傷者・被害 */
    injured: z.string().optional(),
    damage: z.string().optional(),
    /** 原因分析・再発防止策 */
    cause: z.string().optional(),
    preventiveAction: z.string().optional(),
    /** 行政機関への報告（海難等の報告・死傷病報告） */
    reportedToAuthority: z.boolean().optional(),
    authorityReportedOn: z.string().optional(),
    /**
     * 付近船舶等への通報（コンテナ海中転落時。要件定義書 3.5.2）。
     * 「通報したか」だけでなく**いつ通報したか**を残す。転落から通報までの時間が
     * 事後の検証で問われるため、日時が無いと記録として用を成さない。
     */
    notifiedNearbyShips: z.boolean().optional(),
    notifiedNearbyShipsAt: z.string().optional(),
    status: z.enum(["open", "investigating", "closed"]).default("open"),
    /** 関連する航海日誌レコードID（報告書ドラフトの引用元。6.5） */
    voyageLogId: z.string().optional(),
  })
  .passthrough();
export type IncidentReportPayload = z.infer<typeof incidentReportPayloadSchema>;

/* ═══════════════ 3.5.3 健康アンケート・ハラスメント相談（V-10。匿名可） ═══════════════ */

export const WELLBEING_FORM_TYPES = ["health_survey", "stress_check", "consultation"] as const;
export type WellbeingFormType = (typeof WELLBEING_FORM_TYPES)[number];

export const wellbeingResponsePayloadSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    vesselId: z.string(),
    occurredAt: z.string(),
    recordedAt: z.string().optional(),
    /** 匿名時は "anonymous" を入れる（本人を特定できる値を載せない） */
    recordedBy: z.string(),
    deviceId: z.string(),
    supersedesId: z.string().optional(),
    note: z.string().optional(),
    formType: z.enum(WELLBEING_FORM_TYPES),
    anonymous: z.boolean().default(true),
    /** 定期アンケート・ストレスチェックの回答（項目キー → 1〜5） */
    answers: z.record(z.string(), z.number()).optional(),
    /** 相談・通報の本文 */
    message: z.string().optional(),
    /** 陸上の相談窓口の対応状況 */
    status: z.enum(["submitted", "received", "responded"]).default("submitted"),
    respondedAt: z.string().optional(),
    response: z.string().optional(),
  })
  .passthrough();
export type WellbeingResponsePayload = z.infer<typeof wellbeingResponsePayloadSchema>;

/* ═══════════════ 3.8 一括届出・行政手続 ═══════════════ */

export const FILING_TYPES = ["hire", "discharge", "renew", "change"] as const;
export type FilingType = (typeof FILING_TYPES)[number];

/** 6.3 の「3つの提出方式」（①紙 ②電子届出 ③一括届出（登録届出）） */
export const FILING_METHODS = ["paper", "electronic", "bulk_electronic"] as const;
export type FilingMethod = (typeof FILING_METHODS)[number];

export const filingPayloadSchema = z
  .object({
    ...masterBase,
    filingType: z.enum(FILING_TYPES),
    /** 一括届出: 複数船員・複数船舶を1件で扱う */
    targets: z.array(
      z
        .object({
          crewMemberId: z.string(),
          targetVesselId: z.string(),
          duty: z.string().optional(),
          effectiveOn: z.string(),
        })
        .passthrough(),
    ),
    method: z.enum(FILING_METHODS),
    status: z.enum(["draft", "checked", "documents_ready", "submitted", "accepted"]).default("draft"),
    /** 添付要件チェックの実施日時（判定結果は導出。ここは実施の証跡） */
    checkedAt: z.string().optional(),
    submittedOn: z.string().optional(),
    /** 提出先の運輸局・市町村窓口 */
    office: z.string().optional(),
    /** 生成した書類（generated_document の ID） */
    documentIds: z.array(z.string()).optional(),
    /** 船員手帳の記帳情報（電子記録。2026-05 以降は電子証明へ接続） */
    seamanBookEntries: z
      .array(
        z
          .object({
            crewMemberId: z.string(),
            vesselName: z.string(),
            duty: z.string().optional(),
            onDate: z.string().optional(),
            offDate: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
export type FilingPayload = z.infer<typeof filingPayloadSchema>;

/* ═══════════════ 6.2 手続きインベントリ（A/B/C/D 群）・期限管理 ═══════════════ */

export const PROCEDURE_GROUPS = ["A", "B", "C", "D"] as const;
export type ProcedureGroup = (typeof PROCEDURE_GROUPS)[number];

export const procedureTaskPayloadSchema = z
  .object({
    ...masterBase,
    group: z.enum(PROCEDURE_GROUPS),
    title: z.string(),
    /** 根拠法令・様式 */
    basis: z.string().optional(),
    /** 対象（船員・船舶・事業者） */
    subjectType: z.enum(["crew", "vessel", "company"]),
    subjectId: z.string().optional(),
    /** 提出期限 */
    dueOn: z.string().optional(),
    /**
     * 準備リードタイム（日）。着手期限 = dueOn - leadTimeDays（6.6②）。
     * 着手期限そのものは導出値なので保持しない。
     */
    leadTimeDays: z.number().optional(),
    status: z.enum(["open", "in_progress", "done", "canceled"]).default("open"),
    doneOn: z.string().optional(),
    responsible: z.string().optional(),
    /** イベント駆動の連鎖生成（6.6①）で作られた場合の起点イベント */
    sourceEventId: z.string().optional(),
  })
  .passthrough();
export type ProcedureTaskPayload = z.infer<typeof procedureTaskPayloadSchema>;

/* ═══════════════ 3.9 訓練・教育の受講手配 ═══════════════ */

export const TRAINING_KINDS = [
  "stcw_basic",
  "stcw_practical",
  "license_renewal",
  "internal",
  "other",
] as const;
export type TrainingKind = (typeof TRAINING_KINDS)[number];

export const trainingPlanPayloadSchema = z
  .object({
    ...masterBase,
    crewMemberId: z.string(),
    trainingKind: z.enum(TRAINING_KINDS),
    title: z.string(),
    /** 登録実技講習機関名 */
    institution: z.string().optional(),
    scheduledOn: z.string().optional(),
    status: z.enum(["needed", "arranged", "completed", "canceled"]).default("needed"),
    /** 完了時に発行された修了証（credential）のID */
    credentialId: z.string().optional(),
    /** 教材・手順書の配信（3.9 主要機能④） */
    materialName: z.string().optional(),
    materialBody: z.string().optional(),
  })
  .passthrough();
export type TrainingPlanPayload = z.infer<typeof trainingPlanPayloadSchema>;

/* ═══════════════ 3.6 陸上事務（傭船・請求・経費・給与・補助金） ═══════════════ */

export const charterContractPayloadSchema = z
  .object({
    ...masterBase,
    targetVesselId: z.string(),
    counterparty: z.string(),
    contractType: z.enum(["time_charter", "voyage_charter", "bareboat"]),
    from: z.string(),
    to: z.string().optional(),
    /** 用船料 */
    rate: z.number().optional(),
    rateUnit: z.string().optional(),
    status: z.enum(["active", "expired", "terminated"]).default("active"),
    terms: z.string().optional(),
  })
  .passthrough();
export type CharterContractPayload = z.infer<typeof charterContractPayloadSchema>;

export const invoicePayloadSchema = z
  .object({
    ...masterBase,
    /** 請求番号（インボイス制度の登録番号は事業者設定側に持つ） */
    invoiceNo: z.string(),
    counterparty: z.string(),
    contractId: z.string().optional(),
    periodFrom: z.string().optional(),
    periodTo: z.string().optional(),
    issuedOn: z.string(),
    dueOn: z.string().optional(),
    amount: z.number(),
    taxAmount: z.number().optional(),
    status: z.enum(["draft", "issued", "paid", "overdue"]).default("draft"),
    paidOn: z.string().optional(),
    /** 電子帳簿保存法: 保存要件を満たす原本の識別 */
    archiveRef: z.string().optional(),
  })
  .passthrough();
export type InvoicePayload = z.infer<typeof invoicePayloadSchema>;

export const EXPENSE_KINDS = ["fuel", "port", "repair", "supply", "other"] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];

export const expensePayloadSchema = z
  .object({
    ...masterBase,
    targetVesselId: z.string().optional(),
    kind: z.enum(EXPENSE_KINDS),
    title: z.string(),
    amount: z.number(),
    spentOn: z.string(),
    supplier: z.string().optional(),
    receiptRef: z.string().optional(),
  })
  .passthrough();
export type ExpensePayload = z.infer<typeof expensePayloadSchema>;

export const payrollPayloadSchema = z
  .object({
    ...masterBase,
    crewMemberId: z.string(),
    /** 対象月 YYYY-MM */
    month: z.string(),
    baseAmount: z.number(),
    /** 船員特有の手当（航海日当・乗船手当 等）。名称 → 金額 */
    allowances: z.record(z.string(), z.number()).optional(),
    /** 時間外の対象時間（分）。まるめ設定を適用した後の値 */
    overtimeMinutes: z.number().optional(),
    overtimeAmount: z.number().optional(),
    deductions: z.record(z.string(), z.number()).optional(),
    /** 給与連携のまるめ単位（分）。適用値を証跡として保持する */
    roundingUnitMinutes: z.number().optional(),
    status: z.enum(["draft", "confirmed", "paid"]).default("draft"),
  })
  .passthrough();
export type PayrollPayload = z.infer<typeof payrollPayloadSchema>;

export const subsidyPayloadSchema = z
  .object({
    ...masterBase,
    title: z.string(),
    category: z.enum(["subsidy", "coastal_shipping_filing", "labor_inspection", "other"]),
    authority: z.string().optional(),
    appliedOn: z.string().optional(),
    dueOn: z.string().optional(),
    amount: z.number().optional(),
    status: z.enum(["preparing", "applied", "approved", "rejected", "done"]).default("preparing"),
    body: z.string().optional(),
  })
  .passthrough();
export type SubsidyPayload = z.infer<typeof subsidyPayloadSchema>;

/* ═══════════════ 3.7 配船・位置情報 ═══════════════ */

export const vesselPositionPayloadSchema = z
  .object({
    ...masterBase,
    targetVesselId: z.string(),
    /**
     * 取得元（AIS 配信サービス / スマホGPS / 手入力）。
     * 無償 AIS は可用性・品質の SLA がないため参考情報と位置づけ、
     * 商用 API へ差替え可能なアダプタとして扱う（3.7.1 留意点）。
     */
    source: z.enum(["ais", "gps", "manual"]),
    lat: z.number(),
    lon: z.number(),
    speedKnots: z.number().optional(),
    courseDeg: z.number().optional(),
    navStatus: z.enum(["underway", "moored", "cargo_ops", "anchored", "unknown"]).optional(),
    destination: z.string().optional(),
    eta: z.string().optional(),
    /** 取得日時（鮮度の判定に使う） */
    observedAt: z.string(),
  })
  .passthrough();
export type VesselPositionPayload = z.infer<typeof vesselPositionPayloadSchema>;

export const voyageSchedulePayloadSchema = z
  .object({
    ...masterBase,
    targetVesselId: z.string(),
    voyageNo: z.string().optional(),
    departurePort: z.string(),
    arrivalPort: z.string(),
    departureAt: z.string(),
    arrivalAt: z.string(),
    cargoKind: z.string().optional(),
    quantity: z.string().optional(),
    counterparty: z.string().optional(),
    status: z.enum(["planned", "fixed", "in_progress", "done", "canceled"]).default("planned"),
    /** 配船検討時のメモ（燃料・潮汐・港湾混雑の考慮） */
    planningNote: z.string().optional(),
  })
  .passthrough();
export type VoyageSchedulePayload = z.infer<typeof voyageSchedulePayloadSchema>;

/* ═══════════════ 9章 帳票・S-14 出力センター ═══════════════ */

export const DOCUMENT_KINDS = [
  "labor_ledger", // 労務管理記録簿（第16号の5書式）
  "hire_filing", // 雇入（雇止）届出書（第六号書式）
  "change_filing", // 雇入契約変更（更新）届出書
  "crew_list", // クルーリスト（海員名簿第六表）
  "crew_register", // 海員名簿
  "bulk_permit", // 一括届出許可申請書・電子届出登録申請書
  "electronic_filing_xlsx", // 電子届出用 雇入（止）届出書（Excel様式）
  "opinion_statement", // 意見陳述書（オペレーター宛）
  "labor_agreement", // 時間外労働等の労使協定書
  "operation_report", // 運航実績レポート・月次報告書
  "drill_record_doc", // 操練（訓練）実施記録
  "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const generatedDocumentPayloadSchema = z
  .object({
    ...masterBase,
    kind: z.enum(DOCUMENT_KINDS),
    title: z.string(),
    /** 対象（船員・船舶・月 等） */
    subjectLabel: z.string().optional(),
    /**
     * 生成時点のスナップショット（12.3: 提出物は以後マスタが更新されても書き換えない）。
     * PoC は行データを保持し、画面が印刷用に整形する。本番は PDF/Excel の実体を保管する。
     */
    snapshot: z.unknown().optional(),
    format: z.enum(["pdf", "xlsx", "csv", "html"]).default("html"),
    generatedOn: z.string(),
    /** 提出記録 */
    submittedOn: z.string().optional(),
    submittedTo: z.string().optional(),
    filingId: z.string().optional(),
  })
  .passthrough();
export type GeneratedDocumentPayload = z.infer<typeof generatedDocumentPayloadSchema>;

/* ═══════════════ 6.5 労使協定・就業規則の版管理 ═══════════════ */

export const agreementPayloadSchema = z
  .object({
    ...masterBase,
    kind: z.enum(["labor_agreement", "work_rules"]),
    title: z.string(),
    version: z.string(),
    /** 運輸局への届出日・適用期間（12.2: 届出済みの版が正本） */
    filedOn: z.string().optional(),
    effectiveFrom: z.string(),
    effectiveTo: z.string().optional(),
    /**
     * 協定内容 → アラート閾値への自動反映（6.5）。
     * ここで指定した値が労働時間ルールセットを上書きし、
     * 判定結果には上書き後の版が記録される。
     */
    overrideValues: z
      .object({
        dailyMaxMinutes: z.number().optional(),
        weeklyMaxMinutes: z.number().optional(),
        restMinDailyMinutes: z.number().optional(),
        restLongestMinMinutes: z.number().optional(),
        restSplitMax: z.number().optional(),
        monthlyOvertimeMaxMinutes: z.number().optional(),
        referencePeriodDays: z.number().optional(),
        restDaysPerWeek: z.number().optional(),
      })
      .passthrough()
      .optional(),
    body: z.string().optional(),
  })
  .passthrough();
export type AgreementPayload = z.infer<typeof agreementPayloadSchema>;

/* ═══════════════ 12.6 監査証跡 ═══════════════ */

export const auditLogPayloadSchema = z
  .object({
    ...masterBase,
    action: z.enum(["create", "update", "view_sensitive", "export", "sign_in", "sign_out"]),
    /** 対象エンティティ種別・ID */
    entityKind: z.string(),
    entityId: z.string().optional(),
    /** 変更前後の値（更新時。要配慮情報は値を載せず項目名のみ） */
    before: z.string().optional(),
    after: z.string().optional(),
    /** 変更経路（12.6: 陸上／船内／外部連携を区別する） */
    channel: z.enum(["shore", "vessel", "external"]),
    actor: z.string(),
    /** 外部システム連携で自動更新された項目の連携元 */
    externalSource: z.string().optional(),
    summary: z.string().optional(),
  })
  .passthrough();
export type AuditLogPayload = z.infer<typeof auditLogPayloadSchema>;

/* ═══════════════ レジストリへ渡す対応表 ═══════════════ */

/**
 * マスタ・事務エンティティのスキーマ表。
 * `records.ts` の RECORD_PAYLOAD_SCHEMAS に統合され、
 * `events.ts` の SYNC_ENTITY_REGISTRY に競合ポリシーつきで登録される（ガードレール⑨）。
 */
export const MASTER_PAYLOAD_SCHEMAS = {
  crew_master: crewMasterPayloadSchema,
  credential: credentialPayloadSchema,
  embarkation: embarkationPayloadSchema,
  evaluation: evaluationPayloadSchema,
  leave_record: leaveRecordPayloadSchema,
  vessel_master: vesselMasterPayloadSchema,
  maintenance_plan: maintenancePlanPayloadSchema,
  part_stock: partStockPayloadSchema,
  dock_plan: dockPlanPayloadSchema,
  sms_document: smsDocumentPayloadSchema,
  incident_report: incidentReportPayloadSchema,
  wellbeing_response: wellbeingResponsePayloadSchema,
  filing: filingPayloadSchema,
  procedure_task: procedureTaskPayloadSchema,
  training_plan: trainingPlanPayloadSchema,
  charter_contract: charterContractPayloadSchema,
  invoice: invoicePayloadSchema,
  expense: expensePayloadSchema,
  payroll: payrollPayloadSchema,
  subsidy: subsidyPayloadSchema,
  vessel_position: vesselPositionPayloadSchema,
  voyage_schedule: voyageSchedulePayloadSchema,
  generated_document: generatedDocumentPayloadSchema,
  agreement: agreementPayloadSchema,
  audit_log: auditLogPayloadSchema,
} as const;
