"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/ja";
import { Button, Input, Select, SelectItem, Textarea } from "@/ui";
import type { VesselPositionPayload } from "@/sync-protocol/masters";
import { publishManualPositionAction, type DispatchFormState } from "../actions";
import type { VesselOption } from "./schedule-form";

const INITIAL: DispatchFormState = { ok: false, message: "" };
const NAV_STATUSES: NonNullable<VesselPositionPayload["navStatus"]>[] = [
  "underway",
  "moored",
  "cargo_ops",
  "anchored",
  "unknown",
];

/**
 * 位置の手入力（3.7.1「AIS非搭載の小型船はスマホGPSによる位置共有で補完する」）。
 * 登録した位置は取得元が「手入力」として残り、AIS 由来の値と区別して表示される。
 */
export function ManualPositionForm({ vessels }: { vessels: VesselOption[] }) {
  const [state, formAction, pending] = useActionState(publishManualPositionAction, INITIAL);
  const [vesselId, setVesselId] = useState(vessels[0]?.id ?? "");
  const [navStatus, setNavStatus] =
    useState<NonNullable<VesselPositionPayload["navStatus"]>>("underway");

  return (
    <form action={formAction} className="ui-card flex flex-col gap-3 p-4">
      <h2 className="font-bold">位置を手で入れる</h2>
      <p className="text-sm text-foreground-500">
        AIS を積んでいない船や、受信が途切れた船の位置を補うための入力です。無線・電話で聞いた
        位置をそのまま入れてください。
      </p>
      <input type="hidden" name="targetVesselId" value={vesselId} />
      <input type="hidden" name="navStatus" value={navStatus} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="船"
          selectedKeys={vesselId ? [vesselId] : []}
          onSelectionChange={(k) => {
            const v = [...k][0];
            if (v) setVesselId(String(v));
          }}
        >
          {vessels.map((v) => (
            <SelectItem key={v.id}>{v.name}</SelectItem>
          ))}
        </Select>
        <Select
          label="いまの状態"
          selectedKeys={[navStatus]}
          onSelectionChange={(k) => {
            const v = [...k][0];
            if (v) setNavStatus(String(v) as NonNullable<VesselPositionPayload["navStatus"]>);
          }}
        >
          {NAV_STATUSES.map((s) => (
            <SelectItem key={s}>{t.navStatus[s]}</SelectItem>
          ))}
        </Select>
        <Input name="lat" type="number" step="0.0001" label="緯度（北緯・度）" placeholder="34.4" isRequired />
        <Input name="lon" type="number" step="0.0001" label="経度（東経・度）" placeholder="133.2" isRequired />
        <Input name="speedKnots" type="number" step="0.1" label="速力（ノット）" />
        <Input name="courseDeg" type="number" step="1" label="針路（度）" />
        <Input name="destination" label="行き先" placeholder="例: 水島港" />
        <Input name="eta" type="datetime-local" label="到着の見込み" />
        <Input name="observedAt" type="datetime-local" label="この位置を確かめた日時（空なら今）" />
      </div>
      <Textarea name="note" label="メモ（誰から聞いたか等）" minRows={2} />
      <div className="flex items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          位置を登録する
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
