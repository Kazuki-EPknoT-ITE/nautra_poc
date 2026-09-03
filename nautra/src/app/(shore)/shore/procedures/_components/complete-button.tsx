"use client";

import { useActionState } from "react";
import { Button } from "@/ui";
import { completeProcedureAction, type ProcedureFormState } from "../actions";

const INITIAL: ProcedureFormState = { ok: false, message: "" };

/** 手続き1件の消込。押すと「完了」の新しいレコードが追記される（元の記録は残る） */
export function CompleteButton({ taskId }: { taskId: string }) {
  const [state, formAction, pending] = useActionState(completeProcedureAction, INITIAL);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <Button type="submit" size="sm" variant="bordered" isLoading={pending}>
        完了にする
      </Button>
      {state.message ? (
        <span className={state.ok ? "text-xs font-semibold" : "text-xs text-danger"}>
          {state.ok ? "✓ " : "✕ "}
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
