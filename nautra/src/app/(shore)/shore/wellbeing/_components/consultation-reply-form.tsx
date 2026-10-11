"use client";

import { useActionState } from "react";
import { respondConsultationAction, type WellbeingFormState } from "../actions";

const INITIAL: WellbeingFormState = { ok: false, message: "" };

/**
 * 匿名の相談への回答（3.5.3）。相談のカードの中で答える（一覧から相談を選び直させない。レビュー HEALTH-04）。
 * 相談者の氏名は画面に出さない（そもそもこの画面に渡していない）。
 * 回答は「相談への返信」として船内に表示され、誰への返信かは相談者本人だけが分かる。
 */
export function ConsultationReplyForm({ responseId, canReceive }: { responseId: string; canReceive: boolean }) {
  const [state, formAction, pending] = useActionState(respondConsultationAction, INITIAL);

  if (state.ok) return <p className="m-0 text-sm font-semibold">✓ {state.message}</p>;
  return (
    <form action={formAction} className="flex flex-col gap-2" aria-label="この相談に答える">
      <input type="hidden" name="responseId" value={responseId} />
      <textarea
        name="response"
        rows={3}
        aria-label="回答"
        title="相談者に表示されます。個人が特定される書き方は避けてください"
        placeholder="回答（相談者に表示されます）"
        className="ui-field w-full resize-y"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" name="mode" value="respond" className="ui-btn-primary" disabled={pending}>
          回答する
        </button>
        {canReceive ? (
          <button type="submit" name="mode" value="receive" className="ui-btn-ghost" disabled={pending}>
            受け付けたことだけ知らせる
          </button>
        ) : null}
        {state.message ? <span className="text-sm text-danger">✕ {state.message}</span> : null}
      </div>
    </form>
  );
}
