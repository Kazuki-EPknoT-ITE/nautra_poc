"use client";

import { useMemo, useState } from "react";
import { buildIntervals } from "@/domain/labor-law/intervals";
import { WORK_CATEGORIES, type WorkCategory } from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";
import { fmtMinutes, fmtTime } from "@/lib/format";
import { recordPunch } from "@/lib/vessel-actions";
import { useCrewRecords, useNowTick, useSelectedCrew } from "@/lib/vessel-hooks";
import { Card, CardBody, PunchButton } from "@/ui";
import { CrewPicker } from "../_components/crew-picker";
import { GroupHeader } from "../_components/group-header";

/**
 * V-01 ホーム（打刻）。作業種別大ボタン + 開始/終了打刻。
 * 打刻はホームから2タップ以内（打刻者選択は保持される）。
 * 直前打刻の確認表示を常時行い、誤操作を防止する（基本設計書 6.1 / 6.3）。
 */
export default function VesselHomePage() {
  const [crew, selectCrew] = useSelectedCrew();
  const records = useCrewRecords(crew.id);
  const now = useNowTick(15_000);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openInterval = useMemo(() => {
    const intervals = buildIntervals(records);
    return intervals.find((iv) => iv.endAt === null) ?? null;
  }, [records]);

  const lastRecord = useMemo(() => {
    if (records.length === 0) return null;
    return [...records].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).at(-1) ?? null;
  }, [records]);

  async function punch(workCategory: WorkCategory, action: "start" | "end") {
    setError(null);
    try {
      const rec = await recordPunch({ crewMemberId: crew.id, workCategory, action });
      setConfirmation(
        `${t.workCategory[workCategory]} を${t.action[action]}しました（${fmtTime(rec.occurredAt)}）`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const elapsed = openInterval
    ? Math.max(0, Math.round((now.getTime() - openInterval.startAt.getTime()) / 60000))
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="01" />

      <CrewPicker selected={crew} onSelect={selectCrew} />

      <div className="flex items-baseline justify-between">
        <p className="text-foreground-500">
          {now.getMonth() + 1}/{now.getDate()}{" "}
          <span className="tabular-nums text-2xl font-bold text-foreground">
            {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
          </span>
        </p>
        <p className="text-foreground-500">{crew.name}（{crew.position}）</p>
      </div>

      {openInterval ? (
        <Card className="border-2 border-primary bg-content2" shadow="none">
          <CardBody className="flex flex-col gap-3">
            <p className="text-xl">
              <span className="font-bold">{t.workCategory[openInterval.workCategory]}</span> 作業中
              <span className="ml-3 tabular-nums text-foreground-500">
                {fmtTime(openInterval.startAt.toISOString())}〜（経過 {fmtMinutes(elapsed)}）
              </span>
            </p>
            <PunchButton
              label={`${t.workCategory[openInterval.workCategory]} を終了`}
              danger
              onPress={() => void punch(openInterval.workCategory, "end")}
            />
          </CardBody>
        </Card>
      ) : (
        <p className="text-foreground-500">作業を選んで押すだけで開始打刻されます。</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {WORK_CATEGORIES.map((cat) => (
          <PunchButton
            key={cat}
            label={t.workCategory[cat]}
            sublabel={
              openInterval?.workCategory === cat
                ? "作業中"
                : openInterval
                  ? "タップで切替"
                  : "タップで開始"
            }
            active={openInterval?.workCategory === cat}
            onPress={() =>
              openInterval?.workCategory === cat
                ? void punch(cat, "end")
                : void punch(cat, "start")
            }
          />
        ))}
      </div>

      {error ? (
        <Card className="border border-danger" shadow="none">
          <CardBody>
            <p className="text-danger">✕ {error}</p>
          </CardBody>
        </Card>
      ) : null}

      {confirmation ? (
        <Card className="border border-success" shadow="none">
          <CardBody>
            <p className="text-success-600">✓ {confirmation}</p>
          </CardBody>
        </Card>
      ) : null}

      <Card shadow="none" className="bg-content1">
        <CardBody className="flex flex-col gap-1">
          <p className="text-sm text-foreground-500">直前の打刻（常時表示・誤操作確認用）</p>
          {lastRecord ? (
            <p>
              <span className="font-semibold">{t.workCategory[lastRecord.workCategory]}</span>{" "}
              {t.action[lastRecord.action]}{" "}
              <span className="tabular-nums">{fmtTime(lastRecord.occurredAt)}</span>
              <span className="ml-2 text-sm text-foreground-500">
                （{t.entryType[lastRecord.entryType]}）
              </span>
            </p>
          ) : (
            <p className="text-foreground-500">まだ打刻がありません。</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
