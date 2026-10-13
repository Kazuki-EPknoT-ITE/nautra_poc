"use client";

import Link from "next/link";
import { Button } from "@/ui/heroui";
import type { DocumentFormState } from "../actions";

/**
 * 作るボタンと結果（書類を作る各フォームで同じ形にする）。
 * 作ったら、一覧へ探しに行かずにそのまま印刷へ進めるようにする（レビュー FORM-06）。
 */
export function FormResult({ label, pending, state }: { label: string; pending: boolean; state: DocumentFormState }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" color="primary" isLoading={pending}>
        {label}
      </Button>
      {state.message ? (
        <p className={state.ok ? "m-0 text-sm font-semibold" : "m-0 text-sm text-danger"}>
          {state.ok ? "✓ " : "✕ "}
          {state.message}
        </p>
      ) : null}
      {state.ok && state.documentId ? (
        <Link href={`/shore/documents/${state.documentId}/print`} prefetch={false} className="ui-btn-ghost">
          印刷する →
        </Link>
      ) : null}
    </div>
  );
}
