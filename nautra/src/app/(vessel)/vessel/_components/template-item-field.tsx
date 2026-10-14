"use client";

import { cn } from "@/lib/cn";
import { isItemRequired } from "@/lib/record-templates";
import type { TemplateItem } from "@/sync-protocol/records";
import { Input, Radio, RadioGroup } from "@/ui/heroui";

/**
 * 配信された記録項目（航海日誌の追加項目など）の入力欄を1行描く。入力の種類ごとの描き分けをここに集め、
 * 項目を足した直後でも記録の入力画面で同じ見た目になるようにする。値は文字列で受け渡し、
 * 記録に載せる形への変換と検査は `collectTemplateValues`（src/lib/record-templates.ts）が行う。
 */
export function TemplateItemField({
  item,
  value,
  onChange,
}: {
  item: TemplateItem;
  value: string;
  onChange: (v: string) => void;
}) {
  const required = isItemRequired(item);
  return (
    <div className="ui-inset flex flex-wrap items-center justify-between gap-2 p-3">
      <span className="flex items-center gap-2">
        {item.label}
        {required ? <span className="text-sm text-foreground-600">（必須）</span> : null}
      </span>
      {item.inputType === "check" ? (
        <RadioGroup
          orientation="horizontal"
          aria-label={item.label}
          value={value || "ok"}
          onValueChange={onChange}
        >
          <Radio value="ok">良</Radio>
          <Radio value="ng">不良</Radio>
        </RadioGroup>
      ) : item.inputType === "choice" ? (
        <div role="radiogroup" aria-label={item.label} className="flex flex-wrap gap-2">
          {(item.options ?? []).map((o) => {
            const on = value === o;
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={on}
                // 選んだものをもう一度押すと選び直せる（任意の項目を空に戻せるように）
                onClick={() => onChange(on ? "" : o)}
                className={cn("ui-btn-quiet min-h-10 !px-3 !text-base", on && "ui-btn-selected")}
              >
                {o}
              </button>
            );
          })}
        </div>
      ) : (
        <Input
          size="sm"
          type={item.inputType === "number" ? "number" : item.inputType === "time" ? "time" : "text"}
          aria-label={item.label}
          className={item.inputType === "text" ? "max-w-72" : "max-w-44"}
          endContent={item.unit ? <span className="text-sm text-foreground-600">{item.unit}</span> : null}
          value={value}
          onValueChange={onChange}
        />
      )}
    </div>
  );
}
