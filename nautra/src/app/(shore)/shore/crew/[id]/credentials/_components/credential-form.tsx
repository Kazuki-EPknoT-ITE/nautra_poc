"use client";

import { useActionState } from "react";
import { t } from "@/i18n/ja";
import { CREDENTIAL_CATEGORIES, CREDENTIAL_VERIFY_METHODS } from "@/sync-protocol/records";
import { Button, Input, Select, SelectItem } from "@/ui";
import { createCredentialAction, type CredentialFormState } from "../actions";

const INITIAL: CredentialFormState = { ok: false, message: "" };

/** 船員に紐づく区分だけを出す（船舶検査証書・無線局免許は船舶側の証書） */
const CREW_CATEGORIES = CREDENTIAL_CATEGORIES.filter(
  (c) => c !== "vessel_survey" && c !== "radio_station",
);

/**
 * 資格・証書の新規登録（要件定義書 3.1.3 / 3.9 / 12.2）。
 * 免状・健診・修了証は**外部に正本がある写し**なので、最終確認日と確認方法を必ず添える（12.4）。
 */
export function CredentialForm({ crewMemberId }: { crewMemberId: string }) {
  const [state, formAction, pending] = useActionState(createCredentialAction, INITIAL);

  return (
    <form action={formAction} className="ui-card flex flex-col gap-3 p-4">
      <h2 className="font-bold">資格・証書を登録する</h2>
      <input type="hidden" name="crewMemberId" value={crewMemberId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select name="category" label="区分" defaultSelectedKeys={["license"]} isRequired>
          {CREW_CATEGORIES.map((c) => (
            <SelectItem key={c}>{t.credentialCategory[c] ?? c}</SelectItem>
          ))}
        </Select>
        <Input name="name" label="名称" placeholder="例: 四級海技士（航海）" isRequired />
        <Input name="grade" label="等級・種別" placeholder="例: 四級" />
        <Input name="number" label="番号" placeholder="例: K-040-227813" />
        <Input name="issuedOn" type="date" label="交付日・修了日" />
        <Input
          name="expiresOn"
          type="date"
          label="有効期限"
          description="修了証など期限のないものは空のままにします"
        />
        <Input name="issuer" label="発行機関・登録実技講習機関" placeholder="例: 四国運輸局" />
        <Input
          name="attachmentName"
          label="添付ファイル名"
          placeholder="例: license-sato.pdf"
          description="PoC はファイル名のみ保持します"
        />
        <Input
          name="lastVerifiedOn"
          type="date"
          label="最終確認日"
          description="いつ現物・通知書を確かめたかを入れます（12.4）"
        />
        <Select name="verifyMethod" label="確認方法" defaultSelectedKeys={["original"]}>
          {CREDENTIAL_VERIFY_METHODS.map((m) => (
            <SelectItem key={m}>{t.verifyMethod[m]}</SelectItem>
          ))}
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
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
