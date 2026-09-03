"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/ja";
import { RISK_SCALE } from "@/lib/safety-plain";
import type { SmsDocKind } from "@/sync-protocol/masters";
import { Button, Input, Select, SelectItem, Textarea } from "@/ui";
import { publishSmsDocumentAction, type SafetyFormState } from "../actions";

const INITIAL: SafetyFormState = { ok: false, message: "" };
const KINDS: SmsDocKind[] = ["policy", "risk_assessment", "nonconformity", "internal_audit"];
const STATUSES: ("open" | "in_progress" | "closed")[] = ["open", "in_progress", "closed"];

/**
 * 安全管理の記録を1件登録する（3.5.1）。
 * 種別を選ぶと、その種別で意味のある入力欄だけを出す（不要な欄で迷わせない）。
 */
export function SmsForm() {
  const [state, formAction, pending] = useActionState(publishSmsDocumentAction, INITIAL);
  const [kind, setKind] = useState<SmsDocKind>("nonconformity");
  const [status, setStatus] = useState<"open" | "in_progress" | "closed">("open");
  const [severity, setSeverity] = useState("3");
  const [likelihood, setLikelihood] = useState("2");

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <h2 className="font-bold">安全管理の記録を登録</h2>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="status" value={status} />
      {kind === "risk_assessment" ? (
        <>
          <input type="hidden" name="severity" value={severity} />
          <input type="hidden" name="likelihood" value={likelihood} />
        </>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="種別"
          selectedKeys={[kind]}
          onSelectionChange={(k) => {
            const v = [...k][0];
            if (v) setKind(String(v) as SmsDocKind);
          }}
        >
          {KINDS.map((k) => (
            <SelectItem key={k}>{t.smsDocKind[k]}</SelectItem>
          ))}
        </Select>
        <Select
          label="対応の状態"
          selectedKeys={[status]}
          onSelectionChange={(k) => {
            const v = [...k][0];
            if (v) setStatus(String(v) as "open" | "in_progress" | "closed");
          }}
        >
          {STATUSES.map((s) => (
            <SelectItem key={s}>{t.findingStatus[s]}</SelectItem>
          ))}
        </Select>
      </div>

      <Input name="title" label="標題" isRequired placeholder="例: 不適合: 通路への工具放置" />
      <Textarea name="body" label="内容" minRows={3} />

      {kind === "risk_assessment" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="影響度（1〜5）"
            selectedKeys={[severity]}
            onSelectionChange={(k) => {
              const v = [...k][0];
              if (v) setSeverity(String(v));
            }}
          >
            {RISK_SCALE.map((n) => (
              <SelectItem key={String(n)}>{`${n}`}</SelectItem>
            ))}
          </Select>
          <Select
            label="発生度（1〜5）"
            selectedKeys={[likelihood]}
            onSelectionChange={(k) => {
              const v = [...k][0];
              if (v) setLikelihood(String(v));
            }}
          >
            {RISK_SCALE.map((n) => (
              <SelectItem key={String(n)}>{`${n}`}</SelectItem>
            ))}
          </Select>
        </div>
      ) : null}

      {kind === "internal_audit" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input name="auditedOn" type="date" label="実施日" />
          <Input name="auditor" label="監査員" />
        </div>
      ) : null}

      {kind !== "policy" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input name="dueOn" type="date" label="是正の期限" />
          <Input name="responsible" label="担当" />
        </div>
      ) : (
        <Input name="responsible" label="担当" />
      )}
      {kind !== "policy" ? (
        <Textarea name="correctiveAction" label="是正・対策の内容" minRows={2} />
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          登録する
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
