"use client";

import { useActionState, useState } from "react";
import { Button, Input, Select, SelectItem, Textarea } from "@/ui";
import { createOpinionStatementAction, type DocumentFormState } from "../actions";

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
      <h2 className="font-bold">意見陳述書を作る（オペレーター宛）</h2>
      <p className="text-sm text-foreground-600">
        相手先と期間を選ぶと、その期間の待機時間と労働時間の実績を書面に自動で添えます。
        待機が長引くと乗組員の労働時間の上限に直接影響するため、実績を示して運航計画の見直しを
        申し入れる書面です。
      </p>
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
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          意見陳述書を作る
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
