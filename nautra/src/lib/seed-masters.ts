import { addDays } from "@/domain/labor-law/evaluate";
import { DEMO_TENANT_ID, DEMO_VESSEL, SHORE_PLANNER_ID } from "@/lib/crew";
import { makeRecordEvent, type SyncEvent } from "@/sync-protocol/events";
import type {
  AgreementPayload,
  AuditLogPayload,
  CharterContractPayload,
  CredentialPayload,
  CrewMasterPayload,
  DockPlanPayload,
  EmbarkationPayload,
  EvaluationPayload,
  ExpensePayload,
  FilingPayload,
  GeneratedDocumentPayload,
  IncidentReportPayload,
  InvoicePayload,
  LeaveRecordPayload,
  MaintenancePlanPayload,
  PartStockPayload,
  PayrollPayload,
  ProcedureTaskPayload,
  SmsDocumentPayload,
  SubsidyPayload,
  TrainingPlanPayload,
  VesselMasterPayload,
  VesselPositionPayload,
  VoyageSchedulePayload,
  WellbeingResponsePayload,
} from "@/sync-protocol/masters";

/**
 * マスタ・事務エンティティのデモデータ（要件定義書 3.1 / 3.4〜3.9 / 6.2 / 9章 / 12章）。
 *
 * 見どころ（画面で確認できる状態を意図的に作る）:
 * - 佐藤: **海技免状の更新着手時期**（満了まで 300日 < リードタイム365日）→ S-08 に「着手時期」
 * - 鈴木: **健康証明書の最終確認日が古い**（200日前 > 鮮度180日）→「要再確認」（不適合ではない）
 * - 森（予備船員）: **保険の加入が未確認** → 配乗ブロック／届出の添付要件で「不適合」
 * - 石井（新規雇入予定）: **基本訓練 未修了** → 2026-02-14 以降の雇入で受理保留リスク
 * - 部品在庫: 潤滑油フィルタが発注点割れ、ウインチのブレーキライニングは在庫ゼロで手配依頼中
 * - 入渠: 中間検査が3か月後。前回検査の指摘1件が未対応のまま残っている
 * - 事故: 前日のヒヤリハット（通路の工具放置。安全パトロールの不良と符合する）
 */

const SEED_DEVICE = "seed-shore-device";
/** 事業者共通（特定の船に紐づかない）マスタ用の擬似船舶ID */
export const COMPANY_SCOPE_ID = "company-demo";

/** デモの2隻目（配船・位置情報で複数隻を見せるため） */
export const DEMO_VESSEL_2 = { id: "vessel-002", name: "第二のーとら丸" } as const;

/** 配乗候補（乗船していないため船内アプリのサインイン一覧には出ない） */
export const CANDIDATE_CREW = [
  { id: "crew-mori", name: "森 波留", position: "一等航海士（予備）" },
  { id: "crew-ishii", name: "石井 新", position: "甲板部員（新規雇入予定）" },
] as const;

function mbase(id: string, occurredAt: string, vesselId: string = DEMO_VESSEL.id) {
  return {
    id,
    tenantId: DEMO_TENANT_ID,
    vesselId,
    occurredAt,
    recordedBy: SHORE_PLANNER_ID,
    deviceId: SEED_DEVICE,
    publishedAt: occurredAt,
    publishedBy: SHORE_PLANNER_ID,
  };
}

/** ローカル日 YYYY-MM-DD の 09:00 を ISO 文字列で返す（決定的） */
function at9(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 9, 0, 0, 0).toISOString();
}

/* ═══════════════ 3.1.1 船員マスタ ═══════════════ */

function crewMasterSeed(today: string): SyncEvent[] {
  const t = at9(addDays(today, -60));
  const v = (offset: number) => addDays(today, offset); // 最終確認日

  const rows: CrewMasterPayload[] = [
    {
      ...mbase("sd-cm-kato", t, COMPANY_SCOPE_ID),
      crewMemberId: "crew-kato",
      name: "加藤 大和",
      nameKana: "カトウ ヤマト",
      birthDate: "1971-05-14",
      seamanBookNo: "SB-1102-4471",
      address: "広島県尾道市山波町1-2-3",
      bloodType: "A",
      phone: "090-1111-0001",
      photo: "加",
      position: "船長",
      role: "captain",
      employmentType: "期間の定めのない雇用",
      hiredOn: "2009-04-01",
      emergencyContactName: "加藤 恵",
      emergencyContactRelation: "配偶者",
      emergencyContactPhone: "090-1111-9001",
      medicalHistory: "高血圧（内服で安定）",
      medication: "アムロジピン 5mg 朝1回",
      insurances: [
        { kind: "seamen", number: "SI-4471-01", acquiredOn: "2009-04-01", lastVerifiedOn: v(-40), verifyMethod: "notice", verifiedBy: SHORE_PLANNER_ID },
        { kind: "workers_accident", number: "RS-4471-01", acquiredOn: "2009-04-01", lastVerifiedOn: v(-40), verifyMethod: "notice", verifiedBy: SHORE_PLANNER_ID },
        { kind: "employment", number: "KY-4471-01", acquiredOn: "2009-04-01", lastVerifiedOn: v(-40), verifyMethod: "notice", verifiedBy: SHORE_PLANNER_ID },
      ],
    },
    {
      ...mbase("sd-cm-sato", t, COMPANY_SCOPE_ID),
      crewMemberId: "crew-sato",
      name: "佐藤 海斗",
      nameKana: "サトウ カイト",
      birthDate: "1988-11-03",
      seamanBookNo: "SB-1102-5588",
      address: "愛媛県今治市片原町2-5",
      bloodType: "O",
      phone: "090-2222-0002",
      photo: "佐",
      position: "航海士",
      role: "deck_officer",
      employmentType: "期間の定めのない雇用",
      hiredOn: "2015-07-01",
      emergencyContactName: "佐藤 美咲",
      emergencyContactRelation: "配偶者",
      emergencyContactPhone: "090-2222-9002",
      insurances: [
        { kind: "seamen", number: "SI-5588-01", acquiredOn: "2015-07-01", lastVerifiedOn: v(-30), verifyMethod: "document", verifiedBy: SHORE_PLANNER_ID },
        { kind: "workers_accident", number: "RS-5588-01", acquiredOn: "2015-07-01", lastVerifiedOn: v(-30), verifyMethod: "document", verifiedBy: SHORE_PLANNER_ID },
        { kind: "employment", number: "KY-5588-01", acquiredOn: "2015-07-01", lastVerifiedOn: v(-30), verifyMethod: "document", verifiedBy: SHORE_PLANNER_ID },
      ],
    },
    {
      ...mbase("sd-cm-suzuki", t, COMPANY_SCOPE_ID),
      crewMemberId: "crew-suzuki",
      name: "鈴木 港",
      nameKana: "スズキ ミナト",
      birthDate: "1979-02-20",
      seamanBookNo: "SB-1102-6613",
      address: "香川県坂出市入船町1-8",
      bloodType: "B",
      phone: "090-3333-0003",
      photo: "鈴",
      position: "機関長",
      role: "chief_engineer",
      employmentType: "期間の定めのない雇用",
      hiredOn: "2012-10-01",
      emergencyContactName: "鈴木 剛",
      emergencyContactRelation: "父",
      emergencyContactPhone: "090-3333-9003",
      medicalHistory: "腰椎椎間板ヘルニア（2019年 手術）",
      insurances: [
        { kind: "seamen", number: "SI-6613-01", acquiredOn: "2012-10-01", lastVerifiedOn: v(-30), verifyMethod: "document", verifiedBy: SHORE_PLANNER_ID },
        { kind: "workers_accident", number: "RS-6613-01", acquiredOn: "2012-10-01", lastVerifiedOn: v(-30), verifyMethod: "document", verifiedBy: SHORE_PLANNER_ID },
        { kind: "employment", number: "KY-6613-01", acquiredOn: "2012-10-01", lastVerifiedOn: v(-30), verifyMethod: "document", verifiedBy: SHORE_PLANNER_ID },
      ],
    },
    {
      ...mbase("sd-cm-tanaka", t, COMPANY_SCOPE_ID),
      crewMemberId: "crew-tanaka",
      name: "田中 凪",
      nameKana: "タナカ ナギ",
      birthDate: "1997-08-09",
      seamanBookNo: "SB-1102-7724",
      address: "岡山県玉野市宇野3-11",
      bloodType: "A",
      phone: "090-4444-0004",
      photo: "田",
      position: "甲板部員",
      role: "deck_rating",
      employmentType: "期間の定めのない雇用",
      hiredOn: "2021-04-01",
      emergencyContactName: "田中 千夏",
      emergencyContactRelation: "母",
      emergencyContactPhone: "090-4444-9004",
      insurances: [
        { kind: "seamen", number: "SI-7724-01", acquiredOn: "2021-04-01", lastVerifiedOn: v(-20), verifyMethod: "document", verifiedBy: SHORE_PLANNER_ID },
        { kind: "workers_accident", number: "RS-7724-01", acquiredOn: "2021-04-01", lastVerifiedOn: v(-20), verifyMethod: "document", verifiedBy: SHORE_PLANNER_ID },
        { kind: "employment", number: "KY-7724-01", acquiredOn: "2021-04-01", lastVerifiedOn: v(-20), verifyMethod: "document", verifiedBy: SHORE_PLANNER_ID },
      ],
    },
    {
      // 予備船員: 雇用保険の加入が未確認 → 配乗ブロック（3.1.2 ブロック条件）
      ...mbase("sd-cm-mori", t, COMPANY_SCOPE_ID),
      crewMemberId: "crew-mori",
      name: "森 波留",
      nameKana: "モリ ハル",
      birthDate: "1983-03-30",
      seamanBookNo: "SB-1102-8830",
      address: "広島県呉市中通2-4",
      bloodType: "AB",
      phone: "090-5555-0005",
      photo: "森",
      position: "一等航海士（予備）",
      role: "deck_officer",
      employmentType: "期間の定めのない雇用",
      hiredOn: "2018-06-01",
      emergencyContactName: "森 亜紀",
      emergencyContactRelation: "配偶者",
      emergencyContactPhone: "090-5555-9005",
      insurances: [
        { kind: "seamen", number: "SI-8830-01", acquiredOn: "2018-06-01", lastVerifiedOn: v(-250), verifyMethod: "document", verifiedBy: SHORE_PLANNER_ID },
        { kind: "workers_accident", number: "RS-8830-01", acquiredOn: "2018-06-01", lastVerifiedOn: v(-250), verifyMethod: "document", verifiedBy: SHORE_PLANNER_ID },
        // 雇用保険は記号番号が未登録 = 加入が確認できない
        { kind: "employment" },
      ],
    },
    {
      // 新規雇入予定: 基本訓練 未修了 → 2026-02-14 以降の届出で受理保留リスク（3.8.1）
      ...mbase("sd-cm-ishii", t, COMPANY_SCOPE_ID),
      crewMemberId: "crew-ishii",
      name: "石井 新",
      nameKana: "イシイ アラタ",
      birthDate: "2004-01-18",
      seamanBookNo: "SB-1102-9941",
      address: "愛媛県松山市三津3-2",
      bloodType: "O",
      phone: "090-6666-0006",
      photo: "石",
      position: "甲板部員（新規雇入予定）",
      role: "deck_rating",
      employmentType: "有期雇用（1年）",
      hiredOn: addDays(today, 14),
      emergencyContactName: "石井 幸子",
      emergencyContactRelation: "母",
      emergencyContactPhone: "090-6666-9006",
      insurances: [
        { kind: "seamen", number: "SI-9941-01", acquiredOn: addDays(today, 14), lastVerifiedOn: v(-3), verifyMethod: "notice", verifiedBy: SHORE_PLANNER_ID },
        { kind: "workers_accident", number: "RS-9941-01", acquiredOn: addDays(today, 14), lastVerifiedOn: v(-3), verifyMethod: "notice", verifiedBy: SHORE_PLANNER_ID },
        { kind: "employment", number: "KY-9941-01", acquiredOn: addDays(today, 14), lastVerifiedOn: v(-3), verifyMethod: "notice", verifiedBy: SHORE_PLANNER_ID },
      ],
    },
  ];
  return rows.map((r) => makeRecordEvent("crew_master", r, SEED_DEVICE));
}

/* ═══════════════ 3.1.3 / 3.9 / 3.4.2 資格・証書 ═══════════════ */

function credentialSeed(today: string): SyncEvent[] {
  const t = at9(addDays(today, -60));
  const rows: CredentialPayload[] = [];
  /**
   * ペイロードは passthrough スキーマのため Omit では必須キーが緩む。
   * ここでは「必ず要る2項目 + 任意項目」として受け、Zod の検証は push 時に行う。
   */
  type CredentialFields = Partial<CredentialPayload> & {
    name: string;
    category: CredentialPayload["category"];
  };
  const push = (
    id: string,
    subjectType: "crew" | "vessel",
    subjectId: string,
    c: CredentialFields,
  ) => {
    rows.push({ ...mbase(id, t, COMPANY_SCOPE_ID), subjectType, subjectId, ...c });
  };

  // 加藤（船長）: 三級海技士（航海）・健診・基本訓練 いずれも余裕あり
  push("sd-cr-kato-lic", "crew", "crew-kato", {
    category: "license",
    name: "三級海技士（航海）",
    grade: "三級",
    number: "K-030-114712",
    issuedOn: addDays(today, -900),
    expiresOn: addDays(today, 920),
    issuer: "中国運輸局",
    lastVerifiedOn: addDays(today, -40),
    verifyMethod: "original",
    verifiedBy: SHORE_PLANNER_ID,
  });
  push("sd-cr-kato-med", "crew", "crew-kato", {
    category: "medical",
    name: "健康証明書",
    issuedOn: addDays(today, -120),
    expiresOn: addDays(today, 245),
    issuer: "尾道海員診療所",
    lastVerifiedOn: addDays(today, -120),
    verifyMethod: "document",
    verifiedBy: SHORE_PLANNER_ID,
  });
  push("sd-cr-kato-stcw", "crew", "crew-kato", {
    category: "stcw_basic",
    name: "STCW 基本訓練修了証",
    issuedOn: addDays(today, -800),
    issuer: "海技教育機構",
    lastVerifiedOn: addDays(today, -40),
    verifyMethod: "original",
    verifiedBy: SHORE_PLANNER_ID,
  });

  // 佐藤（航海士）: 免状の満了まで 300日 → 着手期限（365日前）を過ぎている＝更新に着手する時期
  push("sd-cr-sato-lic", "crew", "crew-sato", {
    category: "license",
    name: "四級海技士（航海）",
    grade: "四級",
    number: "K-040-227813",
    issuedOn: addDays(today, -1525),
    expiresOn: addDays(today, 300),
    issuer: "四国運輸局",
    lastVerifiedOn: addDays(today, -30),
    verifyMethod: "original",
    verifiedBy: SHORE_PLANNER_ID,
  });
  push("sd-cr-sato-med", "crew", "crew-sato", {
    category: "medical",
    name: "健康証明書",
    issuedOn: addDays(today, -200),
    expiresOn: addDays(today, 165),
    issuer: "今治海員診療所",
    lastVerifiedOn: addDays(today, -30),
    verifyMethod: "document",
    verifiedBy: SHORE_PLANNER_ID,
  });
  push("sd-cr-sato-stcw", "crew", "crew-sato", {
    category: "stcw_basic",
    name: "STCW 基本訓練修了証",
    issuedOn: addDays(today, -1400),
    issuer: "海技教育機構",
    lastVerifiedOn: addDays(today, -30),
    verifyMethod: "original",
    verifiedBy: SHORE_PLANNER_ID,
  });

  // 鈴木（機関長）: 健康証明書の最終確認から 200日 → 鮮度切れ「要再確認」（期限内なので不適合ではない）
  push("sd-cr-suzuki-lic", "crew", "crew-suzuki", {
    category: "license",
    name: "四級海技士（機関）",
    grade: "四級",
    number: "K-140-331924",
    issuedOn: addDays(today, -1100),
    expiresOn: addDays(today, 720),
    issuer: "四国運輸局",
    lastVerifiedOn: addDays(today, -60),
    verifyMethod: "original",
    verifiedBy: SHORE_PLANNER_ID,
  });
  push("sd-cr-suzuki-med", "crew", "crew-suzuki", {
    category: "medical",
    name: "健康証明書",
    issuedOn: addDays(today, -210),
    expiresOn: addDays(today, 155),
    issuer: "坂出港湾診療所",
    lastVerifiedOn: addDays(today, -200),
    verifyMethod: "document",
    verifiedBy: SHORE_PLANNER_ID,
  });
  push("sd-cr-suzuki-stcw", "crew", "crew-suzuki", {
    category: "stcw_basic",
    name: "STCW 基本訓練修了証",
    issuedOn: addDays(today, -1000),
    issuer: "海技教育機構",
    lastVerifiedOn: addDays(today, -60),
    verifyMethod: "original",
    verifiedBy: SHORE_PLANNER_ID,
  });

  // 田中（甲板部員）
  push("sd-cr-tanaka-lic", "crew", "crew-tanaka", {
    category: "license",
    name: "六級海技士（航海）",
    grade: "六級",
    number: "K-060-442035",
    issuedOn: addDays(today, -700),
    expiresOn: addDays(today, 1120),
    issuer: "中国運輸局",
    lastVerifiedOn: addDays(today, -20),
    verifyMethod: "original",
    verifiedBy: SHORE_PLANNER_ID,
  });
  push("sd-cr-tanaka-med", "crew", "crew-tanaka", {
    category: "medical",
    name: "健康証明書",
    issuedOn: addDays(today, -90),
    expiresOn: addDays(today, 275),
    issuer: "玉野中央病院",
    lastVerifiedOn: addDays(today, -90),
    verifyMethod: "document",
    verifiedBy: SHORE_PLANNER_ID,
  });
  push("sd-cr-tanaka-stcw", "crew", "crew-tanaka", {
    category: "stcw_basic",
    name: "STCW 基本訓練修了証",
    issuedOn: addDays(today, -650),
    issuer: "海技教育機構",
    lastVerifiedOn: addDays(today, -20),
    verifyMethod: "original",
    verifiedBy: SHORE_PLANNER_ID,
  });
  push("sd-cr-tanaka-prac", "crew", "crew-tanaka", {
    category: "stcw_practical",
    name: "登録実技講習（生存・消火）修了証",
    issuedOn: addDays(today, -300),
    issuer: "海技大学校（登録実技講習機関）",
    lastVerifiedOn: addDays(today, -20),
    verifyMethod: "original",
    verifiedBy: SHORE_PLANNER_ID,
  });

  // 森（予備）: 証書は揃うが保険が未確認（crewMasterSeed 側でブロック要因を作る）
  push("sd-cr-mori-lic", "crew", "crew-mori", {
    category: "license",
    name: "三級海技士（航海）",
    grade: "三級",
    number: "K-030-553146",
    issuedOn: addDays(today, -1200),
    expiresOn: addDays(today, 620),
    issuer: "中国運輸局",
    lastVerifiedOn: addDays(today, -250),
    verifyMethod: "original",
    verifiedBy: SHORE_PLANNER_ID,
  });
  push("sd-cr-mori-med", "crew", "crew-mori", {
    category: "medical",
    name: "健康証明書",
    issuedOn: addDays(today, -150),
    expiresOn: addDays(today, 215),
    issuer: "呉共済病院",
    lastVerifiedOn: addDays(today, -150),
    verifyMethod: "document",
    verifiedBy: SHORE_PLANNER_ID,
  });
  push("sd-cr-mori-stcw", "crew", "crew-mori", {
    category: "stcw_basic",
    name: "STCW 基本訓練修了証",
    issuedOn: addDays(today, -1150),
    issuer: "海技教育機構",
    lastVerifiedOn: addDays(today, -250),
    verifyMethod: "original",
    verifiedBy: SHORE_PLANNER_ID,
  });

  // 石井（新規雇入予定）: 基本訓練の修了証が無い → 届出の添付要件で「不適合」
  push("sd-cr-ishii-lic", "crew", "crew-ishii", {
    category: "license",
    name: "六級海技士（航海）",
    grade: "六級",
    number: "K-060-664257",
    issuedOn: addDays(today, -60),
    expiresOn: addDays(today, 1765),
    issuer: "四国運輸局",
    lastVerifiedOn: addDays(today, -3),
    verifyMethod: "original",
    verifiedBy: SHORE_PLANNER_ID,
  });
  push("sd-cr-ishii-med", "crew", "crew-ishii", {
    category: "medical",
    name: "健康証明書",
    issuedOn: addDays(today, -20),
    expiresOn: addDays(today, 345),
    issuer: "松山市立病院",
    lastVerifiedOn: addDays(today, -3),
    verifyMethod: "document",
    verifiedBy: SHORE_PLANNER_ID,
  });

  // 船舶の検査証書・無線局免許（3.4.2 検査証書の有効期限管理）
  push("sd-cr-v1-survey", "vessel", DEMO_VESSEL.id, {
    category: "vessel_survey",
    name: "船舶検査証書（定期検査）",
    number: "V-499-001",
    issuedOn: addDays(today, -1000),
    expiresOn: addDays(today, 95),
    issuer: "日本小型船舶検査機構",
    lastVerifiedOn: addDays(today, -60),
    verifyMethod: "original",
    verifiedBy: SHORE_PLANNER_ID,
  });
  push("sd-cr-v1-radio", "vessel", DEMO_VESSEL.id, {
    category: "radio_station",
    name: "無線局免許状",
    number: "R-499-001",
    issuedOn: addDays(today, -1300),
    expiresOn: addDays(today, 520),
    issuer: "総務省 中国総合通信局",
    lastVerifiedOn: addDays(today, -60),
    verifyMethod: "original",
    verifiedBy: SHORE_PLANNER_ID,
  });
  push("sd-cr-v2-survey", "vessel", DEMO_VESSEL_2.id, {
    category: "vessel_survey",
    name: "船舶検査証書（定期検査）",
    number: "V-749-002",
    issuedOn: addDays(today, -700),
    expiresOn: addDays(today, 640),
    issuer: "日本小型船舶検査機構",
    lastVerifiedOn: addDays(today, -60),
    verifyMethod: "original",
    verifiedBy: SHORE_PLANNER_ID,
  });

  return rows.map((r) => makeRecordEvent("credential", r, SEED_DEVICE));
}

/* ═══════════════ 3.4 / 3.7 船舶マスタ ═══════════════ */

function vesselMasterSeed(today: string): SyncEvent[] {
  const t = at9(addDays(today, -90));
  const rows: VesselMasterPayload[] = [
    {
      ...mbase("sd-vm-1", t),
      targetVesselId: DEMO_VESSEL.id,
      name: DEMO_VESSEL.name,
      grossTonnage: 499,
      imoNumber: "IMO 9123456",
      mmsi: "431000123",
      navigationArea: "沿海区域",
      referencePeriodDays: 28,
      requiredCrew: 4,
      builtOn: "2016-03-15",
      wifiAvailable: true,
      // メモは「あり／なし」の補足だけを書く（画面側が あり／なし を別に表示するため）
      wifiNote: "衛星回線。居室でも利用可。上限 30GB/月",
      cabinType: "個室（全員）",
      amenities: "洗濯機・乾燥機・共用ラウンジ・冷蔵庫",
      environmentVerifiedOn: addDays(today, -30),
    },
    {
      ...mbase("sd-vm-2", t, DEMO_VESSEL_2.id),
      targetVesselId: DEMO_VESSEL_2.id,
      name: DEMO_VESSEL_2.name,
      grossTonnage: 749,
      imoNumber: "IMO 9234567",
      mmsi: "431000456",
      navigationArea: "近海区域",
      referencePeriodDays: 28,
      requiredCrew: 5,
      builtOn: "2019-08-20",
      wifiAvailable: false,
      wifiNote: "2027年度に整備予定。現在は港での接続のみ",
      cabinType: "個室（士官）／2人部屋（部員）",
      amenities: "洗濯機・共用ラウンジ",
      environmentVerifiedOn: addDays(today, -30),
    },
  ];
  return rows.map((r) => makeRecordEvent("vessel_master", r, SEED_DEVICE));
}

/* ═══════════════ 3.1.2 乗下船（配乗） ═══════════════ */

function embarkationSeed(today: string): SyncEvent[] {
  const rows: EmbarkationPayload[] = [
    ...(
      [
        ["crew-kato", "船長", -120],
        ["crew-sato", "一等航海士", -95],
        ["crew-suzuki", "機関長", -120],
        ["crew-tanaka", "甲板手", -60],
      ] as [string, string, number][]
    ).map(([crewMemberId, duty, offset], i) => ({
      ...mbase(`sd-emb-on-${i}`, at9(addDays(today, offset)), COMPANY_SCOPE_ID),
      crewMemberId,
      eventType: "on" as const,
      targetVesselId: DEMO_VESSEL.id,
      date: addDays(today, offset),
      duty,
      contractType: "start" as const,
      status: "actual" as const,
    })),
    {
      // 予定: 森が2週間後に乗船（保険未確認のため配乗ブロックの警告つき）
      ...mbase("sd-emb-plan-mori", at9(today), COMPANY_SCOPE_ID),
      crewMemberId: "crew-mori",
      eventType: "on",
      targetVesselId: DEMO_VESSEL_2.id,
      date: addDays(today, 14),
      duty: "一等航海士",
      contractType: "start",
      status: "planned",
      blockNoteAtPlanning: "雇用保険の加入が未確認（届出の受理保留リスク）",
    },
    {
      // 予定: 佐藤が3週間後に下船（交代）
      ...mbase("sd-emb-plan-sato-off", at9(today), COMPANY_SCOPE_ID),
      crewMemberId: "crew-sato",
      eventType: "off",
      targetVesselId: DEMO_VESSEL.id,
      date: addDays(today, 21),
      duty: "一等航海士",
      contractType: "end",
      status: "planned",
    },
  ];
  return rows.map((r) => makeRecordEvent("embarkation", r, SEED_DEVICE));
}

/* ═══════════════ 3.1.5 人事考課 ═══════════════ */

function evaluationSeed(today: string): SyncEvent[] {
  const rows: EvaluationPayload[] = [
    {
      ...mbase("sd-eval-sato", at9(addDays(today, -100)), COMPANY_SCOPE_ID),
      crewMemberId: "crew-sato",
      periodFrom: addDays(today, -280),
      periodTo: addDays(today, -100),
      scores: { job_skill: 4, safety: 5, teamwork: 4, discipline: 4, growth: 5 },
      comment:
        "荷役計画の精度が高く、若手への指導も丁寧。当直交代時の引継が明確で事故の芽を摘めている。次期は船長補佐業務の習熟を期待。",
      evaluatedBy: "crew-kato",
      disclosedToCrew: true,
    },
    {
      ...mbase("sd-eval-tanaka", at9(addDays(today, -70)), COMPANY_SCOPE_ID),
      crewMemberId: "crew-tanaka",
      periodFrom: addDays(today, -250),
      periodTo: addDays(today, -70),
      scores: { job_skill: 3, safety: 4, teamwork: 5, discipline: 4, growth: 4 },
      comment:
        "点検記録の記入が丁寧で漏れがない。係船作業の手順はさらに反復が必要。六級海技士の取得に向けた学習を継続中。",
      evaluatedBy: "crew-kato",
      disclosedToCrew: true,
    },
  ];
  return rows.map((r) => makeRecordEvent("evaluation", r, SEED_DEVICE));
}

/* ═══════════════ 3.2.4 休日・有給・補償休日 ═══════════════ */

function leaveSeed(today: string): SyncEvent[] {
  const rows: LeaveRecordPayload[] = [];
  const crew = ["crew-kato", "crew-sato", "crew-suzuki", "crew-tanaka"];
  crew.forEach((crewMemberId, i) => {
    // 年次付与（有効期限＝2年の時効）
    rows.push({
      ...mbase(`sd-lv-grant-${i}`, at9(addDays(today, -200)), COMPANY_SCOPE_ID),
      crewMemberId,
      kind: "paid_leave",
      action: "grant",
      date: addDays(today, -200),
      days: i === 3 ? 12 : 20,
      expiresOn: addDays(today, 530),
      reason: "年次有給休暇の付与",
      grantedBy: SHORE_PLANNER_ID,
    });
    // 取得
    rows.push({
      ...mbase(`sd-lv-take-${i}`, at9(addDays(today, -45 - i * 3)), COMPANY_SCOPE_ID),
      crewMemberId,
      kind: "paid_leave",
      action: "take",
      date: addDays(today, -45 - i * 3),
      days: i === 0 ? 5 : 3,
      reason: "下船休暇",
    });
    // 補償休日（法定休日に労働した分の代替）
    rows.push({
      ...mbase(`sd-lv-comp-${i}`, at9(addDays(today, -20 - i)), COMPANY_SCOPE_ID),
      crewMemberId,
      kind: "compensatory",
      action: "grant",
      date: addDays(today, -20 - i),
      days: 1,
      reason: "法定休日の労働に対する補償休日",
      grantedBy: SHORE_PLANNER_ID,
    });
  });
  return rows.map((r) => makeRecordEvent("leave_record", r, SEED_DEVICE));
}

/* ═══════════════ 3.4.1 定期保守計画・部品在庫 ═══════════════ */

function maintenancePlanSeed(today: string): SyncEvent[] {
  const t = at9(addDays(today, -90));
  const plans: MaintenancePlanPayload[] = [
    {
      ...mbase("sd-mp-1", t),
      targetVesselId: DEMO_VESSEL.id,
      equipment: "main_engine",
      task: "潤滑油・オイルフィルタ交換",
      intervalDays: 90,
      intervalHours: 500,
      lastDoneOn: addDays(today, -85),
      responsible: "crew-suzuki",
      active: true,
    },
    {
      ...mbase("sd-mp-2", t),
      targetVesselId: DEMO_VESSEL.id,
      equipment: "generator",
      task: "燃料フィルタ交換・冷却水点検",
      intervalDays: 180,
      lastDoneOn: addDays(today, -175),
      responsible: "crew-suzuki",
      active: true,
    },
    {
      ...mbase("sd-mp-3", t),
      targetVesselId: DEMO_VESSEL.id,
      equipment: "steering_gear",
      task: "作動油交換・リンク部給脂",
      intervalDays: 90,
      lastDoneOn: addDays(today, -3),
      responsible: "crew-suzuki",
      active: true,
    },
    {
      ...mbase("sd-mp-4", t),
      targetVesselId: DEMO_VESSEL.id,
      equipment: "deck_machinery",
      task: "ウインチ ブレーキライニング点検・調整",
      intervalDays: 60,
      lastDoneOn: addDays(today, -75),
      responsible: "crew-tanaka",
      active: true,
    },
    {
      ...mbase("sd-mp-5", t),
      targetVesselId: DEMO_VESSEL.id,
      equipment: "hull",
      task: "上甲板 塗装・防錆処理",
      intervalDays: 365,
      lastDoneOn: addDays(today, -300),
      responsible: "crew-tanaka",
      active: true,
    },
    {
      ...mbase("sd-mp-6", t),
      targetVesselId: DEMO_VESSEL.id,
      equipment: "lifesaving",
      task: "救命胴衣・膨張式救命いかだの点検",
      intervalDays: 365,
      lastDoneOn: addDays(today, -200),
      responsible: "crew-kato",
      active: true,
    },
  ];

  const stocks: PartStockPayload[] = [
    {
      ...mbase("sd-ps-1", t),
      targetVesselId: DEMO_VESSEL.id,
      partName: "主機 潤滑油フィルタ",
      partNo: "LF-3000-A",
      equipment: "main_engine",
      unit: "個",
      quantity: 2,
      minQuantity: 3, // 発注点割れ
      orderStatus: "none",
      supplier: "尾道舶用商会",
    },
    {
      ...mbase("sd-ps-2", t),
      targetVesselId: DEMO_VESSEL.id,
      partName: "ウインチ ブレーキライニング",
      partNo: "WB-220-L",
      equipment: "deck_machinery",
      unit: "組",
      quantity: 0, // 在庫ゼロ（不良のウインチ用。船内から手配依頼中）
      minQuantity: 1,
      orderStatus: "requested",
      orderedOn: addDays(today, -1),
      supplier: "今治機械",
    },
    {
      ...mbase("sd-ps-3", t),
      targetVesselId: DEMO_VESSEL.id,
      partName: "発電機 Vベルト",
      partNo: "VB-A55",
      equipment: "generator",
      unit: "本",
      quantity: 6,
      minQuantity: 2,
      orderStatus: "none",
      supplier: "尾道舶用商会",
    },
    {
      ...mbase("sd-ps-4", t),
      targetVesselId: DEMO_VESSEL.id,
      partName: "操舵装置 作動油（20L缶）",
      partNo: "HO-20",
      equipment: "steering_gear",
      unit: "缶",
      quantity: 4,
      minQuantity: 2,
      orderStatus: "delivered",
      orderedOn: addDays(today, -30),
      supplier: "坂出油機",
    },
  ];

  return [
    ...plans.map((p) => makeRecordEvent("maintenance_plan", p, SEED_DEVICE)),
    ...stocks.map((p) => makeRecordEvent("part_stock", p, SEED_DEVICE)),
  ];
}

/* ═══════════════ 3.4.2 入渠・検査 ═══════════════ */

function dockSeed(today: string): SyncEvent[] {
  const rows: DockPlanPayload[] = [
    {
      ...mbase("sd-dock-1", at9(addDays(today, -30))),
      targetVesselId: DEMO_VESSEL.id,
      kind: "intermediate",
      title: "中間検査（第2回）",
      plannedFrom: addDays(today, 88),
      plannedTo: addDays(today, 95),
      shipyard: "尾道造船 第2ドック",
      status: "planned",
      prepTasks: [
        { key: "p1", label: "検査申請書の提出", done: true },
        { key: "p2", label: "船底外板の板厚計測 手配", done: true },
        { key: "p3", label: "救命設備の整備業者 手配", done: false },
        { key: "p4", label: "貨物艙の清掃・ガスフリー", done: false },
        { key: "p5", label: "乗組員の入渠中 宿泊手配", done: false },
      ],
    },
    {
      ...mbase("sd-dock-2", at9(addDays(today, -400))),
      targetVesselId: DEMO_VESSEL.id,
      kind: "periodic",
      title: "定期検査（前回）",
      plannedFrom: addDays(today, -400),
      plannedTo: addDays(today, -388),
      shipyard: "尾道造船 第2ドック",
      status: "done",
      findings: [
        {
          key: "f1",
          content: "No.2 貨物艙 ビルジウェル 局部腐食（板厚 減少率 12%）。次回中間検査までに再計測",
          dueOn: addDays(today, 88),
          status: "open",
          action: "中間検査時に板厚再計測を実施予定",
        },
        {
          key: "f2",
          content: "救命浮環の自己点火灯 電池切れ 2個",
          dueOn: addDays(today, -380),
          status: "closed",
          action: "入渠中に交換済（証書添付）",
        },
      ],
    },
  ];
  return rows.map((r) => makeRecordEvent("dock_plan", r, SEED_DEVICE));
}

/* ═══════════════ 3.5.1 安全管理システム（SMS） ═══════════════ */

function smsSeed(today: string): SyncEvent[] {
  const rows: SmsDocumentPayload[] = [
    {
      ...mbase("sd-sms-1", at9(addDays(today, -180)), COMPANY_SCOPE_ID),
      kind: "policy",
      title: "2026年度 安全方針・重点施策",
      body:
        "「無事故・無災害の運航」を最優先とする。重点施策: ①係船作業中の指差呼称の徹底 " +
        "②荷役待機時の熱中症・低体温対策 ③ヒヤリハット報告の月2件以上（報告者を責めない運用）",
      status: "open",
      responsible: SHORE_PLANNER_ID,
    },
    {
      ...mbase("sd-sms-2", at9(addDays(today, -120)), COMPANY_SCOPE_ID),
      kind: "risk_assessment",
      title: "荷役作業（鋼材コイル）のリスクアセスメント",
      body:
        "想定リスク: 吊荷の落下・荷崩れ、玉掛け不良、クレーン旋回範囲への立入。" +
        "対策: 立入禁止区画のコーン設置、玉掛け者の資格確認、無線での合図統一。",
      severity: 4,
      likelihood: 2,
      correctiveAction: "立入禁止区画の表示を追加（実施済）。玉掛け合図の手順書を配布。",
      status: "closed",
      responsible: "crew-kato",
    },
    {
      ...mbase("sd-sms-3", at9(addDays(today, -1)), COMPANY_SCOPE_ID),
      kind: "nonconformity",
      title: "不適合: 機関室前通路への工具放置",
      body: "安全パトロール（前日）で機関室前通路に工具が放置されているのを確認。通行の支障・つまずきの恐れ。",
      correctiveAction: "即時撤去。工具の戻し場所を明示し、作業終了時の相互確認を朝礼で周知する。",
      dueOn: addDays(today, 6),
      status: "in_progress",
      responsible: "crew-kato",
    },
    {
      ...mbase("sd-sms-4", at9(addDays(today, -60)), COMPANY_SCOPE_ID),
      kind: "internal_audit",
      title: "内部監査（第1回・2026年度）",
      body: "対象: 労務記録の運用、操練の実施記録、点検表の記入状況。指摘2件（いずれも軽微）。",
      correctiveAction: "操練の次回期日管理をアプリで行うよう変更（3.9 連携）。",
      auditedOn: addDays(today, -60),
      auditor: SHORE_PLANNER_ID,
      status: "closed",
      responsible: SHORE_PLANNER_ID,
    },
  ];
  return rows.map((r) => makeRecordEvent("sms_document", r, SEED_DEVICE));
}

/* ═══════════════ 3.5.2 事故・インシデント報告（船内の一次記録） ═══════════════ */

function incidentSeed(today: string): SyncEvent[] {
  const rows: IncidentReportPayload[] = [
    {
      id: "sd-inc-1",
      tenantId: DEMO_TENANT_ID,
      vesselId: DEMO_VESSEL.id,
      occurredAt: at9(addDays(today, -1)),
      recordedAt: at9(addDays(today, -1)),
      recordedBy: "crew-tanaka",
      deviceId: SEED_DEVICE,
      kind: "near_miss",
      title: "機関室前通路の工具につまずきかけた",
      location: "機関室前通路（第2甲板）",
      description:
        "安全パトロール中、機関室前の通路に工具箱とスパナが置かれており、通行時につまずきかけた。転倒には至らず負傷者なし。",
      cause: "作業後の工具の戻し忘れ。工具の定位置が明示されていなかった。",
      preventiveAction: "工具の定位置を表示。作業終了時に相互確認する運用を朝礼で周知。",
      status: "closed",
      reportedToAuthority: false,
    },
    {
      id: "sd-inc-2",
      tenantId: DEMO_TENANT_ID,
      vesselId: DEMO_VESSEL.id,
      occurredAt: at9(addDays(today, -1)),
      recordedAt: at9(addDays(today, -1)),
      recordedBy: "crew-tanaka",
      deviceId: SEED_DEVICE,
      kind: "equipment",
      title: "No.2 ウインチ ブレーキの効き不良",
      location: "船首甲板",
      description:
        "係船索の巻き取り時、No.2 ウインチのブレーキの効きが甘く、保持力が不足していることを確認。作業は No.1 ウインチに切り替えて継続。",
      damage: "ブレーキライニングの摩耗（推定）",
      cause: "ライニングの摩耗。前回点検から75日経過（計画周期60日を超過）。",
      preventiveAction: "使用制限のうえ陸上へ部品手配を依頼。定期保守計画の周期見直しを検討。",
      status: "investigating",
      reportedToAuthority: false,
    },
  ];
  return rows.map((r) => makeRecordEvent("incident_report", r, SEED_DEVICE));
}

/* ═══════════════ 3.5.3 健康アンケート・相談（匿名） ═══════════════ */

function wellbeingSeed(today: string): SyncEvent[] {
  const rows: WellbeingResponsePayload[] = [
    {
      id: "sd-wb-1",
      tenantId: DEMO_TENANT_ID,
      vesselId: DEMO_VESSEL.id,
      occurredAt: at9(addDays(today, -10)),
      recordedBy: "anonymous",
      deviceId: SEED_DEVICE,
      formType: "health_survey",
      anonymous: true,
      answers: { sleep: 3, fatigue: 2, appetite: 4, mood: 4, workload: 3 },
      status: "received",
    },
    {
      id: "sd-wb-2",
      tenantId: DEMO_TENANT_ID,
      vesselId: DEMO_VESSEL.id,
      occurredAt: at9(addDays(today, -9)),
      recordedBy: "anonymous",
      deviceId: SEED_DEVICE,
      formType: "health_survey",
      anonymous: true,
      answers: { sleep: 2, fatigue: 2, appetite: 3, mood: 3, workload: 2 },
      message: "荷役待ちが長い日は仮眠が細切れになり、翌日に疲れが残る。",
      status: "received",
    },
    {
      id: "sd-wb-3",
      tenantId: DEMO_TENANT_ID,
      vesselId: DEMO_VESSEL.id,
      occurredAt: at9(addDays(today, -5)),
      recordedBy: "anonymous",
      deviceId: SEED_DEVICE,
      formType: "consultation",
      anonymous: true,
      message:
        "作業中の言葉づかいが強い場面があり、気になっている。誰が言ったかは伏せたいが、全体に注意してほしい。",
      status: "responded",
      respondedAt: at9(addDays(today, -3)),
      response:
        "ご連絡ありがとうございます。個人を特定しない形で、朝礼にて言葉づかいと指示の伝え方について全体周知しました。改善が見られない場合は再度お知らせください。",
    },
  ];
  return rows.map((r) => makeRecordEvent("wellbeing_response", r, SEED_DEVICE));
}

/* ═══════════════ 3.8 届出 ═══════════════ */

function filingSeed(today: string): SyncEvent[] {
  const rows: FilingPayload[] = [
    {
      ...mbase("sd-fil-1", at9(today), COMPANY_SCOPE_ID),
      filingType: "hire",
      targets: [
        { crewMemberId: "crew-mori", targetVesselId: DEMO_VESSEL_2.id, duty: "一等航海士", effectiveOn: addDays(today, 14) },
        { crewMemberId: "crew-ishii", targetVesselId: DEMO_VESSEL.id, duty: "甲板手", effectiveOn: addDays(today, 14) },
      ],
      method: "bulk_electronic",
      status: "draft",
    },
    {
      ...mbase("sd-fil-2", at9(addDays(today, -55)), COMPANY_SCOPE_ID),
      filingType: "hire",
      targets: [
        { crewMemberId: "crew-tanaka", targetVesselId: DEMO_VESSEL.id, duty: "甲板手", effectiveOn: addDays(today, -60) },
      ],
      method: "paper",
      status: "accepted",
      checkedAt: at9(addDays(today, -58)),
      submittedOn: addDays(today, -57),
      office: "中国運輸局 尾道海事事務所",
      documentIds: ["sd-doc-2"],
      seamanBookEntries: [
        { crewMemberId: "crew-tanaka", vesselName: DEMO_VESSEL.name, duty: "甲板手", onDate: addDays(today, -60) },
      ],
    },
  ];
  return rows.map((r) => makeRecordEvent("filing", r, SEED_DEVICE));
}

/* ═══════════════ 6.2 手続き・期限 ═══════════════ */

function procedureSeed(today: string): SyncEvent[] {
  const rows: ProcedureTaskPayload[] = [
    {
      ...mbase("sd-pt-1", at9(today), COMPANY_SCOPE_ID),
      group: "B",
      title: "雇入契約成立の届出（森・石井）",
      basis: "船員法第37条。遅滞なく届け出る",
      subjectType: "crew",
      subjectId: "crew-mori",
      dueOn: addDays(today, 17),
      leadTimeDays: 14,
      status: "in_progress",
      responsible: SHORE_PLANNER_ID,
      sourceEventId: "sd-emb-plan-mori",
    },
    {
      ...mbase("sd-pt-2", at9(today), COMPANY_SCOPE_ID),
      group: "C",
      title: "海技免状の更新（佐藤 海斗・四級海技士（航海））",
      basis: "船舶職員及び小型船舶操縦者法。5年更新・1年前から申請可",
      subjectType: "crew",
      subjectId: "crew-sato",
      dueOn: addDays(today, 300),
      leadTimeDays: 365, // 着手期限を既に過ぎている → 「着手時期」
      status: "open",
      responsible: SHORE_PLANNER_ID,
    },
    {
      ...mbase("sd-pt-3", at9(today), COMPANY_SCOPE_ID),
      group: "C",
      title: "船舶検査証書の更新（中間検査の受検）",
      basis: "船舶安全法",
      subjectType: "vessel",
      subjectId: DEMO_VESSEL.id,
      dueOn: addDays(today, 95),
      leadTimeDays: 120, // 着手期限超過
      status: "in_progress",
      responsible: SHORE_PLANNER_ID,
    },
    {
      ...mbase("sd-pt-4", at9(today), COMPANY_SCOPE_ID),
      group: "C",
      title: "健康証明書の更新（鈴木 港）",
      basis: "船員法施行規則",
      subjectType: "crew",
      subjectId: "crew-suzuki",
      dueOn: addDays(today, 155),
      leadTimeDays: 60,
      status: "open",
      responsible: SHORE_PLANNER_ID,
    },
    {
      ...mbase("sd-pt-5", at9(today), COMPANY_SCOPE_ID),
      group: "A",
      title: "事業概況報告書の提出",
      basis: "内航海運業法。事業年度経過後100日以内",
      subjectType: "company",
      dueOn: addDays(today, 40),
      leadTimeDays: 30, // まもなく着手
      status: "open",
      responsible: SHORE_PLANNER_ID,
    },
    {
      ...mbase("sd-pt-6", at9(today), COMPANY_SCOPE_ID),
      group: "C",
      title: "無線局免許の再免許申請",
      basis: "電波法。5年ごと",
      subjectType: "vessel",
      subjectId: DEMO_VESSEL.id,
      dueOn: addDays(today, 520),
      leadTimeDays: 90,
      status: "open",
      responsible: SHORE_PLANNER_ID,
    },
    {
      ...mbase("sd-pt-7", at9(addDays(today, -30)), COMPANY_SCOPE_ID),
      group: "D",
      title: "海上労働検査への対応資料の準備",
      basis: "船員法。海上労働検査",
      subjectType: "company",
      dueOn: addDays(today, -10),
      leadTimeDays: 14,
      status: "done",
      doneOn: addDays(today, -12),
      responsible: SHORE_PLANNER_ID,
    },
    {
      ...mbase("sd-pt-8", at9(addDays(today, -20)), COMPANY_SCOPE_ID),
      group: "B",
      title: "船員保険・雇用保険の資格取得届（石井 新）",
      basis: "船員保険法・雇用保険法",
      subjectType: "crew",
      subjectId: "crew-ishii",
      dueOn: addDays(today, 19),
      leadTimeDays: 10,
      status: "open",
      responsible: SHORE_PLANNER_ID,
    },
  ];
  return rows.map((r) => makeRecordEvent("procedure_task", r, SEED_DEVICE));
}

/* ═══════════════ 3.9 訓練管理 ═══════════════ */

function trainingSeed(today: string): SyncEvent[] {
  const rows: TrainingPlanPayload[] = [
    {
      ...mbase("sd-tr-1", at9(today), COMPANY_SCOPE_ID),
      crewMemberId: "crew-ishii",
      trainingKind: "stcw_basic",
      title: "STCW 基本訓練（生存・消火・応急・保安）",
      institution: "海技教育機構 清水校",
      scheduledOn: addDays(today, 7),
      status: "arranged",
      materialName: "基本訓練 受講前の手引き",
      materialBody:
        "受講当日は船員手帳・健康証明書の写しを持参してください。実技があるため動きやすい服装で。",
    },
    {
      ...mbase("sd-tr-2", at9(today), COMPANY_SCOPE_ID),
      crewMemberId: "crew-mori",
      trainingKind: "stcw_practical",
      title: "登録実技講習（生存・消火）",
      institution: "海技大学校（登録実技講習機関）",
      scheduledOn: addDays(today, 10),
      status: "arranged",
    },
    {
      ...mbase("sd-tr-3", at9(today), COMPANY_SCOPE_ID),
      crewMemberId: "crew-sato",
      trainingKind: "license_renewal",
      title: "海技免状 更新講習（四級海技士（航海））",
      institution: "日本海技協会",
      status: "needed",
    },
    {
      ...mbase("sd-tr-4", at9(addDays(today, -300)), COMPANY_SCOPE_ID),
      crewMemberId: "crew-tanaka",
      trainingKind: "stcw_practical",
      title: "登録実技講習（生存・消火）",
      institution: "海技大学校（登録実技講習機関）",
      scheduledOn: addDays(today, -300),
      status: "completed",
      credentialId: "sd-cr-tanaka-prac",
    },
    {
      ...mbase("sd-tr-5", at9(addDays(today, -30)), COMPANY_SCOPE_ID),
      crewMemberId: "crew-tanaka",
      trainingKind: "internal",
      title: "船内教育: 係船作業の手順と合図",
      status: "completed",
      scheduledOn: addDays(today, -30),
      materialName: "係船作業 手順書 rev.3",
      materialBody:
        "①合図は無線で統一する ②索の張力がかかる範囲（スナップバックゾーン）に立たない ③指差呼称を行う",
    },
  ];
  return rows.map((r) => makeRecordEvent("training_plan", r, SEED_DEVICE));
}

/* ═══════════════ 3.6 陸上事務 ═══════════════ */

function officeSeed(today: string): SyncEvent[] {
  const events: SyncEvent[] = [];

  const charters: CharterContractPayload[] = [
    {
      ...mbase("sd-ch-1", at9(addDays(today, -300))),
      targetVesselId: DEMO_VESSEL.id,
      counterparty: "瀬戸内海運株式会社",
      contractType: "time_charter",
      from: addDays(today, -300),
      to: addDays(today, 65),
      rate: 285000,
      rateUnit: "円/日",
      status: "active",
      terms: "定期傭船。燃料は傭船者負担。返船30日前までに通知。",
    },
    {
      ...mbase("sd-ch-2", at9(addDays(today, -120)), DEMO_VESSEL_2.id),
      targetVesselId: DEMO_VESSEL_2.id,
      counterparty: "西日本フェリー物流",
      contractType: "voyage_charter",
      from: addDays(today, -120),
      to: addDays(today, 20),
      rate: 1850000,
      rateUnit: "円/航海",
      status: "active",
    },
  ];

  const invoices: InvoicePayload[] = [
    {
      ...mbase("sd-inv-1", at9(addDays(today, -40)), COMPANY_SCOPE_ID),
      invoiceNo: "INV-2026-0031",
      counterparty: "瀬戸内海運株式会社",
      contractId: "sd-ch-1",
      periodFrom: addDays(today, -70),
      periodTo: addDays(today, -41),
      issuedOn: addDays(today, -40),
      dueOn: addDays(today, -10),
      amount: 8550000,
      taxAmount: 855000,
      status: "paid",
      paidOn: addDays(today, -12),
      archiveRef: "denshi-2026-0031.pdf",
    },
    {
      ...mbase("sd-inv-2", at9(addDays(today, -10)), COMPANY_SCOPE_ID),
      invoiceNo: "INV-2026-0032",
      counterparty: "瀬戸内海運株式会社",
      contractId: "sd-ch-1",
      periodFrom: addDays(today, -40),
      periodTo: addDays(today, -11),
      issuedOn: addDays(today, -10),
      dueOn: addDays(today, 20),
      amount: 8265000,
      taxAmount: 826500,
      status: "issued",
      archiveRef: "denshi-2026-0032.pdf",
    },
    {
      ...mbase("sd-inv-3", at9(addDays(today, -75)), COMPANY_SCOPE_ID),
      invoiceNo: "INV-2026-0029",
      counterparty: "西日本フェリー物流",
      contractId: "sd-ch-2",
      issuedOn: addDays(today, -75),
      dueOn: addDays(today, -45),
      amount: 1850000,
      taxAmount: 185000,
      status: "overdue",
      archiveRef: "denshi-2026-0029.pdf",
    },
  ];

  const expenses: ExpensePayload[] = [
    {
      ...mbase("sd-ex-1", at9(addDays(today, -1))),
      targetVesselId: DEMO_VESSEL.id,
      kind: "fuel",
      title: "A重油 12,000L 補給（名古屋）",
      amount: 1416000,
      spentOn: addDays(today, -1),
      supplier: "中部バンカリング",
      receiptRef: "RC-2026-0912",
    },
    {
      ...mbase("sd-ex-2", at9(addDays(today, -2))),
      targetVesselId: DEMO_VESSEL.id,
      kind: "port",
      title: "名古屋港 入港料・岸壁使用料",
      amount: 184500,
      spentOn: addDays(today, -2),
      supplier: "名古屋港管理組合",
    },
    {
      ...mbase("sd-ex-3", at9(addDays(today, -25))),
      targetVesselId: DEMO_VESSEL.id,
      kind: "repair",
      title: "操舵装置 作動油交換 部品代",
      amount: 62000,
      spentOn: addDays(today, -25),
      supplier: "坂出油機",
    },
    {
      ...mbase("sd-ex-4", at9(addDays(today, -8))),
      targetVesselId: DEMO_VESSEL.id,
      kind: "supply",
      title: "船用品（食料・清水・消耗品）",
      amount: 138000,
      spentOn: addDays(today, -8),
      supplier: "今治船用品",
    },
  ];

  /**
   * 給与の対象月は**打刻の実績がある月**（前日が属する月）にする。
   * 月初（1日）にデモを開くと当月の打刻がまだ無く、時間外が常に0分になって
   * 「まるめ時間設定による給与連携」（3.6.2）が画面で確認できなくなるため。
   */
  const month = addDays(today, -1).slice(0, 7);
  const payrolls: PayrollPayload[] = (
    [
      ["crew-kato", 480000, { 乗船手当: 90000, 職務手当: 60000 }],
      ["crew-sato", 380000, { 乗船手当: 75000, 職務手当: 35000 }],
      ["crew-suzuki", 420000, { 乗船手当: 80000, 職務手当: 45000 }],
      ["crew-tanaka", 290000, { 乗船手当: 60000 }],
    ] as [string, number, Record<string, number>][]
  ).map(([crewMemberId, baseAmount, allowances], i) => ({
    ...mbase(`sd-pay-${i}`, at9(today), COMPANY_SCOPE_ID),
    crewMemberId,
    month,
    baseAmount,
    allowances,
    // 打刻から導出する値だが、給与は「確定した数値」を残す必要があるため確定時の値を保持する
    overtimeMinutes: [1860, 2640, 1980, 1500][i],
    overtimeAmount: [93000, 132000, 99000, 60000][i],
    deductions: { 社会保険料: Math.round(baseAmount * 0.15), 所得税: Math.round(baseAmount * 0.05) },
    roundingUnitMinutes: 15,
    status: "draft" as const,
  }));

  const subsidies: SubsidyPayload[] = [
    {
      ...mbase("sd-sub-1", at9(addDays(today, -60)), COMPANY_SCOPE_ID),
      title: "内航船舶の省エネ改造に係る補助金",
      category: "subsidy",
      authority: "国土交通省 海事局",
      appliedOn: addDays(today, -55),
      dueOn: addDays(today, 30),
      amount: 12000000,
      status: "applied",
      body: "主機の高効率化改造。中間検査時の入渠に合わせて実施予定。",
    },
    {
      ...mbase("sd-sub-2", at9(addDays(today, -20)), COMPANY_SCOPE_ID),
      title: "内航海運業法に基づく事業概況報告",
      category: "coastal_shipping_filing",
      authority: "中国運輸局",
      dueOn: addDays(today, 40),
      status: "preparing",
      body: "輸送実績・財務データを取り込んで下書きを作成する。",
    },
    {
      ...mbase("sd-sub-3", at9(addDays(today, -30)), COMPANY_SCOPE_ID),
      title: "海上労働検査への対応",
      category: "labor_inspection",
      authority: "中国運輸局 船員労務官",
      appliedOn: addDays(today, -12),
      status: "done",
      body: "労務管理記録簿・当直表・操練記録を提出。指摘なし。",
    },
  ];

  events.push(...charters.map((r) => makeRecordEvent("charter_contract", r, SEED_DEVICE)));
  events.push(...invoices.map((r) => makeRecordEvent("invoice", r, SEED_DEVICE)));
  events.push(...expenses.map((r) => makeRecordEvent("expense", r, SEED_DEVICE)));
  events.push(...payrolls.map((r) => makeRecordEvent("payroll", r, SEED_DEVICE)));
  events.push(...subsidies.map((r) => makeRecordEvent("subsidy", r, SEED_DEVICE)));
  return events;
}

/* ═══════════════ 3.7 配船・位置情報 ═══════════════ */

function dispatchSeed(today: string): SyncEvent[] {
  const events: SyncEvent[] = [];

  // 航跡（横浜 → 名古屋 → 現在地）。無償 AIS を模した観測点
  const track: [string, number, number, number, string][] = [
    [at9(addDays(today, -2)), 35.45, 139.68, 0, "moored"],
    [at9(addDays(today, -2)).replace("T09", "T12"), 34.58, 138.83, 11.5, "underway"],
    [at9(addDays(today, -2)).replace("T09", "T18"), 35.05, 136.85, 6.2, "underway"],
    [at9(addDays(today, -1)), 35.05, 136.86, 0, "anchored"],
    [at9(addDays(today, -1)).replace("T09", "T13"), 35.05, 136.87, 0, "cargo_ops"],
    [at9(today), 35.05, 136.87, 0, "moored"],
  ];
  track.forEach(([observedAt, lat, lon, speedKnots, navStatus], i) => {
    const p: VesselPositionPayload = {
      ...mbase(`sd-pos-1-${i}`, observedAt),
      targetVesselId: DEMO_VESSEL.id,
      source: "ais",
      lat,
      lon,
      speedKnots,
      courseDeg: speedKnots > 0 ? 265 : undefined,
      navStatus: navStatus as VesselPositionPayload["navStatus"],
      destination: "名古屋港（金城埠頭）",
      eta: at9(addDays(today, -2)).replace("T09", "T18"),
      observedAt,
    };
    events.push(makeRecordEvent("vessel_position", p, SEED_DEVICE));
  });

  const p2: VesselPositionPayload = {
    ...mbase("sd-pos-2-0", at9(today), DEMO_VESSEL_2.id),
    targetVesselId: DEMO_VESSEL_2.id,
    source: "ais",
    lat: 33.95,
    lon: 132.98,
    speedKnots: 10.8,
    courseDeg: 92,
    navStatus: "underway",
    destination: "阪神港（神戸）",
    eta: at9(addDays(today, 1)),
    observedAt: at9(today),
  };
  events.push(makeRecordEvent("vessel_position", p2, SEED_DEVICE));

  const schedules: VoyageSchedulePayload[] = [
    {
      ...mbase("sd-vs-1", at9(addDays(today, -3))),
      targetVesselId: DEMO_VESSEL.id,
      voyageNo: "V-2026-041",
      departurePort: "横浜港（大黒埠頭）",
      arrivalPort: "名古屋港（金城埠頭）",
      departureAt: at9(addDays(today, -2)).replace("T09", "T06"),
      arrivalAt: at9(addDays(today, -2)).replace("T09", "T18"),
      cargoKind: "鋼材コイル",
      quantity: "1,200 t",
      counterparty: "瀬戸内海運株式会社",
      status: "done",
    },
    {
      ...mbase("sd-vs-2", at9(today)),
      targetVesselId: DEMO_VESSEL.id,
      voyageNo: "V-2026-042",
      departurePort: "名古屋港（金城埠頭）",
      arrivalPort: "阪神港（大阪）",
      departureAt: at9(today).replace("T09", "T16"),
      arrivalAt: at9(addDays(today, 1)).replace("T09", "T08"),
      cargoKind: "鋼材コイル",
      quantity: "900 t",
      counterparty: "瀬戸内海運株式会社",
      status: "fixed",
      planningNote: "出港は荷役完了後。潮汐により 16:00 以降が望ましい。",
    },
    {
      ...mbase("sd-vs-3", at9(today)),
      targetVesselId: DEMO_VESSEL.id,
      voyageNo: "V-2026-043",
      departurePort: "阪神港（大阪）",
      arrivalPort: "水島港",
      departureAt: at9(addDays(today, 1)).replace("T09", "T14"),
      arrivalAt: at9(addDays(today, 2)).replace("T09", "T06"),
      cargoKind: "石材",
      quantity: "1,100 t",
      counterparty: "瀬戸内海運株式会社",
      status: "planned",
      planningNote: "佐藤の下船予定（21日後）まで余裕あり。燃料は大阪で補給。",
    },
    {
      ...mbase("sd-vs-4", at9(today), DEMO_VESSEL_2.id),
      targetVesselId: DEMO_VESSEL_2.id,
      voyageNo: "V2-2026-018",
      departurePort: "松山港",
      arrivalPort: "阪神港（神戸）",
      departureAt: at9(addDays(today, -1)).replace("T09", "T20"),
      arrivalAt: at9(addDays(today, 1)).replace("T09", "T06"),
      cargoKind: "紙製品",
      quantity: "700 t",
      counterparty: "西日本フェリー物流",
      status: "in_progress",
    },
  ];
  events.push(...schedules.map((r) => makeRecordEvent("voyage_schedule", r, SEED_DEVICE)));
  return events;
}

/* ═══════════════ 9章 帳票 / 6.5 協定 / 12.6 監査 ═══════════════ */

function documentSeed(today: string): SyncEvent[] {
  const docs: GeneratedDocumentPayload[] = [
    {
      ...mbase("sd-doc-1", at9(addDays(today, -35)), COMPANY_SCOPE_ID),
      kind: "labor_ledger",
      title: "労務管理記録簿（第16号の5書式）",
      subjectLabel: `${addDays(today, -35).slice(0, 7)} / 全船員`,
      format: "pdf",
      generatedOn: addDays(today, -35),
      submittedOn: addDays(today, -12),
      submittedTo: "中国運輸局 船員労務官（海上労働検査）",
    },
    {
      ...mbase("sd-doc-2", at9(addDays(today, -58)), COMPANY_SCOPE_ID),
      kind: "hire_filing",
      title: "雇入届出書（第六号書式）",
      subjectLabel: "田中 凪 / 第一のーとら丸",
      format: "pdf",
      generatedOn: addDays(today, -58),
      submittedOn: addDays(today, -57),
      submittedTo: "中国運輸局 尾道海事事務所",
      filingId: "sd-fil-2",
    },
    {
      ...mbase("sd-doc-3", at9(addDays(today, -58)), COMPANY_SCOPE_ID),
      kind: "crew_list",
      title: "クルーリスト（海員名簿第六表）",
      subjectLabel: "第一のーとら丸 / 4名",
      format: "pdf",
      generatedOn: addDays(today, -58),
      submittedOn: addDays(today, -57),
      submittedTo: "中国運輸局 尾道海事事務所",
      filingId: "sd-fil-2",
    },
    {
      ...mbase("sd-doc-4", at9(addDays(today, -15)), COMPANY_SCOPE_ID),
      kind: "opinion_statement",
      title: "意見陳述書（運航計画の変更要請）",
      subjectLabel: "瀬戸内海運株式会社 宛",
      format: "pdf",
      generatedOn: addDays(today, -15),
      submittedOn: addDays(today, -14),
      submittedTo: "瀬戸内海運株式会社",
    },
  ];

  const agreements: AgreementPayload[] = [
    {
      ...mbase("sd-ag-1", at9(addDays(today, -200)), COMPANY_SCOPE_ID),
      kind: "labor_agreement",
      title: "時間外労働等に関する労使協定（2026年度）",
      version: "2026.1",
      filedOn: addDays(today, -195),
      effectiveFrom: addDays(today, -190),
      effectiveTo: addDays(today, 175),
      overrideValues: { monthlyOvertimeMaxMinutes: 80 * 60, restSplitMax: 2 },
      body:
        "1月あたりの時間外労働は80時間を超えないものとする。休息時間の分割は2回までとし、" +
        "分割する場合の最長休息は6時間以上とする。",
    },
    {
      ...mbase("sd-ag-2", at9(addDays(today, -400)), COMPANY_SCOPE_ID),
      kind: "work_rules",
      title: "就業規則（船員用）",
      version: "2025.2",
      filedOn: addDays(today, -395),
      effectiveFrom: addDays(today, -390),
      body: "基準労働期間は4週間とする。法定休日は週1日以上を付与する。",
    },
  ];

  const audits: AuditLogPayload[] = [
    {
      ...mbase("sd-au-1", at9(addDays(today, -40)), COMPANY_SCOPE_ID),
      action: "update",
      entityKind: "crew_master",
      entityId: "crew-kato",
      before: "保険 最終確認日: （未設定）",
      after: `保険 最終確認日: ${addDays(today, -40)}`,
      channel: "shore",
      actor: SHORE_PLANNER_ID,
      summary: "船員保険・労災・雇用保険の加入を通知書で確認",
    },
    {
      ...mbase("sd-au-2", at9(addDays(today, -12)), COMPANY_SCOPE_ID),
      action: "export",
      entityKind: "generated_document",
      entityId: "sd-doc-1",
      channel: "shore",
      actor: SHORE_PLANNER_ID,
      summary: "労務管理記録簿を海上労働検査へ提出",
    },
    {
      ...mbase("sd-au-3", at9(addDays(today, -5)), COMPANY_SCOPE_ID),
      action: "view_sensitive",
      entityKind: "crew_master",
      entityId: "crew-suzuki",
      channel: "shore",
      actor: SHORE_PLANNER_ID,
      summary: "既往歴・服薬状況を参照（配乗判断のため）",
    },
  ];

  return [
    ...docs.map((r) => makeRecordEvent("generated_document", r, SEED_DEVICE)),
    ...agreements.map((r) => makeRecordEvent("agreement", r, SEED_DEVICE)),
    ...audits.map((r) => makeRecordEvent("audit_log", r, SEED_DEVICE)),
  ];
}

/** マスタ・事務エンティティのデモイベント一式 */
export function makeMasterSeedEvents(today: string): SyncEvent[] {
  return [
    ...crewMasterSeed(today),
    ...credentialSeed(today),
    ...vesselMasterSeed(today),
    ...embarkationSeed(today),
    ...evaluationSeed(today),
    ...leaveSeed(today),
    ...maintenancePlanSeed(today),
    ...dockSeed(today),
    ...smsSeed(today),
    ...incidentSeed(today),
    ...wellbeingSeed(today),
    ...filingSeed(today),
    ...procedureSeed(today),
    ...trainingSeed(today),
    ...officeSeed(today),
    ...dispatchSeed(today),
    ...documentSeed(today),
  ];
}
