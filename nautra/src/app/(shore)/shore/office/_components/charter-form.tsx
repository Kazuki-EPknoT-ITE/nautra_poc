"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/ja";
import { Button, Input, Select, SelectItem, Textarea } from "@/ui";
import { saveCharterAction, type OfficeFormState } from "../actions";

export interface VesselOption {
  id: string;
  name: string;
}

export interface CharterOption {
  id: string;
  label: string;
  targetVesselId: string;
  counterparty: string;
  contractType: string;
  from: string;
  to: string;
  rate: string;
  rateUnit: string;
  status: string;
  terms: string;
}

const INITIAL: OfficeFormState = { ok: false, message: "" };

/** 3.6.1 傭船契約の登録・更新。更新も追記（前の契約内容は残る） */
export function CharterForm({
  vessels,
  contracts,
  defaultFrom,
}: {
  vessels: VesselOption[];
  contracts: CharterOption[];
  defaultFrom: string;
}) {
  const [state, formAction, pending] = useActionState(saveCharterAction, INITIAL);
  const [supersedesId, setSupersedesId] = useState("");
  const [targetVesselId, setTargetVesselId] = useState(vessels[0]?.id ?? "");
  const [contractType, setContractType] = useState("time_charter");
  const [status, setStatus] = useState("active");
  const [counterparty, setCounterparty] = useState("");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState("");
  const [rate, setRate] = useState("");
  const [rateUnit, setRateUnit] = useState("円/日");
  const [terms, setTerms] = useState("");

  function loadForUpdate(id: string) {
    setSupersedesId(id);
    const found = contracts.find((c) => c.id === id);
    if (!found) return;
    setTargetVesselId(found.targetVesselId);
    setContractType(found.contractType);
    setStatus(found.status);
    setCounterparty(found.counterparty);
    setFrom(found.from);
    setTo(found.to);
    setRate(found.rate);
    setRateUnit(found.rateUnit);
    setTerms(found.terms);
  }

  return (
    <form action={formAction} className="ui-card flex flex-col gap-3 p-4">
      <h3 className="font-bold">{supersedesId ? "契約を更新する" : "契約を登録する"}</h3>
      <input type="hidden" name="supersedesId" value={supersedesId} />
      <input type="hidden" name="targetVesselId" value={targetVesselId} />
      <input type="hidden" name="contractType" value={contractType} />
      <input type="hidden" name="status" value={status} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Select
          label="船"
          selectedKeys={targetVesselId ? [targetVesselId] : []}
          onSelectionChange={(k) => setTargetVesselId(String([...k][0] ?? ""))}
          isRequired
        >
          {vessels.map((v) => (
            <SelectItem key={v.id}>{v.name}</SelectItem>
          ))}
        </Select>
        <Input
          name="counterparty"
          label="相手先"
          value={counterparty}
          onValueChange={setCounterparty}
          placeholder="例: 瀬戸内海運株式会社"
          isRequired
        />
        <Select
          label="種別"
          selectedKeys={[contractType]}
          onSelectionChange={(k) => setContractType(String([...k][0] ?? "time_charter"))}
        >
          {Object.keys(t.charterType).map((k) => (
            <SelectItem key={k}>{t.charterType[k]}</SelectItem>
          ))}
        </Select>
        <Input name="from" type="date" label="開始日" value={from} onValueChange={setFrom} isRequired />
        <Input name="to" type="date" label="終了日（期間の定めがなければ空欄）" value={to} onValueChange={setTo} />
        <Select
          label="状態"
          selectedKeys={[status]}
          onSelectionChange={(k) => setStatus(String([...k][0] ?? "active"))}
        >
          {Object.keys(t.charterStatus).map((k) => (
            <SelectItem key={k}>{t.charterStatus[k]}</SelectItem>
          ))}
        </Select>
        <Input name="rate" type="number" label="用船料" value={rate} onValueChange={setRate} />
        <Input name="rateUnit" label="単位" value={rateUnit} onValueChange={setRateUnit} />
      </div>
      <Textarea name="terms" label="条件のメモ" minRows={2} value={terms} onValueChange={setTerms} />
      <Select
        label="更新する契約を選ぶ（新規のときは空のまま）"
        selectedKeys={supersedesId ? [supersedesId] : []}
        onSelectionChange={(k) => loadForUpdate(String([...k][0] ?? ""))}
      >
        {contracts.map((c) => (
          <SelectItem key={c.id}>{c.label}</SelectItem>
        ))}
      </Select>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          {supersedesId ? "更新する" : "登録する"}
        </Button>
        {supersedesId ? (
          <Button variant="bordered" onPress={() => setSupersedesId("")}>
            更新をやめる
          </Button>
        ) : null}
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
