"use client";

import { useActionState, useState } from "react";
import { Select, SelectItem } from "@/ui/heroui";
import { createOperationReportAction, type DocumentFormState } from "../actions";
import { FormResult } from "./form-result";

const INITIAL: DocumentFormState = { ok: false, message: "" };

/**
 * 運航実績レポート・月次報告書の作成（要件定義書 3.3.3 / 3.6.4）。
 * 対象月の航海・荷役・燃料・待機・労働時間を1つの書面にまとめ、生成時点の値を保存する。
 */
export function ReportForm({ months }: { months: string[] }) {
  const [state, formAction, pending] = useActionState(createOperationReportAction, INITIAL);
  const [month, setMonth] = useState(months[0] ?? "");

  return (
    <form action={formAction} className="ui-card flex flex-col gap-3 p-4">
      <input type="hidden" name="month" value={month} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="対象月"
          selectedKeys={month ? [month] : []}
          onSelectionChange={(k) => setMonth(String([...k][0] ?? ""))}
          isRequired
        >
          {months.map((m) => (
            <SelectItem key={m}>{m}</SelectItem>
          ))}
        </Select>
      </div>
      <FormResult label="レポートを作る" pending={pending} state={state} />
    </form>
  );
}
