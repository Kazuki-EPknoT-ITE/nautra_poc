"use client";

import { useActionState, useState } from "react";
import { Button, Select, SelectItem, Textarea } from "@/ui";
import { respondConsultationAction, type WellbeingFormState } from "../actions";

export interface ConsultationOption {
  id: string;
  label: string;
  canReceive: boolean;
}

const INITIAL: WellbeingFormState = { ok: false, message: "" };

/**
 * 匿名の相談への回答フォーム（3.5.3）。
 * 相談者の氏名は画面に出さない（そもそもこの画面に渡していない）。
 * 回答は「相談への返信」として船内に表示され、誰への返信かは相談者本人だけが分かる。
 */
export function ConsultationReplyForm({ consultations }: { consultations: ConsultationOption[] }) {
  const [state, formAction, pending] = useActionState(respondConsultationAction, INITIAL);
  const [responseId, setResponseId] = useState(consultations[0]?.id ?? "");
  const [mode, setMode] = useState<"respond" | "receive">("respond");

  if (consultations.length === 0) {
    return (
      <div className="glass-tile p-4">
        <h3 className="font-bold">相談に回答する</h3>
        <p className="mt-1 text-sm text-foreground-500">届いている相談はありません。</p>
      </div>
    );
  }

  const selected = consultations.find((c) => c.id === responseId);

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <h3 className="font-bold">相談に回答する</h3>
      <input type="hidden" name="responseId" value={responseId} />
      <input type="hidden" name="mode" value={mode} />
      <Select
        label="対象の相談"
        selectedKeys={responseId ? [responseId] : []}
        onSelectionChange={(k) => setResponseId(String([...k][0] ?? ""))}
        isRequired
      >
        {consultations.map((c) => (
          <SelectItem key={c.id}>{c.label}</SelectItem>
        ))}
      </Select>
      <Textarea
        name="response"
        label="回答（相談者に表示されます。個人が特定される書き方は避けてください）"
        minRows={4}
        placeholder="例: ご連絡ありがとうございます。個人を特定しない形で、朝礼にて全体に周知しました。"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          color="primary"
          isLoading={pending && mode === "respond"}
          onPress={() => setMode("respond")}
        >
          回答する
        </Button>
        <Button
          type="submit"
          variant="bordered"
          isDisabled={!selected?.canReceive}
          isLoading={pending && mode === "receive"}
          onPress={() => setMode("receive")}
        >
          受け付けたことだけ知らせる
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
