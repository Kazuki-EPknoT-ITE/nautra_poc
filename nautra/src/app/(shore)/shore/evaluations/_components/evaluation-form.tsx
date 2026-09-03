"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/ja";
import { Button, Checkbox, Input, Select, SelectItem, Textarea } from "@/ui";
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
  correctable,
  defaultEvaluatedBy,
  defaultPeriodFrom,
  defaultPeriodTo,
}: {
  items: readonly string[];
  crewOptions: PersonOption[];
  evaluatorOptions: PersonOption[];
  correctable: CorrectableEvaluation[];
  defaultEvaluatedBy: string;
  defaultPeriodFrom: string;
  defaultPeriodTo: string;
}) {
  const [state, formAction, pending] = useActionState(saveEvaluationAction, INITIAL);
  const [supersedesId, setSupersedesId] = useState("");
  const [crewMemberId, setCrewMemberId] = useState(crewOptions[0]?.id ?? "");
  const [evaluatedBy, setEvaluatedBy] = useState(defaultEvaluatedBy);
  const [periodFrom, setPeriodFrom] = useState(defaultPeriodFrom);
  const [periodTo, setPeriodTo] = useState(defaultPeriodTo);
  const [scores, setScores] = useState<Record<string, string>>(
    Object.fromEntries(items.map((k) => [k, "3"])),
  );
  const [comment, setComment] = useState("");
  const [disclosed, setDisclosed] = useState(true);

  /** 訂正対象を選ぶと、その内容を読み込んで書き換えられるようにする */
  function loadForCorrection(id: string) {
    setSupersedesId(id);
    const found = correctable.find((c) => c.id === id);
    if (!found) return;
    setCrewMemberId(found.crewMemberId);
    setEvaluatedBy(found.evaluatedBy);
    setPeriodFrom(found.periodFrom);
    setPeriodTo(found.periodTo);
    setScores(Object.fromEntries(items.map((k) => [k, String(found.scores[k] ?? 3)])));
    setComment(found.comment);
    setDisclosed(found.disclosedToCrew);
  }

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-4 p-4">
      <h2 className="font-bold">{supersedesId ? "評価を訂正する" : "評価を記入する"}</h2>

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
        <p className="text-sm text-foreground-500">
          5つの項目を同じものさし（1〜5）で選びます。全員に同じ項目・同じ段階を使うことで、
          評価者による偏りを減らします。
        </p>
        {items.map((key) => (
          <div key={key} className="glass-inset flex flex-wrap items-center gap-3 p-3">
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
        label="所見（本人開示する場合は本人が読みます）"
        minRows={3}
        value={comment}
        onValueChange={setComment}
      />

      <Checkbox name="disclosedToCrew" isSelected={disclosed} onValueChange={setDisclosed}>
        この評価を本人に開示する
      </Checkbox>
      <p className="text-xs text-foreground-600">
        開示すると本人が所見と点数を読めます。開示しない場合でも、評価は残り、閲覧できるのは
        権限のある担当者だけです。
      </p>

      <Select
        label="訂正する評価を選ぶ（新しく書くときは空のまま）"
        selectedKeys={supersedesId ? [supersedesId] : []}
        onSelectionChange={(k) => loadForCorrection(String([...k][0] ?? ""))}
      >
        {correctable.map((o) => (
          <SelectItem key={o.id}>{o.label}</SelectItem>
        ))}
      </Select>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          {supersedesId ? "訂正して保存する" : "保存する"}
        </Button>
        {supersedesId ? (
          <Button variant="bordered" onPress={() => setSupersedesId("")}>
            訂正をやめる
          </Button>
        ) : null}
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
