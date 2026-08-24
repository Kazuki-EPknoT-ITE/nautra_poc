"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { CREW_MEMBERS, type CrewMember } from "@/lib/crew";
import { useSessionCrew } from "@/lib/vessel-hooks";
import { signIn } from "@/lib/vessel-session";
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
  const [selected, setSelected] = useState<CrewMember | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // サインイン済みならメニューへ
  useEffect(() => {
    if (session) router.replace("/vessel");
  }, [session, router]);

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

      <GlassCard blurred>
        <CardHeader className="px-5 pb-2 pt-5 text-base font-bold">
          2. PIN（4桁）を入力
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
        セッションは端末内にのみ保持され、通信断でもサインイン・記録ができます。
      </p>
    </div>
  );
}
