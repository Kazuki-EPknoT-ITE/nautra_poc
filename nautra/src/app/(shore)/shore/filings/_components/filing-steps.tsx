"use client";

import { useActionState } from "react";
import { Button, Input } from "@/ui/heroui";
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

  if (status === "draft") {
    return (
      <form action={checkAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="filingId" value={filingId} />
        <Button type="submit" color="primary" isLoading={checking}>
          次へ: 添付要件を確認した
        </Button>
        <Result state={checkState} />
      </form>
    );
  }
  if (status === "checked") {
    return (
      <form action={docAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="filingId" value={filingId} />
        <Button type="submit" color="primary" isLoading={generating}>
          次へ: 書類を作る
        </Button>
        <Result state={checkState} />
        <Result state={docState} />
      </form>
    );
  }
  return (
    <form action={submitAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="filingId" value={filingId} />
      <Input size="sm" type="date" name="submittedOn" label="提出日" defaultValue={today} className="w-44" />
      <Input size="sm" name="office" label="提出先" placeholder="例: 中国運輸局 尾道海事事務所" className="w-72" />
      <Button type="submit" color="primary" isLoading={submitting}>
        次へ: 提出を記録する
      </Button>
      <Result state={docState} />
      <Result state={submitState} />
    </form>
  );
}
