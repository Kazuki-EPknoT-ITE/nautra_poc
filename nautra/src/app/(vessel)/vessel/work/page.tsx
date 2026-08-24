"use client";

import { useMemo, useState } from "react";
import { addDays, ymdLocal } from "@/domain/labor-law/evaluate";
import { t } from "@/i18n/ja";
import { cn } from "@/lib/cn";
import { CREW_MEMBERS, personName } from "@/lib/crew";
import {
  fmtDateTime,
  fmtMinutes,
  fmtTime,
  fromLocalInputValue,
  parseOptionalNumber,
  toLocalInputValue,
} from "@/lib/format";
import { appendRecord, assertNotFuture, newRecordBase } from "@/lib/vessel-actions";
import { useRecords, useSelectedCrew } from "@/lib/vessel-hooks";
import { WORK_REPORT_TYPES, type WorkReportPayload, type WorkReportType } from "@/sync-protocol/records";
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
  RadioGroup,
  Radio,
  Select,
  SelectItem,
  Textarea,
  useDisclosure,
  useGlassModalProps,
} from "@/ui";
import { CrewPicker } from "../_components/crew-picker";
import { GroupHeader } from "../_components/group-header";

/** 記録種別は白黒基調（塗り=主要操作 / 枠線=補助）。種別名は必ず文言で併記する */
const TYPE_COLOR: Record<WorkReportType, "primary" | "default"> = {
  cargo: "primary",
  standby: "primary",
  fuel: "default",
  handover: "default",
};

const STANDBY_REASONS = [
  "荷役待ち（バース空き待ち）",
  "荷役待ち（荷主・貨物手配待ち）",
  "水先人・タグ待ち",
  "気象・海象による待機",
  "その他",
];

interface FormState {
  reportType: WorkReportType;
  startedAt: string;
  endedAt: string;
  port: string;
  cargoKind: string;
  operation: "load" | "unload";
  quantity: string;
  standbyReason: string;
  fuelType: string;
  fuelOperation: "bunkering" | "consumption";
  fuelQuantityL: string;
  remainingOnBoardL: string;
  handoverTo: string;
  handoverItems: string;
  remarks: string;
}

function emptyForm(reportType: WorkReportType, crewId: string): FormState {
  const now = new Date();
  const other = CREW_MEMBERS.find((c) => c.id !== crewId)?.id ?? crewId;
  return {
    reportType,
    startedAt: toLocalInputValue(new Date(now.getTime() - 60 * 60 * 1000)),
    endedAt: toLocalInputValue(now),
    port: "",
    cargoKind: "",
    operation: "unload",
    quantity: "",
    standbyReason: STANDBY_REASONS[0],
    fuelType: "A重油",
    fuelOperation: "consumption",
    fuelQuantityL: "",
    remainingOnBoardL: "",
    handoverTo: other,
    handoverItems: "",
    remarks: "",
  };
}

function durationMinutes(r: WorkReportPayload): number | null {
  if (!r.endedAt) return null;
  return Math.max(0, Math.round((new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()) / 60000));
}

function summaryOf(r: WorkReportPayload): string {
  switch (r.reportType) {
    case "cargo":
      return [r.port, r.operation ? t.cargoOperation[r.operation] : null, r.cargoKind, r.quantity].filter(Boolean).join(" / ");
    case "standby":
      return r.standbyReason ?? "";
    case "fuel":
      return [
        r.fuelType,
        r.fuelOperation ? t.fuelOperation[r.fuelOperation] : null,
        r.fuelQuantityL !== undefined ? `${r.fuelQuantityL.toLocaleString()} L` : null,
        r.remainingOnBoardL !== undefined ? `残油 ${r.remainingOnBoardL.toLocaleString()} L` : null,
      ]
        .filter(Boolean)
        .join(" / ");
    case "handover":
      return `→ ${personName(r.handoverTo)}: ${r.handoverItems ?? ""}`;
  }
}

/**
 * V-07 作業・待機・燃料・引継記録（要件定義書 3.3.3）。
 * スタンバイ待機時間は労働時間に算入される待機の見える化（荷主・オペレーターとの
 * 取引環境改善協議のエビデンス）として週次合計を表示する。
 */
export default function WorkPage() {
  const [crew, selectCrew] = useSelectedCrew();
  const reports = useRecords("work_report");
  const modal = useDisclosure();
  const glassModal = useGlassModalProps();
  const [form, setForm] = useState<FormState>(() => emptyForm("cargo", crew.id));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [filter, setFilter] = useState<WorkReportType | "all">("all");

  const today = ymdLocal(new Date());
  const weekStart = addDays(today, -6);
  const standbyWeek = useMemo(
    () =>
      reports
        .filter((r) => r.reportType === "standby" && ymdLocal(new Date(r.startedAt)) >= weekStart)
        .reduce((sum, r) => sum + (durationMinutes(r) ?? 0), 0),
    [reports, weekStart],
  );
  const standbyWeekCount = reports.filter(
    (r) => r.reportType === "standby" && ymdLocal(new Date(r.startedAt)) >= weekStart,
  ).length;

  const visible = useMemo(
    () => (filter === "all" ? reports : reports.filter((r) => r.reportType === filter)).slice(0, 60),
    [reports, filter],
  );

  function open(type: WorkReportType) {
    setForm(emptyForm(type, crew.id));
    setError(null);
    modal.onOpen();
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setError(null);
    try {
      const start = fromLocalInputValue(form.startedAt);
      if (!start) throw new Error("開始日時を入力してください");
      const needsEnd = form.reportType !== "handover";
      const end = needsEnd ? fromLocalInputValue(form.endedAt) : null;
      if (needsEnd && end && end.getTime() < start.getTime()) throw new Error("終了は開始より後にしてください");
      if (end) assertNotFuture(end); // 終了日時にも未来ガード（誤操作防止。基本設計書 6.3）
      if (form.reportType === "cargo" && !form.port.trim()) throw new Error("港名を入力してください");
      if (form.reportType === "handover" && !form.handoverItems.trim()) throw new Error("引継事項を入力してください");
      const b = await newRecordBase(crew.id, start);
      const payload: WorkReportPayload = {
        ...b,
        reportType: form.reportType,
        crewMemberId: crew.id,
        startedAt: start.toISOString(),
        endedAt: end ? end.toISOString() : undefined,
        port: form.reportType === "cargo" ? form.port.trim() || undefined : undefined,
        cargoKind: form.reportType === "cargo" ? form.cargoKind.trim() || undefined : undefined,
        operation: form.reportType === "cargo" ? form.operation : undefined,
        quantity: form.reportType === "cargo" ? form.quantity.trim() || undefined : undefined,
        standbyReason: form.reportType === "standby" ? form.standbyReason : undefined,
        fuelType: form.reportType === "fuel" ? form.fuelType.trim() || undefined : undefined,
        fuelOperation: form.reportType === "fuel" ? form.fuelOperation : undefined,
        fuelQuantityL: form.reportType === "fuel" ? parseOptionalNumber(form.fuelQuantityL) : undefined,
        remainingOnBoardL: form.reportType === "fuel" ? parseOptionalNumber(form.remainingOnBoardL) : undefined,
        handoverTo: form.reportType === "handover" ? form.handoverTo : undefined,
        handoverItems: form.reportType === "handover" ? form.handoverItems.trim() : undefined,
        remarks: form.remarks.trim() || undefined,
      };
      await appendRecord("work_report", payload);
      setDone(`${t.workReportType[form.reportType]} を記録しました（${fmtTime(payload.startedAt)}〜）`);
      modal.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="05" subtitle="作業・待機・燃料・引継" />
      <CrewPicker selected={crew} onSelect={selectCrew} />
      <p className="text-sm text-foreground-400">記録者: {crew.name}（{crew.position}）</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {WORK_REPORT_TYPES.map((type) => (
          <Button
            key={type}
            color={TYPE_COLOR[type] === "default" ? "default" : TYPE_COLOR[type]}
            variant={TYPE_COLOR[type] === "default" ? "bordered" : "solid"}
            radius="lg"
            className={cn("min-h-16 h-auto py-2 text-lg font-bold", TYPE_COLOR[type] === "default" && "border-[var(--glass-border-strong)] text-foreground")}
            onPress={() => open(type)}
          >
            {t.workReportType[type]}
          </Button>
        ))}
      </div>

      {done ? (
        <Chip variant="flat" radius="sm" className="h-auto whitespace-normal py-1">
          ✓ {done}
        </Chip>
      ) : null}

      <Card shadow="none" className="glass-tile glass-blur border border-warning/60">
        <CardBody className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-sm text-foreground-400">スタンバイ待機時間（直近7日・全船員）</p>
            <p className="tabular-nums text-2xl font-bold">
              {fmtMinutes(standbyWeek)}
              <span className="ml-2 text-base font-normal text-foreground-400">{standbyWeekCount}件</span>
            </p>
          </div>
          <p className="max-w-sm text-xs text-foreground-400">
            作業報告（待機記録）ベースの集計です。労働時間への算入は 01 の打刻（スタンバイ）が正であり、
            労務管理記録簿の集計とは別系統です。待機の見える化は荷主・オペレーターとの取引環境改善協議の
            エビデンスになります（要件定義書 3.3.3）。
          </p>
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-2">
        {(["all", ...WORK_REPORT_TYPES] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            radius="full"
            variant={filter === f ? "solid" : "bordered"}
            color={filter === f ? "primary" : "default"}
            className={cn("min-h-10", filter !== f && "border-[var(--glass-border-strong)] text-foreground")}
            onPress={() => setFilter(f)}
          >
            {f === "all" ? "すべて" : t.workReportType[f]}
          </Button>
        ))}
      </div>

      <section aria-label="作業記録の履歴" className="flex flex-col gap-2">
        {visible.length === 0 ? (
          <Card shadow="none" className="glass-tile">
            <CardBody>
              <p className="text-foreground-400">記録がありません。</p>
            </CardBody>
          </Card>
        ) : null}
        {visible.map((r) => {
          const mins = durationMinutes(r);
          return (
            <Card key={r.id} shadow="none" className="glass-tile">
              <CardBody className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums font-bold">
                    {fmtDateTime(r.startedAt)}
                    {r.endedAt ? `–${fmtTime(r.endedAt)}` : ""}
                  </span>
                  <Chip size="sm" variant="flat" color={TYPE_COLOR[r.reportType]} radius="sm">
                    {t.workReportType[r.reportType]}
                  </Chip>
                  {mins !== null ? <span className="text-sm text-foreground-400">{fmtMinutes(mins)}</span> : null}
                  <span className="ml-auto text-sm text-foreground-400">{personName(r.crewMemberId)}</span>
                </div>
                <p className="text-pretty">{summaryOf(r)}</p>
                {r.remarks ? <p className="text-sm text-foreground-400">{r.remarks}</p> : null}
              </CardBody>
            </Card>
          );
        })}
      </section>

      <Modal {...glassModal} isOpen={modal.isOpen} onOpenChange={modal.onOpenChange} placement="center" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{t.workReportType[form.reportType]} の記録</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <Input type="datetime-local" label={form.reportType === "handover" ? "引継日時" : "開始"} value={form.startedAt} max={toLocalInputValue(new Date())} onValueChange={(v) => set("startedAt", v)} />
            {form.reportType !== "handover" ? (
              <Input type="datetime-local" label="終了（進行中は空欄）" value={form.endedAt} max={toLocalInputValue(new Date())} onValueChange={(v) => set("endedAt", v)} />
            ) : null}

            {form.reportType === "cargo" ? (
              <>
                <Input label="港名・バース" value={form.port} onValueChange={(v) => set("port", v)} placeholder="例: 名古屋港（金城埠頭）" />
                <RadioGroup orientation="horizontal" label="作業" value={form.operation} onValueChange={(v) => set("operation", v as "load" | "unload")}>
                  <Radio value="load">{t.cargoOperation.load}</Radio>
                  <Radio value="unload">{t.cargoOperation.unload}</Radio>
                </RadioGroup>
                <div className="grid grid-cols-2 gap-2">
                  <Input label="貨種" value={form.cargoKind} onValueChange={(v) => set("cargoKind", v)} placeholder="例: 鋼材コイル" />
                  <Input label="数量" value={form.quantity} onValueChange={(v) => set("quantity", v)} placeholder="例: 1,200 t" />
                </div>
              </>
            ) : null}

            {form.reportType === "standby" ? (
              <Select label="待機理由" selectedKeys={[form.standbyReason]} onSelectionChange={(k) => set("standbyReason", String([...k][0] ?? ""))}>
                {STANDBY_REASONS.map((r) => (
                  <SelectItem key={r}>{r}</SelectItem>
                ))}
              </Select>
            ) : null}

            {form.reportType === "fuel" ? (
              <>
                <RadioGroup orientation="horizontal" label="区分" value={form.fuelOperation} onValueChange={(v) => set("fuelOperation", v as "bunkering" | "consumption")}>
                  <Radio value="bunkering">{t.fuelOperation.bunkering}</Radio>
                  <Radio value="consumption">{t.fuelOperation.consumption}</Radio>
                </RadioGroup>
                <Input label="油種" value={form.fuelType} onValueChange={(v) => set("fuelType", v)} />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" label="数量 (L)" value={form.fuelQuantityL} onValueChange={(v) => set("fuelQuantityL", v)} />
                  <Input type="number" label="残油量 ROB (L)" value={form.remainingOnBoardL} onValueChange={(v) => set("remainingOnBoardL", v)} />
                </div>
              </>
            ) : null}

            {form.reportType === "handover" ? (
              <>
                <Select
                  label="引継先"
                  selectedKeys={[form.handoverTo]}
                  onSelectionChange={(k) => {
                    const v = [...k][0];
                    if (v) set("handoverTo", String(v));
                  }}
                >
                  {CREW_MEMBERS.filter((c) => c.id !== crew.id).map((c) => (
                    <SelectItem key={c.id}>{`${c.name}（${c.position}）`}</SelectItem>
                  ))}
                </Select>
                <Textarea label="引継事項（航行状況・作業進捗・注意点）" value={form.handoverItems} onValueChange={(v) => set("handoverItems", v)} minRows={3} />
              </>
            ) : null}

            <Textarea label="備考" value={form.remarks} onValueChange={(v) => set("remarks", v)} minRows={2} />
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
