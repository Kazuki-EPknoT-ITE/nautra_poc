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
} as const;
