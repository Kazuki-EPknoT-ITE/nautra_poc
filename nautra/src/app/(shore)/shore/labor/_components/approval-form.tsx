"use client";

import { useActionState, useRef, useState } from "react";
import { fmtDateLabel, fmtMinutes } from "@/lib/format";
import { RemandDialog, StatusChip } from "@/ui";
import { Button, Checkbox, CheckboxGroup } from "@/ui/heroui";
import { approveDaysAction, type ApprovalFormState } from "../actions";

export interface PendingDay {
  date: string;
  workedMinutes: number;
  level: "ok" | "caution" | "violation";
  /** 注意・警告の理由（ホバーで出す。LABOR-05） */
  hint?: string;
  /** 船長の承認が済んでいるか（労務管理責任者はその上で確認する） */
  captainApproved: boolean;
}

const INITIAL: ApprovalFormState = { ok: false, message: "" };

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
  /** 差戻しは理由を選んでから送る（デザイン正本 S-06 の問いかけ） */
  const [remandOpen, setRemandOpen] = useState(false);
  const [reason, setReason] = useState("");
  const remandSubmitRef = useRef<HTMLButtonElement>(null);

  if (days.length === 0) {
    return (
      <div className="ui-card p-4">
        <h2 className="font-bold">労務管理責任者の承認</h2>
        <p className="mt-1 text-sm text-foreground-500">
          未承認の日はありません（{crewName}）。
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="ui-card flex flex-col gap-3 p-4">
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
              <StatusChip level={d.level} size="sm" hint={d.hint} />
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

      {/* 理由は差戻しの問いかけで選ぶ。ここは送信のための控え */}
      <input type="hidden" name="reason" value={reason} />

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
          variant="bordered"
          color="danger"
          isDisabled={selected.length === 0}
          onPress={() => {
            setDecision("remanded");
            setRemandOpen(true);
          }}
        >
          差戻す
        </Button>
        {/* 差戻しの送信ボタン。問いかけで理由を選んでから押される（画面には出さない） */}
        <button ref={remandSubmitRef} type="submit" className="hidden" aria-hidden="true" />
        {state.message ? (
          <p className={state.ok ? "text-sm font-semibold" : "text-sm text-danger"}>
            {state.ok ? "✓ " : "✕ "}
            {state.message}
          </p>
        ) : null}
      </div>

      <RemandDialog
        open={remandOpen}
        crewName={crewName}
        targetLabel={`選択した ${selected.length}日`}
        reason={reason}
        onReasonChange={setReason}
        onCancel={() => {
          setRemandOpen(false);
          setDecision("approved");
        }}
        onSubmit={() => {
          setRemandOpen(false);
          // 理由を hidden に載せてからフォームを送る
          setTimeout(() => remandSubmitRef.current?.click(), 0);
        }}
        submitting={pending && decision === "remanded"}
      />
    </form>
  );
}
