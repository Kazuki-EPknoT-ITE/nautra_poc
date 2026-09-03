import { crewById, type CrewMember } from "./crew";
import { getMeta, setMeta, vesselDb } from "./vessel-db";

/**
 * 船内共用端末のサインイン（基本設計書 11.3）。
 * 「船員を顔写真リストから選択 + PIN」方式で、個人のクラウドセッションに依存させない。
 * セッションは端末内（IndexedDB meta）にのみ保持するため、通信断でもサインイン・記録が成立する。
 *
 * PoC の簡略化: PIN はデモ用にマスタへ平文で持つ。本番は Supabase Auth（メール+パスワード、
 * 管理者ロールは MFA）と端末登録（sync_devices）を併用し、PIN は打刻者特定の補助手段として
 * ハッシュ化して保持する。
 */

const SESSION_CREW_KEY = "sessionCrewId";
const SESSION_AT_KEY = "sessionStartedAt";

export interface SignInResult {
  ok: boolean;
  error?: string;
}

export async function signIn(crewMemberId: string, pin: string): Promise<SignInResult> {
  const crew = crewById(crewMemberId);
  if (!crew) return { ok: false, error: "船員が見つかりません" };
  if (pin.trim() !== crew.demoPin) return { ok: false, error: "PIN が違います" };
  await vesselDb.transaction("rw", vesselDb.meta, async () => {
    const now = new Date().toISOString();
    await setMeta(SESSION_CREW_KEY, crew.id);
    await setMeta(SESSION_AT_KEY, now);
    await setMeta("sessionLastActiveAt", now);
    // 対象船員の選択（船長のみ切替可）はサインインした本人に戻す
    await setMeta("selectedCrewId", crew.id);
  });
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await vesselDb.transaction("rw", vesselDb.meta, async () => {
    await setMeta(SESSION_CREW_KEY, "");
    await setMeta(SESSION_AT_KEY, "");
  });
}

export async function getSessionCrew(): Promise<CrewMember | null> {
  const id = await getMeta(SESSION_CREW_KEY);
  if (!id) return null;
  return crewById(id) ?? null;
}

/* ─────────── 放置時の自動サインアウト ───────────
 *
 * レビュー書の懸念事項「**毎度ログアウトしないと別のユーザーに情報が見られてしまう**」への対応。
 * 共用端末を置いたまま持ち場に戻ると、次に触った人が前の人の記録簿・労務判定を見られてしまう
 * （要件定義書 10.3 のロールベース閲覧制御が、端末の前では実質無効になる）。
 *
 * 最後の操作から一定時間が経ったらサインアウトする。
 * - 判定は**最後の操作時刻**で行い、タイマーではなく時刻の比較にする。
 *   タブが背面に回ると `setTimeout` は間引かれるため、時間で数えると当てにならない。
 * - **記録は消さない**。サインアウトしても IndexedDB の一次記録・未送信 outbox は残る
 *   （打刻が失われないことが最優先）。
 * - 閾値は運用で変わるため定数として1か所に置く（本番はテナント設定から供給する）。
 */

/** 放置とみなすまでの時間（分）。船橋で作業しながら触る間隔を考えて長めにとる */
export const IDLE_SIGN_OUT_MINUTES = 15;

const LAST_ACTIVE_KEY = "sessionLastActiveAt";

/** 操作があったことを記録する（画面側が定期的に呼ぶ） */
export async function touchSession(now = new Date()): Promise<void> {
  await setMeta(LAST_ACTIVE_KEY, now.toISOString());
}

/**
 * 放置による期限切れかを判定する（純粋な時刻比較）。
 * 記録が無い場合は「いま来たところ」とみなし、期限切れにしない。
 */
export async function isSessionExpired(now = new Date()): Promise<boolean> {
  const id = await getMeta(SESSION_CREW_KEY);
  if (!id) return false;
  const last = (await getMeta(LAST_ACTIVE_KEY)) || (await getMeta(SESSION_AT_KEY));
  if (!last) return false;
  const elapsedMs = now.getTime() - new Date(last).getTime();
  return elapsedMs > IDLE_SIGN_OUT_MINUTES * 60_000;
}

/**
 * 放置していたらサインアウトする。サインアウトしたら true を返す。
 * 呼び出し側は「置きっぱなしだったのでサインアウトしました」と理由を出す。
 */
export async function signOutIfIdle(now = new Date()): Promise<boolean> {
  if (!(await isSessionExpired(now))) return false;
  await signOut();
  return true;
}

/* ─────────── 生体認証（顔・指紋）でのサインイン ───────────
 *
 * 要件定義書 3.2.1「打刻認証は運用に応じ選択可能（認証なし＋打刻者表示 / IC カード /
 * **生体** / パスワード）」。レビュー書の「ログインの際に顔認証によるログインを行う」に対応する。
 *
 * 端末の生体認証（Windows Hello / Face ID / Android の顔・指紋）を使い、
 * **生体情報そのものは端末から出ない**（アプリもサーバも顔画像・指紋を受け取らない。10.3）。
 * 登録した資格情報のIDだけを端末内（IndexedDB meta）に保持し、照合は端末が行う。
 *
 * 登録は船員ごと・端末ごと。共用端末では乗り合わせた全員がそれぞれ登録できる。
 * 生体が使えない端末・登録していない船員は、これまでどおり PIN でサインインする
 * （生体を必須にすると、手袋・濡れた手・登録漏れで打刻ができなくなり記録が欠ける）。
 */

/** 船員ごとの生体資格情報IDを入れる meta キー */
function biometricKey(crewMemberId: string): string {
  return `biometricCredential:${crewMemberId}`;
}

/** この端末にその船員の生体認証が登録済みか */
export async function getBiometricCredentialId(crewMemberId: string): Promise<string | undefined> {
  return getMeta(biometricKey(crewMemberId));
}

/** 登録した資格情報IDを端末に保存する（生体情報そのものは保存しない） */
export async function saveBiometricCredentialId(
  crewMemberId: string,
  credentialId: string,
): Promise<void> {
  await setMeta(biometricKey(crewMemberId), credentialId);
}

/** 登録を取り消す（端末を手放すとき・別人に譲るとき） */
export async function clearBiometricCredentialId(crewMemberId: string): Promise<void> {
  await setMeta(biometricKey(crewMemberId), "");
}

/**
 * 生体認証でサインインする。
 * 端末が本人確認に成功したときだけセッションを開始する。
 * PIN と同じく、成立するのは端末内のセッションのみ（通信断でも動く）。
 */
export async function signInWithBiometric(crewMemberId: string): Promise<SignInResult> {
  const crew = crewById(crewMemberId);
  if (!crew) return { ok: false, error: "船員が見つかりません" };
  const credentialId = await getBiometricCredentialId(crewMemberId);
  if (!credentialId) {
    return { ok: false, error: "この端末には登録されていません。PIN でサインインしてください" };
  }
  const { verifyBiometric } = await import("./biometric-auth");
  const result = await verifyBiometric(credentialId);
  if (!result.ok) return { ok: false, error: result.error };

  await vesselDb.transaction("rw", vesselDb.meta, async () => {
    const now = new Date().toISOString();
    await setMeta(SESSION_CREW_KEY, crew.id);
    await setMeta(SESSION_AT_KEY, now);
    await setMeta("sessionLastActiveAt", now);
    await setMeta("selectedCrewId", crew.id);
  });
  return { ok: true };
}

export { SESSION_CREW_KEY, SESSION_AT_KEY };
