"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/ja";
import { Button, Input, Select, SelectItem, Textarea } from "@/ui";
import { upsertFindingAction, type FleetFormState } from "../actions";

export interface FindingOption {
  key: string;
  label: string;
  content: string;
  dueOn: string;
  status: "open" | "in_progress" | "closed";
  action: string;
}

const INITIAL: FleetFormState = { ok: false, message: "" };
const STATUSES: ("open" | "in_progress" | "closed")[] = ["open", "in_progress", "closed"];

/**
 * 検査の指摘事項の追加・状態更新（3.4.2）。
 * 既存を選ぶとその指摘の更新、選ばなければ新しい指摘の追加になる。
 */
export function FindingForm({
  dockId,
  dockTitle,
  options,
}: {
  dockId: string;
  dockTitle: string;
  options: FindingOption[];
}) {
  const [state, formAction, pending] = useActionState(upsertFindingAction, INITIAL);
  const [key, setKey] = useState("");
  const [content, setContent] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [status, setStatus] = useState<"open" | "in_progress" | "closed">("open");
  const [action, setAction] = useState("");

  function pick(nextKey: string) {
    setKey(nextKey);
    const o = options.find((x) => x.key === nextKey);
    setContent(o?.content ?? "");
    setDueOn(o?.dueOn ?? "");
    setStatus(o?.status ?? "open");
    setAction(o?.action ?? "");
  }

  return (
    <form action={formAction} className="ui-inset flex flex-col gap-3 p-3">
      <h4 className="text-sm font-bold">指摘事項を追加・更新（{dockTitle}）</h4>
      <input type="hidden" name="dockId" value={dockId} />
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="status" value={status} />
      <Select
        size="sm"
        label="更新する指摘（選ばなければ新規追加）"
        selectedKeys={key ? [key] : []}
        onSelectionChange={(k) => pick(String([...k][0] ?? ""))}
      >
        {options.map((o) => (
          <SelectItem key={o.key}>{o.label}</SelectItem>
        ))}
      </Select>
      <Textarea
        name="content"
        size="sm"
        label="指摘の内容"
        minRows={2}
        value={content}
        onValueChange={setContent}
        isRequired
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          name="dueOn"
          type="date"
          size="sm"
          label="対応の期限"
          value={dueOn}
          onValueChange={setDueOn}
        />
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
      </div>
      <Textarea
        name="action"
        size="sm"
        label="対応の内容"
        minRows={2}
        value={action}
        onValueChange={setAction}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" color="primary" size="sm" isLoading={pending}>
          指摘を記録する
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
