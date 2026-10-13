import { cookies } from "next/headers";
import {
  canShore,
  SHORE_ROLES,
  type ShorePermission,
  type ShoreRole,
} from "@/domain/authz/shore-roles";
import { SEED_RESPONSIBLE_MANAGER } from "./shore-staff-seed";
import {
  authenticateShoreUser,
  listActiveShoreUsers,
  listShoreUsers,
  shoreUserById,
  type ShoreUser,
} from "./shore-user-service";

/**
 * 陸上アプリのサインイン（要件定義書 10.3 ロールベースの閲覧権限）。
 *
 * アカウントの実体は追記型の `shore_user` エンティティで、デモ用の種は
 * `shore-staff-seed.ts` に置く（読み書きは `shore-user-service.ts` が一手に引き受ける）。
 * この層は **Cookie とガード**だけを持つ——セッションの扱いとアカウントの扱いを
 * 混ぜると、招待・無効化のたびにガードの側を触ることになるため。
 *
 * PoC の簡略化: セッションは HttpOnly Cookie にアカウントIDを入れるだけ。
 * 本番は Supabase Auth（管理者ロールは MFA）＋ RLS でテナント・行レベルまで絞る。
 * ただし**権限判定の経路は本番と同じ**にしてある（`domain/authz/shore-roles.ts` の表が
 * 唯一の情報源で、画面は requireShore/hasShorePermission 経由でしか判定しない）。
 */

const COOKIE_NAME = "nautra_shore_session";

/** 陸上スタッフ（＝アカウント）。中身は `shore-user-service.ts` の ShoreUser */
export type ShoreStaff = ShoreUser;

/** 一覧・選択肢に出すアカウント（招待中・無効化を含む全件） */
export function listShoreStaff(): ShoreStaff[] {
  return listShoreUsers();
}

/** サインインできるアカウントだけ（評価者の選択肢・デモ用の並びに使う） */
export function listActiveShoreStaff(): ShoreStaff[] {
  return listActiveShoreUsers();
}

/**
 * 承認の最終権限者（デザインのサイドバー下部に出る「労務管理責任者」）。
 * 肩書きはストア側で変わりうるので毎回引き直す（種は見つからなかったときの拠り所）。
 */
export function responsibleManager(): ShoreStaff {
  const found = listActiveShoreUsers().find((s) => s.title === "労務管理責任者");
  if (found) return found;
  return {
    ...SEED_RESPONSIBLE_MANAGER,
    status: "active",
    scope: "all",
    seeded: true,
    invitePending: false,
  };
}

/**
 * メール + パスワードでの照合（デザイン正本のサインイン画面）。
 * 招待中・無効化のアカウントは通さない。判定は `shore-user-service.ts` が行う。
 */
export function authenticateShore(email: string, password: string): ShoreStaff | null {
  return authenticateShoreUser(email, password);
}

export function shoreStaffById(id: string): ShoreStaff | undefined {
  return shoreUserById(id);
}

/** 現在のサインイン中スタッフ（未サインインなら null） */
export async function getShoreSession(): Promise<ShoreStaff | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE_NAME)?.value;
  if (!id) return null;
  const staff = shoreStaffById(id);
  // 無効化されたアカウントの Cookie が残っていても中身は見せない
  return staff && staff.status === "active" ? staff : null;
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
