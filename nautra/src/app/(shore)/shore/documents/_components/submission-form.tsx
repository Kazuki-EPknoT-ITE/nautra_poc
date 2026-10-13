"use client";

import { useActionState, useState } from "react";
import { recordSubmissionAction, type DocumentFormState } from "../actions";

const INITIAL: DocumentFormState = { ok: false, message: "" };

/**
 * 提出記録の登録（S-14）。一覧の行から直接記録する（書類を選び直す手間を省く。レビュー FORM-06）。
 * 提出済みの書類は中身を書き換えず、提出の事実だけを新しい版として足す（12.3）。
 */
export function SubmitRowForm({ documentId, title, defaultDate }: { documentId: string; title: string; defaultDate: string }) {
  const [state, formAction, pending] = useActionState(recordSubmissionAction, INITIAL);
  const [open, setOpen] = useState(false);

  if (state.ok) return <span className="text-sm font-semibold">✓ 記録しました</span>;
  if (!open) {
    return (
      <button type="button" className="ui-btn-quiet" onClick={() => setOpen(true)}>
        提出を記録
      </button>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1.5" aria-label={`${title} の提出を記録`}>
      <input type="hidden" name="documentId" value={documentId} />
      <input type="date" name="submittedOn" defaultValue={defaultDate} required aria-label="提出日" className="ui-field !w-auto !py-1 font-mono !text-sm" />
      <input name="submittedTo" required placeholder="提出先" aria-label="提出先" className="ui-field !w-44 !py-1 !text-sm" />
      <button type="submit" className="ui-btn-primary h-8" disabled={pending}>
        記録
      </button>
      <button type="button" className="ui-btn-quiet h-8" onClick={() => setOpen(false)} aria-label="やめる">
        ✕
      </button>
      {state.message && !state.ok ? <span className="text-sm text-danger">✕ {state.message}</span> : null}
    </form>
  );
}
