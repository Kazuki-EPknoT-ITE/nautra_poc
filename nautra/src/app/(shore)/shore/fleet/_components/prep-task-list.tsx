"use client";

import { useState, useTransition } from "react";
import { Checkbox } from "@/ui";
import { setPrepTaskAction, type FleetFormState } from "../actions";

export interface PrepTask {
  key: string;
  label: string;
  done: boolean;
}

/**
 * 入渠前の準備タスクの消し込み（3.4.2）。
 * チェックを付け外しすると、そのつど「変更後の完全な姿」を追記で配信する。
 */
export function PrepTaskList({ dockId, tasks }: { dockId: string; tasks: PrepTask[] }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FleetFormState | null>(null);

  if (tasks.length === 0) {
    return <p className="text-sm text-foreground-500">準備タスクは登録されていません。</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {tasks.map((task) => (
        <Checkbox
          key={task.key}
          size="sm"
          isSelected={task.done}
          isDisabled={pending}
          onValueChange={(v) =>
            startTransition(async () => setState(await setPrepTaskAction(dockId, task.key, v)))
          }
        >
          <span className={task.done ? "text-foreground-500 line-through" : ""}>{task.label}</span>
        </Checkbox>
      ))}
      {state && !state.ok ? <p className="text-xs text-danger">✕ {state.message}</p> : null}
    </div>
  );
}
