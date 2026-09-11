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
  /** 社内の肩書き（ロールとは別。同じロールでも責任の重さが違うため表示を分ける） */
  title: string;
  /** サインイン ID（デザイン正本のメール + パスワード方式） */
  email: string;
  /** PoC のデモ用パスワード。本番は Supabase Auth が保持し、アプリは平文を持たない */
  demoPassword: string;
  /** 招待済みだが未ログイン（S-15 のユーザー管理で「招待中」と表示する） */
  invitePending?: boolean;
}

/**
 * デモの陸上スタッフ（本番は users テーブル + Supabase Auth）。
 * 氏名・メール・肩書きはデザイン正本 `design/poc_design` の S-15 ユーザー一覧に合わせる。
 *
 * 承認は労務管理責任者の役割（要件定義書 3.2）。`labor_manager` を持つ人が2名いるのは
 * 実務どおりで、**日々の起票は労務担当（白石）、最終確認は責任者（谷口）**が行う。
 */
export const SHORE_STAFF_ACCOUNTS: ShoreStaff[] = [
  {
    id: "shore-shiraishi",
    name: "白石 千夏",
    role: "labor_manager",
    title: "労務担当",
    email: "shiraishi@shoun-kaiun.co.jp",
    demoPassword: "nautra-demo",
  },
  {
    id: "shore-taniguchi",
    name: "谷口 亮子",
    role: "labor_manager",
    title: "労務管理責任者",
    email: "taniguchi@shoun-kaiun.co.jp",
    demoPassword: "nautra-demo",
  },
  {
    id: "shore-fujii",
    name: "藤井 圭",
    role: "operations",
    title: "運航担当",
    email: "fujii@shoun-kaiun.co.jp",
    demoPassword: "nautra-demo",
  },
  {
    id: "shore-okamoto",
    name: "岡本 遥",
    role: "clerk",
    title: "経理・事務",
    email: "okamoto@shoun-kaiun.co.jp",
    demoPassword: "nautra-demo",
  },
  {
    id: "shore-yamaguchi",
    name: "山口 隆",
    role: "admin",
    title: "海務部長（管理者）",
    email: "yamaguchi@shoun-kaiun.co.jp",
    demoPassword: "nautra-demo",
  },
  {
    id: "shore-shintani",
    name: "新谷 実",
    role: "labor_manager",
    title: "労務担当",
    email: "shintani@shoun-kaiun.co.jp",
    demoPassword: "nautra-demo",
    invitePending: true,
  },
];

/** 承認の最終権限者（デザインのサイドバー下部に出る「労務管理責任者」） */
export const RESPONSIBLE_MANAGER = SHORE_STAFF_ACCOUNTS.find(
  (s) => s.title === "労務管理責任者",
)!;

/**
 * メール + パスワードでの照合（デザイン正本のサインイン画面）。
 * PoC はデモ値の平文比較。本番は Supabase Auth に委ね、アプリはパスワードを保持しない。
 */
export function authenticateShore(email: string, password: string): ShoreStaff | null {
  const normalized = email.trim().toLowerCase();
  const staff = SHORE_STAFF_ACCOUNTS.find((s) => s.email.toLowerCase() === normalized);
  if (!staff || staff.invitePending) return null;
  return staff.demoPassword === password ? staff : null;
}

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
