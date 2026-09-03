"use client";

import { useActionState, useMemo, useState } from "react";
import { t } from "@/i18n/ja";
import type { FilingCandidate } from "@/server/filing-service";
import { FILING_METHODS, FILING_TYPES, type FilingMethod, type FilingType } from "@/sync-protocol/records";
import { Button, Checkbox, Input, Radio, RadioGroup, Select, SelectItem } from "@/ui";
import { createFilingAction, type FilingFormState } from "../actions";

const INITIAL: FilingFormState = { ok: false, message: "" };

interface ManualTarget {
  key: string;
  crewMemberId: string;
  targetVesselId: string;
  duty: string;
  effectiveOn: string;
}

/**
 * 届出ウィザードの手順①②（要件定義書 3.8.3①② / 4.3 ①→②）。
 *
 * ① 届出の種別と提出方式を決める（6.3 の3方式）
 * ② 対象を**複数**選ぶ。配乗計画で決めた未提出の乗下船予定から引けるようにし、
 *    足りない分だけ手で足す（マスタから自動引用するので氏名等は入力しない）。
 */
export function FilingWizard({
  candidates,
  crew,
  vessels,
  today,
}: {
  candidates: FilingCandidate[];
  crew: { id: string; name: string; position: string }[];
  vessels: { id: string; name: string }[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(createFilingAction, INITIAL);
  const [filingType, setFilingType] = useState<FilingType>("hire");
  const [method, setMethod] = useState<FilingMethod>("bulk_electronic");
  const [picked, setPicked] = useState<string[]>([]);
  const [manual, setManual] = useState<ManualTarget[]>([]);

  const targets = useMemo(() => {
    const fromCandidates = candidates
      .filter((c) => picked.includes(c.key))
      .map((c) => ({
        crewMemberId: c.crewMemberId,
        targetVesselId: c.targetVesselId,
        duty: c.duty ?? "",
        effectiveOn: c.effectiveOn,
      }));
    const fromManual = manual
      .filter((m) => m.crewMemberId && m.targetVesselId && m.effectiveOn)
      .map((m) => ({
        crewMemberId: m.crewMemberId,
        targetVesselId: m.targetVesselId,
        duty: m.duty,
        effectiveOn: m.effectiveOn,
      }));
    return [...fromCandidates, ...fromManual];
  }, [candidates, picked, manual]);

  function addManual() {
    setManual((rows) => [
      ...rows,
      {
        key: `m-${Date.now()}-${rows.length}`,
        crewMemberId: crew[0]?.id ?? "",
        targetVesselId: vessels[0]?.id ?? "",
        duty: "",
        effectiveOn: today,
      },
    ]);
  }

  function patch(key: string, patchValue: Partial<ManualTarget>) {
    setManual((rows) => rows.map((r) => (r.key === key ? { ...r, ...patchValue } : r)));
  }

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-4 p-4">
      <h2 className="font-bold">新しい届出を作る</h2>

      <input type="hidden" name="filingType" value={filingType} />
      <input type="hidden" name="method" value={method} />
      <input type="hidden" name="targets" value={JSON.stringify(targets)} />

      {/* 手順① 種別・方式 */}
      <div className="glass-inset flex flex-col gap-3 p-3">
        <h3 className="text-sm font-bold">手順1 どの届出をどの方式で出すか</h3>
        <RadioGroup
          orientation="horizontal"
          label="届出の種別"
          value={filingType}
          onValueChange={(v) => setFilingType(v as FilingType)}
        >
          {FILING_TYPES.map((f) => (
            <Radio key={f} value={f}>
              {t.filingType[f]}
            </Radio>
          ))}
        </RadioGroup>
        <RadioGroup
          label="提出の方式"
          value={method}
          onValueChange={(v) => setMethod(v as FilingMethod)}
        >
          {FILING_METHODS.map((m) => (
            <Radio key={m} value={m}>
              {t.filingMethod[m]}
            </Radio>
          ))}
        </RadioGroup>
        <p className="text-xs text-foreground-500">
          電子届出・一括届出（登録届出）を選ぶと、窓口へ持参する書類に加えて電子届出用の様式も作ります。
        </p>
      </div>

      {/* 手順② 対象の選択（複数船員・複数船舶） */}
      <div className="glass-inset flex flex-col gap-3 p-3">
        <h3 className="text-sm font-bold">手順2 対象をまとめて選ぶ（複数の船員・複数の船をまとめて出せます）</h3>

        {candidates.length === 0 ? (
          <p className="text-sm text-foreground-500">配乗計画に未提出の乗下船予定はありません。</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {candidates.map((c) => (
              <li key={c.key} className="flex flex-wrap items-center gap-2 text-sm">
                <Checkbox
                  size="sm"
                  isSelected={picked.includes(c.key)}
                  onValueChange={(on) =>
                    setPicked((p) => (on ? [...p, c.key] : p.filter((x) => x !== c.key)))
                  }
                >
                  <span className="font-semibold">{c.crewName}</span>
                </Checkbox>
                <span className="text-foreground-600">{c.vesselName}</span>
                <span className="tabular-nums text-foreground-500">
                  {c.effectiveOn} {t.embarkationEvent[c.eventType]}
                </span>
                {c.duty ? <span className="text-foreground-600">{c.duty}</span> : null}
                {c.alreadyFiled ? (
                  <span className="text-foreground-500">（提出済みの届出にも載っています）</span>
                ) : null}
                {c.blockNoteAtPlanning ? (
                  <span className="text-warning-700">⚠ {c.blockNoteAtPlanning}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {manual.map((m) => (
          <div key={m.key} className="grid gap-2 sm:grid-cols-5">
            <Select
              size="sm"
              label="船員"
              selectedKeys={m.crewMemberId ? [m.crewMemberId] : []}
              onSelectionChange={(k) => patch(m.key, { crewMemberId: String([...k][0] ?? "") })}
            >
              {crew.map((c) => (
                <SelectItem key={c.id} textValue={c.name}>
                  {c.name}（{c.position}）
                </SelectItem>
              ))}
            </Select>
            <Select
              size="sm"
              label="船"
              selectedKeys={m.targetVesselId ? [m.targetVesselId] : []}
              onSelectionChange={(k) => patch(m.key, { targetVesselId: String([...k][0] ?? "") })}
            >
              {vessels.map((v) => (
                <SelectItem key={v.id}>{v.name}</SelectItem>
              ))}
            </Select>
            <Input
              size="sm"
              type="date"
              label="効力発生日"
              value={m.effectiveOn}
              onValueChange={(v) => patch(m.key, { effectiveOn: v })}
            />
            <Input
              size="sm"
              label="職務"
              value={m.duty}
              onValueChange={(v) => patch(m.key, { duty: v })}
            />
            <Button
              size="sm"
              variant="bordered"
              onPress={() => setManual((rows) => rows.filter((r) => r.key !== m.key))}
            >
              この行を消す
            </Button>
          </div>
        ))}

        <div>
          <Button size="sm" variant="bordered" onPress={addManual}>
            対象を手で足す
          </Button>
        </div>

        <p className="text-sm">
          いま選んでいる対象:{" "}
          <span className="tabular-nums font-semibold">{targets.length}名</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending} isDisabled={targets.length === 0}>
          下書きを作る
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
