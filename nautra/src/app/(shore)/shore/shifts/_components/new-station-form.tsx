"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/ja";
import { STATION_SCENARIOS, type StationScenario } from "@/sync-protocol/records";
import { Button, Input, Select, SelectItem, Textarea } from "@/ui";
import { publishNewStationAction, type ShiftChangeFormState } from "../actions";
import type { CrewOption } from "./new-shift-form";

const INITIAL: ShiftChangeFormState = { ok: false, message: "" };

/** 通常配置表に新しい持ち場を追加する（これまでは既存の変更しかできなかった） */
export function NewStationForm({ crews }: { crews: CrewOption[] }) {
  const [state, formAction, pending] = useActionState(publishNewStationAction, INITIAL);
  const [crewMemberId, setCrewMemberId] = useState(crews[0]?.id ?? "");
  const [scenario, setScenario] = useState<StationScenario>("arrival_departure");

  return (
    <form action={formAction} className="ui-card flex flex-col gap-3 p-4">
      <h2 className="font-bold">配置表に持ち場を追加</h2>
      <input type="hidden" name="crewMemberId" value={crewMemberId} />
      <input type="hidden" name="scenario" value={scenario} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="船員"
          selectedKeys={crewMemberId ? [crewMemberId] : []}
          onSelectionChange={(k) => setCrewMemberId(String([...k][0] ?? ""))}
        >
          {crews.map((c) => (
            <SelectItem key={c.id}>{c.name}</SelectItem>
          ))}
        </Select>
        <Select
          label="場面"
          selectedKeys={[scenario]}
          onSelectionChange={(k) =>
            setScenario(String([...k][0] ?? "arrival_departure") as StationScenario)
          }
        >
          {STATION_SCENARIOS.map((s) => (
            <SelectItem key={s}>{t.stationScenario[s]}</SelectItem>
          ))}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="station" label="持ち場" placeholder="例: 船首" isRequired />
        <Input name="duty" label="任務" placeholder="例: 係船索の取り扱い" />
      </div>
      <Textarea name="changeNote" label="メモ（船内にも表示されます）" minRows={2} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          追加して配信する
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
