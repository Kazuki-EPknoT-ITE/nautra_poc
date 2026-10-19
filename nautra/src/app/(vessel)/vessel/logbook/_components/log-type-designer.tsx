"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { buildTemplateRevision, draftTemplate, type DraftTemplateItem } from "@/lib/record-templates";
import type { TemplateItem } from "@/sync-protocol/records";
import { LineIcon, StepBar, type Step } from "@/ui";
import { Button, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@/ui/heroui";
import { TemplateItemField } from "../../_components/template-item-field";
import { blankRow, FieldHint, FieldLabel, ItemRowsEditor, rowsToDrafts, rowsToPreviewItems, toRow, type Row } from "./template-items-editor";

/**
 * よく使う項目。押すだけで行が1つ増え、名前と答え方が入った状態から直せる（白紙から考えさせない）。
 * 利用者の依頼 2026-10-16「初心者が分かりやすいように」
 */
const PRESETS: { label: string; row: Partial<Row> }[] = [
  { label: "時刻", row: { label: "時刻", inputType: "time" } },
  { label: "船位", row: { label: "船位", inputType: "text" } },
  { label: "燃料残量", row: { label: "燃料残量", inputType: "number", unit: "kL" } },
  { label: "天候", row: { label: "天候", inputType: "choice", optionsText: "晴、曇、雨、霧" } },
  { label: "異常の有無", row: { label: "異常の有無", inputType: "check" } },
  { label: "担当者", row: { label: "担当者", inputType: "text" } },
];

/** 種類の名前の候補（押すと名前の欄に入る） */
const NAME_SUGGESTIONS = ["投錨", "抜錨", "給油", "荒天準備", "入渠"];

/**
 * 航海日誌の種類を作る・記録する項目を直す画面（手順つき）。
 *
 * 以前は記録の入力画面の中で項目を直していたが、「項目を決める」と「記録を書く」が1枚に混ざり、
 * 初めての人には何をしている画面か分かりにくかった（利用者の指摘 2026-10-16）。
 * 1手順1つのこと（GOV.UK "One thing per page"）にし、最後に記録するときの見え方を試してから保存する。
 */
export function LogTypeDesigner({
  mode,
  typeName,
  fixedName,
  items,
  takenNames,
  onSave,
  onRetire,
  onClose,
}: {
  /** create = 種類を新しく作る / edit = いまある種類の項目を直す */
  mode: "create" | "edit";
  /** 船長・陸上が作った種類の名前（edit で名前を直せる）。組み込みの種類は undefined で、名前の手順を出さない */
  typeName?: string;
  /** 組み込みの種類を直すときの、画面に出す名前 */
  fixedName?: string;
  items: TemplateItem[];
  /** 名前の重なりを確かめるための、ほかの種類の名前 */
  takenNames: string[];
  onSave: (items: DraftTemplateItem[], name?: string) => Promise<void>;
  onRetire?: () => Promise<void>;
  onClose: () => void;
}) {
  const withName = mode === "create" || typeName !== undefined;
  const steps: Step[] = withName
    ? [
        { no: 1, title: "名前を決める" },
        { no: 2, title: "記録する項目を決める" },
        { no: 3, title: "見え方を確かめる" },
      ]
    : [
        { no: 1, title: "記録する項目を決める" },
        { no: 2, title: "見え方を確かめる" },
      ];
  const nameStep = withName ? 1 : 0;
  const itemsStep = withName ? 2 : 1;
  const previewStep = withName ? 3 : 2;

  const [step, setStep] = useState(1);
  const [name, setName] = useState(typeName ?? "");
  const [rows, setRows] = useState<Row[]>(() => items.map(toRow));
  const [focusUid, setFocusUid] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [trial, setTrial] = useState<Record<string, string>>({});

  function addRow(patch: Partial<Row> = {}) {
    const r = blankRow(patch);
    setRows((rs) => [...rs, r]);
    setFocusUid(r.uid);
  }

  /** 次の手順へ進む前に、その手順の中身を確かめる（保存のときと同じ検査を先に走らせる） */
  function validate(at: number): string | null {
    if (at === nameStep) {
      const n = name.trim();
      if (!n) return "種類の名前を入れてください";
      if (n !== (typeName ?? "") && takenNames.includes(n)) return `「${n}」という種類はもうあります。別の名前にしてください`;
    }
    if (at === itemsStep) {
      if (mode === "create" && rows.length === 0) return "記録する項目を1つ以上決めてください。下の「よく使う項目」から選べます";
      try {
        buildTemplateRevision({
          template: draftTemplate({ usage: "voyage_log", templateKey: "check", name: "check", tenantId: "-", vesselId: "-" }),
          items: rowsToDrafts(rows),
          id: "01CHECK0000000000000000000",
          recordedBy: "-",
          deviceId: "-",
          publishedBy: "-",
          group: "-",
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
      await onSave(rowsToDrafts(rows), withName ? name : undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const shownName = withName ? name.trim() : (fixedName ?? "");
  const title = mode === "create" ? "日誌の種類を増やす" : `「${typeName ?? fixedName ?? ""}」の記録する項目を直す`;
  const previewItems = rowsToPreviewItems(rows);

  return (
    <ModalContent>
      <ModalHeader className="flex flex-col gap-1">{title}</ModalHeader>
      <StepBar steps={steps} current={step} />
      <ModalBody className="flex flex-col gap-4 py-4">
        {step === nameStep ? (
          <section aria-label="名前を決める" className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <FieldLabel>種類の名前</FieldLabel>
              <input className="ui-field" value={name} autoFocus onChange={(e) => setName(e.target.value)} aria-describedby="type-name-hint" />
              <FieldHint id="type-name-hint">日誌の画面の札に、この名前で出ます</FieldHint>
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
                    <span>「{typeName}」の種類を削除しますか（これまでの記録は残ります）</span>
                    <button type="button" className="ui-btn-danger min-h-11 px-3" disabled={busy} onClick={() => void onRetire()}>
                      削除する
                    </button>
                    <button type="button" className="ui-btn-quiet min-h-11 !text-base" onClick={() => setConfirmRetire(false)}>
                      やめる
                    </button>
                  </>
                ) : (
                  <button type="button" className="ui-btn-quiet min-h-11 !text-base" onClick={() => setConfirmRetire(true)}>
                    この種類を削除する
                  </button>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {step === itemsStep ? (
          <section aria-label="記録する項目を決める" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <FieldLabel>よく使う項目（押すと増えます）</FieldLabel>
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
            <ItemRowsEditor rows={rows} onChange={setRows} focusUid={focusUid} />
            <button type="button" onClick={() => addRow()} className="ui-btn-ghost min-h-12 self-start px-4 text-lg">
              <LineIcon name="plus" size={20} />
              自分で項目を作る
            </button>
          </section>
        ) : null}

        {step === previewStep ? (
          <section aria-label="見え方を確かめる" className="flex flex-col gap-3">
            <p className="m-0 text-base">記録するときは、この画面になります。試しに入れてみられます（保存はされません）。</p>
            <div className="flex flex-col gap-2 rounded-[4px] border border-[var(--ui-hairline-strong)] p-3">
              <span className="text-lg font-bold">航海日誌: {shownName}</span>
              <span className="ui-inset px-3 py-2 text-foreground-600">日時（記録するときの日時が入ります）</span>
              {previewItems.length === 0 ? <p className="m-0 text-foreground-600">記録する項目はありません（日時と備考だけ）</p> : null}
              {previewItems.map((it) => (
                <TemplateItemField
                  key={it.key}
                  item={it}
                  value={trial[it.key] ?? ""}
                  onChange={(v) => setTrial((t) => ({ ...t, [it.key]: v }))}
                />
              ))}
              <span className="ui-inset px-3 py-2 text-foreground-600">備考</span>
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
