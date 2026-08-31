"use client";

import { useActionState, useState } from "react";
import { fmtDateLabel, fmtMinutes } from "@/lib/format";
import { Button, Checkbox, CheckboxGroup, Chip, Textarea } from "@/ui";
import { approveDaysAction, type ApprovalFormState } from "../actions";

export interface PendingDay {
  date: string;
  workedMinutes: number;
  level: "ok" | "caution" | "violation";
  /** 船長の承認が済んでいるか（労務管理責任者はその上で確認する） */
  captainApproved: boolean;
}

const INITIAL: ApprovalFormState = { ok: false, message: "" };

const LEVEL: Record<string, { color: "success" | "warning" | "danger"; icon: string; label: string }> = {
  ok: { color: "success", icon: "✓", label: "適合" },
  caution: { color: "warning", icon: "⚠", label: "注意" },
  violation: { color: "danger", icon: "✕", label: "警告" },
};

/**
 * 労務管理責任者の承認フォーム（S-06）。
 * 未承認の日をまとめて承認・差戻しできる。差戻しは理由が必須で、船内の本人に表示される。
 */
export function ApprovalForm({
  crewMemberId,
  crewName,
  days,
}: {
  crewMemberId: string;
  crewName: string;
  days: PendingDay[];
}) {
  const [state, formAction, pending] = useActionState(approveDaysAction, INITIAL);
  const [selected, setSelected] = useState<string[]>(days.map((d) => d.date));
  const [decision, setDecision] = useState<"approved" | "remanded">("approved");

  if (days.length === 0) {
    return (
      <div className="glass-tile p-4">
        <h2 className="font-bold">労務管理責任者の承認</h2>
        <p className="mt-1 text-sm text-foreground-500">
          未承認の日はありません（{crewName}）。
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">労務管理責任者の承認（{crewName}）</h2>
        <span className="text-sm text-foreground-500">未承認 {days.length}日</span>
      </div>
      <input type="hidden" name="crewMemberId" value={crewMemberId} />
      <input type="hidden" name="decision" value={decision} />
      {selected.map((d) => (
        <input key={d} type="hidden" name="dates" value={d} />
      ))}

      <CheckboxGroup
        aria-label="承認する日"
        value={selected}
        onValueChange={setSelected}
        classNames={{ wrapper: "gap-1" }}
      >
        {days.map((d) => (
          <Checkbox key={d.date} value={d.date}>
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span className="tabular-nums font-semibold">{fmtDateLabel(d.date)}</span>
              <span className="tabular-nums">{fmtMinutes(d.workedMinutes)}</span>
              <Chip size="sm" variant="flat" color={LEVEL[d.level].color} radius="sm">
                {LEVEL[d.level].icon} {LEVEL[d.level].label}
              </Chip>
              <span className="text-foreground-500">
                {d.captainApproved ? "船長 承認済" : "船長 未承認"}
              </span>
            </span>
          </Checkbox>
        ))}
      </CheckboxGroup>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="bordered"
          className="min-h-10"
          onPress={() => setSelected(days.map((d) => d.date))}
        >
          すべて選択
        </Button>
        <Button size="sm" variant="bordered" className="min-h-10" onPress={() => setSelected([])}>
          選択を解除
        </Button>
      </div>

      <Textarea
        name="reason"
        label="差戻しの理由（差戻すときは必須。船内の本人に表示されます）"
        minRows={2}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          color="primary"
          isLoading={pending && decision === "approved"}
          isDisabled={selected.length === 0}
          onPress={() => setDecision("approved")}
        >
          選択した{selected.length}日を承認する
        </Button>
        <Button
          type="submit"
          variant="bordered"
          color="danger"
          isLoading={pending && decision === "remanded"}
          isDisabled={selected.length === 0}
          onPress={() => setDecision("remanded")}
        >
          差戻す
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
