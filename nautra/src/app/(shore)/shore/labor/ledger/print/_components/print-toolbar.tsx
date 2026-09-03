"use client";

import { useActionState } from "react";
import { Button } from "@/ui";
import { saveLedgerDocumentAction, type DocumentFormState } from "../../../actions";

const INITIAL: DocumentFormState = { ok: false, message: "" };

/**
 * 印刷ビューの操作列（印刷そのものはブラウザに任せる）。
 * `@media print` で消えるため、PDF には残らない。
 */
export function PrintToolbar({
  crewMemberId,
  month,
  canSave,
  saveLabel,
  printLabel,
}: {
  crewMemberId: string;
  month: string;
  canSave: boolean;
  saveLabel: string;
  printLabel: string;
}) {
  const [state, formAction, pending] = useActionState(saveLedgerDocumentAction, INITIAL);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button color="primary" onPress={() => window.print()}>
        {printLabel}
      </Button>
      {canSave ? (
        <form action={formAction} className="flex items-center gap-3">
          <input type="hidden" name="crewMemberId" value={crewMemberId} />
          <input type="hidden" name="month" value={month} />
          <Button type="submit" variant="bordered" isLoading={pending}>
            {saveLabel}
          </Button>
        </form>
      ) : null}
      {state.message ? (
        <p className={state.ok ? "text-sm font-semibold" : "text-sm text-danger"}>
          {state.ok ? "✓ " : "✕ "}
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
