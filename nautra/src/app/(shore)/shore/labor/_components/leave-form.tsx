"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/ja";
import { LEAVE_KINDS, type LeaveKind } from "@/sync-protocol/records";
import { Button, Input, Radio, RadioGroup, Select, SelectItem, Textarea } from "@/ui";
import { publishLeaveAction, type LeaveFormState } from "../actions";

export interface LeaveCrewOption {
  id: string;
  name: string;
}

const INITIAL: LeaveFormState = { ok: false, message: "" };

/**
 * 休日・有給・補償休日の付与／取得の登録（3.2.4）。
 * 付与・編集は管理者権限のみのため、この画面は `edit_leave` を持つ担当者にだけ描画する
 * （Server Action 側でも `requireShore` で再確認する）。
 */
export function LeaveForm({
  crews,
  defaultCrewId,
  today,
}: {
  crews: LeaveCrewOption[];
  defaultCrewId: string;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(publishLeaveAction, INITIAL);
  const [crewMemberId, setCrewMemberId] = useState(defaultCrewId);
  const [kind, setKind] = useState<LeaveKind>("paid_leave");
  const [leaveAction, setLeaveAction] = useState<"grant" | "take">("grant");

  return (
    <form action={formAction} className="glass-inset flex flex-col gap-3 p-4">
      <h3 className="font-bold">休日・有給を登録する</h3>
      <p className="text-xs text-foreground-600">
        残り日数は付与と取得から毎回計算しています。ここで直接書き換えることはできません。
      </p>
      <input type="hidden" name="crewMemberId" value={crewMemberId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="leaveAction" value={leaveAction} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="対象の船員"
          selectedKeys={crewMemberId ? [crewMemberId] : []}
          onSelectionChange={(k) => setCrewMemberId(String([...k][0] ?? ""))}
        >
          {crews.map((c) => (
            <SelectItem key={c.id}>{c.name}</SelectItem>
          ))}
        </Select>
        <Select
          label="休みの種類"
          selectedKeys={[kind]}
          onSelectionChange={(k) => setKind(String([...k][0] ?? "paid_leave") as LeaveKind)}
        >
          {LEAVE_KINDS.map((k) => (
            <SelectItem key={k}>{t.leaveKind[k]}</SelectItem>
          ))}
        </Select>
      </div>

      <RadioGroup
        orientation="horizontal"
        label="登録の種類"
        value={leaveAction}
        onValueChange={(v) => setLeaveAction(v as "grant" | "take")}
      >
        <Radio value="grant">{t.leaveAction.grant}（休みを与える）</Radio>
        <Radio value="take">{t.leaveAction.take}（休みを使った）</Radio>
      </RadioGroup>

      <div className="grid gap-3 sm:grid-cols-3">
        <Input type="date" name="date" label="日付" defaultValue={today} isRequired />
        <Input
          type="number"
          name="days"
          label="日数"
          step="0.5"
          min="0.5"
          defaultValue="1"
          isRequired
        />
        <Input
          type="date"
          name="expiresOn"
          label="いつまでに使うか（付与のみ）"
          isDisabled={leaveAction === "take"}
        />
      </div>

      <Textarea name="reason" label="理由・メモ" minRows={2} />

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
