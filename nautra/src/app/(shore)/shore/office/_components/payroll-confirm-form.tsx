"use client";

import { useActionState, useState } from "react";
import { Button, Select, SelectItem } from "@/ui";
import { confirmPayrollAction, type OfficeFormState } from "../actions";

export interface DraftPayrollOption {
  id: string;
  label: string;
}

const INITIAL: OfficeFormState = { ok: false, message: "" };

/**
 * 給与の確定（3.6.2）。
 * 確定すると、そのときの時間外分数（まるめ後）を給与に保存する。
 * 給与は支払の根拠なので、あとから打刻の訂正で金額が動かないよう値を固定する。
 */
export function PayrollConfirmForm({ payrolls }: { payrolls: DraftPayrollOption[] }) {
  const [state, formAction, pending] = useActionState(confirmPayrollAction, INITIAL);
  const [payrollId, setPayrollId] = useState(payrolls[0]?.id ?? "");

  if (payrolls.length === 0) {
    return (
      <div className="glass-tile p-4">
        <h3 className="font-bold">給与を確定する</h3>
        <p className="mt-1 text-sm text-foreground-500">計算中の給与はありません。</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <h3 className="font-bold">給与を確定する</h3>
      <p className="text-sm text-foreground-600">
        確定すると、そのときの時間外（まるめ後）の分数を給与に保存します。支払った金額の根拠として
        残すため、あとから打刻が直っても確定した給与の時間外は動きません。打刻そのものは残ります。
      </p>
      <input type="hidden" name="payrollId" value={payrollId} />
      <Select
        label="計算中の給与"
        selectedKeys={payrollId ? [payrollId] : []}
        onSelectionChange={(k) => setPayrollId(String([...k][0] ?? ""))}
        isRequired
      >
        {payrolls.map((p) => (
          <SelectItem key={p.id}>{p.label}</SelectItem>
        ))}
      </Select>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          確定する
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
