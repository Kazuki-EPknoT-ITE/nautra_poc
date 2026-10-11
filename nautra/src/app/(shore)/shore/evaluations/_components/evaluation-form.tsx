"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/ja";
import { Button, Checkbox, Input, Select, SelectItem, Textarea } from "@/ui/heroui";
import { saveEvaluationAction, type EvaluationFormState } from "../actions";

export interface PersonOption {
  id: string;
  label: string;
}

export interface CorrectableEvaluation {
  id: string;
  label: string;
  crewMemberId: string;
  periodFrom: string;
  periodTo: string;
  scores: Record<string, number>;
  comment: string;
  evaluatedBy: string;
  disclosedToCrew: boolean;
}

const INITIAL: EvaluationFormState = { ok: false, message: "" };

const SCORES = ["1", "2", "3", "4", "5"];

/**
 * 人事考課の記入フォーム（3.1.5）。
 *
 * 5項目を同じ 1〜5 の段階で入力する**テンプレート形式**にして、
 * 評価基準の属人性を下げる（DX効果「評価テンプレート化による公平性確保」）。
 * 本人開示の可否は必ず選ばせる（運用上の留意「本人開示ルールを定める」）。
 */
export function EvaluationForm({
  items,
  crewOptions,
  evaluatorOptions,
  initial,
  defaultEvaluatedBy,
  defaultPeriodFrom,
  defaultPeriodTo,
}: {
  items: readonly string[];
  crewOptions: PersonOption[];
  evaluatorOptions: PersonOption[];
  /** 直すときの元の評価（レビュー EVAL-04: 記入と訂正をタブで分ける） */
  initial?: CorrectableEvaluation;
  defaultEvaluatedBy: string;
  defaultPeriodFrom: string;
  defaultPeriodTo: string;
}) {
  const [state, formAction, pending] = useActionState(saveEvaluationAction, INITIAL);
  const supersedesId = initial?.id ?? "";
  const [crewMemberId, setCrewMemberId] = useState(initial?.crewMemberId ?? crewOptions[0]?.id ?? "");
  const [evaluatedBy, setEvaluatedBy] = useState(initial?.evaluatedBy ?? defaultEvaluatedBy);
  const [periodFrom, setPeriodFrom] = useState(initial?.periodFrom ?? defaultPeriodFrom);
  const [periodTo, setPeriodTo] = useState(initial?.periodTo ?? defaultPeriodTo);
  const [scores, setScores] = useState<Record<string, string>>(
    Object.fromEntries(items.map((k) => [k, String(initial?.scores[k] ?? 3)])),
  );
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [disclosed, setDisclosed] = useState(initial?.disclosedToCrew ?? true);

  return (
    <form action={formAction} className="ui-card flex flex-col gap-4 p-4">
      <input type="hidden" name="supersedesId" value={supersedesId} />
      <input type="hidden" name="crewMemberId" value={crewMemberId} />
      <input type="hidden" name="evaluatedBy" value={evaluatedBy} />
      {items.map((k) => (
        <input key={k} type="hidden" name={`score_${k}`} value={scores[k] ?? "3"} />
      ))}

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="評価する船員"
          selectedKeys={crewMemberId ? [crewMemberId] : []}
          onSelectionChange={(k) => setCrewMemberId(String([...k][0] ?? ""))}
          isRequired
        >
          {crewOptions.map((o) => (
            <SelectItem key={o.id}>{o.label}</SelectItem>
          ))}
        </Select>
        <Select
          label="評価者"
          selectedKeys={evaluatedBy ? [evaluatedBy] : []}
          onSelectionChange={(k) => setEvaluatedBy(String([...k][0] ?? ""))}
          isRequired
        >
          {evaluatorOptions.map((o) => (
            <SelectItem key={o.id}>{o.label}</SelectItem>
          ))}
        </Select>
        <Input
          name="periodFrom"
          type="date"
          label="対象期間（開始）"
          value={periodFrom}
          onValueChange={setPeriodFrom}
          isRequired
        />
        <Input
          name="periodTo"
          type="date"
          label="対象期間（終了）"
          value={periodTo}
          onValueChange={setPeriodTo}
          isRequired
        />
      </div>

      <div className="flex flex-col gap-2">
        {items.map((key) => (
          <div key={key} className="ui-inset flex flex-wrap items-center gap-3 p-3">
            <span className="w-56 shrink-0 text-sm font-semibold">{t.evaluationItem[key] ?? key}</span>
            <div className="flex flex-wrap gap-2">
              {SCORES.map((s) => {
                const selected = (scores[key] ?? "3") === s;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setScores((prev) => ({ ...prev, [key]: s }))}
                    className={`rounded-medium px-3 py-1.5 text-sm ${
                      selected ? "bg-primary text-primary-foreground" : "bg-default-100"
                    }`}
                  >
                    <span className="tabular-nums">{s}</span>
                    <span className="ml-1 text-xs">{(t.evaluationScore[s] ?? s).slice(2)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Textarea
        name="comment"
        label="所見"
        minRows={3}
        value={comment}
        onValueChange={setComment}
      />

      <Checkbox name="disclosedToCrew" isSelected={disclosed} onValueChange={setDisclosed}>
        この評価を本人に開示する
      </Checkbox>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          {supersedesId ? "訂正して保存する" : "保存する"}
        </Button>

        {state.message ? (
          <p className={state.ok ? "text-sm font-semibold" : "text-sm text-danger"}>
            {state.ok ? "✓ " : "✕ "}
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
