"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { personName } from "@/lib/crew";
import { fmtDateTime, parseOptionalNumber } from "@/lib/format";
import { buildTemplateWithAddedItem } from "@/lib/record-templates";
import { useLocale } from "@/lib/use-locale";
import { appendRecord, newRecordBase } from "@/lib/vessel-actions";
import { usePermission, useRecordTemplates, useSessionCrew } from "@/lib/vessel-hooks";
import type {
  ChecklistItemResult,
  ChecklistResultPayload,
  RecordTemplatePayload,
  TemplateInputType,
} from "@/sync-protocol/records";
import {
  Accordion,
  AccordionItem,
  Button,
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
  useModalProps,
} from "@/ui";
import type { TriState } from "@/ui/tri-state-toggle";
import { RecordTile } from "./record-tile";

/**
 * 点検表（出港前点検・安全パトロール）の記録。
 *
 * 点検は 05「船内保守・作業記録」に置く。機器の日常点検・保守と内容が重なるため、
 * 同じ画面で続けて記録できるようにする（レビュー: 03 は日誌だけにする）。
 *
 * 項目は配信テンプレート（record_template）から組み立て、数値は利用者が入力する。
 * 記録者はサインイン中の本人に固定する（共用端末で取り違えない）。
 */
export function ChecklistSection({ onDone }: { onDone?: (message: string) => void }) {
  const session = useSessionCrew();
  const { tr } = useLocale(); // 良否の表示言語（10.2）
  const canManageTemplates = usePermission("manage_record_templates");
  const templates = useRecordTemplates("checklist");
  const modalProps = useModalProps();

  const checklistModal = useDisclosure();
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, TriState | null>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    setRemarks("");
    setError(null);
    checklistModal.onOpen();
  }

  async function submitChecklist() {
    setError(null);
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
        remarks: remarks.trim() || undefined,
      });
      onDone?.(`${template.name} を記録しました（${tr("overall", overall)}）`);
      checklistModal.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // ── 項目の追加（船長。陸上からも配信される） ──
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
      onDone?.(`${next.name} に「${itemLabel.trim()}」を追加しました（版 ${next.version}）`);
      itemModal.onClose();
    } catch (e) {
      setItemError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section aria-label="船の点検表" className="flex flex-col gap-2">
      <h2 className="text-base font-bold text-foreground-600">船の点検表</h2>
      <div className="grid grid-cols-2 gap-2">
        {templates.map((tpl) => (
          <RecordTile
            key={tpl.templateKey}
            label={tpl.name}
            sublabel={`${tpl.items.length}項目 / 版 ${tpl.version}`}
            onPress={() => openChecklist(tpl.templateKey)}
          />
        ))}
      </div>
      {canManageTemplates ? (
        <Button
          variant="bordered"
          radius="lg"
          className="min-h-12 self-start border-[var(--ui-hairline-strong)]"
          onPress={openAddItem}
        >
          点検項目を追加する
        </Button>
      ) : null}

      {/* 点検表の入力 */}
      <Modal
        {...modalProps}
        isOpen={checklistModal.isOpen}
        onOpenChange={checklistModal.onOpenChange}
        placement="center"
        scrollBehavior="inside"
        size="2xl"
      >
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
                className="min-h-10 border-[var(--ui-hairline-strong)]"
                onPress={() => setAnswers(Object.fromEntries(checkItems.map((it) => [it.key, "ok" as TriState])))}
              >
                未判定をすべて「良」にする
              </Button>
            </div>
            {groups.map(([group, items]) => (
              <div key={group} className="flex flex-col gap-2">
                <h3 className="font-bold">{group}</h3>
                {items.map((it) => (
                  <div key={it.key} className="ui-inset flex flex-col gap-1 p-3">
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
            <Textarea label="所見・備考" value={remarks} onValueChange={setRemarks} minRows={2} />
            {error ? <p className="text-danger">✕ {error}</p> : null}
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
      <Modal
        {...modalProps}
        isOpen={itemModal.isOpen}
        onOpenChange={itemModal.onOpenChange}
        placement="center"
        scrollBehavior="inside"
      >
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
    </section>
  );
}

/** 点検表の結果1件（履歴の行）。機器の保守記録と同じ一覧に並べる */
export function ChecklistResultRow({ r, name }: { r: ChecklistResultPayload; name: string }) {
  const { tr } = useLocale();
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
              {r.overall === "pass" ? "✓" : "✕"} {tr("overall", r.overall)}
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
                  {it.result === "ok" ? "✓" : it.result === "ng" ? "✕" : "–"} {tr("checkResult", it.result)}
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
