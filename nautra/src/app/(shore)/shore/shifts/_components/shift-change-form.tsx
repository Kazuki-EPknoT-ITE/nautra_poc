"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/ja";
import { SHIFT_TYPES, type ShiftType } from "@/sync-protocol/records";
import { Button, Input, Select, SelectItem, Textarea } from "@/ui";
import { publishShiftChangeAction, type ShiftChangeFormState } from "../actions";

export interface ShiftOption {
  id: string;
  label: string;
  shiftType: ShiftType;
  from: string;
  to: string;
}

const INITIAL: ShiftChangeFormState = { ok: false, message: "" };

/** シフト変更フォーム（S-10 簡易版）。選択したシフトを新しい時間帯で置き換えて配信する */
export function ShiftChangeForm({ options }: { options: ShiftOption[] }) {
  const [state, formAction, pending] = useActionState(publishShiftChangeAction, INITIAL);
  const [selectedId, setSelectedId] = useState<string>(options[0]?.id ?? "");
  const selected = options.find((o) => o.id === selectedId);
  const [shiftType, setShiftType] = useState<ShiftType>(selected?.shiftType ?? "navigation_watch");
  const [from, setFrom] = useState(selected?.from ?? "");
  const [to, setTo] = useState(selected?.to ?? "");

  function pick(id: string) {
    setSelectedId(id);
    const o = options.find((x) => x.id === id);
    if (o) {
      setShiftType(o.shiftType);
      setFrom(o.from);
      setTo(o.to);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-large border border-default-200 bg-content1 p-4">
      <h2 className="font-bold">シフトを変更して配信</h2>
      <input type="hidden" name="supersedesId" value={selectedId} />
      <input type="hidden" name="shiftType" value={shiftType} />
      <Select
        label="変更するシフト"
        selectedKeys={selectedId ? [selectedId] : []}
        onSelectionChange={(k) => {
          const v = [...k][0];
          if (v) pick(String(v));
        }}
      >
        {options.map((o) => (
          <SelectItem key={o.id}>{o.label}</SelectItem>
        ))}
      </Select>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="当直種別"
          selectedKeys={[shiftType]}
          onSelectionChange={(k) => {
            const v = [...k][0];
            if (v) setShiftType(String(v) as ShiftType);
          }}
        >
          {SHIFT_TYPES.map((s) => (
            <SelectItem key={s}>{t.shiftType[s]}</SelectItem>
          ))}
        </Select>
        <Input name="from" type="time" label="開始" value={from} onValueChange={setFrom} />
        <Input name="to" type="time" label="終了" value={to} onValueChange={setTo} />
      </div>
      <Textarea name="changeNote" label="変更理由（船内に通知されます）" minRows={2} />
      <div className="flex items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending} isDisabled={!selectedId}>
          変更を配信する
        </Button>
        {state.message ? (
          <p className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>
            {state.ok ? "✓ " : "✕ "}
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
