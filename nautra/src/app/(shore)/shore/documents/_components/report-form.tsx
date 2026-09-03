"use client";

import { useActionState, useState } from "react";
import { Button, Select, SelectItem } from "@/ui";
import { createOperationReportAction, type DocumentFormState } from "../actions";

const INITIAL: DocumentFormState = { ok: false, message: "" };

/**
 * 運航実績レポート・月次報告書の作成（要件定義書 3.3.3 / 3.6.4）。
 * 対象月の航海・荷役・燃料・待機・労働時間を1つの書面にまとめ、生成時点の値を保存する。
 */
export function ReportForm({ months }: { months: string[] }) {
  const [state, formAction, pending] = useActionState(createOperationReportAction, INITIAL);
  const [month, setMonth] = useState(months[0] ?? "");

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <h2 className="font-bold">運航実績レポート（月次報告書）を作る</h2>
      <p className="text-sm text-foreground-600">
        対象月の航海・荷役・燃料・待機・労働時間をまとめます。作成時点の内容を保存するので、
        あとからマスタが変わっても提出した書面は変わりません。
      </p>
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
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          レポートを作る
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
