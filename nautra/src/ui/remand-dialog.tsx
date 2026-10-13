"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";
import { Eyebrow } from "./section";

/**
 * 本人への差戻し（デザイン正本 `design/poc_design` の `remandOpen`）。
 *
 * 差戻しは**理由が要る**。船内で受け取った本人が「何を直すのか」を読めないと、
 * 同じ打刻をもう一度入れ直すだけになるため。よくある理由をあらかじめ並べておき、
 * 押すだけで選べるようにする（自由記述も残すが、空のままでは送れない）。
 *
 * 承認者は打刻値そのものを書き換えられない。この画面で起きるのは
 * 「本人に直してもらう依頼」だけで、そのことを本文にも書いてある（ガードレール②）。
 */
export const REMAND_REASONS = [
  "作業種別の選び間違いが疑われる",
  "打刻の抜け（終了打刻なし）がある",
  "待機時間の記録が労働時間と重複している",
  "休息の分割回数が実態と合わない",
];

export function RemandDialog({
  open,
  crewName,
  targetLabel,
  reason,
  onReasonChange,
  onCancel,
  onSubmit,
  submitting = false,
}: {
  open: boolean;
  crewName: string;
  /** 対象（日付など）。「誰の・いつの記録か」を見出しに出す */
  targetLabel: string;
  reason: string;
  onReasonChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting?: boolean;
}) {
  const id = useId();
  const [free, setFree] = useState(false);

  useEffect(() => {
    if (!open) setFree(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[88] flex items-center justify-center bg-[rgba(10,10,10,0.5)] p-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="ui-modal w-full max-w-[560px] overflow-hidden"
      >
        <div className="border-b border-[var(--ui-hairline)] px-6 pb-4 pt-5">
          <Eyebrow tone="alert">本人への差戻し</Eyebrow>
          <h2 id={id} className="m-0 mt-2 text-2xl font-bold text-foreground-900">
            {crewName} ／ {targetLabel}
          </h2>
          <p className="m-0 mt-2.5 text-base leading-relaxed text-foreground-700">
            実打刻は承認者も修正できません。差戻すと船内アプリに修正依頼が届き、
            本人の新しい記録として追記されます。
          </p>
        </div>

        <div className="flex flex-col gap-3 px-6 py-[18px]">
          <p className="m-0 text-sm text-foreground-500">差戻しの理由（船内アプリに表示されます）</p>
          <div className="flex flex-col gap-2">
            {REMAND_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={reason === r}
                onClick={() => {
                  setFree(false);
                  onReasonChange(r);
                }}
                className={cn(
                  "rounded-small border px-3 py-2.5 text-left text-sm leading-normal",
                  reason === r
                    ? "border-primary bg-warning-100 text-foreground-800"
                    : "border-[var(--ui-hairline-strong)] bg-content1 text-foreground-700",
                )}
              >
                {r}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={free}
              onClick={() => {
                setFree(true);
                onReasonChange("");
              }}
              className={cn(
                "rounded-small border px-3 py-2.5 text-left text-sm",
                free
                  ? "border-primary bg-warning-100 text-foreground-800"
                  : "border-[var(--ui-hairline-strong)] bg-content1 text-foreground-700",
              )}
            >
              そのほか（自分で書く）
            </button>
          </div>

          {free ? (
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              rows={2}
              placeholder="例）09-03 の荷役終了が翌日の打刻と重なっています"
              className="ui-field text-base"
              autoFocus
            />
          ) : null}

          <div className="mt-0.5 flex gap-3">
            <button type="button" onClick={onCancel} className="ui-btn-ghost min-h-[46px] flex-[0_0_150px]">
              やめる
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!reason.trim() || submitting}
              className="ui-btn-danger min-h-[46px] flex-1 disabled:cursor-not-allowed disabled:opacity-45"
            >
              差戻しを送る
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
