"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/ja";
import { Button, Input, Select, SelectItem } from "@/ui";
import { saveExpenseAction, type OfficeFormState } from "../actions";
import type { VesselOption } from "./charter-form";

const INITIAL: OfficeFormState = { ok: false, message: "" };

/** 3.6.2 経費（燃料費・港費・修繕費 等）の登録 */
export function ExpenseForm({
  vessels,
  defaultDate,
}: {
  vessels: VesselOption[];
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState(saveExpenseAction, INITIAL);
  const [kind, setKind] = useState("fuel");
  const [targetVesselId, setTargetVesselId] = useState(vessels[0]?.id ?? "");

  return (
    <form action={formAction} className="ui-card flex flex-col gap-3 p-4">
      <h3 className="font-bold">経費を登録する</h3>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="targetVesselId" value={targetVesselId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Select
          label="区分"
          selectedKeys={[kind]}
          onSelectionChange={(k) => setKind(String([...k][0] ?? "other"))}
        >
          {Object.keys(t.expenseKind).map((k) => (
            <SelectItem key={k}>{t.expenseKind[k]}</SelectItem>
          ))}
        </Select>
        <Input name="title" label="件名" placeholder="例: A重油 12,000L 補給（名古屋）" isRequired />
        <Input name="amount" type="number" label="金額（円）" isRequired />
        <Input name="spentOn" type="date" label="支出日" defaultValue={defaultDate} isRequired />
        <Select
          label="船"
          selectedKeys={targetVesselId ? [targetVesselId] : []}
          onSelectionChange={(k) => setTargetVesselId(String([...k][0] ?? ""))}
        >
          {vessels.map((v) => (
            <SelectItem key={v.id}>{v.name}</SelectItem>
          ))}
        </Select>
        <Input name="supplier" label="支払先" placeholder="例: 中部バンカリング" />
        <Input name="receiptRef" label="領収書の番号（保存要件の確認用）" placeholder="例: RC-2026-0912" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          登録する
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
