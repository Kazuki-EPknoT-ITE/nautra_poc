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
import { Avatar, Button, CardBody, CardHeader, GlassCard } from "@/ui";

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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <h1 className="text-balance text-2xl font-bold">サインイン</h1>

      {/* 放置で自動サインアウトしたときは、故障と間違われないよう理由を出す */}
      {idle ? (
        <p className="glass-inset p-3 text-base">
          <span aria-hidden="true">⏱ </span>
          しばらく操作がなかったため、サインアウトしました。
          <span className="text-foreground-600">
            {" "}
            共用の端末で、次に使う人に前の人の記録が見えないようにするためです。記録は消えていません。
          </span>
        </p>
      ) : null}

      <GlassCard blurred>
        <CardHeader className="px-5 pb-2 pt-5 text-base font-bold">
          1. 自分を選ぶ
        </CardHeader>
        <CardBody className="px-5 pb-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="船員の選択">
            {CREW_MEMBERS.map((c) => {
              const active = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setSelected(c);
                    setPin("");
                    setError(null);
                  }}
                  className={cn(
                    "glass-tile flex min-h-32 flex-col items-center justify-center gap-1 px-3 py-4",
                    active ? "border-2 border-primary bg-primary/10" : "border-2 border-transparent",
                  )}
                >
                  <Avatar
                    name={c.initial}
                    color={active ? "primary" : "default"}
                    size="lg"
                    className="text-xl font-bold"
                  />
                  <span className="text-base font-semibold">
                    {active ? <span aria-hidden="true">✓ </span> : null}
                    {c.name}
                  </span>
                  <span className="text-sm text-foreground-600">{c.position}</span>
                </button>
              );
            })}
          </div>
        </CardBody>
      </GlassCard>

      {/* 生体認証（3.2.1 の認証方式の選択制）。対応端末でのみ出す。
          登録済みなら1タップでサインインでき、未登録なら PIN のあとで登録できる */}
      {bioAvailable && selected ? (
        <GlassCard blurred>
          <CardHeader className="px-5 pb-2 pt-5 text-base font-bold">
            {bioRegistered ? "2. 顔・指紋でサインイン" : "顔・指紋を使う（任意）"}
          </CardHeader>
          <CardBody className="flex flex-col items-start gap-3 px-5 pb-5">
            {bioRegistered ? (
              <>
                <Button
                  color="primary"
                  size="lg"
                  className="min-h-14 w-full text-lg font-bold sm:w-auto sm:px-10"
                  isDisabled={busy}
                  onPress={() => void submitBiometric()}
                >
                  {selected.name} として顔・指紋で入る
                </Button>
                <p className="text-sm text-foreground-600">
                  うまくいかないときは、下の PIN でサインインできます。
                </p>
              </>
            ) : (
              <>
                <Button
                  variant="bordered"
                  size="lg"
                  className="min-h-14 border-[var(--glass-border-strong)]"
                  isDisabled={busy}
                  onPress={() => void register()}
                >
                  この端末に顔・指紋を登録する
                </Button>
                <p className="text-sm text-foreground-600">
                  登録すると、次から PIN を打たずに入れます。登録後も PIN は使えます。
                </p>
              </>
            )}
            {bioNotice ? <p className="text-sm font-semibold">✓ {bioNotice}</p> : null}
            <p className="text-xs text-foreground-600">
              顔・指紋の情報はこの端末の中だけで照合され、アプリにも陸上にも送られません。
            </p>
          </CardBody>
        </GlassCard>
      ) : null}

      <GlassCard blurred>
        <CardHeader className="px-5 pb-2 pt-5 text-base font-bold">
          {bioAvailable && selected && bioRegistered ? "3. PIN（4桁）を入力" : "2. PIN（4桁）を入力"}
        </CardHeader>
        <CardBody className="flex flex-col items-center gap-4 px-5 pb-5">
          <div className="flex items-center gap-3" aria-label="入力済みの桁数" aria-live="polite">
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "size-5 rounded-full border-2 border-foreground-400",
                  i < pin.length && "bg-foreground",
                )}
              />
            ))}
          </div>

          <div className="grid w-full max-w-xs grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <Button
                key={k}
                variant={k === "clear" || k === "back" ? "bordered" : "solid"}
                color={k === "clear" || k === "back" ? "default" : "primary"}
                radius="md"
                isDisabled={!selected || busy}
                aria-label={k === "clear" ? "クリア" : k === "back" ? "1文字消す" : k}
                className={cn(
                  "min-h-14 text-xl font-bold",
                  (k === "clear" || k === "back") &&
                    "border-[var(--glass-border-strong)] text-base text-foreground",
                )}
                onPress={() => press(k)}
              >
                {k === "clear" ? "クリア" : k === "back" ? "← 消す" : k}
              </Button>
            ))}
          </div>

          {!selected ? (
            <p className="text-foreground-600">先に自分を選んでください。</p>
          ) : null}
          {error ? <p className="font-semibold text-danger">✕ {error}</p> : null}
          <p className="text-sm text-foreground-600">
            デモ用 PIN: 加藤 1111 / 佐藤 2222 / 鈴木 3333 / 田中 4444
          </p>
        </CardBody>
      </GlassCard>

      <p className="text-pretty text-xs text-foreground-600">
        共用端末での本人特定は「顔写真リストから選択 + PIN」方式です（基本設計書 11.3）。
        端末が対応していれば、顔・指紋での本人確認も選べます（要件定義書 3.2.1 の認証方式は
        運用に応じて選べる方針。IC カードは本番で追加）。
        セッションは端末内にのみ保持され、通信断でもサインイン・記録ができます。
      </p>
    </div>
  );
}
