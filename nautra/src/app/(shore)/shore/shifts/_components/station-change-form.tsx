"use client";

import { useActionState, useState } from "react";
import { Button, Input, Select, SelectItem, Textarea } from "@/ui";
import { publishStationChangeAction, type ShiftChangeFormState } from "../actions";

export interface StationOption {
  id: string;
  label: string;
  station: string;
  duty: string;
}

const INITIAL: ShiftChangeFormState = { ok: false, message: "" };

/** 通常配置表の変更フォーム。選んだ配置を新しい持ち場で置き換えて配信する */
export function StationChangeForm({ options }: { options: StationOption[] }) {
  const [state, formAction, pending] = useActionState(publishStationChangeAction, INITIAL);
  const [selectedId, setSelectedId] = useState<string>(options[0]?.id ?? "");
  const selected = options.find((o) => o.id === selectedId);
  const [station, setStation] = useState(selected?.station ?? "");
  const [duty, setDuty] = useState(selected?.duty ?? "");

  function pick(id: string) {
    setSelectedId(id);
    const o = options.find((x) => x.id === id);
    if (o) {
      setStation(o.station);
      setDuty(o.duty);
    }
  }

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <h2 className="font-bold">通常配置表を変更して配信</h2>
      <input type="hidden" name="supersedesId" value={selectedId} />
      <Select
        label="変更する配置"
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="station" label="持ち場" value={station} onValueChange={setStation} />
        <Input name="duty" label="担当" value={duty} onValueChange={setDuty} />
      </div>
      <Textarea name="changeNote" label="変更理由（船内に通知されます）" minRows={2} />
      <div className="flex items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending} isDisabled={!selectedId}>
          配置の変更を配信する
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
