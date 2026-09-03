"use client";

import { useActionState } from "react";
import { Button, Input } from "@/ui";
import {
  generateDocumentsAction,
  recordCheckAction,
  submitFilingAction,
  type FilingFormState,
} from "../actions";

const INITIAL: FilingFormState = { ok: false, message: "" };

function Result({ state }: { state: FilingFormState }) {
  if (!state.message) return null;
  return (
    <p className={state.ok ? "text-sm font-semibold" : "text-sm text-danger"}>
      {state.ok ? "✓ " : "✕ "}
      {state.message}
    </p>
  );
}

/**
 * 届出を1段ずつ進める操作（手順③④⑤）。
 * 状態は `filing` レコードを supersedes で置き換えて進める（draft → checked →
 * documents_ready → submitted）。前の版は履歴として残る。
 */
export function FilingSteps({
  filingId,
  status,
  today,
}: {
  filingId: string;
  status: string;
  today: string;
}) {
  const [checkState, checkAction, checking] = useActionState(recordCheckAction, INITIAL);
  const [docState, docAction, generating] = useActionState(generateDocumentsAction, INITIAL);
  const [submitState, submitAction, submitting] = useActionState(submitFilingAction, INITIAL);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <form action={checkAction}>
          <input type="hidden" name="filingId" value={filingId} />
          <Button type="submit" size="sm" variant="bordered" isLoading={checking}>
            手順3 添付要件を確認した
          </Button>
        </form>
        <Result state={checkState} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form action={docAction}>
          <input type="hidden" name="filingId" value={filingId} />
          <Button
            type="submit"
            size="sm"
            color="primary"
            isLoading={generating}
            isDisabled={status === "draft"}
          >
            手順4 書類を生成する
          </Button>
        </form>
        {status === "draft" ? (
          <p className="text-sm text-foreground-500">先に添付要件の確認を記録してください。</p>
        ) : null}
        <Result state={docState} />
      </div>

      <form action={submitAction} className="flex flex-col gap-2">
        <input type="hidden" name="filingId" value={filingId} />
        <div className="grid gap-2 sm:grid-cols-3">
          <Input size="sm" type="date" name="submittedOn" label="提出日" defaultValue={today} />
          <Input
            size="sm"
            name="office"
            label="提出先"
            placeholder="例: 中国運輸局 尾道海事事務所"
            className="sm:col-span-2"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            size="sm"
            color="primary"
            isLoading={submitting}
            isDisabled={status !== "documents_ready"}
          >
            手順5 提出を記録する
          </Button>
          {status !== "documents_ready" ? (
            <p className="text-sm text-foreground-500">
              先に書類を生成してください（提出と同時に船員手帳の記帳情報を残します）。
            </p>
          ) : null}
          <Result state={submitState} />
        </div>
      </form>
    </div>
  );
}
