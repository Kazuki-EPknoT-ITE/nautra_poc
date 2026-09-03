/**
 * 生体認証（顔・指紋）によるサインイン（要件定義書 3.2.1「打刻認証は運用に応じ選択可能
 * （認証なし＋打刻者表示 / IC カード / **生体** / パスワード）」）。
 *
 * 実装方針:
 * - **WebAuthn のプラットフォーム認証器**を使う（Windows Hello / Touch ID / Face ID / Android の生体）。
 *   端末そのものが本人確認を行い、**生体情報は端末から出ない**。アプリもサーバも
 *   顔画像・指紋を受け取らない（個人情報保護法の要配慮個人情報を持たない設計。10.3）。
 * - **オフラインで成立すること**が船内の必須条件。ここでは端末内に登録した資格情報IDを
 *   IndexedDB に保存し、認証時は `navigator.credentials.get()` の成功だけを判断材料にする。
 *   通信は一切しない（本番はサーバ側で公開鍵を検証する。下記「本番との差分」）。
 * - 生体が使えない端末・環境では**必ず PIN に落ちる**。生体を必須にすると、
 *   手袋・濡れた手・共用端末の登録漏れで打刻ができなくなり、労働時間の記録が欠ける。
 *
 * 本番との差分（PoC の簡略化）:
 * - チャレンジは端末側で生成している。本番はサーバが発行し、署名を検証して初めて
 *   サインインを認める（リプレイ防止）。`sync_devices` に公開鍵を登録する。
 * - ここでの成功は「**この端末に登録した本人がいる**」ことの確認であり、
 *   サーバから見た認証ではない。オフライン運用の現実解として、端末内セッションの
 *   開始条件に用いる（基本設計書 11.3 と同じ位置づけ）。
 */

/** 端末に生体認証（プラットフォーム認証器）があるか */
export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * 乱数チャレンジ。
 * TypeScript の `Uint8Array<ArrayBufferLike>` は `BufferSource` に代入できないため、
 * ArrayBuffer を明示して作る（SharedArrayBuffer の可能性を排除する）。
 */
function randomChallenge(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(32));
  crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface BiometricResult {
  ok: boolean;
  /** 登録した資格情報ID（端末に保存して次回の認証に使う） */
  credentialId?: string;
  error?: string;
}

/**
 * この端末に、その船員の生体認証を登録する（初回のみ）。
 * 共用端末では船員ごとに1件ずつ登録され、認証時は本人の資格情報だけを候補にする。
 */
export async function registerBiometric(params: {
  crewMemberId: string;
  crewName: string;
}): Promise<BiometricResult> {
  if (!(await isBiometricAvailable())) {
    return { ok: false, error: "この端末では生体認証が使えません" };
  }
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: "Nautra" },
        user: {
          // 生体情報ではなく船員IDのみを載せる（端末に残る値も最小限にする）
          id: new TextEncoder().encode(params.crewMemberId),
          name: params.crewMemberId,
          displayName: params.crewName,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          // 端末内蔵の認証器に限る（外付けキーではなく顔・指紋を使う運用）
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60_000,
        attestation: "none", // 端末の識別情報を集めない
      },
    })) as PublicKeyCredential | null;

    if (!credential) return { ok: false, error: "登録できませんでした" };
    return { ok: true, credentialId: toBase64Url(credential.rawId) };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/**
 * 登録済みの生体認証で本人確認する。
 * 成功したら「この端末の登録者本人がいる」と判断してサインインを進める。
 */
export async function verifyBiometric(credentialId: string): Promise<BiometricResult> {
  if (!(await isBiometricAvailable())) {
    return { ok: false, error: "この端末では生体認証が使えません" };
  }
  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: [{ type: "public-key", id: fromBase64Url(credentialId) }],
        userVerification: "required",
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) return { ok: false, error: "確認できませんでした" };
    return { ok: true, credentialId: toBase64Url(assertion.rawId) };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** 失敗理由を日常語にする（利用者は WebAuthn の用語を知らない） */
function describeError(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError") return "確認が取り消されたか、時間切れになりました";
  if (name === "InvalidStateError") return "この端末には既に登録されています";
  if (name === "SecurityError")
    return "安全な接続（HTTPS）でないため使えません。PIN でサインインしてください";
  return "生体認証を使えませんでした。PIN でサインインしてください";
}
