/**
 * i18n リソース（英語）— 外国人船員向け（要件定義書 10.2「多言語UI を拡張可能な設計とする」）。
 *
 * 方針:
 * - **辞書は部分的でよい**。未翻訳のキーは日本語へフォールバックする（i18n/index.ts）。
 *   全語彙の翻訳完了を待たずに言語を追加でき、翻訳は運用中に育てられる。
 * - 収録範囲は **船内アプリが使う語彙**を優先する（外国人船員が実際に触れる画面）。
 *   陸上の事務語彙は日本語へフォールバックする。
 * - 語形は船員向けの平易な英語にし、法令用語の直訳を避ける（10.2 ユーザビリティ）。
 */
export const en = {
  appSubtitle: "Crew operations management (PoC)",
  vesselApp: "Onboard app",
  shoreApp: "Shore app",

  workCategory: {
    navigation_watch: "Navigation watch",
    cargo: "Cargo work",
    standby: "Standby (waiting)",
    maintenance: "Maintenance",
    other: "Other work",
  } as Record<string, string>,

  action: {
    start: "Start",
    end: "End",
  } as Record<string, string>,

  entryType: {
    realtime: "Live punch",
    after: "Entered later",
    resubmit: "Re-entered after return",
  } as Record<string, string>,

  level: {
    ok: "OK",
    caution: "Caution",
    violation: "Warning",
    none: "No record",
  } as Record<string, string>,

  check: {
    daily_max: "Daily work-hour limit",
    weekly_max: "Weekly work-hour limit (any 7 days)",
    rest_total: "Total daily rest",
    rest_split: "Number of rest splits",
    rest_longest: "Longest rest period",
  } as Record<string, string>,

  checkExtra: {
    rest_day: "Rest day (at least 1 per week)",
    four_week_max: "Four-week work-hour limit",
    reference_period: "Weekly average over the reference period",
    monthly_overtime: "Monthly overtime limit",
  } as Record<string, string>,

  exceptionalWork: {
    safety_emergency: "Emergency / safety work",
    drill: "Drill / training",
  } as Record<string, string>,

  /** Everyday wording for the legal checks (shown on the onboard record book) */
  checkPlain: {
    daily_max: "Hours worked today",
    weekly_max: "Hours worked in the last 7 days",
    rest_total: "Total rest taken",
    rest_split: "Times the rest was split",
    rest_longest: "Longest single rest",
    four_week_max: "Hours worked in these 4 weeks",
    reference_period: "Average hours per week",
    monthly_overtime: "Overtime this month",
    rest_day: "Days off",
  } as Record<string, string>,

  wellbeingQuestion: {
    sleep: "Are you sleeping well?",
    fatigue: "Do you recover from tiredness?",
    appetite: "Do you have an appetite?",
    mood: "How is your mood?",
    workload: "Is your workload manageable?",
    irritable: "Do you feel irritable?",
    anxious: "Do you feel anxious?",
    concentration: "Do you find it hard to concentrate?",
    isolation: "Do you feel isolated, with nobody to talk to?",
    recovery: "Does tiredness stay with you after resting?",
  } as Record<string, string>,
  wellbeingScaleLow: {
    health_survey: "1 poor",
    stress_check: "1 not at all",
  } as Record<string, string>,
  wellbeingScaleHigh: {
    health_survey: "5 very good",
    stress_check: "5 very strong",
  } as Record<string, string>,

  approval: {
    approved: "Approved",
    remanded: "Returned for correction",
    pending: "Awaiting approval",
  } as Record<string, string>,

  role: {
    captain: "Master",
    deck_officer: "Deck officer",
    chief_engineer: "Chief engineer",
    deck_rating: "Deck rating",
  } as Record<string, string>,

  permission: {
    punch: "Record own work time",
    punch_after_entry: "Enter or re-enter own records",
    adjust_crew_punch: "Review and return others' records",
    manage_record_templates: "Add record items",
    view_own_ledger: "View own record book",
    approve_labor: "Approve work records onboard",
    view_all_crew: "View other crew records",
    write_logbook: "Write the deck log",
    write_checklist: "Fill in checklists",
    write_work_report: "Write work reports",
    write_maintenance: "Record equipment checks",
    view_shift: "View watch and station bills",
    view_sync: "View sync status",
  } as Record<string, string>,

  voyageLogType: {
    departure: "Departure",
    arrival: "Arrival",
    position: "Position report",
    remark: "Remarks",
  } as Record<string, string>,

  checklistTemplate: {
    pre_departure: "Pre-departure check",
    safety_patrol: "Safety patrol",
  } as Record<string, string>,
  checkResult: {
    ok: "Good",
    ng: "Defect",
    na: "N/A",
  } as Record<string, string>,
  overall: {
    pass: "Pass (no defects)",
    fail: "Fail (action required)",
  } as Record<string, string>,
  drillType: {
    fire: "Fire drill",
    abandon_ship: "Abandon-ship drill",
    man_overboard: "Man-overboard drill",
    emergency_steering: "Emergency steering drill",
    oil_spill: "Oil-spill drill",
    other: "Other training",
  } as Record<string, string>,
  alcoholResult: {
    pass: "Pass (fit for duty)",
    fail: "Fail (not fit for duty)",
  } as Record<string, string>,
  alcoholMethod: {
    detector: "Breath tester",
    visual: "Visual / interview",
  } as Record<string, string>,

  workReportType: {
    cargo: "Cargo operation",
    standby: "Standby waiting",
    fuel: "Bunker / fuel",
    handover: "Handover",
  } as Record<string, string>,
  cargoOperation: {
    load: "Loading",
    unload: "Discharging",
  } as Record<string, string>,
  fuelOperation: {
    bunkering: "Bunkering",
    consumption: "Consumption",
  } as Record<string, string>,

  equipment: {
    main_engine: "Main engine",
    generator: "Generator",
    steering_gear: "Steering gear",
    deck_machinery: "Deck machinery (winch / crane)",
    hull: "Hull and compartments",
    nav_equipment: "Navigation and radio equipment",
    lifesaving: "Life-saving and fire-fighting",
    other: "Other",
  } as Record<string, string>,
  maintenanceRecordType: {
    daily_inspection: "Daily inspection",
    maintenance: "Planned maintenance",
    repair: "Repair",
  } as Record<string, string>,
  condition: {
    good: "Good",
    attention: "Needs attention",
    defect: "Defective",
  } as Record<string, string>,

  shiftType: {
    navigation_watch: "Navigation watch",
    engine_watch: "Engine watch",
    port_watch: "Port watch",
    cargo_watch: "Cargo watch",
    off: "Off duty",
  } as Record<string, string>,
  stationScenario: {
    arrival_departure: "Arrival / departure stations",
    cargo: "Cargo stations",
    emergency: "Emergency stations (abandon ship / fire)",
  } as Record<string, string>,

  incidentKind: {
    accident: "Marine casualty",
    near_miss: "Near miss",
    injury: "Injury or illness",
    equipment: "Equipment damage",
    pollution: "Pollution / spill",
    container_loss: "Container lost overboard",
    other: "Other",
  } as Record<string, string>,
  incidentStatus: {
    open: "Reported",
    investigating: "Under investigation",
    closed: "Closed",
  } as Record<string, string>,

  wellbeingFormType: {
    health_survey: "Health questionnaire",
    stress_check: "Stress check",
    consultation: "Consultation / report",
  } as Record<string, string>,
  wellbeingStatus: {
    submitted: "Submitted",
    received: "Received by shore",
    responded: "Answered",
  } as Record<string, string>,

  credentialCategory: {
    license: "Certificate of competency",
    small_craft: "Small-craft licence",
    radio_operator: "Radio operator certificate",
    medical: "Medical certificate",
    stcw_basic: "STCW basic training certificate",
    stcw_practical: "Practical training certificate",
    endorsement: "Endorsement",
    vessel_survey: "Ship survey certificate",
    radio_station: "Radio station licence",
    other: "Other certificate",
  } as Record<string, string>,
  expiryState: {
    valid: "Valid",
    start_due: "Time to start renewal",
    expiring: "Expiring soon",
    expired: "Expired",
    no_expiry: "No expiry",
    unknown: "Expiry not recorded",
  } as Record<string, string>,
  freshnessState: {
    fresh: "Verified",
    stale: "Needs re-verification",
    never: "Never verified",
  } as Record<string, string>,

  /**
   * 9章 労務管理記録簿（第16号の5書式）の英語様式。
   * 印刷ビュー `/shore/labor/ledger/print?lang=en` がこの辞書から見出しを引く
   * （要件定義書 3.2.2「英語版様式にも対応可能な設計とする」）。
   */
  ledger: {
    documentTitle: "Record of Hours of Work and Rest",
    formNote: "Equivalent to Form No. 16-5, Ordinance for Enforcement of the Mariners Act (Japan)",
    vessel: "Ship",
    crew: "Seafarer",
    position: "Rank / Rating",
    seamanBookNo: "Seafarer's book No.",
    month: "Month",
    date: "Date",
    worked: "Hours of work",
    restTotal: "Hours of rest",
    restSplit: "Rest periods (splits)",
    restLongest: "Longest rest period",
    restDay: "Rest day",
    judgement: "Assessment",
    approval: "Approval",
    approver: "Approved by",
    total: "Total",
    workedDays: "Days worked",
    restDays: "Rest days",
    overtime: "Overtime",
    weeklyAverage: "Weekly average",
    exceptional: "Excluded from limits (emergency / safety work)",
    managerSign: "Labour management supervisor",
    captainSign: "Master",
    signName: "Name",
    signDate: "Date of approval",
    ruleVersion: "Applied rule version",
    generatedAt: "Generated at",
    pending: "Not approved",
    remanded: "Returned for correction",
    approved: "Approved",
    none: "—",
    sourceNote:
      "This record is derived from the original punch records every time it is displayed. The record itself cannot be edited.",
    printHint: "Use the browser print dialog to save as PDF. Paper size is A4 landscape.",
    language: "Language",
  } as Record<string, string>,

  laborRuleValue: {
    dailyMaxMinutes: "Daily limit on hours of work",
    weeklyMaxMinutes: "Limit for any seven consecutive days",
    restMinDailyMinutes: "Minimum total rest per day",
    restLongestMinMinutes: "Minimum length of the longest rest period",
    restSplitMax: "Maximum number of rest splits",
    cautionRatio: "Ratio that triggers a caution",
    restDaysPerWeek: "Rest days granted per week",
    referencePeriodDays: "Length of the reference period",
    referenceWeeklyAverageMinutes: "Weekly average limit over the reference period",
    fourWeekMaxMinutes: "Four-week limit on hours of work",
    monthlyOvertimeMaxMinutes: "Monthly overtime limit",
    dailyStandardMinutes: "Standard hours of work per day",
  } as Record<string, string>,

  syncKind: {
    time_record: "Work time",
    approval: "Approval / return",
    voyage_log: "Deck log",
    checklist_result: "Checklist",
    drill_record: "Drill record",
    alcohol_check: "Alcohol test",
    work_report: "Work / standby / fuel / handover",
    maintenance_record: "Inspection and maintenance",
    shift_plan: "Watch and station bill",
    record_template: "Record item template",
    notice: "Notice from shore",
  } as Record<string, string>,
} as const;
