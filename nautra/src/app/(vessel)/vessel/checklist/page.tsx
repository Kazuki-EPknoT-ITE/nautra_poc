"use client";

import { useMemo, useState } from "react";
import { t } from "@/i18n/ja";
import { CHECKLIST_TEMPLATES } from "@/lib/checklist-templates";
import { cn } from "@/lib/cn";
import { CREW_MEMBERS, personName } from "@/lib/crew";
import { fmtDateTime, fromLocalInputValue, parseOptionalNumber, toLocalInputValue } from "@/lib/format";
import { appendRecord, newRecordBase } from "@/lib/vessel-actions";
import { useRecords, useSelectedCrew } from "@/lib/vessel-hooks";
import { DEFAULT_SAFETY_RULE_SET, judgeAlcohol } from "@/rules/safety-rules";
import {
  CHECKLIST_TEMPLATE_IDS,
  DRILL_TYPES,
  type AlcoholCheckPayload,
  type ChecklistItemResult,
  type ChecklistResultPayload,
  type ChecklistTemplateId,
  type DrillRecordPayload,
  type DrillType,
} from "@/sync-protocol/records";
import {
  Accordion,
  AccordionItem,
  Button,
  Card,
  CardBody,
  Checkbox,
  CheckboxGroup,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Radio,
  RadioGroup,
  Select,
  SelectItem,
  Textarea,
  TriStateToggle,
  useDisclosure,
} from "@/ui";
import type { TriState } from "@/ui/tri-state-toggle";
import { CrewPicker } from "../_components/crew-picker";
import { GroupHeader } from "../_components/group-header";

type HistoryItem =
  | { kind: "checklist"; at: string; r: ChecklistResultPayload }
  | { kind: "drill"; at: string; r: DrillRecordPayload }
  | { kind: "alcohol"; at: string; r: AlcoholCheckPayload };

/**
 * V-06 チェックリスト・点検。出港前点検・安全パトロール・操練記録・アルコール検知
 * （要件定義書 3.3.2）。いずれも追記専用の一次記録として保存し同期する。
 */
export default function ChecklistPage() {
  const [crew, selectCrew] = useSelectedCrew();
  const checklists = useRecords("checklist_result");
  const drills = useRecords("drill_record");
  const alcohols = useRecords("alcohol_check");
  const [done, setDone] = useState<string | null>(null);

  // ── チェックリスト ──
  const checklistModal = useDisclosure();
  const [templateId, setTemplateId] = useState<ChecklistTemplateId>("pre_departure");
  const [answers, setAnswers] = useState<Record<string, TriState | null>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [clRemarks, setClRemarks] = useState("");
  const [clError, setClError] = useState<string | null>(null);
  const template = CHECKLIST_TEMPLATES[templateId];
  const groups = useMemo(() => {
    const m = new Map<string, typeof template.items>();
    for (const it of template.items) m.set(it.group, [...(m.get(it.group) ?? []), it]);
    return [...m.entries()];
  }, [template]);
  const unanswered = template.items.filter((it) => !answers[it.key]).length;

  function openChecklist(id: ChecklistTemplateId) {
    setTemplateId(id);
    setAnswers({});
    setNotes({});
    setClRemarks("");
    setClError(null);
    checklistModal.onOpen();
  }

  async function submitChecklist() {
    setClError(null);
    try {
      if (unanswered > 0) throw new Error(`未判定の項目が ${unanswered} 件あります`);
      const items: ChecklistItemResult[] = template.items.map((it) => ({
        key: it.key,
        label: it.label,
        group: it.group,
        result: answers[it.key] as TriState,
        note: notes[it.key]?.trim() || undefined,
      }));
      const overall = items.some((i) => i.result === "ng") ? "fail" : "pass";
      const b = await newRecordBase(crew.id);
      await appendRecord("checklist_result", {
        ...b,
        templateId,
        templateVersion: template.version,
        items,
        overall,
        remarks: clRemarks.trim() || undefined,
      });
      setDone(`${template.name} を記録しました（${t.overall[overall]}）`);
      checklistModal.onClose();
    } catch (e) {
      setClError(e instanceof Error ? e.message : String(e));
    }
  }

  // ── 操練 ──
  const drillModal = useDisclosure();
  const [drillType, setDrillType] = useState<DrillType>("fire");
  const [drillAt, setDrillAt] = useState(toLocalInputValue(new Date()));
  const [participants, setParticipants] = useState<string[]>(CREW_MEMBERS.map((c) => c.id));
  const [duration, setDuration] = useState("30");
  const [drillRemarks, setDrillRemarks] = useState("");
  const [drillError, setDrillError] = useState<string | null>(null);

  function openDrill() {
    setDrillAt(toLocalInputValue(new Date()));
    setDrillError(null);
    drillModal.onOpen();
  }

  async function submitDrill() {
    setDrillError(null);
    try {
      const at = fromLocalInputValue(drillAt);
      if (!at) throw new Error("実施日時を入力してください");
      const minutes = parseOptionalNumber(duration);
      if (minutes === undefined || minutes <= 0) throw new Error("所要時間（分）を入力してください");
      if (participants.length === 0) throw new Error("参加者を選択してください");
      const b = await newRecordBase(crew.id, at);
      await appendRecord("drill_record", {
        ...b,
        drillType,
        leader: crew.id,
        participants,
        durationMinutes: minutes,
        remarks: drillRemarks.trim() || undefined,
      });
      setDone(`${t.drillType[drillType]} を記録しました（参加 ${participants.length}名）`);
      drillModal.onClose();
    } catch (e) {
      setDrillError(e instanceof Error ? e.message : String(e));
    }
  }

  // ── アルコール検知 ──
  const alcoholModal = useDisclosure();
  const [subjectId, setSubjectId] = useState(CREW_MEMBERS[1].id);
  const [alcoholValue, setAlcoholValue] = useState("0.00");
  const [alcoholMethod, setAlcoholMethod] = useState<"detector" | "visual">("detector");
  const [alcoholError, setAlcoholError] = useState<string | null>(null);
  const limit = DEFAULT_SAFETY_RULE_SET.values.alcoholLimitMgPerL;
  const previewValue = parseOptionalNumber(alcoholValue);
  const previewResult = previewValue === undefined ? null : judgeAlcohol(previewValue, limit);

  function openAlcohol() {
    setAlcoholValue("0.00");
    setAlcoholError(null);
    alcoholModal.onOpen();
  }

  async function submitAlcohol() {
    setAlcoholError(null);
    try {
      const v = parseOptionalNumber(alcoholValue);
      if (v === undefined || v < 0) throw new Error("測定値（mg/L）を入力してください");
      const result = judgeAlcohol(v, limit);
      const b = await newRecordBase(crew.id);
      await appendRecord("alcohol_check", {
        ...b,
        crewMemberId: subjectId,
        valueMgPerL: v,
        method: alcoholMethod,
        result,
        checkedBy: crew.id,
        limitMgPerL: limit,
      });
      setDone(`${personName(subjectId)} のアルコール検知を記録しました（${t.alcoholResult[result]}）`);
      alcoholModal.onClose();
    } catch (e) {
      setAlcoholError(e instanceof Error ? e.message : String(e));
    }
  }

  // ── 履歴 ──
  const history = useMemo<HistoryItem[]>(() => {
    const items: HistoryItem[] = [
      ...checklists.map((r) => ({ kind: "checklist" as const, at: r.occurredAt, r })),
      ...drills.map((r) => ({ kind: "drill" as const, at: r.occurredAt, r })),
      ...alcohols.map((r) => ({ kind: "alcohol" as const, at: r.occurredAt, r })),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
  }, [checklists, drills, alcohols]);

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="03" subtitle="点検・操練・検知" />
      <CrewPicker selected={crew} onSelect={selectCrew} />
      <p className="text-sm text-foreground-500">実施者: {crew.name}（{crew.position}）</p>

      <div className="grid grid-cols-2 gap-2">
        {CHECKLIST_TEMPLATE_IDS.map((id) => (
          <Button
            key={id}
            color="primary"
            radius="lg"
            className="min-h-16 h-auto py-2 text-lg font-bold"
            onPress={() => openChecklist(id)}
          >
            {CHECKLIST_TEMPLATES[id].name}
          </Button>
        ))}
        <Button
          variant="bordered"
          radius="lg"
          className="min-h-16 h-auto border-foreground-300 py-2 text-lg font-bold text-foreground"
          onPress={openDrill}
        >
          操練（訓練）記録
        </Button>
        <Button
          variant="bordered"
          radius="lg"
          className="min-h-16 h-auto border-foreground-300 py-2 text-lg font-bold text-foreground"
          onPress={openAlcohol}
        >
          アルコール検知
        </Button>
      </div>

      {done ? (
        <Chip color="success" variant="flat" radius="sm" className="h-auto whitespace-normal py-1">
          ✓ {done}
        </Chip>
      ) : null}

      <section aria-label="点検・操練・検知の履歴" className="flex flex-col gap-2">
        <h2 className="text-base font-bold text-foreground-500">履歴（新しい順）</h2>
        {history.length === 0 ? (
          <Card shadow="none" className="bg-content1">
            <CardBody>
              <p className="text-foreground-500">記録がありません。</p>
            </CardBody>
          </Card>
        ) : null}
        {history.map((h) => (
          <Card key={h.r.id} shadow="none" className="bg-content1">
            <CardBody className="flex flex-col gap-2">
              {h.kind === "checklist" ? (
                <ChecklistRow r={h.r} />
              ) : h.kind === "drill" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums font-bold">{fmtDateTime(h.r.occurredAt)}</span>
                  <Chip size="sm" variant="flat" color="secondary" radius="sm">
                    操練
                  </Chip>
                  <span className="font-semibold">{t.drillType[h.r.drillType]}</span>
                  <span className="text-sm text-foreground-500">
                    指揮 {personName(h.r.leader)} / 参加 {h.r.participants.length}名 / {h.r.durationMinutes}分
                  </span>
                  {h.r.remarks ? <p className="w-full text-sm text-foreground-500">{h.r.remarks}</p> : null}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums font-bold">{fmtDateTime(h.r.occurredAt)}</span>
                  <Chip size="sm" variant="flat" radius="sm">
                    アルコール検知
                  </Chip>
                  <span className="font-semibold">{personName(h.r.crewMemberId)}</span>
                  <span className="tabular-nums">{h.r.valueMgPerL.toFixed(2)} mg/L</span>
                  <Chip size="sm" variant="flat" color={h.r.result === "pass" ? "success" : "danger"} radius="sm">
                    {h.r.result === "pass" ? "✓" : "✕"} {t.alcoholResult[h.r.result]}
                  </Chip>
                  <span className="ml-auto text-sm text-foreground-500">
                    確認者 {personName(h.r.checkedBy)} / 基準 {h.r.limitMgPerL} mg/L
                  </span>
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </section>

      {/* チェックリスト入力 */}
      <Modal isOpen={checklistModal.isOpen} onOpenChange={checklistModal.onOpenChange} placement="center" scrollBehavior="inside" size="2xl">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span>{template.name}</span>
            <span className="text-sm font-normal text-foreground-500">{template.description}（テンプレート版 {template.version}）</span>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-500">未判定 {unanswered} / {template.items.length} 件</span>
              <Button
                size="sm"
                variant="bordered"
                className="min-h-10 border-foreground-300"
                onPress={() =>
                  setAnswers(Object.fromEntries(template.items.map((it) => [it.key, "ok" as TriState])))
                }
              >
                未判定をすべて「良」にする
              </Button>
            </div>
            {groups.map(([group, items]) => (
              <div key={group} className="flex flex-col gap-2">
                <h3 className="font-bold">{group}</h3>
                {items.map((it) => (
                  <div key={it.key} className="flex flex-col gap-1 rounded-medium bg-content2 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-base">{it.label}</span>
                      <TriStateToggle
                        ariaLabel={it.label}
                        value={answers[it.key] ?? null}
                        onChange={(v) => setAnswers((a) => ({ ...a, [it.key]: v }))}
                      />
                    </div>
                    {answers[it.key] === "ng" ? (
                      <Input
                        size="sm"
                        label="不良の内容・処置"
                        value={notes[it.key] ?? ""}
                        onValueChange={(v) => setNotes((n) => ({ ...n, [it.key]: v }))}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
            <Textarea label="所見・備考" value={clRemarks} onValueChange={setClRemarks} minRows={2} />
            {clError ? <p className="text-danger">✕ {clError}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={checklistModal.onClose}>
              キャンセル
            </Button>
            <Button color="primary" onPress={() => void submitChecklist()}>
              点検結果を記録
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 操練 */}
      <Modal isOpen={drillModal.isOpen} onOpenChange={drillModal.onOpenChange} placement="center" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>操練（訓練）実施記録</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <RadioGroup label="操練種別" value={drillType} onValueChange={(v) => setDrillType(v as DrillType)}>
              {DRILL_TYPES.map((d) => (
                <Radio key={d} value={d}>
                  {t.drillType[d]}
                </Radio>
              ))}
            </RadioGroup>
            <Input type="datetime-local" label="実施日時" value={drillAt} max={toLocalInputValue(new Date())} onValueChange={setDrillAt} />
            <Input type="number" label="所要時間（分）" value={duration} onValueChange={setDuration} />
            <CheckboxGroup label="参加者" value={participants} onValueChange={setParticipants}>
              {CREW_MEMBERS.map((c) => (
                <Checkbox key={c.id} value={c.id}>
                  {c.name}（{c.position}）
                </Checkbox>
              ))}
            </CheckboxGroup>
            <p className="text-sm text-foreground-500">指揮者: {crew.name}</p>
            <Textarea label="実施内容・所見" value={drillRemarks} onValueChange={setDrillRemarks} minRows={2} />
            {drillError ? <p className="text-danger">✕ {drillError}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={drillModal.onClose}>
              キャンセル
            </Button>
            <Button color="primary" onPress={() => void submitDrill()}>
              操練を記録
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* アルコール検知 */}
      <Modal isOpen={alcoholModal.isOpen} onOpenChange={alcoholModal.onOpenChange} placement="center">
        <ModalContent>
          <ModalHeader>アルコール検知記録</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <Select
              label="被検者"
              selectedKeys={[subjectId]}
              onSelectionChange={(k) => {
                const v = [...k][0];
                if (v) setSubjectId(String(v));
              }}
            >
              {CREW_MEMBERS.map((c) => (
                <SelectItem key={c.id}>{`${c.name}（${c.position}）`}</SelectItem>
              ))}
            </Select>
            <Input
              type="number"
              step="0.01"
              min="0"
              label="呼気中アルコール濃度（mg/L）"
              value={alcoholValue}
              onValueChange={setAlcoholValue}
            />
            <RadioGroup
              orientation="horizontal"
              label="測定方法"
              value={alcoholMethod}
              onValueChange={(v) => setAlcoholMethod(v as "detector" | "visual")}
            >
              <Radio value="detector">{t.alcoholMethod.detector}</Radio>
              <Radio value="visual">{t.alcoholMethod.visual}</Radio>
            </RadioGroup>
            <div className={cn("rounded-medium p-3", previewResult === "fail" ? "bg-danger-50 text-danger" : "bg-content2")}>
              判定: {previewResult ? t.alcoholResult[previewResult] : "—"}
              <span className="ml-2 text-sm text-foreground-500">
                （基準値 {limit} mg/L 以上で乗務不可。安全ルール版 {DEFAULT_SAFETY_RULE_SET.version}）
              </span>
            </div>
            <p className="text-sm text-foreground-500">確認者: {crew.name}</p>
            {alcoholError ? <p className="text-danger">✕ {alcoholError}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={alcoholModal.onClose}>
              キャンセル
            </Button>
            <Button color="primary" onPress={() => void submitAlcohol()}>
              検知結果を記録
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

function ChecklistRow({ r }: { r: ChecklistResultPayload }) {
  const ngItems = r.items.filter((i) => i.result === "ng");
  return (
    <Accordion isCompact className="px-0">
      <AccordionItem
        key={r.id}
        aria-label={`${CHECKLIST_TEMPLATES[r.templateId].name} の詳細`}
        title={
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums font-bold">{fmtDateTime(r.occurredAt)}</span>
            <Chip size="sm" variant="flat" color="primary" radius="sm">
              {t.checklistTemplate[r.templateId]}
            </Chip>
            <Chip size="sm" variant="flat" color={r.overall === "pass" ? "success" : "danger"} radius="sm">
              {r.overall === "pass" ? "✓" : "✕"} {t.overall[r.overall]}
            </Chip>
            <span className="text-sm text-foreground-500">
              実施 {personName(r.recordedBy)} / 不良 {ngItems.length}件 / 全 {r.items.length}項目
            </span>
          </div>
        }
      >
        <div className="flex flex-col gap-1 pb-2">
          {r.items.map((it) => (
            <div key={it.key} className="flex flex-wrap items-baseline gap-2 text-sm">
              <span
                className={cn(
                  "w-12 shrink-0 font-bold",
                  it.result === "ok" ? "text-success" : it.result === "ng" ? "text-danger" : "text-foreground-400",
                )}
              >
                {it.result === "ok" ? "✓" : it.result === "ng" ? "✕" : "–"} {t.checkResult[it.result]}
              </span>
              <span className="text-foreground-500">[{it.group}]</span>
              <span>{it.label}</span>
              {it.note ? <span className="text-danger">— {it.note}</span> : null}
            </div>
          ))}
          {r.remarks ? <p className="mt-1 text-sm">{r.remarks}</p> : null}
        </div>
      </AccordionItem>
    </Accordion>
  );
}
