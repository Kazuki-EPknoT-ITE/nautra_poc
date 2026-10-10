"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CREW_FIELD_INPUT_LABEL, type CrewFieldView } from "@/lib/crew-fields";
import { cn } from "@/lib/cn";
import type { CrewFieldCategory, CrewFieldInputType } from "@/sync-protocol/masters";
import { addCrewFieldAction, removeCrewFieldAction, updateCrewFieldAction } from "../actions";

/**
 * 管理者が足した入力項目（レビュー CREWEDIT-04）を枠の中に並べ、「＋ 項目を追加」から足せるようにする。
 *
 * 値の欄は船員マスタのフォームの一部（name は `cf.<項目キー>`）で、保存ボタンでマスタと一緒に保存される。
 * 項目そのもの（名前・必須・入力例）の追加・変更・削除は、その場で保存する別の経路。
 */
export function CustomFields({
  category,
  fields,
  values,
  canManage,
}: {
  category: CrewFieldCategory;
  fields: CrewFieldView[];
  values: Record<string, string>;
  canManage: boolean;
}) {
  const mine = fields.filter((f) => f.category === category);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {mine.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {mine.map((f) =>
            editing === f.fieldKey ? (
              <FieldEditor
                key={f.fieldKey}
                category={category}
                field={f}
                onDone={() => setEditing(null)}
              />
            ) : (
              <ValueInput
                key={f.fieldKey}
                field={f}
                value={values[f.fieldKey] ?? ""}
                canManage={canManage}
                onEdit={() => setEditing(f.fieldKey)}
              />
            ),
          )}
        </div>
      ) : null}
      {canManage ? (
        adding ? (
          <FieldEditor category={category} onDone={() => setAdding(false)} />
        ) : (
          <button type="button" className="ui-btn-quiet self-start" onClick={() => setAdding(true)}>
            ＋ 項目を追加
          </button>
        )
      ) : null}
    </div>
  );
}

function ValueInput({
  field,
  value,
  canManage,
  onEdit,
}: {
  field: CrewFieldView;
  value: string;
  canManage: boolean;
  onEdit: () => void;
}) {
  const id = `cf-${field.fieldKey}`;
  const common = {
    id,
    name: `cf.${field.fieldKey}`,
    defaultValue: value,
    placeholder: field.placeholder ? `例: ${field.placeholder}` : undefined,
    required: field.required,
    className: "ui-field",
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-sm font-bold text-foreground-700">
          {field.label}
          {field.required ? <span className="ml-1 text-danger">＊</span> : null}
        </label>
        {canManage ? (
          <button type="button" onClick={onEdit} className="ui-btn-quiet ml-auto !px-2 !py-0.5 !text-xs" aria-label={`「${field.label}」の項目を直す`}>
            ✎ 項目を直す
          </button>
        ) : null}
      </div>
      {field.inputType === "textarea" ? (
        <textarea rows={2} {...common} />
      ) : (
        <input type={field.inputType === "date" ? "date" : "text"} inputMode={field.inputType === "number" ? "decimal" : undefined} {...common} />
      )}
    </div>
  );
}

/** 項目の追加・変更・削除の小さな欄（フォームの中に置くので <form> を使わない） */
function FieldEditor({
  category,
  field,
  onDone,
}: {
  category: CrewFieldCategory;
  field?: CrewFieldView;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(field?.label ?? "");
  const [inputType, setInputType] = useState<CrewFieldInputType>(field?.inputType ?? "text");
  const [required, setRequired] = useState(field?.required ?? false);
  const [placeholder, setPlaceholder] = useState(field?.placeholder ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) return setError(res.message);
      router.refresh();
      onDone();
    });
  }

  const input = { category, label, inputType, required, placeholder };

  return (
    <div
      role="group"
      aria-label={field ? `「${field.label}」の項目を直す` : "項目を追加"}
      className="ui-card flex flex-col gap-3 border-primary p-3 sm:col-span-2"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-foreground-700">項目名</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="ui-field !py-2" placeholder="例: 作業服のサイズ" />
        </label>
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-1 text-sm font-bold text-foreground-700">入力の種類</legend>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(CREW_FIELD_INPUT_LABEL) as CrewFieldInputType[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={inputType === k}
                disabled={Boolean(field)}
                onClick={() => setInputType(k)}
                className={cn("ui-btn-quiet", inputType === k && "ui-btn-selected")}
              >
                {CREW_FIELD_INPUT_LABEL[k]}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-foreground-700">入力例</span>
          <input value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} className="ui-field !py-2" placeholder="例: L" />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-base">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="h-5 w-5" />
          必須にする
        </label>
      </div>
      {error ? <p className="m-0 text-sm text-danger">✕ {error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {field ? (
          confirmRemove ? (
            <>
              <span className="text-sm text-danger">外しますか？（入力済みの値は履歴に残ります）</span>
              <button
                type="button"
                className="ui-btn-danger h-9"
                disabled={pending}
                onClick={() => run(() => removeCrewFieldAction(field.fieldKey))}
              >
                外す
              </button>
            </>
          ) : (
            <button type="button" className="ui-btn-ghost h-9 text-danger" onClick={() => setConfirmRemove(true)}>
              この項目を外す
            </button>
          )
        ) : null}
        <span className="ml-auto" />
        <button type="button" className="ui-btn-ghost h-9" onClick={onDone} disabled={pending}>
          やめる
        </button>
        <button
          type="button"
          className="ui-btn-primary h-9"
          disabled={pending || !label.trim()}
          onClick={() =>
            run(() => (field ? updateCrewFieldAction(field.fieldKey, input) : addCrewFieldAction(input)))
          }
        >
          {pending ? "保存中…" : field ? "変更する" : "追加する"}
        </button>
      </div>
    </div>
  );
}
