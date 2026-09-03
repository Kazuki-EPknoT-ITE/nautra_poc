"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/ja";
import { Button, Input, Select, SelectItem, Textarea } from "@/ui";
import {
  saveSubsidyAction,
  updateSubsidyStatusAction,
  type OfficeFormState,
} from "../actions";

export interface SubsidyOption {
  id: string;
  label: string;
  status: string;
}

const INITIAL: OfficeFormState = { ok: false, message: "" };

/** 3.6.3 補助金・行政手続きの登録 */
export function SubsidyForm() {
  const [state, formAction, pending] = useActionState(saveSubsidyAction, INITIAL);
  const [category, setCategory] = useState("subsidy");
  const [status, setStatus] = useState("preparing");

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <h3 className="font-bold">手続きを登録する</h3>
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="status" value={status} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Input name="title" label="標題" placeholder="例: 内航船舶の省エネ改造に係る補助金" isRequired />
        <Select
          label="区分"
          selectedKeys={[category]}
          onSelectionChange={(k) => setCategory(String([...k][0] ?? "subsidy"))}
        >
          {Object.keys(t.subsidyCategory).map((k) => (
            <SelectItem key={k}>{t.subsidyCategory[k]}</SelectItem>
          ))}
        </Select>
        <Input name="authority" label="所管" placeholder="例: 国土交通省 海事局" />
        <Input name="appliedOn" type="date" label="申請日（まだなら空欄）" />
        <Input name="dueOn" type="date" label="期限" />
        <Input name="amount" type="number" label="金額（円。任意）" />
        <Select
          label="状態"
          selectedKeys={[status]}
          onSelectionChange={(k) => setStatus(String([...k][0] ?? "preparing"))}
        >
          {Object.keys(t.subsidyStatus).map((k) => (
            <SelectItem key={k}>{t.subsidyStatus[k]}</SelectItem>
          ))}
        </Select>
      </div>
      <Textarea name="body" label="メモ（準備する資料・進め方）" minRows={2} />
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

/** 3.6.3 手続きの状態を進める（内容はそのまま引き継ぐ） */
export function SubsidyStatusForm({ subsidies }: { subsidies: SubsidyOption[] }) {
  const [state, formAction, pending] = useActionState(updateSubsidyStatusAction, INITIAL);
  const [subsidyId, setSubsidyId] = useState(subsidies[0]?.id ?? "");
  const [status, setStatus] = useState(subsidies[0]?.status ?? "preparing");

  if (subsidies.length === 0) return null;

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <h3 className="font-bold">手続きの状態を進める</h3>
      <input type="hidden" name="subsidyId" value={subsidyId} />
      <input type="hidden" name="status" value={status} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="手続き"
          selectedKeys={subsidyId ? [subsidyId] : []}
          onSelectionChange={(k) => {
            const id = String([...k][0] ?? "");
            setSubsidyId(id);
            setStatus(subsidies.find((s) => s.id === id)?.status ?? "preparing");
          }}
          isRequired
        >
          {subsidies.map((s) => (
            <SelectItem key={s.id}>{s.label}</SelectItem>
          ))}
        </Select>
        <Select
          label="新しい状態"
          selectedKeys={[status]}
          onSelectionChange={(k) => setStatus(String([...k][0] ?? "preparing"))}
        >
          {Object.keys(t.subsidyStatus).map((k) => (
            <SelectItem key={k}>{t.subsidyStatus[k]}</SelectItem>
          ))}
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          状態を更新する
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
