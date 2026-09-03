"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/ja";
import { Button, Input, Select, SelectItem, Textarea } from "@/ui";
import type { VoyageSchedulePayload } from "@/sync-protocol/masters";
import { createScheduleAction, type DispatchFormState } from "../actions";

export interface VesselOption {
  id: string;
  name: string;
}

const INITIAL: DispatchFormState = { ok: false, message: "" };
const STATUSES: VoyageSchedulePayload["status"][] = [
  "planned",
  "fixed",
  "in_progress",
  "done",
  "canceled",
];

/**
 * 配船スケジュールの新規登録（3.7.2）。
 * 登録した期間に下船・乗船の予定が重なる船員がいれば、そのことを結果として知らせる
 * （サブプロセス③「船員の配乗状況・休暇予定の確認」）。
 */
export function ScheduleForm({ vessels }: { vessels: VesselOption[] }) {
  const [state, formAction, pending] = useActionState(createScheduleAction, INITIAL);
  const [vesselId, setVesselId] = useState(vessels[0]?.id ?? "");
  const [status, setStatus] = useState<VoyageSchedulePayload["status"]>("planned");

  return (
    <form action={formAction} className="ui-card flex flex-col gap-3 p-4">
      <h2 className="font-bold">配船を登録</h2>
      <input type="hidden" name="targetVesselId" value={vesselId} />
      <input type="hidden" name="status" value={status} />
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
        <Input name="voyageNo" label="航海番号" placeholder="例: V-2026-044" />
        <Input name="departurePort" label="出港地" placeholder="例: 水島港" isRequired />
        <Input name="arrivalPort" label="入港地" placeholder="例: 横浜港（大黒埠頭）" isRequired />
        <Input name="departureAt" type="datetime-local" label="出港日時" isRequired />
        <Input name="arrivalAt" type="datetime-local" label="入港日時" isRequired />
        <Input name="cargoKind" label="貨物" placeholder="例: 鋼材コイル" />
        <Input name="quantity" label="数量" placeholder="例: 1,000 t" />
        <Input name="counterparty" label="相手先" placeholder="例: 瀬戸内海運株式会社" />
        <Select
          label="状態"
          selectedKeys={[status]}
          onSelectionChange={(k) => {
            const v = [...k][0];
            if (v) setStatus(String(v) as VoyageSchedulePayload["status"]);
          }}
        >
          {STATUSES.map((s) => (
            <SelectItem key={s}>{t.scheduleStatus[s]}</SelectItem>
          ))}
        </Select>
      </div>
      <Textarea
        name="planningNote"
        label="検討のメモ（燃料・潮汐・港湾の混雑など）"
        minRows={2}
      />
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <Button type="submit" color="primary" isLoading={pending}>
            配船を登録する
          </Button>
          {state.message ? (
            <p className={state.ok ? "text-sm font-semibold" : "text-sm text-danger"}>
              {state.ok ? "✓ " : "✕ "}
              {state.message}
            </p>
          ) : null}
        </div>
        {state.ok && state.warnings && state.warnings.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm text-warning-700">
            {state.warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </form>
  );
}
