"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { buildTemplateRevision, draftTemplate, type DraftTemplateItem } from "@/lib/record-templates";
import type { TemplateInputType, TemplateItem } from "@/sync-protocol/records";
import { LineIcon, StepBar, type Step } from "@/ui";
import { Button, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@/ui/heroui";
import { ChecklistItemsForm, emptyChecklistAnswers, type ChecklistAnswers } from "./checklist-items-form";
import { blankRow, FieldHint, FieldLabel, INPUT_TYPES, ItemRowsEditor, rowsToDrafts, rowsToPreviewItems, toRow, type Row } from "./template-items-editor";

/** 見出しが空の項目に付ける見出し */
export const CHECKLIST_FALLBACK_GROUP = "その他";

/** 点検は「良・不良で答える」がいちばん多いので左に置く */
const CHECK_FIRST: { id: TemplateInputType; label: string }[] = [
  ...INPUT_TYPES.filter((x) => x.id === "check"),
  ...INPUT_TYPES.filter((x) => x.id !== "check"),
];

/** よく使う見出し（押すと行の見出しに入る） */
const GROUP_SUGGESTIONS = ["船体", "機関", "甲板", "航海設備", "安全設備"];

/**
 * よく使う点検項目。押すだけで行が1つ増え、名前・見出し・答え方が入った状態から直せる（白紙から考えさせない）。
 * 航海日誌の項目づくり（log-type-designer）と同じ作り。利用者の依頼 2026-10-19
 */
const PRESETS: { label: string; row: Partial<Row> }[] = [
  { label: "船体外観", row: { label: "船体外観", group: "船体", inputType: "check" } },
  { label: "主機の運転状態", row: { label: "主機の運転状態", group: "機関", inputType: "check" } },
  { label: "潤滑油量", row: { label: "潤滑油量", group: "機関", inputType: "check" } },
  { label: "冷却水温度", row: { label: "冷却水温度", group: "機関", inputType: "number", unit: "°C", required: true } },
  { label: "燃料残量", row: { label: "燃料残量", group: "機関", inputType: "number", unit: "kL", required: true } },
  { label: "航海灯", row: { label: "航海灯", group: "航海設備", inputType: "check" } },
  { label: "救命胴衣", row: { label: "救命胴衣", group: "安全設備", inputType: "check" } },
  { label: "消火器", row: { label: "消火器", group: "安全設備", inputType: "check" } },
  { label: "気付いたこと", row: { label: "気付いたこと", group: CHECKLIST_FALLBACK_GROUP, inputType: "text" } },
];

/** 点検表の名前の候補（押すと名前の欄に入る） */
const NAME_SUGGESTIONS = ["入港前点検", "荷役前点検", "荒天準備点検", "月例点検", "消火設備点検"];

/**
 * 点検表を作る・点検する項目を直す画面（手順つき）。
 *
 * 以前は「点検項目を追加する」の小さな問いかけで1項目ずつ足すだけで、直す・外す・並べ替えができず、
 * 足した項目が点検のときにどう出るかも分からなかった。航海日誌の項目づくりと同じく
 * 1手順1つのこと（GOV.UK "One thing per page"）にし、最後に点検するときの見え方を試してから保存する。
 */
export function ChecklistDesigner({
  mode,
  checklistName,
  fixedName,
  items,
  takenNames,
  onSave,
  onRetire,
  onClose,
}: {
  /** create = 点検表を新しく作る / edit = いまある点検表の項目を直す */
  mode: "create" | "edit";
  /** 船長・陸上が作った点検表の名前（edit で名前を直せる）。組み込みの点検表は undefined で、名前の手順を出さない */
  checklistName?: string;
  /** 組み込みの点検表を直すときの、画面に出す名前 */
  fixedName?: string;
  items: TemplateItem[];
  /** 名前の重なりを確かめるための、ほかの点検表の名前 */
  takenNames: string[];
  onSave: (items: DraftTemplateItem[], name?: string) => Promise<void>;
  onRetire?: () => Promise<void>;
  onClose: () => void;
}) {
  const withName = mode === "create" || checklistName !== undefined;
  const steps: Step[] = withName
    ? [
        { no: 1, title: "名前を決める" },
        { no: 2, title: "点検する項目を決める" },
        { no: 3, title: "見え方を確かめる" },
      ]
    : [
        { no: 1, title: "点検する項目を決める" },
        { no: 2, title: "見え方を確かめる" },
      ];
  const nameStep = withName ? 1 : 0;
  const itemsStep = withName ? 2 : 1;
  const previewStep = withName ? 3 : 2;

  const [step, setStep] = useState(1);
  const [name, setName] = useState(checklistName ?? "");
  const [rows, setRows] = useState<Row[]>(() => items.map(toRow));
  const [focusUid, setFocusUid] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [trial, setTrial] = useState<ChecklistAnswers>(emptyChecklistAnswers);

  function addRow(patch: Partial<Row> = {}) {
    // 自分で作る行は、直前の行と同じ見出しから始める（続けて同じ場所の項目を足すことが多い）
    const r = blankRow({ inputType: "check", group: rows.at(-1)?.group ?? "", ...patch });
    setRows((rs) => [...rs, r]);
    setFocusUid(r.uid);
  }

  /** 次の手順へ進む前に、その手順の中身を確かめる（保存のときと同じ検査を先に走らせる） */
  function validate(at: number): string | null {
    if (at === nameStep) {
      const n = name.trim();
      if (!n) return "点検表の名前を入れてください";
      if (n !== (checklistName ?? "") && takenNames.includes(n)) return `「${n}」という点検表はもうあります。別の名前にしてください`;
    }
    if (at === itemsStep) {
      if (rows.length === 0) return "点検する項目を1つ以上決めてください。上の「よく使う点検項目」から選べます";
      try {
        buildTemplateRevision({
          template: draftTemplate({ usage: "checklist", templateKey: "check", name: "check", tenantId: "-", vesselId: "-" }),
          items: rowsToDrafts(rows, true),
          id: "01CHECK0000000000000000000",
          recordedBy: "-",
          deviceId: "-",
          publishedBy: "-",
          group: CHECKLIST_FALLBACK_GROUP,
        });
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    }
    return null;
  }

  function next() {
    const msg = validate(step);
    setError(msg);
    if (!msg) setStep((s) => s + 1);
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await onSave(rowsToDrafts(rows, true), withName ? name : undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const shownName = withName ? name.trim() : (fixedName ?? "");
  const title = mode === "create" ? "点検表を増やす" : `「${checklistName ?? fixedName ?? ""}」の点検する項目を直す`;
  const previewItems = rowsToPreviewItems(rows, CHECKLIST_FALLBACK_GROUP);

  return (
    <ModalContent>
      <ModalHeader className="flex flex-col gap-1">{title}</ModalHeader>
      <StepBar steps={steps} current={step} />
      <ModalBody className="flex flex-col gap-4 py-4">
        {step === nameStep ? (
          <section aria-label="名前を決める" className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <FieldLabel>点検表の名前</FieldLabel>
              <input className="ui-field" value={name} autoFocus onChange={(e) => setName(e.target.value)} aria-describedby="checklist-name-hint" />
              <FieldHint id="checklist-name-hint">点検・保守の画面の札に、この名前で出ます</FieldHint>
            </label>
            <div className="flex flex-col gap-1">
              <FieldLabel>よく使う名前</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {NAME_SUGGESTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setName(n)}
                    className={cn("ui-btn-quiet min-h-11 !px-3 !text-base", name === n && "ui-btn-selected")}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {mode === "edit" && onRetire ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ui-hairline)] pt-3">
                {confirmRetire ? (
                  <>
                    <span>「{checklistName}」を使わなくしますか（これまでの点検の記録は残ります）</span>
                    <button type="button" className="ui-btn-danger min-h-11 px-3" disabled={busy} onClick={() => void onRetire()}>
                      使わなくする
                    </button>
                    <button type="button" className="ui-btn-quiet min-h-11 !text-base" onClick={() => setConfirmRetire(false)}>
                      やめる
                    </button>
                  </>
                ) : (
                  <button type="button" className="ui-btn-quiet min-h-11 !text-base" onClick={() => setConfirmRetire(true)}>
                    この点検表を使わなくする
                  </button>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {step === itemsStep ? (
          <section aria-label="点検する項目を決める" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <FieldLabel>よく使う点検項目（押すと増えます）</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button key={p.label} type="button" onClick={() => addRow(p.row)} className="ui-btn-ghost min-h-11 px-3 text-base">
                    <LineIcon name="plus" size={16} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {rows.length === 0 ? <p className="m-0 text-foreground-600">まだ項目がありません</p> : null}
            <ItemRowsEditor
              rows={rows}
              onChange={setRows}
              focusUid={focusUid}
              groups={GROUP_SUGGESTIONS}
              inputTypes={CHECK_FIRST}
              example="例: 係船索の摩耗、ビルジの量、救命いかだの固縛"
            />
            <button type="button" onClick={() => addRow()} className="ui-btn-ghost min-h-12 self-start px-4 text-lg">
              <LineIcon name="plus" size={20} />
              自分で項目を作る
            </button>
          </section>
        ) : null}

        {step === previewStep ? (
          <section aria-label="見え方を確かめる" className="flex flex-col gap-3">
            <p className="m-0 text-base">点検するときは、この画面になります。試しに入れてみられます（保存はされません）。</p>
            <div className="flex flex-col gap-3 rounded-[4px] border border-[var(--ui-hairline-strong)] p-3">
              <span className="text-lg font-bold">{shownName}</span>
              <ChecklistItemsForm items={previewItems} value={trial} onChange={setTrial} />
              <span className="ui-inset px-3 py-2 text-foreground-600">所見・備考</span>
            </div>
          </section>
        ) : null}

        {error ? (
          <p role="alert" className="m-0 text-danger">
            ✕ {error}
          </p>
        ) : null}
      </ModalBody>
      <ModalFooter className="flex-wrap">
        {step > 1 ? (
          <Button variant="bordered" className="mr-auto" onPress={() => { setError(null); setStep((s) => s - 1); }}>
            戻る
          </Button>
        ) : (
          <Button variant="bordered" className="mr-auto" onPress={onClose}>
            やめる
          </Button>
        )}
        {step < previewStep ? (
          <Button color="primary" onPress={next}>
            次へ: {steps[step].title}
          </Button>
        ) : (
          <Button color="primary" isDisabled={busy} onPress={() => void save()}>
            {mode === "create" ? "この内容で作る" : "この内容で保存する"}
          </Button>
        )}
      </ModalFooter>
    </ModalContent>
  );
}
