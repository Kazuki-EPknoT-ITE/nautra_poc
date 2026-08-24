"use client";

import { useMemo } from "react";
import {
  evaluateDaily,
  evaluateWeekly,
  totalWorkedMinutes,
  ymdLocal,
} from "@/domain/labor-law/evaluate";
import { t } from "@/i18n/ja";
import { fmtMinutes, fmtTime } from "@/lib/format";
import { useCrewRecords, useNowTick, useSelectedCrew } from "@/lib/vessel-hooks";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";
import { Card, CardBody, CardHeader, Divider, LimitGauge, StatusChip } from "@/ui";
import { CrewPicker } from "../_components/crew-picker";
import { GroupHeader } from "../_components/group-header";

/**
 * V-03 本日の労働・休息。日/週/4週の集計と上限ゲージ、休息チェック
 * （注意=黄 / 警告=赤 の2段階アラート。要件定義書 3.2.5）。
 */
export default function TodayPage() {
  const [crew, selectCrew] = useSelectedCrew();
  const records = useCrewRecords(crew.id);
  const now = useNowTick(30_000);
  const ruleSet = DEFAULT_LABOR_RULE_SET;
  const today = ymdLocal(now);

  const daily = useMemo(
    () => evaluateDaily({ crewMemberId: crew.id, date: today, records, now, ruleSet }),
    [crew.id, today, records, now, ruleSet],
  );
  const weekly = useMemo(
    () => evaluateWeekly({ crewMemberId: crew.id, endDate: today, records, now, ruleSet }),
    [crew.id, today, records, now, ruleSet],
  );
  const fourWeeks = useMemo(
    () => totalWorkedMinutes({ crewMemberId: crew.id, endDate: today, days: 28, records, now, ruleSet }),
    [crew.id, today, records, now, ruleSet],
  );

  const restChecks = daily.checks.filter((c) => c.key.startsWith("rest_"));

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader
        group="02"
        subtitle="本日の集計"
        right={<p className="text-xs text-foreground-600">第16号の5書式の帳票出力は陸上側で対応予定</p>}
      />
      <CrewPicker selected={crew} onSelect={selectCrew} />
      <p className="text-foreground-600">対象船員: {crew.name}（{crew.position}）</p>

      <Card shadow="none" className="glass-tile">
        <CardHeader className="flex items-center justify-between">
          <span className="font-bold">労働時間ゲージ</span>
          {daily.hasOpenInterval ? (
            <span className="text-sm text-warning-700">⚠ 作業中の区間を含む（現在時刻まで集計）</span>
          ) : null}
        </CardHeader>
        <Divider />
        <CardBody className="flex flex-col gap-5">
          <LimitGauge
            label="本日の労働時間（上限14時間）"
            actualMinutes={daily.workedMinutes}
            limitMinutes={ruleSet.values.dailyMaxMinutes}
            level={daily.checks.find((c) => c.key === "daily_max")?.level ?? "ok"}
          />
          <LimitGauge
            label="直近7日間の労働時間（連続1週間上限72時間）"
            actualMinutes={weekly.totalMinutes}
            limitMinutes={ruleSet.values.weeklyMaxMinutes}
            level={weekly.check.level}
          />
          <p className="text-sm text-foreground-600">
            直近4週間合計: <span className="tabular-nums">{fmtMinutes(fourWeeks)}</span>
            （4週上限の判定は基準労働期間の設定後に有効化 — PoC対象外）
          </p>
        </CardBody>
      </Card>

      <Card shadow="none" className="glass-tile">
        <CardHeader className="font-bold">休息時間チェック</CardHeader>
        <Divider />
        <CardBody className="flex flex-col gap-3">
          {daily.hasRecords ? (
            <>
              {restChecks.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2">
                  <span>{t.check[c.key]}</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-foreground-600">
                      {c.key === "rest_split"
                        ? `${c.actual}回（上限${c.limit}回）`
                        : `${fmtMinutes(c.actual)}（基準${fmtMinutes(c.limit)}）`}
                    </span>
                    <StatusChip level={c.level} size="sm" />
                  </div>
                </div>
              ))}
              <Divider />
              <p className="text-sm text-foreground-600">
                本日の休息時間帯（現在時刻まで。分割回数・最長休息は日を跨ぐ休息を連結して判定）:
              </p>
              <ul className="flex flex-col gap-1 text-sm">
                {daily.restPeriods.map((p, i) => (
                  <li key={i} className="tabular-nums">
                    {fmtTime(p.startAt)}〜{fmtTime(p.endAt)}（{fmtMinutes(p.minutes)}）
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-foreground-600">本日の打刻がまだありません。</p>
          )}
        </CardBody>
      </Card>

      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground-600">本日の総合判定:</span>
        <StatusChip level={daily.hasRecords ? daily.level : "none"} />
      </div>

      <p className="text-xs text-foreground-600">
        適用ルール版: {daily.appliedRuleVersion}（{ruleSet.source}）。
        判定閾値は法令・労使協定の版管理データから注入され、アプリ内に固定値を持ちません。
      </p>
    </div>
  );
}
