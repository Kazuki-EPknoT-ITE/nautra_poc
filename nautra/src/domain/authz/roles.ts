/**
 * packages/domain/authz 相当。船内アプリのロールと権限（純関数・UI/DB 非依存）。
 *
 * 基本設計書 11.2 の権限マトリクス（打刻・労働時間: 本人=打刻/参照、船長=承認/参照、
 * 修正は本人差戻しのみ）を船内画面に展開したもの。職掌（航海士・機関長・甲板部員）は
 * 記録の主担当を表し、担当外の記録は「参照のみ」とする。
 *
 * 権限判定はこの表だけを唯一の情報源とし、画面側に条件分岐を散らさない
 * （基本設計書 11.1「権限判定を一箇所へ集約」の PoC 表現）。
 */

/** 船内で利用するロール（陸上の労務管理責任者・管理者は本 PoC の対象外） */
export type VesselRole = "captain" | "deck_officer" | "chief_engineer" | "deck_rating";

export const VESSEL_ROLES: VesselRole[] = [
  "captain",
  "deck_officer",
  "chief_engineer",
  "deck_rating",
];

/**
 * 権限キー。
 * - punch/view_own_*: 本人の記録に対する権限（全ロール共通）
 * - approve_labor   : 日次労務の承認・差戻し（船長のみ。11.2）
 * - view_all_crew   : 他船員の記録の参照・対象船員の切替（船長のみ）
 * - write_*         : 各記録の作成（職掌の主担当のみ。担当外は参照のみ）
 */
export type Permission =
  | "punch"
  | "view_own_ledger"
  | "approve_labor"
  | "view_all_crew"
  | "write_logbook"
  | "write_checklist"
  | "write_work_report"
  | "write_maintenance"
  | "view_shift"
  | "view_sync";

const COMMON: Permission[] = [
  "punch",
  "view_own_ledger",
  "write_checklist",
  "write_work_report",
  "view_shift",
  "view_sync",
];

export const ROLE_PERMISSIONS: Record<VesselRole, Permission[]> = {
  // 船長: 船内の全機能。日次労務の承認・差戻しと全船員の参照は船長のみ（11.2）
  captain: [
    ...COMMON,
    "approve_labor",
    "view_all_crew",
    "write_logbook",
    "write_maintenance",
  ],
  // 航海士: 航海当直の主担当。航海日誌の記入を担う
  deck_officer: [...COMMON, "write_logbook"],
  // 機関長: 機関の主担当。日常点検・保守記録の記入を担う
  chief_engineer: [...COMMON, "write_maintenance"],
  // 甲板部員: 打刻・点検・作業記録。日誌と保守記録は参照のみ
  deck_rating: [...COMMON],
};

/** ロールが権限を持つか（唯一の判定経路） */
export function can(role: VesselRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** 対象船員を切り替えられるか（できない場合は本人固定） */
export function canSwitchCrew(role: VesselRole): boolean {
  return can(role, "view_all_crew");
}
