"use client";

import { useActionState, useState } from "react";
import { BUSINESS_EVENT_LABEL, type BusinessEvent } from "@/domain/procedures/chain";
import { PROCEDURE_GROUP_LABEL } from "@/domain/procedures/deadlines";
import { PROCEDURE_GROUPS, type ProcedureGroup } from "@/sync-protocol/records";
import { Button, Input, Select, SelectItem, Textarea } from "@/ui";
import { chainFromEventAction, createProcedureAction, type ProcedureFormState } from "../actions";

const INITIAL: ProcedureFormState = { ok: false, message: "" };

export interface ProcedureOptions {
  crew: { id: string; name: string }[];
  vessels: { id: string; name: string }[];
}

const EVENTS: BusinessEvent[] = ["embark", "disembark", "hire", "fiscal_year_end"];

/**
 * 6.6① イベント駆動の連鎖生成。
 * 手続きを1件ずつ登録するのではなく、**業務の出来事**を入れると必要な一式が生える。
 */
export function EventChainForm({ options, today }: { options: ProcedureOptions; today: string }) {
  const [state, formAction, pending] = useActionState(chainFromEventAction, INITIAL);
  const [event, setEvent] = useState<BusinessEvent>("embark");
  const needsCrew = event !== "fiscal_year_end";

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <h2 className="font-bold">業務の出来事から手続きを起こす</h2>
      <p className="text-sm text-foreground-600">
        乗船・下船・採用・決算期末を入れると、その出来事に必要な手続き（届出・保険・記帳・確認）を
        まとめて起票します。
      </p>
      <input type="hidden" name="event" value={event} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="出来事"
          selectedKeys={[event]}
          onSelectionChange={(k) => setEvent(String([...k][0] ?? "embark") as BusinessEvent)}
        >
          {EVENTS.map((e) => (
            <SelectItem key={e}>{BUSINESS_EVENT_LABEL[e]}</SelectItem>
          ))}
        </Select>
        <Input type="date" name="eventDate" label="起点の日付" defaultValue={today} isRequired />
        {needsCrew ? (
          <Select name="subjectId" label="対象の船員" defaultSelectedKeys={options.crew[0] ? [options.crew[0].id] : []}>
            {options.crew.map((c) => (
              <SelectItem key={c.id}>{c.name}</SelectItem>
            ))}
          </Select>
        ) : (
          <p className="self-end text-sm text-foreground-500">対象は事業者です。</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          手続きをまとめて起票する
        </Button>
        {state.message ? (
          <p className={state.ok ? "text-sm font-semibold" : "text-sm text-danger"}>
            {state.ok ? "✓ " : "✕ "}
            {state.message}
          </p>
        ) : null}
      </div>
      {state.ok && state.createdTitles && state.createdTitles.length > 0 ? (
        <ul className="glass-inset flex flex-col gap-1 p-3 text-sm">
          {state.createdTitles.map((title) => (
            <li key={title}>・{title}</li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

/** 1件ずつの起票（連鎖に載らない突発の手続き用） */
export function NewProcedureForm({ options }: { options: ProcedureOptions }) {
  const [state, formAction, pending] = useActionState(createProcedureAction, INITIAL);
  const [subjectType, setSubjectType] = useState<"crew" | "vessel" | "company">("company");

  const subjects =
    subjectType === "crew" ? options.crew : subjectType === "vessel" ? options.vessels : [];

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <h2 className="font-bold">手続きを1件だけ起票する</h2>
      <input type="hidden" name="subjectType" value={subjectType} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select name="group" label="群（6.1 の4分類）" defaultSelectedKeys={["B"]}>
          {PROCEDURE_GROUPS.map((g) => (
            <SelectItem key={g}>{PROCEDURE_GROUP_LABEL[g as ProcedureGroup]}</SelectItem>
          ))}
        </Select>
        <Input name="title" label="標題" placeholder="例: 就業規則の変更届" isRequired />
      </div>
      <Textarea
        name="basis"
        label="根拠（法令・様式）"
        minRows={2}
        placeholder="例: 船員法97条。常時10人以上の船員を使用する場合"
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <Select
          label="対象の種類"
          selectedKeys={[subjectType]}
          onSelectionChange={(k) =>
            setSubjectType(String([...k][0] ?? "company") as "crew" | "vessel" | "company")
          }
        >
          <SelectItem key="company">事業者</SelectItem>
          <SelectItem key="crew">船員</SelectItem>
          <SelectItem key="vessel">船舶</SelectItem>
        </Select>
        {subjectType === "company" ? (
          <p className="self-end text-sm text-foreground-500">対象は事業者です。</p>
        ) : (
          <Select name="subjectId" label="対象" defaultSelectedKeys={subjects[0] ? [subjects[0].id] : []}>
            {subjects.map((s) => (
              <SelectItem key={s.id}>{s.name}</SelectItem>
            ))}
          </Select>
        )}
        <Input type="date" name="dueOn" label="提出期限" />
        <Input
          type="number"
          name="leadTimeDays"
          label="準備の日数"
          placeholder="14"
          description="着手期限＝提出期限−この日数"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          起票する
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
