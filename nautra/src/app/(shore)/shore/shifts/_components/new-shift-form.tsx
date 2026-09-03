"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/ja";
import { SHIFT_TYPES, type ShiftType } from "@/sync-protocol/records";
import { Button, Input, Select, SelectItem, Textarea } from "@/ui";
import { publishNewShiftAction, type NewShiftFormState } from "../actions";

export interface CrewOption {
  id: string;
  name: string;
}

const INITIAL: NewShiftFormState = { ok: false, phase: "idle", message: "", warnings: [] };

/**
 * 当直シフトの新規作成（S-10「当直・停泊・荷役シフトの作成・配信」）。
 *
 * - 期間を指定すると同じパターンを日ごとにまとめて作る
 * - 配信の前に **その計画どおり働いた場合の法令判定**を出す（3.2.5）。
 *   超えていても作成は止めないが、警告は必ず表示する
 */
export function NewShiftForm({ crews, today }: { crews: CrewOption[]; today: string }) {
  const [state, formAction, pending] = useActionState<NewShiftFormState, FormData>(
    publishNewShiftAction,
    INITIAL,
  );
  const [mode, setMode] = useState<"check" | "create">("check");
  const [crewMemberId, setCrewMemberId] = useState(crews[0]?.id ?? "");
  const [shiftType, setShiftType] = useState<ShiftType>("navigation_watch");

  return (
    <form action={formAction} className="ui-card flex flex-col gap-3 p-4">
      <h2 className="font-bold">当直シフトを作って配信</h2>
      <p className="text-sm text-foreground-600">
        期間を指定すると、同じ当直を日ごとにまとめて作れます。配信前に「内容を確認する」を押すと、
        その予定で働いた場合に基準を超えないかを先に確かめられます。
      </p>
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="crewMemberId" value={crewMemberId} />
      <input type="hidden" name="shiftType" value={shiftType} />

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
          label="当直の種別"
          selectedKeys={[shiftType]}
          onSelectionChange={(k) => setShiftType(String([...k][0] ?? "navigation_watch") as ShiftType)}
        >
          {SHIFT_TYPES.map((s) => (
            <SelectItem key={s}>{t.shiftType[s]}</SelectItem>
          ))}
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Input type="date" name="fromDate" label="開始日" defaultValue={today} isRequired />
        <Input type="date" name="toDate" label="終了日（同じなら空欄）" />
        <Input type="time" name="from" label="開始時刻" defaultValue="08:00" isRequired />
        <Input type="time" name="to" label="終了時刻" defaultValue="12:00" isRequired />
      </div>

      <Textarea name="changeNote" label="メモ（船内にも表示されます）" minRows={2} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="bordered" isLoading={pending && mode === "check"} onPress={() => setMode("check")}>
          内容を確認する
        </Button>
        <Button type="submit" color="primary" isLoading={pending && mode === "create"} onPress={() => setMode("create")}>
          作成して配信する
        </Button>
        {state.message ? (
          <p className={state.ok ? "text-sm font-semibold" : "text-sm text-warning-700"}>
            {state.ok ? "✓ " : "⚠ "}
            {state.message}
          </p>
        ) : null}
      </div>

      {state.warnings.length > 0 ? (
        <div className="ui-inset border border-warning p-3">
          <p className="text-sm font-semibold text-warning-700">
            ⚠ この予定だと基準を外れる日があります（{state.warnings.length}件）
          </p>
          <ul className="mt-1 flex max-h-48 flex-col gap-0.5 overflow-y-auto text-sm">
            {state.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-foreground-600">
            配信はできますが、休みを入れる・時間帯をずらすなどの調整を検討してください。
          </p>
        </div>
      ) : null}
    </form>
  );
}
