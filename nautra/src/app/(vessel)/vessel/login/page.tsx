"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { isBiometricAvailable, registerBiometric } from "@/lib/biometric-auth";
import { cn } from "@/lib/cn";
import { CREW_MEMBERS, type CrewMember } from "@/lib/crew";
import { useSessionCrew } from "@/lib/vessel-hooks";
import {
  getBiometricCredentialId,
  saveBiometricCredentialId,
  signIn,
  signInWithBiometric,
} from "@/lib/vessel-session";
import { CrewPickerGrid, LoginCard, PinDots } from "./_components/login-body";

const PIN_LENGTH = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

/**
 * 船内サインイン（基本設計書 11.3）。
 * 共用端末での本人特定は「船員を顔写真リストから選択 + PIN」方式とし、個人のクラウド
 * セッションに依存させない。セッションは端末内にのみ保持するため、通信断でも成立する。
 * サインインしたロールに応じて、以降の画面の表示・操作可能範囲が変わる（11.2）。
 */
export default function VesselLoginPage() {
  const router = useRouter();
  const session = useSessionCrew();
  const searchParams = useSearchParams();
  const idle = searchParams.get("reason") === "idle";
  const [selected, setSelected] = useState<CrewMember | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 端末が顔・指紋に対応しているか（未判定は null） */
  const [bioAvailable, setBioAvailable] = useState<boolean | null>(null);
  /** 選んだ船員がこの端末に生体を登録済みか */
  const [bioRegistered, setBioRegistered] = useState(false);
  const [bioNotice, setBioNotice] = useState<string | null>(null);

  // サインイン済みならメニューへ
  useEffect(() => {
    if (session) router.replace("/vessel");
  }, [session, router]);

  // 端末の対応状況は一度だけ調べる（対応していなければ生体の導線を出さない）
  useEffect(() => {
    let alive = true;
    void isBiometricAvailable().then((ok) => {
      if (alive) setBioAvailable(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 選んだ船員の登録状況を読む（登録済みなら「顔・指紋でサインイン」を出す）
  useEffect(() => {
    let alive = true;
    if (!selected) {
      setBioRegistered(false);
      return;
    }
    void getBiometricCredentialId(selected.id).then((id) => {
      if (alive) setBioRegistered(Boolean(id));
    });
    return () => {
      alive = false;
    };
  }, [selected]);

  /** 顔・指紋でサインインする（端末が本人確認し、生体情報は端末から出ない） */
  const submitBiometric = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithBiometric(selected.id);
      if (result.ok) router.replace("/vessel");
      else setError(result.error ?? "確認できませんでした");
    } finally {
      setBusy(false);
    }
  }, [selected, router]);

  /** この端末に顔・指紋を登録する（登録後も PIN は使えるままにする） */
  async function register() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setBioNotice(null);
    try {
      const result = await registerBiometric({
        crewMemberId: selected.id,
        crewName: selected.name,
      });
      if (result.ok && result.credentialId) {
        await saveBiometricCredentialId(selected.id, result.credentialId);
        setBioRegistered(true);
        setBioNotice("この端末に登録しました。次からは顔・指紋でサインインできます。");
      } else {
        setError(result.error ?? "登録できませんでした");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submit(nextPin: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signIn(selected.id, nextPin);
      if (result.ok) {
        router.replace("/vessel");
      } else {
        setError(result.error ?? "サインインできませんでした");
        setPin("");
      }
    } finally {
      setBusy(false);
    }
  }

  function press(key: (typeof KEYS)[number]) {
    setError(null);
    if (key === "clear") return setPin("");
    if (key === "back") return setPin((p) => p.slice(0, -1));
    setPin((p) => {
      const next = (p + key).slice(0, PIN_LENGTH);
      if (next.length === PIN_LENGTH) void submit(next);
      return next;
    });
  }

  const demoPins = CREW_MEMBERS.map((c) => `${c.name.split(" ")[0]} ${c.demoPin}`).join(" / ");

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-3.5">
      <h1 className="m-0 text-3xl font-bold text-foreground-900">サインイン</h1>

      {/* 放置で自動サインアウトしたときは、故障と間違われないよう理由を出す */}
      {idle ? (
        <p className="m-0 rounded-small bg-warning-100 px-4 py-3 text-lg leading-relaxed text-foreground-700">
          <span aria-hidden="true">⏱ </span>
          しばらく操作がなかったため、サインアウトしました。
          <span className="text-foreground-500">
            {" "}
            共用の端末で、次に使う人に前の人の記録が見えないようにするためです。記録は消えていません。
          </span>
        </p>
      ) : null}

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_356px]">
        <div className="flex flex-col gap-3.5">
          <LoginCard title="1. ユーザーを選択">
            <CrewPickerGrid
              selectedId={selected?.id ?? null}
              onSelect={(c) => {
                setSelected(c);
                setPin("");
                setError(null);
              }}
            />
          </LoginCard>

          {/* 生体認証（3.2.1 の認証方式の選択制）。対応端末でのみ出す。
              登録済みなら1タップでサインインでき、未登録なら PIN のあとで登録できる */}
          {bioAvailable && selected ? (
            <LoginCard title={bioRegistered ? "顔・指紋でサインイン" : "顔・指紋を使う（任意）"}>
              <div className="flex flex-col items-start gap-3">
                {bioRegistered ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void submitBiometric()}
                      className="ui-btn-primary min-h-14 w-full text-xl"
                    >
                      {selected.name} として顔・指紋で入る
                    </button>
                    <p className="m-0 text-base text-foreground-500">
                      うまくいかないときは、右の PIN でサインインできます。
                    </p>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void register()}
                      className="ui-btn-ghost min-h-14 w-full text-lg"
                    >
                      この端末に顔・指紋を登録する
                    </button>
                    <p className="m-0 text-base text-foreground-500">
                      登録すると、次から PIN を打たずに入れます。登録後も PIN は使えます。
                    </p>
                  </>
                )}
                {bioNotice ? <p className="m-0 text-base font-semibold">✓ {bioNotice}</p> : null}
                <p className="m-0 text-sm text-foreground-500">
                  顔・指紋の情報はこの端末の中だけで照合され、アプリにも陸上にも送られません。
                </p>
              </div>
            </LoginCard>
          ) : null}
        </div>

        <LoginCard title={selected ? `2. ${selected.name} さんの PIN（4桁）` : "2. PIN（4桁）を入力"}>
          <PinDots filled={pin.length} length={PIN_LENGTH} />

          <p
            className={cn(
              "m-0 mt-3 text-center text-base",
              error ? "font-semibold text-danger" : "text-foreground-500",
            )}
            aria-live="polite"
          >
            {error
              ? `✕ ${error}`
              : !selected
                ? "先に自分を選んでください。"
                : "4桁目を入力すると自動で照合します。"}
          </p>

          <div className="mt-2.5 grid w-full grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                disabled={!selected || busy}
                aria-label={k === "clear" ? "クリア" : k === "back" ? "1文字消す" : k}
                onClick={() => press(k)}
                className={cn(
                  "min-h-[60px] rounded-small border text-2xl font-bold transition-colors disabled:opacity-45",
                  k === "clear" || k === "back"
                    ? "border-[var(--ui-hairline-strong)] bg-content1 text-lg text-foreground-700"
                    : "border-[var(--ui-hairline-strong)] bg-content1 text-foreground-900 hover:bg-content2",
                )}
              >
                {k === "clear" ? "クリア" : k === "back" ? "← 消す" : k}
              </button>
            ))}
          </div>

          <p className="m-0 mt-3 text-center font-mono text-sm leading-relaxed text-foreground-500">
            デモ用 PIN: {demoPins}
          </p>
        </LoginCard>
      </div>

      <p className="text-pretty text-sm text-foreground-500">
        共用端末での本人特定は「顔写真リストから選択 + PIN」方式です（基本設計書 11.3）。
        PIN は船員ごとに違い、4桁目の入力で自動照合します。端末が対応していれば、顔・指紋での
        本人確認も選べます（要件定義書 3.2.1 の認証方式は運用に応じて選べる方針。IC カードは本番で追加）。
        セッションは端末内にのみ保持され、通信断でもサインイン・記録ができます。
      </p>
    </div>
  );
}
