"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { CREW_MEMBERS, type CrewMember } from "@/lib/crew";
import { useSessionCrew } from "@/lib/vessel-hooks";
import { signIn } from "@/lib/vessel-session";
import { CrewPickerGrid, LoginCard, PinDots } from "./_components/login-body";

const PIN_LENGTH = 4;
/** デザインの `pinKeys`（数字 → クリア → 0 → 消す の 3×4） */
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

/**
 * 船内サインイン（基本設計書 11.3 / デザイン正本 `design/poc_design` の `showSignIn`）。
 *
 * 共用端末での本人特定は「船員を顔写真リストから選択 + PIN」。セッションは端末内にのみ
 * 保持するため、通信断でも成立する。サインインしたロールに応じて、以降の画面の
 * 表示・操作可能範囲が変わる（11.2）。
 *
 * 版組はデザインの実測どおり: 760px の中央寄せ、左に「1. ユーザーを選択」・
 * 右に 356px の「2. PIN（4桁）を入力」。画面の説明文は置かない（手順の番号と
 * PIN 欄の案内だけで足りる）。
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

  // サインイン済みならホームへ
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

  /** デザインの `pinDemoHint`（区切りは全角スラッシュ） */
  const demoPins = CREW_MEMBERS.map((c) => `${c.name.split(" ")[0]} ${c.demoPin}`).join(" ／ ");

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-3.5">
      <h1 className="m-0 text-3xl font-bold text-foreground-900">サインイン</h1>

      {/* 放置で自動サインアウトしたときは、故障と間違われないよう理由を出す */}
      {idle ? (
        <p className="m-0 rounded-small bg-[color:var(--accent-bg)] px-[15px] py-[13px] text-base leading-[1.7] text-foreground-700">
          <span aria-hidden="true">⏱ </span>
          しばらく操作がなかったため、サインアウトしました。
          <span className="text-foreground-500">
            {" "}
            共用の端末で、次に使う人に前の人の記録が見えないようにするためです。記録は消えていません。
          </span>
        </p>
      ) : null}

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_356px]">
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

        <div className="ui-card flex flex-col items-center px-[18px] pb-[18px] pt-4">
          <h2 className="m-0 self-start text-xl font-bold text-foreground-900">2. PIN（4桁）を入力</h2>

          <div className="mt-3">
            <PinDots
              filled={pin.length}
              length={PIN_LENGTH}
              error={Boolean(error)}
              active={Boolean(selected)}
            />
          </div>

          {/* 案内は1行ぶんの高さを常に確保する（出たり消えたりで枡が動かないように）。
              打ち始めたら消す——数字を追うのに文章は邪魔になる（デザイン正本の `pinMessage`） */}
          <p
            className={cn(
              "m-0 mt-3 min-h-[22px] text-center text-lg",
              error ? "font-bold text-danger" : "text-foreground-500",
            )}
            aria-live="polite"
          >
            {error
              ? `✕ ${error}`
              : !selected
                ? "先に自分を選んでください。"
                : pin.length === 0
                  ? `${selected.name} として、4桁のPINを入力してください`
                  : ""}
          </p>

          {/* 数字はブロンズの塗り＋等幅、消す系は白地。押す対象の主従を塗りで分ける */}
          <div className="mt-2.5 grid w-full grid-cols-3 gap-2">
            {KEYS.map((k) => {
              const isNum = k !== "clear" && k !== "back";
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!selected || busy}
                  aria-label={k === "clear" ? "クリア" : k === "back" ? "1文字消す" : k}
                  onClick={() => press(k)}
                  className={cn(
                    "min-h-[60px] rounded-small border transition-colors disabled:opacity-50",
                    isNum
                      ? "border-primary bg-primary font-mono text-[24px] font-semibold text-primary-foreground hover:bg-primary-600"
                      : "border-[var(--ui-hairline-strong)] bg-content1 text-base font-medium text-foreground-800 hover:bg-content2",
                  )}
                >
                  {k === "clear" ? "クリア" : k === "back" ? "← 消す" : k}
                </button>
              );
            })}
          </div>

          <p className="m-0 mt-3 text-center font-mono text-xs leading-relaxed text-foreground-500">
            デモ用 PIN: {demoPins}
          </p>
        </div>
      </div>
    </div>
  );
}
