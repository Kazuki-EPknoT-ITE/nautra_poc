"use client";

import { useMemo, useState } from "react";
import { t } from "@/i18n/ja";
import { cn } from "@/lib/cn";
import { CREW_MEMBERS, personName } from "@/lib/crew";
import { fmtDateTime, fromLocalInputValue, parseOptionalNumber, toLocalInputValue } from "@/lib/format";
import { buildTemplateWithAddedItem } from "@/lib/record-templates";
import { appendRecord, newRecordBase } from "@/lib/vessel-actions";
import { usePermission, useRecords, useRecordTemplates, useSessionCrew } from "@/lib/vessel-hooks";
import { judgeAlcohol } from "@/domain/safety/alcohol";
import { DEFAULT_SAFETY_RULE_SET } from "@/rules/safety-rules";
import {
  DRILL_TYPES,
  type AlcoholCheckPayload,
  type ChecklistItemResult,
  type ChecklistResultPayload,
  type DrillRecordPayload,
  type DrillType,
  type RecordTemplatePayload,
  type TemplateInputType,
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
  useGlassModalProps,
} from "@/ui";
import type { TriState } from "@/ui/tri-state-toggle";
import { GroupHeader } from "../_components/group-header";
import { RecordTile } from "../_components/record-tile";

type HistoryItem =
  | { kind: "checklist"; at: string; r: ChecklistResultPayload }
  | { kind: "drill"; at: string; r: DrillRecordPayload }
  | { kind: "alcohol"; at: string; r: AlcoholCheckPayload };

/**
 * V-06 チェックリスト・点検。出港前点検・安全パトロール・操練記録・アルコール検知
 * （要件定義書 3.3.2）。いずれも追記専用の一次記録として保存し同期する。
 *
 * 点検項目は配信テンプレート（record_template）から組み立てる。上司（船長）・陸上が
 * 項目を追加でき、数値項目は利用者が入力する。記録者はサインイン中の本人に固定する。
 */
export default function ChecklistPage() {
  const session = useSessionCrew();
  const canManageTemplates = usePermission("manage_record_templates");
  const templates = useRecordTemplates("checklist");
  const checklists = useRecords("checklist_result");
  const drills = useRecords("drill_record");
  const alcohols = useRecords("alcohol_check");
  const [done, setDone] = useState<string | null>(null);
  const glassModal = useGlassModalProps();

  const templateName = useMemo(() => {
    const m = new Map(templates.map((tpl) => [tpl.templateKey, tpl.name]));
    return (key: string) => m.get(key) ?? t.checklistTemplate[key] ?? key;
  }, [templates]);

  // ── チェックリスト ──
  const checklistModal = useDisclosure();
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, TriState | null>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [clRemarks, setClRemarks] = useState("");
  const [clError, setClError] = useState<string | null>(null);
  const template = templates.find((tpl) => tpl.templateKey === templateKey) ?? templates[0] ?? null;
  const groups = useMemo(() => {
    const m = new Map<string, RecordTemplatePayload["items"]>();
    for (const it of template?.items ?? []) m.set(it.group, [...(m.get(it.group) ?? []), it]);
    return [...m.entries()];
  }, [template]);
  const checkItems = (template?.items ?? []).filter((it) => it.inputType === "check");
  // 未入力 = 未判定の良否項目 + 空欄の数値項目（自由記述は任意）
  const unanswered =
    checkItems.filter((it) => !answers[it.key]).length +
    (template?.items ?? []).filter((it) => it.inputType === "number" && !values[it.key]?.trim()).length;

  function openChecklist(key: string) {
    setTemplateKey(key);
    setAnswers({});
    setValues({});
    setNotes({});
    setClRemarks("");
    setClError(null);
    checklistModal.onOpen();
  }

  async function submitChecklist() {
    setClError(null);
    try {
      if (!session) throw new Error("サインインが必要です");
      if (!template) throw new Error("点検表が配信されていません");
      if (unanswered > 0) throw new Error(`未入力の項目が ${unanswered} 件あります`);
      const items: ChecklistItemResult[] = template.items.map((it) => {
        const note = notes[it.key]?.trim() || undefined;
        if (it.inputType === "check") {
          return { key: it.key, label: it.label, group: it.group, result: answers[it.key] as TriState, note };
        }
        const raw = values[it.key]?.trim() ?? "";
        const value = it.inputType === "number" ? parseOptionalNumber(raw) : raw || undefined;
        if (it.inputType === "number" && value === undefined) {
          throw new Error(`「${it.label}」に数値を入力してください`);
        }
        // 良否で答えない項目は result="na"（値そのものが記録の中身）
        return { key: it.key, label: it.label, group: it.group, result: "na", value, unit: it.unit, note };
      });
      const overall = items.some((i) => i.result === "ng") ? "fail" : "pass";
      const b = await newRecordBase(session.id);
      await appendRecord("checklist_result", {
        ...b,
        templateId: template.templateKey,
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

  // ── 項目の追加（上司・陸上が配信するテンプレートの新版） ──
  const itemModal = useDisclosure();
  const [itemTarget, setItemTarget] = useState<string | null>(null);
  const [itemLabel, setItemLabel] = useState("");
  const [itemGroup, setItemGroup] = useState("追加項目");
  const [itemType, setItemType] = useState<TemplateInputType>("check");
  const [itemUnit, setItemUnit] = useState("");
  const [itemError, setItemError] = useState<string | null>(null);
  const itemTemplate = templates.find((tpl) => tpl.templateKey === itemTarget) ?? templates[0] ?? null;

  function openAddItem() {
    setItemTarget(template?.templateKey ?? templates[0]?.templateKey ?? null);
    setItemLabel("");
    setItemGroup("追加項目");
    setItemType("check");
    setItemUnit("");
    setItemError(null);
    itemModal.onOpen();
  }

  async function submitAddItem() {
    setItemError(null);
    try {
      if (!session) throw new Error("サインインが必要です");
      if (!itemTemplate) throw new Error("点検表が配信されていません");
      const b = await newRecordBase(session.id);
      const next = buildTemplateWithAddedItem({
        template: itemTemplate,
        item: { label: itemLabel, group: itemGroup, inputType: itemType, unit: itemUnit },
        id: b.id,
        recordedBy: session.id,
        deviceId: b.deviceId,
        publishedBy: session.id,
      });
      await appendRecord("record_template", next);
      setDone(`${next.name} に「${itemLabel.trim()}」を追加しました（版 ${next.version}）`);
      itemModal.onClose();
    } catch (e) {
      setItemError(e instanceof Error ? e.message : String(e));
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
      if (!session) throw new Error("サインインが必要です");
      const at = fromLocalInputValue(drillAt);
      if (!at) throw new Error("実施日時を入力してください");
      const minutes = parseOptionalNumber(duration);
      if (minutes === undefined || minutes <= 0) throw new Error("所要時間（分）を入力してください");
      if (participants.length === 0) throw new Error("参加者を選択してください");
      const b = await newRecordBase(session.id, at);
      await appendRecord("drill_record", {
        ...b,
        drillType,
        leader: session.id,
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
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [alcoholValue, setAlcoholValue] = useState("0.00");
  const [alcoholMethod, setAlcoholMethod] = useState<"detector" | "visual">("detector");
  const [alcoholError, setAlcoholError] = useState<string | null>(null);
  const limit = DEFAULT_SAFETY_RULE_SET.values.alcoholLimitMgPerL;
  const previewValue = parseOptionalNumber(alcoholValue);
  const previewResult = previewValue === undefined ? null : judgeAlcohol(previewValue, limit);
  const subject = subjectId ?? session?.id ?? CREW_MEMBERS[0].id;

  function openAlcohol() {
    setSubjectId(session?.id ?? null);
    setAlcoholValue("0.00");
    setAlcoholError(null);
    alcoholModal.onOpen();
  }

  async function submitAlcohol() {
    setAlcoholError(null);
    try {
      if (!session) throw new Error("サインインが必要です");
      const v = parseOptionalNumber(alcoholValue);
      if (v === undefined || v < 0) throw new Error("測定値（mg/L）を入力してください");
      const result = judgeAlcohol(v, limit);
      const b = await newRecordBase(session.id);
      await appendRecord("alcohol_check", {
        ...b,
        crewMemberId: subject,
        valueMgPerL: v,
        method: alcoholMethod,
        result,
        checkedBy: session.id,
        limitMgPerL: limit,
        appliedRuleSetId: DEFAULT_SAFETY_RULE_SET.id,
        appliedRuleVersion: DEFAULT_SAFETY_RULE_SET.version,
      });
      setDone(`${personName(subject)} のアルコール検知を記録しました（${t.alcoholResult[result]}）`);
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
      <p className="text-sm text-foreground-600">
        記録者: {session ? `${session.name}（${session.position}）` : "—"}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {templates.map((tpl) => (
          <RecordTile
            key={tpl.templateKey}
            label={tpl.name}
            sublabel={`${tpl.items.length}項目 / 版 ${tpl.version}`}
            onPress={() => openChecklist(tpl.templateKey)}
          />
        ))}
        <RecordTile label="操練（訓練）記録" onPress={openDrill} />
        <RecordTile label="アルコール検知" onPress={openAlcohol} />
      </div>

      {canManageTemplates ? (
        <Button
          variant="bordered"
          radius="lg"
          className="min-h-12 self-start border-[var(--glass-border-strong)]"
          onPress={openAddItem}
        >
          点検項目を追加する
        </Button>
      ) : null}

      {done ? (
        <Chip variant="flat" radius="sm" className="h-auto whitespace-normal py-1">
          ✓ {done}
        </Chip>
      ) : null}

      <section aria-label="点検・操練・検知の履歴" className="flex flex-col gap-2">
        <h2 className="text-base font-bold text-foreground-600">履歴（新しい順）</h2>
        {history.length === 0 ? (
          <Card shadow="none" className="glass-tile">
            <CardBody>
              <p className="text-foreground-600">記録がありません。</p>
            </CardBody>
          </Card>
        ) : null}
        {history.map((h) => (
          <Card key={h.r.id} shadow="none" className="glass-tile">
            <CardBody className="flex flex-col gap-2">
              {h.kind === "checklist" ? (
                <ChecklistRow r={h.r} name={templateName(h.r.templateId)} />
              ) : h.kind === "drill" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums font-bold">{fmtDateTime(h.r.occurredAt)}</span>
                  <Chip size="sm" variant="flat" radius="sm">
                    操練
                  </Chip>
                  <span className="font-semibold">{t.drillType[h.r.drillType]}</span>
                  <span className="text-sm text-foreground-600">
                    指揮 {personName(h.r.leader)} / 参加 {h.r.participants.length}名 / {h.r.durationMinutes}分
                  </span>
                  {h.r.remarks ? <p className="w-full text-sm text-foreground-600">{h.r.remarks}</p> : null}
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
                  <span className="ml-auto text-sm text-foreground-600">
                    確認者 {personName(h.r.checkedBy)} / 基準 {h.r.limitMgPerL} mg/L
                  </span>
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </section>

      {/* チェックリスト入力 */}
      <Modal {...glassModal} isOpen={checklistModal.isOpen} onOpenChange={checklistModal.onOpenChange} placement="center" scrollBehavior="inside" size="2xl">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span>{template?.name ?? "点検表"}</span>
            <span className="text-sm font-normal text-foreground-600">
              {template?.description}（テンプレート版 {template?.version}）
            </span>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-600">
                未入力 {unanswered} / {template?.items.length ?? 0} 件
              </span>
              <Button
                size="sm"
                variant="bordered"
                className="min-h-10 border-[var(--glass-border-strong)]"
                onPress={() => setAnswers(Object.fromEntries(checkItems.map((it) => [it.key, "ok" as TriState])))}
              >
                未判定をすべて「良」にする
              </Button>
            </div>
            {groups.map(([group, items]) => (
              <div key={group} className="flex flex-col gap-2">
                <h3 className="font-bold">{group}</h3>
                {items.map((it) => (
                  <div key={it.key} className="glass-inset flex flex-col gap-1 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-base">{it.label}</span>
                      {it.inputType === "check" ? (
                        <TriStateToggle
                          ariaLabel={it.label}
                          value={answers[it.key] ?? null}
                          onChange={(v) => setAnswers((a) => ({ ...a, [it.key]: v }))}
                        />
                      ) : (
                        <Input
                          size="sm"
                          type={it.inputType === "number" ? "number" : "text"}
                          aria-label={it.label}
                          className="max-w-44"
                          endContent={it.unit ? <span className="text-sm text-foreground-600">{it.unit}</span> : null}
                          value={values[it.key] ?? ""}
                          onValueChange={(v) => setValues((s) => ({ ...s, [it.key]: v }))}
                        />
                      )}
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

      {/* 点検項目の追加（船長。陸上からも配信される） */}
      <Modal {...glassModal} isOpen={itemModal.isOpen} onOpenChange={itemModal.onOpenChange} placement="center" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span>点検項目の追加</span>
            <span className="text-sm font-normal text-foreground-600">
              追加した項目は次の点検から全員に表示されます（過去の記録は当時の版のまま保持）
            </span>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <Select
              label="追加先の点検表"
              selectedKeys={itemTemplate ? [itemTemplate.templateKey] : []}
              onSelectionChange={(k) => {
                const v = [...k][0];
                if (v) setItemTarget(String(v));
              }}
            >
              {templates.map((tpl) => (
                <SelectItem key={tpl.templateKey}>{`${tpl.name}（版 ${tpl.version}）`}</SelectItem>
              ))}
            </Select>
            <Input label="項目名" value={itemLabel} onValueChange={setItemLabel} placeholder="例: 燃料タンク残量" />
            <Input label="区分（見出し）" value={itemGroup} onValueChange={setItemGroup} placeholder="例: 機関" />
            <RadioGroup
              orientation="horizontal"
              label="入力方法"
              value={itemType}
              onValueChange={(v) => setItemType(v as TemplateInputType)}
            >
              <Radio value="check">良否で答える</Radio>
              <Radio value="number">数値を入力</Radio>
              <Radio value="text">文章を入力</Radio>
            </RadioGroup>
            {itemType === "number" ? (
              <Input label="単位" value={itemUnit} onValueChange={setItemUnit} placeholder="例: L / °C / rpm" />
            ) : null}
            {itemError ? <p className="text-danger">✕ {itemError}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={itemModal.onClose}>
              キャンセル
            </Button>
            <Button color="primary" onPress={() => void submitAddItem()}>
              項目を追加して配信
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 操練 */}
      <Modal {...glassModal} isOpen={drillModal.isOpen} onOpenChange={drillModal.onOpenChange} placement="center" scrollBehavior="inside">
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
            <p className="text-sm text-foreground-600">指揮者: {session?.name ?? "—"}</p>
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
      <Modal {...glassModal} isOpen={alcoholModal.isOpen} onOpenChange={alcoholModal.onOpenChange} placement="center">
        <ModalContent>
          <ModalHeader>アルコール検知記録</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <Select
              label="被検者"
              selectedKeys={[subject]}
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
            <div className={cn("rounded-medium p-3", previewResult === "fail" ? "bg-danger/15 text-danger" : "glass-inset")}>
              判定: {previewResult ? t.alcoholResult[previewResult] : "—"}
              <span className="ml-2 text-sm text-foreground-600">
                （基準値 {limit} mg/L 以上で乗務不可。安全ルール版 {DEFAULT_SAFETY_RULE_SET.version}）
              </span>
            </div>
            <p className="text-sm text-foreground-600">確認者: {session?.name ?? "—"}</p>
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

function ChecklistRow({ r, name }: { r: ChecklistResultPayload; name: string }) {
  const ngItems = r.items.filter((i) => i.result === "ng");
  return (
    <Accordion isCompact className="px-0">
      <AccordionItem
        key={r.id}
        aria-label={`${name} の詳細`}
        title={
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums font-bold">{fmtDateTime(r.occurredAt)}</span>
            <Chip size="sm" variant="flat" color="primary" radius="sm">
              {name}
            </Chip>
            <Chip size="sm" variant="flat" color={r.overall === "pass" ? "success" : "danger"} radius="sm">
              {r.overall === "pass" ? "✓" : "✕"} {t.overall[r.overall]}
            </Chip>
            <span className="text-sm text-foreground-600">
              実施 {personName(r.recordedBy)} / 不良 {ngItems.length}件 / 全 {r.items.length}項目
            </span>
          </div>
        }
      >
        <div className="flex flex-col gap-1 pb-2">
          <p className="text-xs text-foreground-600">記録時のテンプレート版 {r.templateVersion}</p>
          {r.items.map((it) => (
            <div key={it.key} className="flex flex-wrap items-baseline gap-2 text-sm">
              {it.value !== undefined && it.value !== "" ? (
                <span className="w-24 shrink-0 font-bold tabular-nums">
                  {it.value}
                  {it.unit ? ` ${it.unit}` : ""}
                </span>
              ) : (
                <span
                  className={cn(
                    "w-12 shrink-0 font-bold",
                    it.result === "ok" ? "text-success" : it.result === "ng" ? "text-danger" : "text-foreground-600",
                  )}
                >
                  {it.result === "ok" ? "✓" : it.result === "ng" ? "✕" : "–"} {t.checkResult[it.result]}
                </span>
              )}
              <span className="text-foreground-600">[{it.group}]</span>
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
