"use client";

import { useActionState, useState, useTransition } from "react";
import { t } from "@/i18n/ja";
import { Button, Checkbox, Input, Select, SelectItem, Textarea } from "@/ui";
import { appendIncidentAction, generateDraftAction, type SafetyFormState } from "../actions";

const INITIAL: SafetyFormState = { ok: false, message: "" };
const STATUSES: ("open" | "investigating" | "closed")[] = ["open", "investigating", "closed"];

export interface IncidentPanelProps {
  incidentId: string;
  status: "open" | "investigating" | "closed";
  cause?: string;
  preventiveAction?: string;
  reportedToAuthority: boolean;
  authorityReportedOn?: string;
  notifiedNearbyShips: boolean;
  notifiedNearbyShipsAt?: string;
  /** コンテナ海中転落など、付近船舶への通報が要る事象か */
  needsNearbyNotice: boolean;
}

/**
 * 事故報告への陸上からの追記（3.5.2）と、報告書ドラフトの生成（6.5）。
 *
 * 船内が起票した一次記録は書き換えず、追記（supersedesId 付きの新しいレコード）で表す。
 */
export function IncidentPanel(props: IncidentPanelProps) {
  const [state, formAction, pending] = useActionState(appendIncidentAction, INITIAL);
  const [status, setStatus] = useState(props.status);
  const [reported, setReported] = useState(props.reportedToAuthority);
  const [notified, setNotified] = useState(props.notifiedNearbyShips);
  const [draftPending, startDraft] = useTransition();
  const [draftState, setDraftState] = useState<SafetyFormState | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="glass-inset flex flex-col gap-3 p-3">
        <h4 className="text-sm font-bold">陸上から追記する</h4>
        <input type="hidden" name="incidentId" value={props.incidentId} />
        <input type="hidden" name="status" value={status} />
        <Textarea
          name="cause"
          size="sm"
          label="原因の分析"
          minRows={2}
          defaultValue={props.cause ?? ""}
        />
        <Textarea
          name="preventiveAction"
          size="sm"
          label="再発防止の策"
          minRows={2}
          defaultValue={props.preventiveAction ?? ""}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            size="sm"
            label="対応の状態"
            selectedKeys={[status]}
            onSelectionChange={(k) => {
              const v = [...k][0];
              if (v) setStatus(String(v) as "open" | "investigating" | "closed");
            }}
          >
            {STATUSES.map((s) => (
              <SelectItem key={s}>{t.incidentStatus[s]}</SelectItem>
            ))}
          </Select>
          <Input
            name="authorityReportedOn"
            type="date"
            size="sm"
            label="役所へ報告した日"
            defaultValue={props.authorityReportedOn ?? ""}
          />
        </div>
        <Checkbox
          name="reportedToAuthority"
          size="sm"
          isSelected={reported}
          onValueChange={setReported}
        >
          役所（運輸局・海上保安庁）へ報告した
        </Checkbox>

        {/* 3.5.2 コンテナ海中転落時の付近船舶等への通報記録 */}
        <div className="flex flex-col gap-2">
          <Checkbox
            name="notifiedNearbyShips"
            size="sm"
            isSelected={notified}
            onValueChange={setNotified}
          >
            付近を走る船・関係先へ通報した
          </Checkbox>
          <Input
            name="notifiedNearbyShipsAt"
            type="datetime-local"
            size="sm"
            label="通報した日時"
            defaultValue={props.notifiedNearbyShipsAt ?? ""}
            isDisabled={!notified}
          />
          {props.needsNearbyNotice && !notified ? (
            <p className="text-xs text-warning-700">
              ⚠ 荷が海に落ちたときは、付近を走る船と関係先への通報が必要です。通報したら記録してください。
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" color="primary" size="sm" isLoading={pending}>
            追記する
          </Button>
          {state.message ? (
            <p className={state.ok ? "text-sm font-semibold" : "text-sm text-danger"}>
              {state.ok ? "✓ " : "✕ "}
              {state.message}
            </p>
          ) : null}
        </div>
      </form>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="bordered"
            isLoading={draftPending}
            onPress={() =>
              startDraft(async () => setDraftState(await generateDraftAction(props.incidentId)))
            }
          >
            報告書の下書きを作る
          </Button>
          <span className="text-xs text-foreground-500">
            事故の記録と、その日の航海日誌から下書きを組み立てて保存します。
          </span>
          {draftState?.message ? (
            <span className={draftState.ok ? "text-xs font-semibold" : "text-xs text-danger"}>
              {draftState.ok ? "✓ " : "✕ "}
              {draftState.message}
            </span>
          ) : null}
        </div>
        {draftState?.draft ? (
          <pre className="glass-inset max-h-96 overflow-auto whitespace-pre-wrap p-3 text-xs">
            {draftState.draft}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
