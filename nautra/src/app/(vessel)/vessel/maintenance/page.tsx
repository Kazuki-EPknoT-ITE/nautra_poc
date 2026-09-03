"use client";

import { useMemo, useState } from "react";
import { t } from "@/i18n/ja";
import { cn } from "@/lib/cn";
import { personName } from "@/lib/crew";
import {
  fmtDateLabel,
  fmtDateTime,
  fromLocalInputValue,
  parseOptionalNumber,
  toLocalInputValue,
} from "@/lib/format";
import { latestByEquipment, openMaintenanceIssues } from "@/lib/maintenance-status";
import { useLocale } from "@/lib/use-locale";
import { appendRecord, newRecordBase } from "@/lib/vessel-actions";
import { usePermission, useRecordTemplates, useRecords, useSessionCrew } from "@/lib/vessel-hooks";
import {
  EQUIPMENT_KINDS,
  MAINTENANCE_RECORD_TYPES,
  type ChecklistResultPayload,
  type EquipmentKind,
  type MaintenanceRecordPayload,
  type MaintenanceRecordType,
} from "@/sync-protocol/records";
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
  Radio,
  RadioGroup,
  Textarea,
  useDisclosure,
  useModalProps,
} from "@/ui";
import { ChecklistResultRow, ChecklistSection } from "../_components/checklist-section";
import { GroupHeader } from "../_components/group-header";
import { ReadOnlyNote } from "../_components/permission-gate";

type Condition = MaintenanceRecordPayload["condition"];

type HistoryItem =
  | { kind: "checklist"; at: string; r: ChecklistResultPayload }
  | { kind: "maintenance"; at: string; r: MaintenanceRecordPayload };

const COND_STYLE: Record<Condition, { color: "success" | "warning" | "danger"; icon: string }> = {
  good: { color: "success", icon: "✓" },
  attention: { color: "warning", icon: "⚠" },
  defect: { color: "danger", icon: "✕" },
};

/**
 * 点検・保守（要件定義書 3.3.2 / 3.4.1）。
 *
 * **船の点検表**（出港前点検・安全パトロール）と**機器の日常点検・保守**を1画面にまとめる。
 * どちらも「点検して結果を残す」作業で内容が重なるため、03 の航海日誌から切り離して
 * ここに統合した（レビュー: 航海日誌は日誌だけにする）。履歴も1つの並びで見せる。
 */
export default function MaintenancePage() {
  // 記録できるのはサインイン中の本人のみ（打刻・日誌と同じ。基本設計書 11.3）
  const session = useSessionCrew();
  const { tr } = useLocale(); // 機器名・状態の表示言語（10.2）
  const canWrite = usePermission("write_maintenance"); // 記入は船長・機関長（11.2）
  const records = useRecords("maintenance_record");
  const checklists = useRecords("checklist_result");
  const templates = useRecordTemplates("checklist");

  /** 配信テンプレート名（過去の記録は当時のキーしか持たないため、無ければキーを出す） */
  const templateName = useMemo(() => {
    const m = new Map(templates.map((tpl) => [tpl.templateKey, tpl.name]));
    return (key: string) => m.get(key) ?? t.checklistTemplate[key] ?? key;
  }, [templates]);

  // 点検表の結果と機器の保守記録を1つの履歴にまとめる（同じ「点検」として並べて読む）
  const history = useMemo<HistoryItem[]>(() => {
    const items: HistoryItem[] = [
      ...checklists.map((r) => ({ kind: "checklist" as const, at: r.occurredAt, r })),
      ...records.map((r) => ({ kind: "maintenance" as const, at: r.occurredAt, r })),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
  }, [checklists, records]);
  const modal = useDisclosure();
  const modalProps = useModalProps();
  const [equipment, setEquipment] = useState<EquipmentKind>("main_engine");
  const [recordType, setRecordType] = useState<MaintenanceRecordType>("daily_inspection");
  const [condition, setCondition] = useState<Condition>("good");
  const [at, setAt] = useState(toLocalInputValue(new Date()));
  const [runningHours, setRunningHours] = useState("");
  const [action, setAction] = useState("");
  const [nextDue, setNextDue] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // 機器ごとの最新状態・要対応はメニューのバッジと同じ導出関数を使う（二重実装しない）
  const latestMap = useMemo(() => latestByEquipment(records), [records]);
  const openIssues = useMemo(() => openMaintenanceIssues(records), [records]);

  function open(eq: EquipmentKind) {
    if (!canWrite) return; // 参照のみのロールは記録できない
    setEquipment(eq);
    setRecordType("daily_inspection");
    setCondition("good");
    setAt(toLocalInputValue(new Date()));
    setRunningHours("");
    setAction("");
    setNextDue("");
    setRemarks("");
    setError(null);
    modal.onOpen();
  }

  async function submit() {
    setError(null);
    try {
      const d = fromLocalInputValue(at);
      if (!d) throw new Error("実施日時を入力してください");
      if (condition !== "good" && !action.trim()) throw new Error("要注意・不良の場合は処置・内容を入力してください");
      if (!session) throw new Error("サインインが必要です");
      const b = await newRecordBase(session.id, d);
      await appendRecord("maintenance_record", {
        ...b,
        equipment,
        recordType,
        crewMemberId: session.id,
        condition,
        runningHours: parseOptionalNumber(runningHours),
        action: action.trim() || undefined,
        nextDueDate: nextDue || undefined,
        remarks: remarks.trim() || undefined,
      });
      setDone(`${tr("equipment", equipment)} の${tr("maintenanceRecordType", recordType)}を記録しました（${tr("condition", condition)}）`);
      modal.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader
        group="05"
        subtitle="点検・保守"
        right={
          openIssues.length > 0 ? (
            <Chip size="sm" variant="flat" color="danger" radius="sm">
              要対応 {openIssues.length}件
            </Chip>
          ) : null
        }
      />
      <p className="text-sm text-foreground-600">
        点検者: {session ? `${session.name}（${session.position}）` : "—"}
      </p>

      {/* 船の点検表（出港前点検・安全パトロール）。項目は上司・陸上から配信される */}
      <ChecklistSection onDone={setDone} />

      <h2 className="text-base font-bold text-foreground-600">機器の日常点検・保守</h2>
      {canWrite ? null : <ReadOnlyNote note="機器の日常点検・保守の記録は船長・機関長が行います。" />}

      <section aria-label="機器別の最新状態" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {EQUIPMENT_KINDS.map((eq) => {
          const latest = latestMap.get(eq);
          const style = latest ? COND_STYLE[latest.condition] : null;
          return (
            <button
              key={eq}
              type="button"
              onClick={() => open(eq)}
              className={cn(
                "ui-card flex min-h-24 flex-col items-start gap-1 border-2 p-3 text-left",
                latest?.condition === "defect"
                  ? "border-danger"
                  : latest?.condition === "attention"
                    ? "border-warning"
                    : "border-transparent",
              )}
            >
              <span className="text-balance font-bold leading-tight">{tr("equipment", eq)}</span>
              {latest && style ? (
                <>
                  <Chip size="sm" variant="flat" color={style.color} radius="sm">
                    {style.icon} {tr("condition", latest.condition)}
                  </Chip>
                  <span className="text-xs text-foreground-600">
                    {tr("maintenanceRecordType", latest.recordType)} {fmtDateTime(latest.occurredAt)}
                  </span>
                </>
              ) : (
                <span className="text-xs text-foreground-600">記録なし</span>
              )}
            </button>
          );
        })}
      </section>

      {done ? (
        <Chip variant="flat" radius="sm" className="h-auto whitespace-normal py-1">
          ✓ {done}
        </Chip>
      ) : null}

      <section aria-label="点検・保守の履歴" className="flex flex-col gap-2">
        <h2 className="text-base font-bold text-foreground-600">履歴（新しい順）</h2>
        {history.length === 0 ? (
          <Card shadow="none" className="ui-card">
            <CardBody>
              <p className="text-foreground-600">記録がありません。</p>
            </CardBody>
          </Card>
        ) : null}
        {history.map((h) =>
          h.kind === "checklist" ? (
            <Card key={h.r.id} shadow="none" className="ui-card">
              <CardBody>
                <ChecklistResultRow r={h.r} name={templateName(h.r.templateId)} />
              </CardBody>
            </Card>
          ) : (
            <MaintenanceRow key={h.r.id} r={h.r} />
          ),
        )}
      </section>
      <p className="text-xs text-foreground-600">
        定期保守計画・部品在庫・入渠対応の管理は陸上アプリ（S-11）で行います。船内は点検結果と保守実績を一次記録として残します。
      </p>

      <Modal {...modalProps} isOpen={modal.isOpen} onOpenChange={modal.onOpenChange} placement="center" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{tr("equipment", equipment)} ─ 点検・保守の記録</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <RadioGroup orientation="horizontal" label="記録種別" value={recordType} onValueChange={(v) => setRecordType(v as MaintenanceRecordType)}>
              {MAINTENANCE_RECORD_TYPES.map((rt) => (
                <Radio key={rt} value={rt}>
                  {tr("maintenanceRecordType", rt)}
                </Radio>
              ))}
            </RadioGroup>
            <Input type="datetime-local" label="実施日時" value={at} max={toLocalInputValue(new Date())} onValueChange={setAt} />
            <RadioGroup orientation="horizontal" label="状態" value={condition} onValueChange={(v) => setCondition(v as Condition)}>
              <Radio value="good">✓ {tr("condition", "good")}</Radio>
              <Radio value="attention">⚠ {tr("condition", "attention")}</Radio>
              <Radio value="defect">✕ {tr("condition", "defect")}</Radio>
            </RadioGroup>
            <Input type="number" label="運転時間計（h・任意）" value={runningHours} onValueChange={setRunningHours} />
            <Textarea label="処置・内容（要注意・不良は必須）" value={action} onValueChange={setAction} minRows={2} />
            <Input type="date" label="次回予定日（任意）" value={nextDue} onValueChange={setNextDue} />
            <Textarea label="備考" value={remarks} onValueChange={setRemarks} minRows={2} />
            {error ? <p className="text-danger">✕ {error}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={modal.onClose}>
              キャンセル
            </Button>
            <Button color="primary" onPress={() => void submit()}>
              記録する
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

/** 機器の点検・保守 1件（履歴の行） */
function MaintenanceRow({ r }: { r: MaintenanceRecordPayload }) {
  const { tr } = useLocale();
  const style = COND_STYLE[r.condition];
  return (
    <Card shadow="none" className={cn("ui-card", r.condition === "defect" && "border border-danger")}>
      <CardBody className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tabular-nums font-bold">{fmtDateTime(r.occurredAt)}</span>
          <span className="font-semibold">{tr("equipment", r.equipment)}</span>
          <Chip size="sm" variant="flat" radius="sm">
            {tr("maintenanceRecordType", r.recordType)}
          </Chip>
          <Chip size="sm" variant="flat" color={style.color} radius="sm">
            {style.icon} {tr("condition", r.condition)}
          </Chip>
          {r.runningHours !== undefined ? (
            <span className="tabular-nums text-sm text-foreground-600">
              運転 {r.runningHours.toLocaleString()} h
            </span>
          ) : null}
          <span className="ml-auto text-sm text-foreground-600">{personName(r.crewMemberId)}</span>
        </div>
        {r.action ? <p className="text-pretty">{r.action}</p> : null}
        {r.remarks ? <p className="text-sm text-foreground-600">{r.remarks}</p> : null}
        {r.nextDueDate ? (
          <p className="text-sm text-foreground-600">次回予定: {fmtDateLabel(r.nextDueDate)}</p>
        ) : null}
      </CardBody>
    </Card>
  );
}
