import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { ShoreRole } from "@/domain/authz/shore-roles";
import { carryOverFields } from "@/lib/master-fields";
import { COMPANY_SCOPE_ID } from "@/lib/seed-masters";
import { effective, publishMaster, writeAuditLog } from "@/server/master-service";
import {
  SHORE_USER_ROLES,
  type ShoreUserPayload,
  type ShoreUserStatus,
} from "@/sync-protocol/masters";
import { SEED_SHORE_STAFF, type SeedShoreStaff } from "./shore-staff-seed";

/**
 * 陸上アプリのアカウント（要件定義書 10.3 / デザイン正本の S-15・サインイン画面）。
 *
 * **招待は本物のアカウントを作る**。監査ログに残すだけだと、招待された人は
 * 一覧にも出ずサインインもできず、「送ったのに使えない」が区別できないため。
 * 実体は追記型の `shore_user` エンティティで、ロール変更・無効化・パスワード再設定は
 * すべて supersedesId 付きの新しい版として積む（12.3 / ガードレール②）。
 *
 * 種は `shore-staff-seed.ts` のデモ用アカウント。ストアに同じ `userId` の行があれば
 * そちらが勝つ（＝デモアカウントのロール変更・無効化・パスワード変更もできる）。
 *
 * **パスワードは平文で保持しない**。scrypt の派生鍵とソルトだけを持ち、照合は
 * `timingSafeEqual` で行う。デモ用アカウントだけは合言葉を画面に出す必要があるため
 * 種の側に平文を残してあり、その旨をサインイン画面にも明記している。
 * 本番は Supabase Auth が保持し、アプリはハッシュごと持たない。
 */

export interface ShoreUser {
  id: string;
  name: string;
  role: ShoreRole;
  title: string;
  email: string;
  status: ShoreUserStatus;
  /** 扱える船（"all" ならすべて） */
  scope: string;
  /** デモ用アカウントの合言葉（サインイン画面に出す。招待されたアカウントは持たない） */
  demoPassword?: string;
  /** 招待コード（招待中のあいだだけ出す） */
  inviteCode?: string;
  invitedAt?: string;
  activatedAt?: string;
  lastSignInAt?: string;
  /** デモの種から来たアカウント（削除できない。ストアの上書きは効く） */
  seeded: boolean;
  /** 互換: 招待済みだが未登録（画面は status を見るのが正） */
  invitePending: boolean;
}

/* ═══════════════ パスワード ═══════════════ */

const SCRYPT_KEYLEN = 32;

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(password, salt, SCRYPT_KEYLEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * パスワードの強さ（サインイン画面の注記と同じ条件）。
 * 画面の文言と判定がずれると「言われたとおりに入れたのに弾かれる」が起きるため、
 * 条件はここだけに置き、画面は `PASSWORD_RULE_TEXT` を表示する。
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_RULE_TEXT = `${PASSWORD_MIN_LENGTH}文字以上で、英大文字・英小文字・数字をそれぞれ1つ以上含めてください`;

export function checkPasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return PASSWORD_RULE_TEXT;
  if (!/[A-Z]/.test(password)) return PASSWORD_RULE_TEXT;
  if (!/[a-z]/.test(password)) return PASSWORD_RULE_TEXT;
  if (!/[0-9]/.test(password)) return PASSWORD_RULE_TEXT;
  return null;
}

/** 招待コード・再設定コード（読み上げて伝えられるよう、紛らわしい文字を外す） */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(prefix: string): string {
  const pick = (n: number) =>
    Array.from(randomBytes(n))
      .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
      .join("");
  return `${prefix}-${pick(4)}-${pick(4)}`;
}

/* ═══════════════ 読み出し ═══════════════ */

function rowsByUserId(): Map<string, ShoreUserPayload> {
  const map = new Map<string, ShoreUserPayload>();
  for (const r of effective("shore_user")) map.set(r.userId, r);
  return map;
}

function fromSeed(seed: SeedShoreStaff): ShoreUser {
  return {
    id: seed.id,
    name: seed.name,
    role: seed.role,
    title: seed.title,
    email: seed.email,
    status: seed.invitePending ? "invited" : "active",
    scope: "all",
    demoPassword: seed.demoPassword,
    seeded: true,
    invitePending: Boolean(seed.invitePending),
  };
}

function fromRow(row: ShoreUserPayload, seed?: SeedShoreStaff): ShoreUser {
  return {
    id: row.userId,
    name: row.name,
    role: row.role as ShoreRole,
    title: row.title ?? seed?.title ?? "",
    email: row.email,
    status: row.status,
    scope: row.scope ?? "all",
    // 上書きでパスワードを設定したら、デモの合言葉はもう通らないので出さない
    demoPassword: row.passwordHash ? undefined : seed?.demoPassword,
    inviteCode: row.status === "invited" ? row.inviteCode : undefined,
    invitedAt: row.invitedAt,
    activatedAt: row.activatedAt,
    lastSignInAt: row.lastSignInAt,
    seeded: Boolean(seed),
    invitePending: row.status === "invited",
  };
}

/**
 * 全アカウント（種 → ストアの順に重ねる）。
 * 並びは「種の順 → 招待された順」で固定する（一覧が開くたびに入れ替わらないように）。
 */
export function listShoreUsers(): ShoreUser[] {
  const rows = rowsByUserId();
  const out: ShoreUser[] = [];
  const used = new Set<string>();

  for (const seed of SEED_SHORE_STAFF) {
    const row = rows.get(seed.id);
    used.add(seed.id);
    out.push(row ? fromRow(row, seed) : fromSeed(seed));
  }
  const extra = [...rows.values()]
    .filter((r) => !used.has(r.userId))
    .sort((a, b) => (a.invitedAt ?? a.occurredAt).localeCompare(b.invitedAt ?? b.occurredAt));
  for (const r of extra) out.push(fromRow(r));
  return out;
}

/** サインインできるアカウントだけ（招待中・無効化を外す） */
export function listActiveShoreUsers(): ShoreUser[] {
  return listShoreUsers().filter((u) => u.status === "active");
}

export function shoreUserById(id: string): ShoreUser | undefined {
  return listShoreUsers().find((u) => u.id === id);
}

export function shoreUserByEmail(email: string): ShoreUser | undefined {
  const normalized = email.trim().toLowerCase();
  return listShoreUsers().find((u) => u.email.toLowerCase() === normalized);
}

/* ═══════════════ 書き込み（すべて追記） ═══════════════ */

interface PublishInput {
  userId: string;
  fields: Record<string, unknown>;
  actor?: string;
  now?: Date;
}

/**
 * 1件ぶんの新しい版を積む。
 * 種にしか無いアカウント（まだストアに行が無い）は、種の内容を土台にして
 * 最初の行を作る——差分だけ積むと「氏名の無いユーザー」ができてしまうため。
 */
function publishShoreUser(input: PublishInput): ShoreUserPayload {
  const current = effective("shore_user").find((r) => r.userId === input.userId);
  const seed = SEED_SHORE_STAFF.find((s) => s.id === input.userId);
  const base = current
    ? carryOverFields(current as unknown as Record<string, unknown>)
    : seed
      ? {
          userId: seed.id,
          name: seed.name,
          email: seed.email,
          role: seed.role,
          title: seed.title,
          status: seed.invitePending ? "invited" : "active",
          scope: "all",
        }
      : {};
  return publishMaster(
    "shore_user",
    { ...base, ...input.fields },
    {
      vesselId: COMPANY_SCOPE_ID,
      supersedesId: current?.id,
      actor: input.actor,
      now: input.now,
    },
  );
}

export interface InviteShoreUserInput {
  email: string;
  role: string;
  name?: string;
  title?: string;
  scope?: string;
  actor: string;
  now?: Date;
}

export interface InvitedShoreUser {
  user: ShoreUser;
  /** 本人に伝える招待コード（PoC はメールを送らないので画面に出す） */
  inviteCode: string;
}

/**
 * 招待する（S-15）。**アカウントの実体を作る**ところまで行い、本人の登録を待つ。
 * 送信経路が無いぶんは招待コードを画面に返して、管理者が口頭・チャットで渡せるようにする。
 */
export function inviteShoreUser(input: InviteShoreUserInput): InvitedShoreUser {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("メールアドレスの形が正しくありません");
  }
  if (!(SHORE_USER_ROLES as readonly string[]).includes(input.role)) {
    throw new Error("ロールを選んでください");
  }
  const existing = shoreUserByEmail(email);
  if (existing && existing.status !== "disabled") {
    throw new Error(
      `${email} はすでに登録されています（${existing.name}／${
        existing.status === "invited" ? "招待中" : "有効"
      }）`,
    );
  }

  const now = input.now ?? new Date();
  const inviteCode = makeCode("NTR");
  const userId = existing?.id ?? `shore-u-${email.split("@")[0]!.replace(/[^a-z0-9]/g, "") || "user"}-${
    randomBytes(3).toString("hex")
  }`;

  const published = publishShoreUser({
    userId,
    fields: {
      userId,
      // 氏名は本人が登録のときに入れる。未入力のあいだはメールの手前を仮の名前にする
      name: input.name?.trim() || email.split("@")[0]!,
      email,
      role: input.role,
      title: input.title?.trim() || "招待中",
      status: "invited",
      scope: input.scope?.trim() || "all",
      inviteCode,
      invitedBy: input.actor,
      invitedAt: now.toISOString(),
      // 招待し直したときに前のパスワードが残らないようにする
      passwordHash: undefined,
      passwordSalt: undefined,
      resetCode: undefined,
      resetCodeExpiresAt: undefined,
      activatedAt: undefined,
    },
    actor: input.actor,
    now,
  });

  writeAuditLog({
    action: "create",
    entityKind: "shore_user",
    entityId: userId,
    after: `${input.role} / ${input.scope ?? "all"} / 招待中`,
    actor: input.actor,
    summary: `${email} を招待した（アカウントを作成。本人の登録待ち）`,
    now,
  });

  return { user: fromRow(published), inviteCode };
}

export interface ActivateShoreUserInput {
  email: string;
  inviteCode: string;
  password: string;
  name?: string;
  now?: Date;
}

/**
 * 招待コードでアカウントを有効にする（サインイン画面の「新規登録」）。
 * ここで初めてパスワードが決まる。ロールは招待した管理者が決めたものを動かさない。
 */
export function activateShoreUser(input: ActivateShoreUserInput): ShoreUser {
  const email = input.email.trim().toLowerCase();
  const row = effective("shore_user").find(
    (r) => r.email.toLowerCase() === email && r.status === "invited",
  );
  const code = input.inviteCode.trim().toUpperCase();
  if (!row || !row.inviteCode || row.inviteCode !== code) {
    throw new Error("招待コードとメールアドレスの組み合わせが見つかりませんでした");
  }
  const weak = checkPasswordStrength(input.password);
  if (weak) throw new Error(weak);

  const now = input.now ?? new Date();
  const salt = randomBytes(16).toString("hex");
  const published = publishShoreUser({
    userId: row.userId,
    fields: {
      name: input.name?.trim() || row.name,
      title: row.title === "招待中" ? "" : row.title,
      status: "active",
      activatedAt: now.toISOString(),
      passwordHash: hashPassword(input.password, salt),
      passwordSalt: salt,
      // 使い終わった招待コードは残さない（二人目が同じコードで入れないように）
      inviteCode: undefined,
    },
    actor: row.userId,
    now,
  });

  writeAuditLog({
    action: "update",
    entityKind: "shore_user",
    entityId: row.userId,
    before: "招待中",
    after: "有効",
    actor: row.userId,
    summary: `${published.name} が招待から登録してアカウントを有効にした`,
    now,
  });
  return fromRow(published);
}

/* ═══════════════ 照合 ═══════════════ */

/**
 * メール + パスワードの照合。
 * 招待中・無効化のアカウントは通さない（「送ったのに使えている」を作らない）。
 * パスワードを設定済みならハッシュで照合し、デモの種はそのままの合言葉で通す。
 */
export function authenticateShoreUser(email: string, password: string): ShoreUser | null {
  const normalized = email.trim().toLowerCase();
  const row = effective("shore_user").find((r) => r.email.toLowerCase() === normalized);
  const seed = SEED_SHORE_STAFF.find((s) => s.email.toLowerCase() === normalized);
  if (!row && !seed) return null;

  const user = row ? fromRow(row, seed) : fromSeed(seed!);
  if (user.status !== "active") return null;

  if (row?.passwordHash && row.passwordSalt) {
    return verifyPassword(password, row.passwordHash, row.passwordSalt) ? user : null;
  }
  if (seed && seed.demoPassword === password) return user;
  return null;
}

/** サインインできた日時を残す（招待したまま使われていないアカウントを見分けるため） */
export function recordShoreSignIn(userId: string, now = new Date()): void {
  publishShoreUser({ userId, fields: { lastSignInAt: now.toISOString() }, actor: userId, now });
}

/* ═══════════════ 管理（S-15） ═══════════════ */

export function changeShoreUserRole(
  userId: string,
  role: string,
  actor: string,
  now = new Date(),
): ShoreUser {
  if (!(SHORE_USER_ROLES as readonly string[]).includes(role)) {
    throw new Error("ロールを選んでください");
  }
  const before = shoreUserById(userId);
  if (!before) throw new Error("このユーザーは見つかりませんでした");
  if (before.role === role) return before;
  const published = publishShoreUser({ userId, fields: { role }, actor, now });
  writeAuditLog({
    action: "update",
    entityKind: "shore_user",
    entityId: userId,
    before: before.role,
    after: role,
    actor,
    summary: `${before.name} のロールを変更した`,
    now,
  });
  return fromRow(published);
}

/**
 * 無効化（S-15 → S-18）。実体は消さず、状態を `disabled` にしてサインインを止める。
 * 一覧から隠す・戻すの判定は `trash_entry` 側が持つ（復元の入口を1つにするため）。
 */
export function disableShoreUser(userId: string, actor: string, now = new Date()): ShoreUser {
  const before = shoreUserById(userId);
  if (!before) throw new Error("このユーザーは見つかりませんでした");
  if (before.id === actor) throw new Error("サインイン中の自分のアカウントは無効化できません");
  const published = publishShoreUser({ userId, fields: { status: "disabled" }, actor, now });
  return fromRow(published, SEED_SHORE_STAFF.find((s) => s.id === userId));
}

/** 復元（S-18）。無効化する前の状態へ戻す（登録前なら招待中、登録済みなら有効） */
export function enableShoreUser(userId: string, actor: string, now = new Date()): ShoreUser | null {
  const row = effective("shore_user").find((r) => r.userId === userId);
  if (!row || row.status !== "disabled") return null;
  const published = publishShoreUser({
    userId,
    fields: { status: row.passwordHash || !row.inviteCode ? "active" : "invited" },
    actor,
    now,
  });
  return fromRow(published, SEED_SHORE_STAFF.find((s) => s.id === userId));
}

/* ═══════════════ パスワード再設定 ═══════════════ */

/** 再設定コードの有効時間（分）。短くしすぎると受け渡しのあいだに切れる */
export const RESET_CODE_MINUTES = 30;

export interface ResetRequest {
  user: ShoreUser;
  resetCode: string;
  expiresAt: string;
}

/**
 * 再設定コードを発行する。メール送信経路が無いので、コードは画面に返して
 * 本人へ渡せるようにする（「送った体」で終わらせない）。
 * 存在しないメールでも同じ見た目にするかは画面側の判断——ここでは正直に返し、
 * 画面が「見つかりませんでした」を出す（社内利用で、総当たりの相手がいないため）。
 */
export function requestPasswordReset(email: string, now = new Date()): ResetRequest {
  const user = shoreUserByEmail(email);
  if (!user) throw new Error("このメールアドレスのアカウントは見つかりませんでした");
  if (user.status === "disabled") throw new Error("このアカウントは無効化されています");
  if (user.status === "invited") {
    throw new Error("このアカウントはまだ登録されていません。招待コードから登録してください");
  }
  const resetCode = makeCode("RST");
  const expiresAt = new Date(now.getTime() + RESET_CODE_MINUTES * 60_000).toISOString();
  publishShoreUser({
    userId: user.id,
    fields: { resetCode, resetCodeExpiresAt: expiresAt },
    actor: user.id,
    now,
  });
  writeAuditLog({
    action: "update",
    entityKind: "shore_user",
    entityId: user.id,
    after: "再設定コードを発行",
    actor: user.id,
    summary: `${user.name} のパスワード再設定コードを発行した`,
    now,
  });
  return { user, resetCode, expiresAt };
}

export interface CompleteResetInput {
  email: string;
  resetCode: string;
  password: string;
  now?: Date;
}

export function completePasswordReset(input: CompleteResetInput): ShoreUser {
  const now = input.now ?? new Date();
  const email = input.email.trim().toLowerCase();
  const row = effective("shore_user").find((r) => r.email.toLowerCase() === email);
  const code = input.resetCode.trim().toUpperCase();
  if (!row || !row.resetCode || row.resetCode !== code) {
    throw new Error("再設定コードとメールアドレスの組み合わせが見つかりませんでした");
  }
  if (row.resetCodeExpiresAt && row.resetCodeExpiresAt < now.toISOString()) {
    throw new Error(`再設定コードの有効時間（${RESET_CODE_MINUTES}分）を過ぎています`);
  }
  const weak = checkPasswordStrength(input.password);
  if (weak) throw new Error(weak);

  const salt = randomBytes(16).toString("hex");
  const published = publishShoreUser({
    userId: row.userId,
    fields: {
      passwordHash: hashPassword(input.password, salt),
      passwordSalt: salt,
      status: "active",
      resetCode: undefined,
      resetCodeExpiresAt: undefined,
    },
    actor: row.userId,
    now,
  });
  writeAuditLog({
    action: "update",
    entityKind: "shore_user",
    entityId: row.userId,
    after: "パスワードを再設定",
    actor: row.userId,
    summary: `${published.name} がパスワードを再設定した`,
    now,
  });
  return fromRow(published);
}
