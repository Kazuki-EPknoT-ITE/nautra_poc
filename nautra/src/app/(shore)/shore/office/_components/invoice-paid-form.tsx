"use client";

import { useActionState, useState } from "react";
import { Button, Input, Select, SelectItem } from "@/ui";
import { markInvoicePaidAction, type OfficeFormState } from "../actions";

export interface UnpaidInvoiceOption {
  id: string;
  label: string;
}

const INITIAL: OfficeFormState = { ok: false, message: "" };

/** 入金の記録。請求の内容は書き換えず、入金の事実だけを新しい版として足す */
export function InvoicePaidForm({
  invoices,
  defaultDate,
}: {
  invoices: UnpaidInvoiceOption[];
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState(markInvoicePaidAction, INITIAL);
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id ?? "");

  if (invoices.length === 0) {
    return (
      <div className="glass-tile p-4">
        <h3 className="font-bold">入金を記録する</h3>
        <p className="mt-1 text-sm text-foreground-500">入金待ちの請求はありません。</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <h3 className="font-bold">入金を記録する</h3>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="入金待ちの請求"
          selectedKeys={invoiceId ? [invoiceId] : []}
          onSelectionChange={(k) => setInvoiceId(String([...k][0] ?? ""))}
          isRequired
        >
          {invoices.map((i) => (
            <SelectItem key={i.id}>{i.label}</SelectItem>
          ))}
        </Select>
        <Input name="paidOn" type="date" label="入金日" defaultValue={defaultDate} isRequired />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          入金を記録する
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
