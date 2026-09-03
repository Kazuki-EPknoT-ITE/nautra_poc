"use client";

import { useState, useTransition } from "react";
import { t } from "@/i18n/ja";
import { Button, Select, SelectItem } from "@/ui";
import type { VoyageSchedulePayload } from "@/sync-protocol/masters";
import { updateScheduleStatusAction, type DispatchFormState } from "../actions";

const STATUSES: VoyageSchedulePayload["status"][] = [
  "planned",
  "fixed",
  "in_progress",
  "done",
  "canceled",
];

/** 配船スケジュール1件の状態更新（訂正は supersedesId 付きの追記として配信される） */
export function ScheduleStatusControls({
  scheduleId,
  current,
}: {
  scheduleId: string;
  current: VoyageSchedulePayload["status"];
}) {
  const [next, setNext] = useState<VoyageSchedulePayload["status"]>(current);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<DispatchFormState | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        size="sm"
        aria-label="状態を変える"
        className="w-40"
        selectedKeys={[next]}
        onSelectionChange={(k) => {
          const v = [...k][0];
          if (v) setNext(String(v) as VoyageSchedulePayload["status"]);
        }}
      >
        {STATUSES.map((s) => (
          <SelectItem key={s}>{t.scheduleStatus[s]}</SelectItem>
        ))}
      </Select>
      <Button
        size="sm"
        variant="bordered"
        isDisabled={next === current}
        isLoading={pending}
        onPress={() =>
          startTransition(async () => setState(await updateScheduleStatusAction(scheduleId, next)))
        }
      >
        状態を変える
      </Button>
      {state?.message ? (
        <span className={state.ok ? "text-xs font-semibold" : "text-xs text-danger"}>
          {state.ok ? "✓ " : "✕ "}
          {state.message}
        </span>
      ) : null}
    </div>
  );
}
