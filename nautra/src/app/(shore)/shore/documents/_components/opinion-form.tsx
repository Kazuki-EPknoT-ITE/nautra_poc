"use client";

import { useActionState, useState } from "react";
import { Input, Select, SelectItem, Textarea } from "@/ui/heroui";
import { createOpinionStatementAction, type DocumentFormState } from "../actions";
import { FormResult } from "./form-result";

const INITIAL: DocumentFormState = { ok: false, message: "" };

/**
 * 意見陳述書（オペレーター宛）の作成フォーム（要件定義書 3.6.4 / 9章）。
 *
 * 相手先と対象期間を選ぶと、その期間の**待機時間と労働時間の実績が自動で添付**される。
 * 改正内航海運業法上、オペレーターは示された意見を尊重する義務を負うため、
 * 書面には実績データと根拠を必ず載せる。
 */
export function OpinionForm({
  counterparties,
  defaultFrom,
  defaultTo,
}: {
  counterparties: string[];
  defaultFrom: string;
  defaultTo: string;
}) {
  const [state, formAction, pending] = useActionState(createOpinionStatementAction, INITIAL);
  const [counterparty, setCounterparty] = useState(counterparties[0] ?? "");

  return (
    <form action={formAction} className="ui-card flex flex-col gap-3 p-4">
      <input type="hidden" name="counterparty" value={counterparty} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="宛先（オペレーター）"
          selectedKeys={counterparty ? [counterparty] : []}
          onSelectionChange={(k) => setCounterparty(String([...k][0] ?? ""))}
          isRequired
        >
          {counterparties.map((c) => (
            <SelectItem key={c}>{c}</SelectItem>
          ))}
        </Select>
        <Input name="periodFrom" type="date" label="対象期間（開始）" defaultValue={defaultFrom} isRequired />
        <Input name="periodTo" type="date" label="対象期間（終了）" defaultValue={defaultTo} isRequired />
      </div>
      <Textarea
        name="request"
        label="お願いしたいこと（空欄なら定型文が入ります）"
        minRows={3}
        placeholder="例: 荷役開始時刻の事前確定と、待機が長引く場合の早期連絡をお願いします。"
      />
      <FormResult label="意見陳述書を作る" pending={pending} state={state} />
    </form>
  );
}
