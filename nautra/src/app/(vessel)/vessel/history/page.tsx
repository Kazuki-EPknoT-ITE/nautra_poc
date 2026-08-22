"use client";

import { useMemo, useState } from "react";
import { startOfLocalDay, ymdLocal } from "@/domain/labor-law/evaluate";
import type { TimeRecord, WorkCategory } from "@/domain/labor-law/types";
import { WORK_CATEGORIES } from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/format";
import { recordPunch } from "@/lib/vessel-actions";
import { useApprovals, useCrewRecords, useSelectedCrew } from "@/lib/vessel-hooks";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  useDisclosure,
} from "@/ui";
import { CrewPicker } from "../_components/crew-picker";
import { GroupHeader } from "../_components/group-header";

function parseLocal(dateStr: string, timeStr: string): Date {
  const d = startOfLocalDay(dateStr);
  const [h, m] = timeStr.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * V-02 打刻履歴・後から打刻。
 * 一次記録は追記のみ。訂正は「差戻し → 再入力（supersedesId 付き新規レコード）」で表現し、
 * 元レコードは物理保持のうえ「訂正済」と表示する（要件定義書 3.2.1 / 12.5）。
 */
export default function HistoryPage() {
  const [crew, selectCrew] = useSelectedCrew();
  const records = useCrewRecords(crew.id);
  const approvals = useApprovals();

  const afterModal = useDisclosure();
  const resubmitModal = useDisclosure();
  const [resubmitTarget, setResubmitTarget] = useState<TimeRecord | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // 後から打刻フォーム
  const today = ymdLocal(new Date());
  const [afterDate, setAfterDate] = useState(today);
  const [afterFrom, setAfterFrom] = useState("08:00");
  const [afterTo, setAfterTo] = useState("12:00");
  const [afterCategory, setAfterCategory] = useState<WorkCategory>("cargo");

  // 再入力フォーム
  const [resubmitDate, setResubmitDate] = useState(today);
  const [resubmitTime, setResubmitTime] = useState("17:00");

  const supersededIds = useMemo(
    () => new Set(records.filter((r) => r.supersedesId).map((r) => r.supersedesId as string)),
    [records],
  );
  const remandByRecordId = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of approvals) {
      if (a.decision === "remanded" && a.targetRecordId) {
        map.set(a.targetRecordId, a.reason ?? "差戻し");
      }
    }
    return map;
  }, [approvals]);

  const sorted = useMemo(
    () => [...records].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 50),
    [records],
  );

  async function submitAfterPunch() {
    setFormError(null);
    try {
      const from = parseLocal(afterDate, afterFrom);
      const to = parseLocal(afterDate, afterTo);
      if (to.getTime() <= from.getTime()) {
        setFormError("終了時刻は開始時刻より後にしてください");
        return;
      }
      await recordPunch({
        crewMemberId: crew.id,
        workCategory: afterCategory,
        action: "start",
        entryType: "after",
        occurredAt: from,
      });
      await recordPunch({
        crewMemberId: crew.id,
        workCategory: afterCategory,
        action: "end",
        entryType: "after",
        occurredAt: to,
      });
      afterModal.onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  }

  function openResubmit(record: TimeRecord) {
    setResubmitTarget(record);
    setResubmitDate(ymdLocal(new Date(record.occurredAt)));
    setResubmitTime(
      `${String(new Date(record.occurredAt).getHours()).padStart(2, "0")}:${String(
        new Date(record.occurredAt).getMinutes(),
      ).padStart(2, "0")}`,
    );
    setFormError(null);
    resubmitModal.onOpen();
  }

  async function submitResubmit() {
    if (!resubmitTarget) return;
    setFormError(null);
    try {
      await recordPunch({
        crewMemberId: crew.id,
        workCategory: resubmitTarget.workCategory,
        action: resubmitTarget.action,
        entryType: "resubmit",
        occurredAt: parseLocal(resubmitDate, resubmitTime),
        supersedesId: resubmitTarget.id,
      });
      resubmitModal.onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <CrewPicker selected={crew} onSelect={selectCrew} />

      <GroupHeader
        group="01"
        subtitle={`打刻履歴（${crew.name}）`}
        right={
          <Button color="primary" variant="bordered" onPress={afterModal.onOpen} className="min-h-12">
            後から打刻
          </Button>
        }
      />

      <div className="flex flex-col gap-2">
        {sorted.length === 0 ? (
          <Card shadow="none" className="bg-content1">
            <CardBody>
              <p className="text-foreground-500">
                打刻がありません。ホーム画面から打刻するか、「後から打刻」で入力してください。
              </p>
            </CardBody>
          </Card>
        ) : null}
        {sorted.map((r) => {
          const isSuperseded = supersededIds.has(r.id);
          const remandReason = !isSuperseded ? remandByRecordId.get(r.id) : undefined;
          return (
            <Card
              key={r.id}
              shadow="none"
              className={cn("bg-content1", remandReason && "border border-danger")}
            >
              <CardBody className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("tabular-nums", isSuperseded && "line-through opacity-60")}>
                    {fmtDateTime(r.occurredAt)}
                  </span>
                  <span className={cn("font-semibold", isSuperseded && "line-through opacity-60")}>
                    {t.workCategory[r.workCategory]} {t.action[r.action]}
                  </span>
                  <Chip size="sm" variant="flat" radius="sm">
                    {t.entryType[r.entryType]}
                  </Chip>
                  {isSuperseded ? (
                    <Chip size="sm" variant="flat" color="default" radius="sm">
                      訂正済（再入力で無効化・原本保持）
                    </Chip>
                  ) : null}
                  {remandReason ? (
                    <Chip size="sm" variant="flat" color="danger" radius="sm">
                      ✕ 差戻し
                    </Chip>
                  ) : null}
                </div>
                {remandReason ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-danger">{remandReason}</p>
                    <Button
                      size="sm"
                      color="danger"
                      variant="solid"
                      className="self-start min-h-10"
                      onPress={() => openResubmit(r)}
                    >
                      再入力する
                    </Button>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* 後から打刻 */}
      <Modal isOpen={afterModal.isOpen} onOpenChange={afterModal.onOpenChange} placement="center">
        <ModalContent>
          <ModalHeader>後から打刻（事後入力）</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <Select
              label="作業種別"
              selectedKeys={[afterCategory]}
              onSelectionChange={(keys) => {
                const k = [...keys][0];
                if (k) setAfterCategory(k as WorkCategory);
              }}
            >
              {WORK_CATEGORIES.map((c) => (
                <SelectItem key={c}>{t.workCategory[c]}</SelectItem>
              ))}
            </Select>
            <Input
              type="date"
              label="対象日"
              value={afterDate}
              max={today}
              onValueChange={setAfterDate}
            />
            <div className="flex gap-3">
              <Input type="time" label="開始" value={afterFrom} onValueChange={setAfterFrom} />
              <Input type="time" label="終了" value={afterTo} onValueChange={setAfterTo} />
            </div>
            {formError ? <p className="text-danger">✕ {formError}</p> : null}
            <p className="text-sm text-foreground-500">
              未来の日時は入力できません（日付誤り防止ガード）。
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={afterModal.onClose}>
              キャンセル
            </Button>
            <Button color="primary" onPress={() => void submitAfterPunch()}>
              登録する
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 差戻し再入力 */}
      <Modal isOpen={resubmitModal.isOpen} onOpenChange={resubmitModal.onOpenChange} placement="center">
        <ModalContent>
          <ModalHeader>差戻し再入力</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            {resubmitTarget ? (
              <p className="text-sm text-foreground-500">
                対象: {t.workCategory[resubmitTarget.workCategory]}{" "}
                {t.action[resubmitTarget.action]}（{fmtDateTime(resubmitTarget.occurredAt)}）。
                正しい日時で再入力すると、元の打刻は「訂正済」となり集計から除外されます
                （元レコードは保全されます）。
              </p>
            ) : null}
            <Input
              type="date"
              label="正しい日付"
              value={resubmitDate}
              max={today}
              onValueChange={setResubmitDate}
            />
            <Input type="time" label="正しい時刻" value={resubmitTime} onValueChange={setResubmitTime} />
            {formError ? <p className="text-danger">✕ {formError}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={resubmitModal.onClose}>
              キャンセル
            </Button>
            <Button color="danger" onPress={() => void submitResubmit()}>
              再入力を登録
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
