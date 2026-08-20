"use client";

import { Progress } from "@heroui/react";
import type { CheckLevel } from "@/domain/labor-law/types";
import { fmtHoursShort } from "@/lib/format";
import { StatusChip } from "./status-chip";

/** 上限ゲージ（V-03 / S-01。実績 / 上限と2段階アラートを併記） */
export function LimitGauge({
  label,
  actualMinutes,
  limitMinutes,
  level,
}: {
  label: string;
  actualMinutes: number;
  limitMinutes: number;
  level: CheckLevel;
}) {
  const color = level === "violation" ? "danger" : level === "caution" ? "warning" : "success";
  const value = Math.min(100, (actualMinutes / limitMinutes) * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-foreground-500">
          {fmtHoursShort(actualMinutes)} / {fmtHoursShort(limitMinutes)}
        </span>
      </div>
      <Progress
        aria-label={label}
        value={value}
        color={color}
        size="md"
        radius="sm"
      />
      <div className="self-end">
        <StatusChip level={level} size="sm" />
      </div>
    </div>
  );
}
