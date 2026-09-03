"use client";

import { useActionState, useState } from "react";
import { Button, Input, Radio, RadioGroup, Select, SelectItem, Textarea } from "@/ui";
import { publishAgreementAction, type AgreementFormState } from "../actions";

export interface OverrideField {
  key: string;
  label: string;
  /** 入力の単位（時間 / 回 / 日） */
  unit: string;
  /** いま適用されている値（同じ単位） */
  current: number;
}

export interface AgreementOption {
  id: string;
  label: string;
}

const INITIAL: AgreementFormState = { ok: false, message: "" };

/**
 * 労使協定・就業規則の新しい版を登録するフォーム（6.5）。
 * 入力した上書き値はそのまま判定閾値になり、適用期間に入ると
 * ダッシュボード・記録簿の判定に効く。
 */
export function AgreementForm({
  fields,
  options,
  today,
}: {
  fields: OverrideField[];
  options: AgreementOption[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(publishAgreementAction, INITIAL);
  const [kind, setKind] = useState<"labor_agreement" | "work_rules">("labor_agreement");
  const [supersedesId, setSupersedesId] = useState("");

  return (
    <form action={formAction} className="ui-card flex flex-col gap-3 p-4">
      <h2 className="font-bold">協定・就業規則の新しい版を登録</h2>
      <p className="text-sm text-foreground-600">
        入力した値は、適用開始日からそのまま判定の基準になります。空欄の項目は法令の既定値のままです。
      </p>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="supersedesId" value={supersedesId} />

      <RadioGroup
        orientation="horizontal"
        label="種類"
        value={kind}
        onValueChange={(v) => setKind(v as "labor_agreement" | "work_rules")}
      >
        <Radio value="labor_agreement">労使協定</Radio>
        <Radio value="work_rules">就業規則</Radio>
      </RadioGroup>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="title" label="標題" placeholder="例: 時間外労働等に関する労使協定（2027年度）" isRequired />
        <Input name="version" label="版" placeholder="例: 2027.1" isRequired />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input type="date" name="filedOn" label="届出日" />
        <Input type="date" name="effectiveFrom" label="適用開始日" defaultValue={today} isRequired />
        <Input type="date" name="effectiveTo" label="適用終了日（無期限なら空欄）" />
      </div>

      <div className="ui-inset p-3">
        <p className="mb-2 text-sm font-semibold">判定の基準にする値（空欄はそのまま）</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((f) => (
            <Input
              key={f.key}
              name={`override_${f.key}`}
              type="number"
              step="0.5"
              min="0"
              label={f.label}
              placeholder={`いま ${f.current}`}
              endContent={<span className="text-xs text-foreground-500">{f.unit}</span>}
            />
          ))}
        </div>
      </div>

      <Textarea name="body" label="協定・規則の内容（要点）" minRows={2} />

      <Select
        label="差し替える既存の版（改定のとき。任意）"
        selectedKeys={supersedesId ? [supersedesId] : []}
        onSelectionChange={(k) => setSupersedesId(String([...k][0] ?? ""))}
      >
        {options.map((o) => (
          <SelectItem key={o.id}>{o.label}</SelectItem>
        ))}
      </Select>

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
