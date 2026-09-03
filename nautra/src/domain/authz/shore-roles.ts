/**
 * 陸上アプリのロールと権限（純関数・UI/DB 非依存）。
 *
 * 要件定義書 10.3:
 *   「健康情報等の要配慮個人情報を扱うため、個人情報保護法に準拠し、
 *    ロールベースの閲覧権限（**本人 / 船長 / 労務管理責任者 / 管理者**）、
 *    通信・保管の暗号化、アクセスログを必須とする」
 *
 * 要件定義書 3.1.5:
 *   「評価情報はハラスメントの温床とならないよう本人開示ルールを定め、評価者・閲覧者を限定する」
 *
 * 船内ロール（roles.ts の VesselRole）とは別体系にする。船内は「船の上の職掌」、
 * 陸上は「事務・管理の職責」であり、同じ表に混ぜると権限の意味が崩れるため。
 * 権限判定はこの表だけを唯一の情報源とし、画面に条件分岐を散らさない。
 */

export type ShoreRole =
  /** 労務管理責任者（船員法第67条の2。労務の把握・措置判断・承認） */
  | "labor_manager"
  /** 運航管理・配船担当 */
  | "operations"
  /** 事務（請求・経理・手続き） */
  | "clerk"
  /** 管理者（マスタ・権限・監査ログ） */
  | "admin";

export const SHORE_ROLES: ShoreRole[] = ["labor_manager", "operations", "clerk", "admin"];

/**
 * 陸上の権限キー。
 * - view_sensitive_*: 要配慮個人情報の参照（10.3）。参照そのものをアクセスログに残す
 * - edit_crew_master: 船員マスタの更新（12.3 単一経路。この画面以外からは更新しない）
 */
export type ShorePermission =
  | "view_dashboard"
  | "view_crew"
  | "edit_crew_master"
  | "view_sensitive_health"
  | "view_evaluation"
  | "edit_evaluation"
  | "approve_labor_manager"
  | "edit_leave"
  | "manage_manning"
  | "manage_filing"
  | "manage_procedures"
  | "manage_training"
  | "manage_fleet"
  | "manage_dispatch"
  | "manage_office"
  | "view_wellbeing"
  | "manage_documents"
  | "manage_settings"
  | "view_audit_log";

export const SHORE_PERMISSIONS: ShorePermission[] = [
  "view_dashboard",
  "view_crew",
  "edit_crew_master",
  "view_sensitive_health",
  "view_evaluation",
  "edit_evaluation",
  "approve_labor_manager",
  "edit_leave",
  "manage_manning",
  "manage_filing",
  "manage_procedures",
  "manage_training",
  "manage_fleet",
  "manage_dispatch",
  "manage_office",
  "view_wellbeing",
  "manage_documents",
  "manage_settings",
  "view_audit_log",
];

const BASE: ShorePermission[] = ["view_dashboard", "view_crew"];

export const SHORE_ROLE_PERMISSIONS: Record<ShoreRole, ShorePermission[]> = {
  /**
   * 労務管理責任者: 労務の承認・記録簿・休暇付与と、健康情報の参照。
   * 評価（人事考課）は閲覧者を限定する方針のため持たせない（3.1.5）。
   */
  labor_manager: [
    ...BASE,
    "view_sensitive_health",
    "approve_labor_manager",
    "edit_leave",
    "manage_training",
    "view_wellbeing",
    "manage_documents",
  ],
  /** 運航管理: 配乗・配船・船舶保守。個人の健康情報は扱わない */
  operations: [
    ...BASE,
    "manage_manning",
    "manage_fleet",
    "manage_dispatch",
    "manage_documents",
  ],
  /** 事務: 届出・手続き・請求・経理 */
  clerk: [...BASE, "manage_filing", "manage_procedures", "manage_office", "manage_documents"],
  /** 管理者: マスタ更新・権限・監査ログ。評価の閲覧・記入もここに限定する */
  admin: [
    ...BASE,
    "edit_crew_master",
    "view_sensitive_health",
    "view_evaluation",
    "edit_evaluation",
    "approve_labor_manager",
    "edit_leave",
    "manage_manning",
    "manage_filing",
    "manage_procedures",
    "manage_training",
    "manage_fleet",
    "manage_dispatch",
    "manage_office",
    "view_wellbeing",
    "manage_documents",
    "manage_settings",
    "view_audit_log",
  ],
};

/** ロールが権限を持つか（唯一の判定経路） */
export function canShore(role: ShoreRole, permission: ShorePermission): boolean {
  return SHORE_ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * 要配慮個人情報（既往歴・服薬状況等）を参照できるか。
 * 参照できる場合でも、呼び出し側は監査ログ（audit_log の view_sensitive）を残すこと（12.6）。
 */
export function canViewSensitive(role: ShoreRole): boolean {
  return canShore(role, "view_sensitive_health");
}
