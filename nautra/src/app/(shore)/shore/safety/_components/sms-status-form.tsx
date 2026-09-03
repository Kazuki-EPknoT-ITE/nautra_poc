"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/ja";
import { Button, Input, Select, SelectItem, Textarea } from "@/ui";
import { updateSmsStatusAction, type SafetyFormState } from "../actions";

const INITIAL: SafetyFormState = { ok: false, message: "" };
const STATUSES: ("open" | "in_progress" | "closed")[] = ["open", "in_progress", "closed"];

/** 不適合・監査所見1件の対応状況の更新（訂正は追記として配信される） */
export function SmsStatusForm({
  documentId,
  status: initialStatus,
  correctiveAction,
  dueOn,
}: {
  documentId: string;
  status: "open" | "in_progress" | "closed";
  correctiveAction?: string;
  dueOn?: string;
}) {
  const [state, formAction, pending] = useActionState(updateSmsStatusAction, INITIAL);
  const [status, setStatus] = useState(initialStatus);

  return (
    <form action={formAction} className="glass-inset flex flex-col gap-2 p-3">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="status" value={status} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          size="sm"
          label="対応の状態"
          selectedKeys={[status]}
          onSelectionChange={(k) => {
            const v = [...k][0];
            if (v) setStatus(String(v) as "open" | "in_progress" | "closed");
          }}
        >
          {STATUSES.map((s) => (
            <SelectItem key={s}>{t.findingStatus[s]}</SelectItem>
          ))}
        </Select>
        <Input name="dueOn" type="date" size="sm" label="期限" defaultValue={dueOn ?? ""} />
      </div>
      <Textarea
        name="correctiveAction"
        size="sm"
        label="是正・対策の内容"
        minRows={2}
        defaultValue={correctiveAction ?? ""}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="bordered" isLoading={pending}>
          対応状況を更新
        </Button>
        {state.message ? (
          <p className={state.ok ? "text-xs font-semibold" : "text-xs text-danger"}>
            {state.ok ? "✓ " : "✕ "}
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
