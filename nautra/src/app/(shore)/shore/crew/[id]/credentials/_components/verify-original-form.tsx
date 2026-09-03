"use client";

import { useActionState } from "react";
import { t } from "@/i18n/ja";
import { CREDENTIAL_VERIFY_METHODS } from "@/sync-protocol/records";
import { Button, Select, SelectItem } from "@/ui";
import { verifyCredentialAction, type CredentialFormState } from "../actions";

const INITIAL: CredentialFormState = { ok: false, message: "" };

/**
 * 「原本を確認した」操作（要件定義書 12.4）。
 *
 * 押すと最終確認日を今日に更新した**新しいレコード**を配信し、
 * 「要再確認（鮮度切れ）」を解消する。有効期限（不適合）とは別の軸なので、
 * 期限切れの証書はこの操作だけでは適合にならない。
 */
export function VerifyOriginalForm({
  credentialId,
  crewMemberId,
}: {
  credentialId: string;
  crewMemberId: string;
}) {
  const [state, formAction, pending] = useActionState(verifyCredentialAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="credentialId" value={credentialId} />
      <input type="hidden" name="crewMemberId" value={crewMemberId} />
      <Select
        name="verifyMethod"
        label="確認のしかた"
        size="sm"
        className="w-52"
        defaultSelectedKeys={["original"]}
      >
        {CREDENTIAL_VERIFY_METHODS.map((m) => (
          <SelectItem key={m}>{t.verifyMethod[m]}</SelectItem>
        ))}
      </Select>
      <Button type="submit" variant="bordered" size="sm" isLoading={pending}>
        原本を確認した
      </Button>
      {state.message ? (
        <span className={state.ok ? "text-sm font-semibold" : "text-sm text-danger"}>
          {state.ok ? "✓ " : "✕ "}
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
