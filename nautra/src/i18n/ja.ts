/**
 * i18n リソース（日本語）。
 * 製品名はこの PRODUCT_NAME キーからのみ参照する（基本設計書 1.6 / ガードレール⑨）。
 * 画面・コンポーネントへの製品名ハードコードは禁止。
 */
export const PRODUCT_NAME = "Nautra";
export const PRODUCT_NAME_KANA = "ノートラ";

export const t = {
  appSubtitle: "船員業務管理アプリケーション（PoC）",
  vesselApp: "船内アプリ",
  shoreApp: "陸上アプリ",

  workCategory: {
    navigation_watch: "航海当直",
    cargo: "荷役",
    standby: "スタンバイ（待機）",
    maintenance: "保守整備",
    other: "その他作業",
  } as Record<string, string>,

  action: {
    start: "開始",
    end: "終了",
  } as Record<string, string>,

  entryType: {
    realtime: "即時打刻",
    after: "事後入力",
    resubmit: "差戻し再入力",
  } as Record<string, string>,

  level: {
    ok: "適合",
    caution: "注意",
    violation: "警告",
    none: "記録なし",
  } as Record<string, string>,

  check: {
    daily_max: "1日の労働時間上限",
    weekly_max: "連続1週間の労働時間上限",
    rest_total: "1日の休息時間合計",
    rest_split: "休息時間の分割回数",
    rest_longest: "最長休息時間",
  } as Record<string, string>,

  approval: {
    approved: "承認済",
    remanded: "差戻し",
    pending: "承認待ち",
  } as Record<string, string>,

  /** 船内ロール（権限は src/domain/authz。基本設計書 11.2） */
  role: {
    captain: "船長",
    deck_officer: "航海士",
    chief_engineer: "機関長",
    deck_rating: "甲板部員",
  } as Record<string, string>,

  /** 権限の表示名（権限表は src/domain/authz/roles.ts が唯一の情報源。ここは表示だけ） */
  permission: {
    punch: "打刻する",
    punch_after_entry: "事後入力・再入力",
    adjust_crew_punch: "他船員の打刻を確認・差戻し",
    manage_record_templates: "記録項目を追加する",
    view_own_ledger: "自分の記録簿を見る",
    approve_labor: "船内承認（労務）",
    view_all_crew: "他船員の記録を見る",
    write_logbook: "航海日誌を書く",
    write_checklist: "点検表を記録する",
    write_work_report: "作業記録を書く",
    write_maintenance: "機器の点検・保守を記録する",
    view_shift: "当直・配置表を見る",
    view_sync: "同期状態を見る",
  } as Record<string, string>,

  /** 同期イベント種別（V-09 送信キュー表示・S-01 受信状況） */
  syncKind: {
    time_record: "打刻",
    approval: "承認・差戻し",
    voyage_log: "航海日誌",
    checklist_result: "点検チェックリスト",
    drill_record: "操練記録",
    alcohol_check: "アルコール検知",
    work_report: "作業・待機・燃料・引継",
    maintenance_record: "日常点検・保守",
    shift_plan: "当直シフト・配置表",
    record_template: "記録項目テンプレート",
    notice: "船内へのお知らせ",
  } as Record<string, string>,

  /* ── 03 航海日誌 ── */
  voyageLogType: {
    departure: "出港",
    arrival: "入港",
    position: "定時記録（船位）",
    remark: "特記事項",
  } as Record<string, string>,

  /* ── 03 点検・操練・検知 ── */
  checklistTemplate: {
    pre_departure: "出港前点検",
    safety_patrol: "安全パトロール",
  } as Record<string, string>,
  checkResult: {
    ok: "良",
    ng: "不良",
    na: "該当なし",
  } as Record<string, string>,
  overall: {
    pass: "合格（異常なし）",
    fail: "不合格（要対応あり）",
  } as Record<string, string>,
  drillType: {
    fire: "防火操練",
    abandon_ship: "退船操練",
    man_overboard: "人命救助（落水者救助）操練",
    emergency_steering: "非常操舵操練",
    oil_spill: "油濁防止操練",
    other: "その他の訓練",
  } as Record<string, string>,
  alcoholResult: {
    pass: "適合（乗務可）",
    fail: "不適合（乗務不可）",
  } as Record<string, string>,
  alcoholMethod: {
    detector: "検知器",
    visual: "目視・問診",
  } as Record<string, string>,

  /* ── 05 作業・待機・燃料・引継 ── */
  workReportType: {
    cargo: "荷役作業",
    standby: "スタンバイ待機",
    fuel: "燃料",
    handover: "職務引継",
  } as Record<string, string>,
  cargoOperation: {
    load: "積荷",
    unload: "揚荷",
  } as Record<string, string>,
  fuelOperation: {
    bunkering: "補給",
    consumption: "消費",
  } as Record<string, string>,

  /* ── 05 日常点検・保守 ── */
  equipment: {
    main_engine: "主機関",
    generator: "発電機",
    steering_gear: "操舵装置",
    deck_machinery: "甲板機器（ウインチ・クレーン）",
    hull: "船体・区画",
    nav_equipment: "航海計器・無線",
    lifesaving: "救命・消防設備",
    other: "その他",
  } as Record<string, string>,
  maintenanceRecordType: {
    daily_inspection: "日常点検",
    maintenance: "定期保守",
    repair: "修繕",
  } as Record<string, string>,
  condition: {
    good: "良好",
    attention: "要注意",
    defect: "不良",
  } as Record<string, string>,

  /* ── 04 当直・シフト ── */
  shiftType: {
    navigation_watch: "航海当直",
    engine_watch: "機関当直",
    port_watch: "停泊当直",
    cargo_watch: "荷役当直",
    off: "非番",
  } as Record<string, string>,
  stationScenario: {
    arrival_departure: "出入港配置",
    cargo: "荷役配置",
    emergency: "非常配置（退船・消火）",
  } as Record<string, string>,

  /* ══════ マスタ・事務エンティティ（要件定義書 3.1/3.4〜3.9/6.2/9章/12章） ══════ */

  /** 3.1.3 資格・証書の区分 */
  credentialCategory: {
    license: "海技免状",
    small_craft: "小型船舶操縦士免許",
    radio_operator: "無線従事者資格",
    medical: "健康証明書",
    stcw_basic: "STCW 基本訓練修了証",
    stcw_practical: "実技講習修了証",
    endorsement: "認定（航海当直部員等）",
    vessel_survey: "船舶検査証書",
    radio_station: "無線局免許",
    other: "その他の証書",
  } as Record<string, string>,

  /** 12.4 確認方法（外部に正本があるデータの鮮度管理） */
  verifyMethod: {
    original: "原本を確認",
    document: "書類の写しを受領",
    notice: "通知書を受領",
    external_link: "外部連携で取得",
  } as Record<string, string>,

  /** 12.4 有効期限の状態（不適合と鮮度切れを区別する） */
  expiryState: {
    valid: "有効",
    start_due: "更新の着手時期",
    expiring: "まもなく期限",
    expired: "期限切れ",
    no_expiry: "期限なし",
    unknown: "期限未登録",
  } as Record<string, string>,
  freshnessState: {
    fresh: "確認済み",
    stale: "要再確認",
    never: "未確認",
  } as Record<string, string>,

  /** 3.1.2 配乗可否（導出値） */
  manningStatus: {
    eligible: "配乗できます",
    caution: "確認してから配乗",
    blocked: "配乗できません",
  } as Record<string, string>,

  /** 3.8.3⑥ 添付要件チェックの状態 */
  requirementState: {
    ok: "適合",
    recheck: "要再確認",
    ng: "不適合",
  } as Record<string, string>,

  /** 3.1.1 / 3.8.1 保険の区分 */
  insuranceKind: {
    seamen: "船員保険",
    workers_accident: "労災保険",
    employment: "雇用保険",
  } as Record<string, string>,

  /**
   * 3.1.1 船員マスタの項目名。
   * S-04 の入力欄・変更履歴・監査ログの「何を変えたか」で同じ言葉を使うための単一の引き当て口
   * （画面ごとに対応表を持たない）。
   */
  crewMasterField: {
    name: "氏名",
    nameKana: "氏名（カナ）",
    birthDate: "生年月日",
    seamanBookNo: "船員手帳番号",
    address: "住所",
    bloodType: "血液型",
    phone: "電話番号",
    position: "職名",
    employmentType: "雇用形態",
    hiredOn: "入社日",
    emergencyContactName: "緊急連絡先の氏名",
    emergencyContactRelation: "緊急連絡先の続柄",
    emergencyContactPhone: "緊急連絡先の電話番号",
    familyNote: "家族構成のメモ",
    medicalHistory: "既往歴",
    medication: "服薬状況",
    retiredOn: "退職日",
  } as Record<string, string>,

  /** 3.1.2 乗下船（配乗の実績・予定） */
  embarkationEvent: {
    on: "乗船",
    off: "下船",
  } as Record<string, string>,
  embarkationStatus: {
    planned: "予定",
    actual: "実績",
  } as Record<string, string>,
  embarkationContract: {
    start: "雇入契約の成立",
    renew: "雇入契約の更新",
    change: "雇入契約の変更",
    end: "雇入契約の終了",
  } as Record<string, string>,

  /** 3.1.5 人事考課の評価項目 */
  evaluationItem: {
    job_skill: "職務遂行能力",
    safety: "安全意識",
    teamwork: "協調性・コミュニケーション",
    discipline: "責任感・規律遵守",
    growth: "改善意欲・学習姿勢",
  } as Record<string, string>,

  /** 3.1.5 人事考課の5段階（テンプレート化による公平性確保。基準を言葉で固定する） */
  evaluationScore: {
    "1": "1 かなり改善が必要",
    "2": "2 改善の余地がある",
    "3": "3 期待どおり",
    "4": "4 期待以上",
    "5": "5 特に優れている",
  } as Record<string, string>,

  /** 3.2.4 休日・休暇の区分 */
  leaveKind: {
    statutory_holiday: "法定休日",
    compensatory: "補償休日",
    paid_leave: "有給休暇",
    special: "特別休暇",
  } as Record<string, string>,
  leaveAction: {
    grant: "付与",
    take: "取得",
  } as Record<string, string>,

  /** 3.2.5 追加した法令チェック項目 */
  checkExtra: {
    rest_day: "休日の付与（週1日以上）",
    four_week_max: "4週間の労働時間上限",
    reference_period: "基準労働期間の週平均",
    monthly_overtime: "1月の時間外労働上限",
  } as Record<string, string>,

  /** 3.2.5⑥ 上限算定から除外する労働 */
  exceptionalWork: {
    safety_emergency: "安全臨時労働・緊急作業",
    drill: "操練・訓練",
  } as Record<string, string>,

  /**
   * 法令チェック項目の**日常語**の名前（船内の記録簿・承認画面で使う）。
   * 法令用語の正式名（check / checkExtra）と対にし、画面には日常語のほうを出す
   * （要件定義書 10.2 / CLAUDE.md「文言は日常語で」）。
   */
  checkPlain: {
    daily_max: "1日に働いた時間",
    weekly_max: "この7日間に働いた時間",
    rest_total: "休んだ時間の合計",
    rest_split: "休みが分かれた回数",
    rest_longest: "いちばん長く休んだ時間",
    four_week_max: "この4週間に働いた時間",
    reference_period: "1週あたりの平均の働いた時間",
    monthly_overtime: "今月の残業した時間",
    rest_day: "休みの日数",
  } as Record<string, string>,

  /** 3.5.3 健康アンケート・ストレスチェックの設問（V-10。1〜5の5段階で答える） */
  wellbeingQuestion: {
    sleep: "よく眠れていますか",
    fatigue: "疲れは取れていますか",
    appetite: "食欲はありますか",
    mood: "気分はどうですか",
    workload: "仕事の量は無理がないですか",
    irritable: "いらいらすることがありますか",
    anxious: "不安を感じることがありますか",
    concentration: "集中しにくいと感じますか",
    isolation: "話し相手がなく孤立を感じますか",
    recovery: "休んでも疲れが残りますか",
  } as Record<string, string>,

  /** 5段階の両端に添える説明（設問群ごとに向きが違うため分けて持つ） */
  wellbeingScaleLow: {
    health_survey: "1 よくない",
    stress_check: "1 ぜんぜんない",
  } as Record<string, string>,
  wellbeingScaleHigh: {
    health_survey: "5 とてもよい",
    stress_check: "5 とても強い",
  } as Record<string, string>,

  /** 3.4.2 入渠・検査の区分 */
  dockKind: {
    periodic: "定期検査",
    intermediate: "中間検査",
    occasional: "臨時検査",
    repair: "修繕工事",
  } as Record<string, string>,
  dockStatus: {
    planned: "予定",
    in_progress: "進行中",
    done: "完了",
  } as Record<string, string>,
  findingStatus: {
    open: "未対応",
    in_progress: "対応中",
    closed: "完了",
  } as Record<string, string>,

  /** 3.4.1 部品在庫の発注状態 */
  orderStatus: {
    none: "手配なし",
    requested: "手配依頼中",
    ordered: "発注済",
    delivered: "入荷済",
  } as Record<string, string>,

  /** 3.5.1 安全管理システム（SMS） */
  smsDocKind: {
    policy: "安全方針・重点施策",
    risk_assessment: "リスクアセスメント",
    nonconformity: "不適合・是正措置",
    internal_audit: "内部監査",
  } as Record<string, string>,

  /** 3.5.2 事故・インシデント */
  incidentKind: {
    accident: "海難事故",
    near_miss: "ヒヤリハット",
    injury: "死傷病",
    equipment: "設備損傷",
    pollution: "油濁・排出",
    container_loss: "コンテナ海中転落",
    other: "その他",
  } as Record<string, string>,
  incidentStatus: {
    open: "報告済（未着手）",
    investigating: "原因分析中",
    closed: "対応完了",
  } as Record<string, string>,

  /** 3.5.3 健康・相談（V-10） */
  wellbeingFormType: {
    health_survey: "健康アンケート",
    stress_check: "ストレスチェック",
    consultation: "相談・通報",
  } as Record<string, string>,
  wellbeingStatus: {
    submitted: "送信済み",
    received: "陸上が受付",
    responded: "回答あり",
  } as Record<string, string>,
  /**
   * 3.5.3 健康アンケート・ストレスチェックの設問。
   * 船内の入力画面と陸上の集計画面が同じ言葉を使うための単一の引き当て口
   * （集計側で設問名の対応表を持たない）。未知のキーはそのまま表示する。
   */
  wellbeingAnswerItem: {
    sleep: "睡眠のとれ具合",
    fatigue: "疲れの残り具合",
    appetite: "食欲",
    mood: "気分の落ち着き",
    workload: "仕事量の負担",
    stress: "ストレスの感じ方",
    support: "相談できる相手がいるか",
  } as Record<string, string>,

  /** 3.9 主要機能③ 船内操練の次回期日（判定は domain/training/drills.ts） */
  drillState: {
    ok: "余裕あり",
    due_soon: "まもなく期日",
    overdue: "期日超過",
    never: "未実施",
  } as Record<string, string>,

  /** 3.8 届出 */
  filingType: {
    hire: "雇入（契約成立）",
    discharge: "雇止（契約終了）",
    renew: "雇入契約の更新",
    change: "雇入契約の変更",
  } as Record<string, string>,
  filingMethod: {
    paper: "①紙（窓口へ持参）",
    electronic: "②電子届出",
    bulk_electronic: "③一括届出（登録届出）",
  } as Record<string, string>,
  filingStatus: {
    draft: "作成中",
    checked: "添付要件チェック済",
    documents_ready: "書類生成済",
    submitted: "提出済",
    accepted: "受理済",
  } as Record<string, string>,

  /** 6.2 手続きの群と状態 */
  procedureGroup: {
    A: "A群 事業関連",
    B: "B群 乗下船の都度",
    C: "C群 周期・期限管理",
    D: "D群 突発・随時",
  } as Record<string, string>,
  procedureState: {
    scheduled: "予定",
    start_due: "着手時期",
    due_soon: "期限間近",
    overdue: "期限超過",
    done: "完了",
    canceled: "取り消し",
    no_due: "期限なし",
  } as Record<string, string>,
  /** 手続きの進み具合（記録に保持する値。期限の状態は procedureState で導出する） */
  procedureStatus: {
    open: "未着手",
    in_progress: "着手済",
    done: "完了",
    canceled: "取り消し",
  } as Record<string, string>,

  /** 3.9 訓練 */
  trainingKind: {
    stcw_basic: "STCW 基本訓練",
    stcw_practical: "登録実技講習（生存・消火）",
    license_renewal: "海技免状 更新講習",
    internal: "社内教育",
    other: "その他",
  } as Record<string, string>,
  trainingStatus: {
    needed: "受講が必要",
    arranged: "手配済",
    completed: "修了",
    canceled: "取り消し",
  } as Record<string, string>,

  /** 3.6 陸上事務 */
  charterType: {
    time_charter: "定期傭船",
    voyage_charter: "航海傭船",
    bareboat: "裸傭船",
  } as Record<string, string>,
  charterStatus: {
    active: "契約中",
    expired: "期間満了",
    terminated: "解約",
  } as Record<string, string>,
  invoiceStatus: {
    draft: "作成中",
    issued: "発行済",
    paid: "入金済",
    overdue: "入金遅延",
  } as Record<string, string>,
  expenseKind: {
    fuel: "燃料費",
    port: "港費",
    repair: "修繕費",
    supply: "船用品費",
    other: "その他",
  } as Record<string, string>,
  payrollStatus: {
    draft: "計算中",
    confirmed: "確定",
    paid: "支給済",
  } as Record<string, string>,
  subsidyCategory: {
    subsidy: "補助金申請",
    coastal_shipping_filing: "内航海運業法の届出",
    labor_inspection: "海上労働検査への対応",
    other: "その他の行政手続",
  } as Record<string, string>,
  subsidyStatus: {
    preparing: "準備中",
    applied: "申請済",
    approved: "採択・受理",
    rejected: "不採択",
    done: "完了",
  } as Record<string, string>,

  /** 3.7 配船・位置情報 */
  positionSource: {
    ais: "AIS",
    gps: "スマホGPS",
    manual: "手入力",
  } as Record<string, string>,
  navStatus: {
    underway: "航行中",
    moored: "係留・停泊中",
    cargo_ops: "荷役中",
    anchored: "錨泊中",
    unknown: "不明",
  } as Record<string, string>,
  scheduleStatus: {
    planned: "検討中",
    fixed: "確定",
    in_progress: "運航中",
    done: "完了",
    canceled: "取り消し",
  } as Record<string, string>,

  /** 9章 帳票 */
  documentKind: {
    labor_ledger: "労務管理記録簿（第16号の5書式）",
    hire_filing: "雇入（雇止）届出書（第六号書式）",
    change_filing: "雇入契約変更（更新）届出書",
    crew_list: "クルーリスト（海員名簿第六表）",
    crew_register: "海員名簿",
    bulk_permit: "一括届出許可申請書・電子届出登録申請書",
    electronic_filing_xlsx: "電子届出用 雇入（止）届出書",
    opinion_statement: "意見陳述書（オペレーター宛）",
    labor_agreement: "時間外労働等の労使協定書",
    operation_report: "運航実績レポート・月次報告書",
    drill_record_doc: "操練（訓練）実施記録",
    other: "その他の帳票",
  } as Record<string, string>,
  /** 9章 帳票の形式（S-14 一覧・再出力） */
  documentFormat: {
    pdf: "PDF",
    xlsx: "Excel",
    csv: "CSV",
    html: "画面（印刷でPDF化）",
  } as Record<string, string>,

  /** 6.5 協定・就業規則 */
  agreementKind: {
    labor_agreement: "労使協定",
    work_rules: "就業規則",
  } as Record<string, string>,

  /** 12.6 監査証跡 */
  auditAction: {
    create: "作成",
    update: "更新",
    view_sensitive: "要配慮情報の参照",
    export: "出力",
    sign_in: "サインイン",
    sign_out: "サインアウト",
  } as Record<string, string>,
  auditChannel: {
    shore: "陸上",
    vessel: "船内",
    external: "外部連携",
  } as Record<string, string>,

  /** 10.3 陸上ロール */
  shoreRole: {
    labor_manager: "労務管理責任者",
    operations: "運航管理",
    clerk: "事務",
    admin: "管理者",
  } as Record<string, string>,

  /** 陸上権限の表示名（判定表は domain/authz/shore-roles.ts が唯一の情報源） */
  shorePermission: {
    view_dashboard: "ダッシュボードを見る",
    view_crew: "船員一覧・カルテを見る",
    edit_crew_master: "船員マスタを更新する",
    view_sensitive_health: "要配慮情報（既往歴・服薬）を見る",
    view_evaluation: "人事考課を見る",
    edit_evaluation: "人事考課を記入する",
    approve_labor_manager: "労務を承認する（労務管理責任者）",
    edit_leave: "休日・有給を付与する",
    manage_manning: "配乗計画を立てる",
    manage_filing: "届出を作成・提出する",
    manage_procedures: "手続き・期限を管理する",
    manage_training: "訓練を管理する",
    manage_fleet: "船舶・保守・検査を管理する",
    manage_dispatch: "配船・位置情報を管理する",
    manage_office: "傭船・請求・経理を扱う",
    view_wellbeing: "健康アンケート・相談を見る",
    manage_documents: "帳票を生成・出力する",
    manage_settings: "設定・権限を変更する",
    view_audit_log: "監査ログを見る",
  } as Record<string, string>,

  /**
   * 6.5 労使協定で上書きできる判定閾値の表示名。
   * 値そのものは `src/rules/` が持ち、ここは表示名だけを持つ（画面に対応表を作らない）。
   */
  laborRuleValue: {
    dailyMaxMinutes: "1日に働ける時間の上限",
    weeklyMaxMinutes: "続けて1週間で働ける時間の上限",
    restMinDailyMinutes: "1日に休む時間の合計（下限）",
    restLongestMinMinutes: "続けて休む時間（下限）",
    restSplitMax: "休みを分けてよい回数",
    cautionRatio: "注意（黄）にする割合",
    restDaysPerWeek: "1週間に与える休日",
    referencePeriodDays: "基準労働期間の長さ",
    referenceWeeklyAverageMinutes: "基準労働期間の週平均（上限）",
    fourWeekMaxMinutes: "4週間で働ける時間の上限",
    monthlyOvertimeMaxMinutes: "1か月の時間外労働の上限",
    dailyStandardMinutes: "1日の所定労働時間",
  } as Record<string, string>,

  /**
   * S-15 テナント（事業者）設定の表示名。
   * PoC のデモ事業者名もここに置く（画面に事業者名を直書きしない）。
   */
  tenant: {
    demoName: "のーとら海運株式会社",
    id: "テナントID",
    name: "事業者名",
    vessels: "対象の船舶",
    ruleLabor: "労働時間・休息の基準",
    ruleSafety: "安全基準",
    ruleCredential: "証書の期限・鮮度の基準",
  } as Record<string, string>,

  /** 3.2.4 休日・有給の集計（付与・取得・残りは導出値） */
  leaveSummary: {
    granted: "付与",
    taken: "取得",
    remaining: "残り",
    expired: "時効切れ",
    expiring: "まもなく時効",
    unit: "日",
  } as Record<string, string>,

  /**
   * 9章 労務管理記録簿（第16号の5書式）の見出し。
   * 印刷・PDF 出力で使い、`translate(locale, "ledger", key)` から英語様式にも切り替える。
   */
  ledger: {
    documentTitle: "労務管理記録簿",
    formNote: "船員法施行規則 第16号の5書式に相当",
    vessel: "船舶名",
    crew: "船員氏名",
    position: "職名",
    seamanBookNo: "船員手帳番号",
    month: "対象年月",
    date: "日付",
    worked: "労働時間",
    restTotal: "休息時間",
    restSplit: "休息の分割回数",
    restLongest: "最長休息時間",
    restDay: "休日",
    judgement: "判定",
    approval: "承認",
    approver: "承認者",
    total: "合計",
    workedDays: "労働日数",
    restDays: "休日数",
    overtime: "時間外労働",
    weeklyAverage: "週平均労働時間",
    exceptional: "上限算定から除いた労働",
    managerSign: "労務管理責任者 承認欄",
    captainSign: "船長 確認欄",
    signName: "氏名",
    signDate: "承認日",
    ruleVersion: "適用ルール版",
    generatedAt: "作成日時",
    pending: "未承認",
    remanded: "差戻し",
    approved: "承認",
    none: "—",
    sourceNote: "この記録簿は打刻（一次記録）から毎回算出しています。記録簿を直接書き換えることはできません。",
    printHint: "ブラウザの印刷（Ctrl+P / ⌘P）から PDF として保存できます。用紙は A4 横です。",
    language: "表示言語",
  } as Record<string, string>,

  /** 3.2.2 国交省 Excel マクロ様式の取込（CSV 経由） */
  ledgerImport: {
    date: "日付",
    crew: "船員",
    category: "作業種別",
    start: "開始",
    end: "終了",
    note: "備考",
  } as Record<string, string>,

  /** 同期イベント種別（追加分。V-09 / S-01 の表示） */
  syncKindExtra: {
    crew_master: "船員マスタ",
    credential: "資格・証書",
    embarkation: "乗下船",
    evaluation: "人事考課",
    leave_record: "休日・有給",
    vessel_master: "船舶マスタ",
    maintenance_plan: "定期保守計画",
    part_stock: "部品在庫",
    dock_plan: "入渠・検査",
    sms_document: "安全管理（SMS）",
    incident_report: "事故・ヒヤリハット",
    wellbeing_response: "健康・相談",
    filing: "届出",
    procedure_task: "手続き・期限",
    training_plan: "訓練",
    charter_contract: "傭船契約",
    invoice: "請求",
    expense: "経費",
    payroll: "給与",
    subsidy: "補助金・行政手続",
    vessel_position: "船舶位置",
    voyage_schedule: "配船スケジュール",
    generated_document: "生成帳票",
    agreement: "労使協定・就業規則",
    audit_log: "監査ログ",
  } as Record<string, string>,
} as const;

/**
 * 同期イベント種別の表示名（船内記録＋マスタ・事務エンティティ）。
 * V-09 送信キューと S-01 受信状況が同じ語彙を使うための単一の引き当て口。
 */
export function syncKindLabel(kind: string): string {
  return t.syncKind[kind] ?? t.syncKindExtra[kind] ?? kind;
}

/** 法令チェック項目の表示名（既存5項目 + 3.2.5 で追加した4項目） */
export function checkLabel(key: string): string {
  return t.check[key] ?? t.checkExtra[key] ?? key;
}
