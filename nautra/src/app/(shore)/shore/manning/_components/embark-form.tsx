"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/ja";
import type { ManningCandidate } from "@/server/manning-plan-service";
import { Button, Checkbox, Input, Radio, RadioGroup, Select, SelectItem, StatusChip } from "@/ui";
import { registerEmbarkationAction, type ManningFormState } from "../actions";

const INITIAL: ManningFormState = { ok: false, message: "" };

const CONTRACT_TYPES = ["start", "renew", "change", "end"] as const;

/**
 * 乗下船イベントの登録フォーム（S-05）。
 *
 * 3.1.2 は配乗ブロック該当者を「**警告付きで除外・注意表示**する」と定めている。
 * したがって候補から黙って消さず、事由を並べたうえで、
 * **事由を承知したチェック**が入るまで乗船の登録を通さない。
 */
export function EmbarkForm({
  candidates,
  vessels,
  today,
}: {
  candidates: ManningCandidate[];
  vessels: { id: string; name: string }[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(registerEmbarkationAction, INITIAL);
  const [crewMemberId, setCrewMemberId] = useState(candidates[0]?.crewMemberId ?? "");
  const [eventType, setEventType] = useState<"on" | "off">("on");
  const [status, setStatus] = useState<"planned" | "actual">("planned");
  const [acknowledged, setAcknowledged] = useState(false);

  const selected = candidates.find((c) => c.crewMemberId === crewMemberId);
  const blockIssues = selected?.issues.filter((i) => i.severity === "block") ?? [];
  const warnIssues = selected?.issues.filter((i) => i.severity === "warn") ?? [];
  const needsAck = eventType === "on" && blockIssues.length > 0;

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <h2 className="font-bold">乗下船を登録する</h2>
      <p className="text-sm text-foreground-600">
        登録すると、この出来事から必要な手続き一式（届出・保険・記帳・チェック）が自動で起票されます。
      </p>

      <input type="hidden" name="crewMemberId" value={crewMemberId} />
      <input type="hidden" name="eventType" value={eventType} />
      <input type="hidden" name="status" value={status} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="船員"
          selectedKeys={crewMemberId ? [crewMemberId] : []}
          onSelectionChange={(k) => {
            setCrewMemberId(String([...k][0] ?? ""));
            setAcknowledged(false);
          }}
        >
          {candidates.map((c) => (
            <SelectItem key={c.crewMemberId} textValue={`${c.name}（${c.position}）`}>
              {c.name}（{c.position}）／{t.manningStatus[c.status]}
            </SelectItem>
          ))}
        </Select>
        <Select name="targetVesselId" label="船" defaultSelectedKeys={vessels[0] ? [vessels[0].id] : []}>
          {vessels.map((v) => (
            <SelectItem key={v.id}>{v.name}</SelectItem>
          ))}
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <RadioGroup
          orientation="horizontal"
          label="出来事"
          value={eventType}
          onValueChange={(v) => setEventType(v as "on" | "off")}
        >
          <Radio value="on">{t.embarkationEvent.on}</Radio>
          <Radio value="off">{t.embarkationEvent.off}</Radio>
        </RadioGroup>
        <RadioGroup
          orientation="horizontal"
          label="区分"
          value={status}
          onValueChange={(v) => setStatus(v as "planned" | "actual")}
        >
          <Radio value="planned">{t.embarkationStatus.planned}</Radio>
          <Radio value="actual">{t.embarkationStatus.actual}</Radio>
        </RadioGroup>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Input type="date" name="date" label="日付" defaultValue={today} isRequired />
        <Input name="duty" label="職務" placeholder="例: 一等航海士" />
        <Select
          name="contractType"
          label="雇入契約の種別"
          defaultSelectedKeys={["start"]}
        >
          {CONTRACT_TYPES.map((c) => (
            <SelectItem key={c}>{t.embarkationContract[c]}</SelectItem>
          ))}
        </Select>
      </div>

      {selected && selected.issues.length > 0 ? (
        <div className="glass-inset flex flex-col gap-2 p-3">
          {/* Chip は div を描くため p に入れない（不正なネストはハイドレーションを壊す） */}
          <div className="flex items-center gap-2 text-sm font-semibold">
            <StatusChip
              size="sm"
              level={blockIssues.length > 0 ? "violation" : "caution"}
              label={t.manningStatus[selected.status]}
            />
            <span>{selected.name} には確認が要る事由があります</span>
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {[...blockIssues, ...warnIssues].map((i) => (
              <li key={i.key}>
                <span className={i.severity === "block" ? "font-bold text-danger" : "font-bold text-warning-700"}>
                  {i.severity === "block" ? "✕ 配乗できません" : "⚠ 注意"}
                </span>
                <span className="ml-2 font-semibold">{i.label}</span>
                <span className="ml-2 text-foreground-600">{i.detail}</span>
              </li>
            ))}
          </ul>
          {needsAck ? (
            <Checkbox
              name="acknowledgeBlock"
              isSelected={acknowledged}
              onValueChange={setAcknowledged}
            >
              事由を承知のうえで予定として登録する（登録内容に事由が残ります）
            </Checkbox>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          color="primary"
          isLoading={pending}
          isDisabled={!crewMemberId || (needsAck && !acknowledged)}
        >
          乗下船を登録する
        </Button>
        {state.message ? (
          <p className={state.ok ? "text-sm font-semibold" : "text-sm text-danger"}>
            {state.ok ? "✓ " : "✕ "}
            {state.message}
          </p>
        ) : null}
      </div>

      {state.ok && state.procedureTitles && state.procedureTitles.length > 0 ? (
        <ul className="glass-inset flex flex-col gap-1 p-3 text-sm">
          {state.procedureTitles.map((title) => (
            <li key={title}>・{title}</li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
