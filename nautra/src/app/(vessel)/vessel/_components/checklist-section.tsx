"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { personName } from "@/lib/crew";
import { fmtDateTime } from "@/lib/format";
import {
  buildTemplateRevision,
  collectTemplateValues,
  CUSTOM_LOG_PREFIX,
  draftTemplate,
  isCustomLogKey,
  isItemRequired,
  type DraftTemplateItem,
} from "@/lib/record-templates";
import { useLocale } from "@/lib/use-locale";
import { appendRecord, newRecordBase } from "@/lib/vessel-actions";
import { usePermission, useRecordTemplates, useSessionCrew } from "@/lib/vessel-hooks";
import type { ChecklistItemResult, ChecklistResultPayload, RecordTemplatePayload } from "@/sync-protocol/records";
import { useModalProps } from "@/ui";
import { Accordion, AccordionItem, Button, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Textarea, useDisclosure } from "@/ui/heroui";
import type { TriState } from "@/ui/tri-state-toggle";
import { CHECKLIST_FALLBACK_GROUP, ChecklistDesigner } from "./checklist-designer";
import { ChecklistItemsForm, emptyChecklistAnswers, type ChecklistAnswers } from "./checklist-items-form";
import { RecordMark, RecordTile } from "./record-tile";

/**
 * 点検表（出港前点検・安全パトロール）の記録。
 *
 * 点検は 05「船内保守・作業記録」に置く。機器の日常点検・保守と内容が重なるため、
 * 同じ画面で続けて記録できるようにする（レビュー: 03 は日誌だけにする）。
 *
 * 項目は配信テンプレート（record_template）から組み立て、数値は利用者が入力する。
 * 記録者はサインイン中の本人に固定する（共用端末で取り違えない）。
 *
 * 点検表を作る・項目を直すのは記録の画面とは別の手順つきの画面（`ChecklistDesigner`）。
 * 航海日誌の項目づくりと同じ形にそろえる（利用者の依頼 2026-10-19「初心者が分かりやすいフロー形式で」）。
 */
export function ChecklistSection({ onDone }: { onDone?: (message: string) => void }) {
  const session = useSessionCrew();
  const { tr } = useLocale(); // 良否の表示言語（10.2）
  const canManageTemplates = usePermission("manage_record_templates");
  const delivered = useRecordTemplates("checklist");
  const modalProps = useModalProps();

  /** 作ったばかり・直したばかりで、まだ一覧に届いていない点検表（作ってすぐ点検できるように） */
  const [local, setLocal] = useState<Record<string, RecordTemplatePayload>>({});
  const templates = useMemo(() => {
    const byKey = new Map<string, RecordTemplatePayload>();
    for (const tpl of delivered) byKey.set(tpl.templateKey, tpl);
    for (const tpl of Object.values(local)) {
      const cur = byKey.get(tpl.templateKey);
      if (cur && cur.publishedAt >= tpl.publishedAt) continue;
      if (tpl.retired) byKey.delete(tpl.templateKey);
      else byKey.set(tpl.templateKey, tpl);
    }
    // 組み込みの点検表を先に、作った点検表は作った順（キーの ULID）に並べる
    return [...byKey.values()].sort(
      (a, b) => Number(isCustomLogKey(a.templateKey)) - Number(isCustomLogKey(b.templateKey)) || a.templateKey.localeCompare(b.templateKey),
    );
  }, [delivered, local]);
  const templateFor = (key: string) => templates.find((tpl) => tpl.templateKey === key);

  const checklistModal = useDisclosure();
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [input, setInput] = useState<ChecklistAnswers>(emptyChecklistAnswers);
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);

  const template = (templateKey ? templateFor(templateKey) : undefined) ?? templates[0] ?? null;
  const allItems = template?.items ?? [];
  const checkItems = allItems.filter((it) => it.inputType === "check");
  const otherItems = allItems.filter((it) => it.inputType !== "check");
  // 未入力 = 未判定の良否項目 + 空欄の必須項目（任意の項目は空欄でよい）
  const unanswered =
    checkItems.filter((it) => !input.answers[it.key]).length +
    otherItems.filter((it) => isItemRequired(it) && !input.values[it.key]?.trim()).length;

  function openChecklist(key: string) {
    setTemplateKey(key);
    setInput(emptyChecklistAnswers());
    setRemarks("");
    setError(null);
    checklistModal.onOpen();
  }

  async function submitChecklist() {
    setError(null);
    try {
      if (!session) throw new Error("サインインが必要です");
      if (!template) throw new Error("点検表が配信されていません");
      const notJudged = checkItems.filter((it) => !input.answers[it.key]);
      if (notJudged.length > 0) {
        throw new Error(`未入力の項目が ${unanswered} 件あります（「${notJudged[0].label}」の良・不良を選んでください）`);
      }
      // 良否以外の値の検査（必須の空欄・数字・選択肢・時刻）は航海日誌と同じ関数で行う
      const others = new Map(collectTemplateValues(otherItems, input.values).map((r) => [r.key, r]));
      const items: ChecklistItemResult[] = allItems.flatMap((it): ChecklistItemResult[] => {
        if (it.inputType === "check") {
          const note = input.notes[it.key]?.trim() || undefined;
          return [{ key: it.key, label: it.label, group: it.group, result: input.answers[it.key] as TriState, note }];
        }
        const r = others.get(it.key);
        return r ? [r] : [];
      });
      const overall = items.some((i) => i.result === "ng") ? "fail" : "pass";
      const b = await newRecordBase(session.id);
      await appendRecord("checklist_result", {
        ...b,
        templateId: template.templateKey,
        templateName: template.name,
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

  // ── 点検表を作る・項目を直す（船長。陸上からも配信される） ──
  const designerModal = useDisclosure();
  const [designer, setDesigner] = useState<{ mode: "create"; n: number } | { mode: "edit"; key: string; n: number }>({ mode: "create", n: 0 });
  const takenNames = templates.map((tpl) => tpl.name);

  function openCreate() {
    setDesigner((d) => ({ mode: "create", n: d.n + 1 }));
    designerModal.onOpen();
  }

  /** 点検の画面から項目を直しに行く（点検の画面は閉じ、保存したら戻ってくる） */
  function openEditFromRecord() {
    if (!template) return;
    checklistModal.onClose();
    setDesigner((d) => ({ mode: "edit", key: template.templateKey, n: d.n + 1 }));
    designerModal.onOpen();
  }

  /** 点検表を作る、または項目の変更を1つの新しい版として全員の端末へ送る（足す・直す・外す・並べ替え・見出し・名前） */
  async function saveDesign(items: DraftTemplateItem[], name?: string) {
    if (!session) throw new Error("サインインが必要です");
    const b = await newRecordBase(session.id);
    const common = { items, id: b.id, recordedBy: session.id, deviceId: b.deviceId, publishedBy: session.id, group: CHECKLIST_FALLBACK_GROUP };
    if (designer.mode === "create") {
      const listName = name?.trim() ?? "";
      const next = buildTemplateRevision({
        ...common,
        template: draftTemplate({ usage: "checklist", templateKey: `${CUSTOM_LOG_PREFIX}${b.id}`, name: listName, tenantId: b.tenantId, vesselId: b.vesselId }),
      });
      await appendRecord("record_template", next);
      setLocal((c) => ({ ...c, [next.templateKey]: next }));
      designerModal.onClose();
      onDone?.(`「${next.name}」を作りました。札を押すと点検を記録できます`);
      return;
    }
    const current = templateFor(designer.key);
    if (!current) throw new Error("この点検表は見つかりません。画面を開き直してください");
    const next = buildTemplateRevision({ ...common, template: current, name: isCustomLogKey(current.templateKey) ? name : undefined });
    await appendRecord("record_template", next);
    setLocal((c) => ({ ...c, [next.templateKey]: next }));
    designerModal.onClose();
    onDone?.(`「${next.name}」の点検する項目を保存しました（全員の端末に届きます）`);
    openChecklist(next.templateKey);
  }

  /** 船長・陸上が作った点検表を使わなくする（新しい点検では選べなくなる。過去の記録は残る） */
  async function retireChecklist() {
    if (!session || designer.mode !== "edit") return;
    const tpl = templateFor(designer.key);
    if (!tpl) return;
    const b = await newRecordBase(session.id);
    const next = buildTemplateRevision({
      template: tpl,
      items: tpl.items,
      retired: true,
      id: b.id,
      recordedBy: session.id,
      deviceId: b.deviceId,
      publishedBy: session.id,
      group: CHECKLIST_FALLBACK_GROUP,
    });
    await appendRecord("record_template", next);
    setLocal((c) => ({ ...c, [next.templateKey]: next }));
    designerModal.onClose();
    onDone?.(`「${tpl.name}」を使わなくしました（これまでの点検の記録は残ります）`);
  }

  const editing = designer.mode === "edit" ? templateFor(designer.key) : undefined;

  return (
    <section aria-label="船の点検表" className="flex flex-col gap-2">
      <h2 className="text-base font-bold text-foreground-600">船の点検表</h2>
      <div className="grid grid-cols-2 gap-2">
        {templates.map((tpl) => (
          <RecordTile
            key={tpl.templateKey}
            label={tpl.name}
            sublabel={`点検する項目 ${tpl.items.length}つ`}
            onPress={() => openChecklist(tpl.templateKey)}
          />
        ))}
        {canManageTemplates ? (
          // 点検表を作る札は点線にして、点検を始める札と見分ける（航海日誌の「日誌の種類を増やす」と同じ）
          <button
            type="button"
            onClick={openCreate}
            className="ui-card record-tile record-tile-new flex min-h-20 items-center gap-3 p-4 text-left"
          >
            <span className="flex flex-1 flex-col gap-1">
              <span className="text-lg font-bold leading-tight">点検表を増やす</span>
              <span className="text-sm text-foreground-600">例: 入港前点検・荷役前点検</span>
            </span>
            <RecordMark />
          </button>
        ) : null}
      </div>

      {/* 点検表の入力（書くことだけ。項目を決めるのは別の手順つきの画面） */}
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
            {template?.description ? <span className="text-sm font-normal text-foreground-600">{template.description}</span> : null}
          </ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-foreground-600">
                未入力 {unanswered} / {allItems.length} 件
              </span>
              {checkItems.length > 0 ? (
                <Button
                  size="sm"
                  variant="bordered"
                  className="min-h-10 border-[var(--ui-hairline-strong)]"
                  onPress={() =>
                    setInput((s) => ({
                      ...s,
                      answers: { ...Object.fromEntries(checkItems.map((it) => [it.key, "ok" as TriState])), ...pickJudged(s.answers) },
                    }))
                  }
                >
                  未判定をすべて「良」にする
                </Button>
              ) : null}
            </div>
            <ChecklistItemsForm items={allItems} value={input} onChange={setInput} />
            {canManageTemplates ? (
              <button type="button" className="ui-btn-quiet min-h-11 self-start !text-base" onClick={openEditFromRecord}>
                点検する項目を増やす・直す
              </button>
            ) : null}
            <Textarea label="所見・備考" value={remarks} onValueChange={setRemarks} minRows={2} />
            {error ? <p role="alert" className="m-0 text-danger">✕ {error}</p> : null}
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

      {/* 点検表を作る・項目を直す（手順つき） */}
      <Modal
        {...modalProps}
        size="2xl"
        isOpen={designerModal.isOpen}
        onOpenChange={designerModal.onOpenChange}
        // 項目が増えても画面が上下に動かないよう上に固定する（続けて押すボタンの位置がずれない）
        placement="top"
        scrollBehavior="inside"
      >
        {designer.mode === "create" ? (
          <ChecklistDesigner key={designer.n} mode="create" items={[]} takenNames={takenNames} onSave={saveDesign} onClose={designerModal.onClose} />
        ) : (
          <ChecklistDesigner
            key={designer.n}
            mode="edit"
            checklistName={editing && isCustomLogKey(editing.templateKey) ? editing.name : undefined}
            fixedName={editing?.name}
            items={editing?.items ?? []}
            takenNames={takenNames.filter((n) => n !== editing?.name)}
            onSave={saveDesign}
            onRetire={editing && isCustomLogKey(editing.templateKey) ? retireChecklist : undefined}
            onClose={designerModal.onClose}
          />
        )}
      </Modal>
    </section>
  );
}

/** すでに選んだ良否だけを残す（「未判定をすべて良にする」で不良を上書きしない） */
function pickJudged(answers: Record<string, TriState | null>): Record<string, TriState> {
  return Object.fromEntries(Object.entries(answers).filter((e): e is [string, TriState] => e[1] != null));
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
