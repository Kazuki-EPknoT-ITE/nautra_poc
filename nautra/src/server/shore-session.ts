import { cookies } from "next/headers";
import {
  canShore,
  SHORE_ROLES,
  type ShorePermission,
  type ShoreRole,
} from "@/domain/authz/shore-roles";

/**
 * 陸上アプリのサインイン（要件定義書 10.3 ロールベースの閲覧権限）。
 *
 * PoC の簡略化: 担当者を選ぶだけの簡易サインインとし、セッションは HttpOnly Cookie に置く。
 * 本番は Supabase Auth（管理者ロールは MFA）＋ RLS でテナント・行レベルまで絞る。
 * ただし**権限判定の経路は本番と同じ**にしてある（`domain/authz/shore-roles.ts` の表が
 * 唯一の情報源で、画面は requireShore/hasShorePermission 経由でしか判定しない）。
 */

const COOKIE_NAME = "nautra_shore_session";

export interface ShoreStaff {
  id: string;
  name: string;
  role: ShoreRole;
  title: string;
}

/** デモの陸上スタッフ（本番は users テーブル + Supabase Auth） */
export const SHORE_STAFF_ACCOUNTS: ShoreStaff[] = [
  { id: "shore-yamamoto", name: "山本 陸", role: "labor_manager", title: "労務管理責任者" },
  { id: "shore-okada", name: "岡田 航", role: "operations", title: "運航管理者" },
  { id: "shore-nishi", name: "西 事務", role: "clerk", title: "事務担当" },
  { id: "shore-admin", name: "管理者アカウント", role: "admin", title: "システム管理者" },
];

export function shoreStaffById(id: string): ShoreStaff | undefined {
  return SHORE_STAFF_ACCOUNTS.find((s) => s.id === id);
}

/** 現在のサインイン中スタッフ（未サインインなら null） */
export async function getShoreSession(): Promise<ShoreStaff | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE_NAME)?.value;
  if (!id) return null;
  return shoreStaffById(id) ?? null;
}

export async function setShoreSession(staffId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, staffId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8時間（勤務時間相当）
  });
}

export async function clearShoreSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/**
 * 権限の判定（唯一の経路）。
 * 画面はこの関数の結果だけを見て出し分け、ロール名で分岐しない。
 */
export async function hasShorePermission(permission: ShorePermission): Promise<boolean> {
  const staff = await getShoreSession();
  if (!staff) return false;
  return canShore(staff.role, permission);
}

/** サインイン中スタッフのロール（未サインイン時は権限なしとして扱う） */
export async function currentShoreRole(): Promise<ShoreRole | null> {
  return (await getShoreSession())?.role ?? null;
}

/**
 * 画面の入口ガード。
 * - 未サインイン: サインイン画面へ誘導する
 * - 権限なし: 画面を描かず、理由だけを返す（他人の氏名・数値を一切出さない）
 *
 * 「権限のない画面はメニューにも出さない」方針（船内 GroupHeader と同じ）に加え、
 * URL 直打ちでも中身が見えないようにする二重の防御。
 */
export type ShoreGuard =
  | { ok: true; staff: ShoreStaff }
  | { ok: false; reason: "signed_out" | "forbidden"; staff: ShoreStaff | null };

export async function requireShore(permission: ShorePermission): Promise<ShoreGuard> {
  const staff = await getShoreSession();
  if (!staff) return { ok: false, reason: "signed_out", staff: null };
  if (!canShore(staff.role, permission)) return { ok: false, reason: "forbidden", staff };
  return { ok: true, staff };
}

export { SHORE_ROLES };
