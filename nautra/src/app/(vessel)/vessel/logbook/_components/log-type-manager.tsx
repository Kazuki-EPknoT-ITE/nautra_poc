"use client";

import { useState } from "react";
import type { TemplateItem } from "@/sync-protocol/records";
import { LineIcon, StepBar, type Step } from "@/ui";
import { Button, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@/ui/heroui";
import { INPUT_TYPES } from "../../_components/template-items-editor";

/** 一覧に並べる日誌の種類（組み込みの4種と、船長・陸上が作った種類） */
export interface ManagedLogType {
  kind: string;
  name: string;
  /** 出港・入港など最初からある種類（種類そのものは消せない。足した項目だけ消せる） */
  builtIn: boolean;
  items: TemplateItem[];
}

/** 何を削除するか */
type Target = { what: "type" } | { what: "item"; key: string; label: string } | { what: "allItems" };

const STEPS: Step[] = [
  { no: 1, title: "種類を選ぶ" },
  { no: 2, title: "することを選ぶ" },
  { no: 3, title: "確かめて削除する" },
];

const answerLabel = (it: TemplateItem) => INPUT_TYPES.find((x) => x.id === it.inputType)?.label ?? "";

/**
 * 日誌の種類と、追加した項目を編集・削除する画面（手順つき）。
 *
 * 利用者の依頼 2026-10-19「追加した項目を編集したり削除できるように。フロー的に、初心者でも分かりやすく」。
 * 以前は札を開いて記録の画面 →「記録する項目を増やす・直す」→ ①の奥にしか「使わなくする」が無く、
 * 作った種類を消す方法に気付けなかった。① 種類を選ぶ → ② することを選ぶ（編集する／削除する）
 * → ③ 何が消えて何が残るかを確かめて削除する、の1手順1つのことにする。
 * 削除は追記（`retired` の版・項目を載せない版）で表し、これまでの記録は消えない。直後なら「元に戻す」で戻せる。
 */
export function LogTypeManager({
  types,
  onEdit,
  onDeleteType,
  onDeleteItems,
  onClose,
  deleteKind,
}: {
  types: ManagedLogType[];
  onEdit: (kind: string) => void;
  onDeleteType: (kind: string) => Promise<void>;
  onDeleteItems: (kind: string, keys: string[]) => Promise<void>;
  onClose: () => void;
  /**
   * 札の「削除」から開いたとき、その種類の③（確かめて削除する）から始める（利用者の依頼 2026-10-19
   * 「日誌の項目に編集や削除ボタンを」）。作った種類は種類ごと、組み込みの種類は追加した項目をすべて削除する
   */
  deleteKind?: string;
}) {
  const startType = types.find((x) => x.kind === deleteKind);
  const [step, setStep] = useState(startType ? 3 : 1);
  const [kind, setKind] = useState<string | null>(startType?.kind ?? null);
  const [target, setTarget] = useState<Target | null>(
    startType ? (startType.builtIn ? { what: "allItems" } : { what: "type" }) : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picked = types.find((x) => x.kind === kind);

  function pick(k: string) {
    setKind(k);
    setError(null);
    setStep(2);
  }

  function askDelete(t: Target) {
    setTarget(t);
    setError(null);
    setStep(3);
  }

  async function run() {
    if (!picked || !target) return;
    setBusy(true);
    setError(null);
    try {
      if (target.what === "type") await onDeleteType(picked.kind);
      else if (target.what === "item") await onDeleteItems(picked.kind, [target.key]);
      else await onDeleteItems(picked.kind, picked.items.map((it) => it.key));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const deleteTitle =
    !picked || !target
      ? ""
      : target.what === "type"
        ? `「${picked.name}」の種類を削除します`
        : target.what === "item"
          ? `「${picked.name}」の「${target.label}」を削除します`
          : `「${picked.name}」に追加した項目をすべて削除します`;
  // 何が消えて何が残るかを、削除の前に並べる（取り返しのつかない操作は問いかけを挟む）
  const effects: string[] =
    !picked || !target
      ? []
      : target.what === "type"
        ? [
            `日誌の画面から「${picked.name}」の札がなくなります（全員の端末で）`,
            `これまでに書いた「${picked.name}」の記録は消えません。過去の日誌で見られます`,
          ]
        : target.what === "item"
          ? [
              `これから「${picked.name}」を記録するとき、「${target.label}」の欄が出なくなります`,
              `これまでの記録に入っている「${target.label}」の値は消えません`,
            ]
          : [
              `これから「${picked.name}」を記録するとき、${picked.items.map((it) => `「${it.label}」`).join("")}の欄が出なくなります`,
              "これまでの記録に入っている値は消えません",
              `「${picked.name}」の札はそのまま使えます`,
            ];

  return (
    <ModalContent>
      <ModalHeader>種類と項目を編集・削除する</ModalHeader>
      <StepBar steps={STEPS} current={step} />
      <ModalBody className="flex flex-col gap-4 py-4">
        {step === 1 ? (
          <section aria-label="種類を選ぶ" className="flex flex-col gap-2">
            <p className="m-0 text-base font-bold">どの種類を直しますか</p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {types.map((x) => (
                <li key={x.kind}>
                  <button
                    type="button"
                    onClick={() => pick(x.kind)}
                    className="ui-card record-tile flex min-h-16 w-full items-center gap-3 p-3 text-left"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-lg font-bold leading-tight">{x.name}</span>
                      <span className="truncate text-sm text-foreground-600">
                        {x.items.length > 0
                          ? `${x.builtIn ? "追加した項目" : "記録する項目"} ${x.items.length}つ: ${x.items.map((it) => it.label).join("・")}`
                          : x.builtIn
                            ? "追加した項目はありません"
                            : "記録する項目はありません"}
                      </span>
                    </span>
                    <LineIcon name="next" size={20} className="shrink-0 text-primary" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {step === 2 && picked ? (
          <section aria-label="することを選ぶ" className="flex flex-col gap-4">
            <p className="m-0 text-xl font-bold">「{picked.name}」をどうしますか</p>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onEdit(picked.kind)}
                className="ui-btn-ghost min-h-14 !justify-start gap-3 px-4 text-left text-lg"
              >
                <LineIcon name="edit" size={22} />
                {picked.builtIn ? "記録する項目を編集する" : "名前と記録する項目を編集する"}
              </button>
              {!picked.builtIn ? (
                <button type="button" onClick={() => askDelete({ what: "type" })} className="ui-btn-ghost min-h-14 !justify-start gap-3 px-4 text-left text-lg">
                  <LineIcon name="trash" size={22} />
                  この種類を削除する
                </button>
              ) : picked.items.length > 0 ? (
                <button type="button" onClick={() => askDelete({ what: "allItems" })} className="ui-btn-ghost min-h-14 !justify-start gap-3 px-4 text-left text-lg">
                  <LineIcon name="trash" size={22} />
                  追加した項目をすべて削除する
                </button>
              ) : null}
            </div>

            {picked.items.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="m-0 text-base font-bold">{picked.builtIn ? "追加した項目" : "記録する項目"}（1つずつ削除できます）</p>
                <ul aria-label={`「${picked.name}」の項目`} className="ui-inset m-0 flex list-none flex-col p-0">
                  {picked.items.map((it) => (
                    <li key={it.key} className="flex min-h-12 items-center gap-3 border-b border-[var(--ui-hairline)] px-3 py-2 last:border-b-0">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-base font-bold">{it.label}</span>
                        <span className="text-sm text-foreground-600">
                          {answerLabel(it)}
                          {it.unit ? `（${it.unit}）` : ""}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={`「${it.label}」を削除する`}
                        onClick={() => askDelete({ what: "item", key: it.key, label: it.label })}
                        className="ui-btn-quiet min-h-11 gap-1.5 !px-3 !text-base"
                      >
                        <LineIcon name="trash" size={16} />
                        削除
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : picked.builtIn ? (
              <p className="m-0 text-foreground-600">追加した項目はありません。最初からある種類は削除できません</p>
            ) : null}
          </section>
        ) : null}

        {step === 3 && picked && target ? (
          <section aria-label="確かめて削除する" className="flex flex-col gap-3">
            <p className="m-0 text-xl font-bold">{deleteTitle}</p>
            <ul aria-label="削除するとどうなるか" className="ui-inset m-0 flex list-none flex-col gap-1.5 px-3.5 py-3">
              {effects.map((e) => (
                <li key={e} className="text-base leading-relaxed">
                  ・{e}
                </li>
              ))}
            </ul>
            <p className="m-0 text-sm text-foreground-600">削除したすぐあとなら「元に戻す」で戻せます</p>
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
          <Button
            variant="bordered"
            className="mr-auto"
            onPress={() => {
              setError(null);
              setStep((s) => s - 1);
            }}
          >
            戻る
          </Button>
        ) : null}
        {step === 3 ? (
          <Button color="danger" isDisabled={busy} onPress={() => void run()}>
            削除する
          </Button>
        ) : (
          <Button variant="bordered" onPress={onClose}>
            閉じる
          </Button>
        )}
      </ModalFooter>
    </ModalContent>
  );
}
