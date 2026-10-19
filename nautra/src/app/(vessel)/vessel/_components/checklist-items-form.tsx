"use client";

import { useMemo } from "react";
import type { TemplateItem } from "@/sync-protocol/records";
import { TriStateToggle } from "@/ui";
import { Input } from "@/ui/heroui";
import type { TriState } from "@/ui/tri-state-toggle";
import { TemplateItemField } from "./template-item-field";

export interface ChecklistAnswers {
  /** 良・不良で答える項目の答え */
  answers: Record<string, TriState | null>;
  /** それ以外の項目の入力（文字列のまま。記録に載せる形へは collectTemplateValues で変える） */
  values: Record<string, string>;
  /** 不良の内容・処置 */
  notes: Record<string, string>;
}

export const emptyChecklistAnswers = (): ChecklistAnswers => ({ answers: {}, values: {}, notes: {} });

/** 項目を見出しごとにまとめる（見出しは最初に出てきた順） */
export function groupItems(items: TemplateItem[]): [string, TemplateItem[]][] {
  const m = new Map<string, TemplateItem[]>();
  for (const it of items) m.set(it.group, [...(m.get(it.group) ?? []), it]);
  return [...m.entries()];
}

/**
 * 点検表の入力欄（見出しごと）。記録の画面と、項目づくりの「見え方を確かめる」で同じものを描き、
 * 作った項目が点検のときにどう出るかを、そのまま試せるようにする。
 */
export function ChecklistItemsForm({
  items,
  value,
  onChange,
}: {
  items: TemplateItem[];
  value: ChecklistAnswers;
  onChange: (next: ChecklistAnswers) => void;
}) {
  const groups = useMemo(() => groupItems(items), [items]);
  return (
    <>
      {groups.map(([group, its]) => (
        <div key={group} className="flex flex-col gap-2">
          <h3 className="m-0 font-bold">{group}</h3>
          {its.map((it) =>
            it.inputType === "check" ? (
              <div key={it.key} className="ui-inset flex flex-col gap-1 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-base">{it.label}</span>
                  <TriStateToggle
                    ariaLabel={it.label}
                    value={value.answers[it.key] ?? null}
                    onChange={(v) => onChange({ ...value, answers: { ...value.answers, [it.key]: v } })}
                  />
                </div>
                {value.answers[it.key] === "ng" ? (
                  <Input
                    size="sm"
                    label="不良の内容・処置"
                    value={value.notes[it.key] ?? ""}
                    onValueChange={(v) => onChange({ ...value, notes: { ...value.notes, [it.key]: v } })}
                  />
                ) : null}
              </div>
            ) : (
              <TemplateItemField
                key={it.key}
                item={it}
                value={value.values[it.key] ?? ""}
                onChange={(v) => onChange({ ...value, values: { ...value.values, [it.key]: v } })}
              />
            ),
          )}
        </div>
      ))}
    </>
  );
}
