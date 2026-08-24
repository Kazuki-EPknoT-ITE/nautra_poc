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
    await setMeta(SESSION_CREW_KEY, crew.id);
    await setMeta(SESSION_AT_KEY, new Date().toISOString());
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

export { SESSION_CREW_KEY, SESSION_AT_KEY };
