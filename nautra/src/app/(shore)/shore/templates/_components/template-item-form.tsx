"use client";

import { useActionState, useState } from "react";
import type { TemplateInputType } from "@/sync-protocol/records";
import { Button, Input, Radio, RadioGroup, Select, SelectItem, Textarea } from "@/ui";
import { publishTemplateItemAction, type TemplateItemFormState } from "../actions";

export interface TemplateTargetOption {
  /** "usage|templateKey|name" */
  value: string;
  label: string;
}

const INITIAL: TemplateItemFormState = { ok: false, message: "" };

/** 記録項目の追加フォーム。数値項目は単位まで指定し、船内では利用者が値を入力する */
export function TemplateItemForm({ options }: { options: TemplateTargetOption[] }) {
  const [state, formAction, pending] = useActionState(publishTemplateItemAction, INITIAL);
  const [target, setTarget] = useState(options[0]?.value ?? "");
  const [inputType, setInputType] = useState<TemplateInputType>("check");

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <h2 className="font-bold">記録項目を追加して配信</h2>
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="inputType" value={inputType} />
      <Select
        label="追加先"
        selectedKeys={target ? [target] : []}
        onSelectionChange={(k) => {
          const v = [...k][0];
          if (v) setTarget(String(v));
        }}
      >
        {options.map((o) => (
          <SelectItem key={o.value}>{o.label}</SelectItem>
        ))}
      </Select>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="label" label="項目名" placeholder="例: 燃料タンク残量" isRequired />
        <Input name="group" label="区分（見出し）" placeholder="例: 機関" defaultValue="追加項目" />
      </div>
      <RadioGroup
        orientation="horizontal"
        label="入力方法"
        value={inputType}
        onValueChange={(v) => setInputType(v as TemplateInputType)}
      >
        <Radio value="check">良否で答える</Radio>
        <Radio value="number">数値を入力（船員が入力）</Radio>
        <Radio value="text">文章を入力</Radio>
      </RadioGroup>
      {inputType === "number" ? (
        <Input name="unit" label="単位" placeholder="例: L / °C / rpm" isRequired />
      ) : (
        <input type="hidden" name="unit" value="" />
      )}
      <Textarea name="changeNote" label="追加の理由（配信履歴に残ります）" minRows={2} />
      <div className="flex items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending} isDisabled={!target}>
          項目を追加して配信する
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
