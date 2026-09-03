"use client";

import { useActionState, useState } from "react";
import { Button, Input, Select, SelectItem } from "@/ui";
import { recordSubmissionAction, type DocumentFormState } from "../actions";

export interface SubmittableDocument {
  id: string;
  label: string;
}

const INITIAL: DocumentFormState = { ok: false, message: "" };

/**
 * 提出記録の登録（S-14）。
 * 提出済みの書類は中身を書き換えず、提出の事実だけを新しい版として足す（12.3）。
 */
export function SubmissionForm({
  documents,
  defaultDate,
}: {
  documents: SubmittableDocument[];
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState(recordSubmissionAction, INITIAL);
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? "");

  if (documents.length === 0) {
    return (
      <div className="ui-card p-4">
        <h2 className="font-bold">提出を記録する</h2>
        <p className="mt-1 text-sm text-foreground-500">まだ提出していない書類はありません。</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="ui-card flex flex-col gap-3 p-4">
      <h2 className="font-bold">提出を記録する</h2>
      <input type="hidden" name="documentId" value={documentId} />
      <Select
        label="まだ提出していない書類"
        selectedKeys={documentId ? [documentId] : []}
        onSelectionChange={(k) => setDocumentId(String([...k][0] ?? ""))}
        isRequired
      >
        {documents.map((d) => (
          <SelectItem key={d.id}>{d.label}</SelectItem>
        ))}
      </Select>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="submittedOn" type="date" label="提出日" defaultValue={defaultDate} isRequired />
        <Input
          name="submittedTo"
          label="提出先"
          placeholder="例: 中国運輸局 尾道海事事務所"
          isRequired
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          提出を記録する
        </Button>
        {state.message ? (
          <p className={state.ok ? "text-sm font-semibold" : "text-sm text-danger"}>
            {state.ok ? "✓ " : "✕ "}
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
