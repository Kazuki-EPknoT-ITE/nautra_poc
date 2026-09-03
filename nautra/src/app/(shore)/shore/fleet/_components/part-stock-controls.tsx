"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, Input } from "@/ui";
import { advancePartOrderAction, receivePartsAction, type FleetFormState } from "../actions";

const INITIAL: FleetFormState = { ok: false, message: "" };

/**
 * 部品・消耗品1件分の操作（発注を進める／入荷を登録する）。
 * どちらも追記型の配信になり、旧レコードは残る（訂正の履歴が追える）。
 */
export function PartStockControls({
  stockId,
  nextLabel,
  unit,
}: {
  stockId: string;
  /** 次に進める段階の文言（進められないときは null） */
  nextLabel: string | null;
  unit?: string;
}) {
  const [orderState, setOrderState] = useState<FleetFormState | null>(null);
  const [pending, startTransition] = useTransition();
  const [receiveState, receiveAction, receivePending] = useActionState(receivePartsAction, INITIAL);
  const [quantity, setQuantity] = useState("1");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {nextLabel ? (
          <Button
            size="sm"
            color="primary"
            isLoading={pending}
            onPress={() =>
              startTransition(async () => setOrderState(await advancePartOrderAction(stockId)))
            }
          >
            {nextLabel}
          </Button>
        ) : null}
        <form action={receiveAction} className="flex items-end gap-2">
          <input type="hidden" name="stockId" value={stockId} />
          <Input
            name="quantity"
            type="number"
            min={1}
            size="sm"
            label={`入荷数${unit ? `（${unit}）` : ""}`}
            className="w-32"
            value={quantity}
            onValueChange={setQuantity}
          />
          <Button type="submit" size="sm" variant="bordered" isLoading={receivePending}>
            入荷を登録
          </Button>
        </form>
      </div>
      {orderState?.message ? (
        <p className={orderState.ok ? "text-xs font-semibold" : "text-xs text-danger"}>
          {orderState.ok ? "✓ " : "✕ "}
          {orderState.message}
        </p>
      ) : null}
      {receiveState.message ? (
        <p className={receiveState.ok ? "text-xs font-semibold" : "text-xs text-danger"}>
          {receiveState.ok ? "✓ " : "✕ "}
          {receiveState.message}
        </p>
      ) : null}
    </div>
  );
}
