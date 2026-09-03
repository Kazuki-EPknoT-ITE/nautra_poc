"use client";

import { useActionState } from "react";
import { t } from "@/i18n/ja";
import type { InsuranceKind } from "@/sync-protocol/records";
import { Button, Input, Select, SelectItem, Textarea } from "@/ui";
import { saveCrewMasterAction, type CrewMasterFormState } from "../actions";

export interface InsuranceFormValue {
  kind: InsuranceKind;
  number: string;
  acquiredOn: string;
  lastVerifiedOn: string;
  verifyMethod: string;
}

export interface CrewMasterFormValues {
  crewMemberId: string;
  name: string;
  nameKana: string;
  birthDate: string;
  seamanBookNo: string;
  address: string;
  bloodType: string;
  phone: string;
  position: string;
  employmentType: string;
  hiredOn: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  familyNote: string;
  /** 権限がある担当者にだけ渡す（無い場合は undefined のままクライアントへ送らない） */
  medicalHistory?: string;
  medication?: string;
  insurances: InsuranceFormValue[];
}

const INITIAL: CrewMasterFormState = { ok: false, message: "", changed: [] };

/** 保険の確認方法（insuranceEntrySchema の enum。原本確認は証書側の語彙なので含めない） */
const INSURANCE_VERIFY_METHODS = ["document", "notice", "external_link"] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="glass-inset flex flex-col gap-3 p-4">
      <h3 className="font-bold">{title}</h3>
      {children}
    </section>
  );
}

/**
 * S-04 船員マスタの編集フォーム（要件定義書 3.1.1 / 12.3 / 12.4）。
 *
 * - **年齢は入力させない**。生年月日から算出した値を読み取り専用で示す（12.3 導出値を持たない）
 * - 要配慮個人情報の欄は権限がある場合だけ描く（欄ごと出さない。10.3）
 * - 保存は差分ではなく「変更後の完全な姿」を配信し、前の内容は履歴として残る（12.3 / 12.6）
 */
export function CrewMasterForm({
  values,
  age,
  canEditSensitive,
}: {
  values: CrewMasterFormValues;
  age: number | null;
  canEditSensitive: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveCrewMasterAction, INITIAL);

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-4 p-4">
      <input type="hidden" name="crewMemberId" value={values.crewMemberId} />

      <Section title="基本情報">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input name="name" label={t.crewMasterField.name} defaultValue={values.name} isRequired />
          <Input
            name="nameKana"
            label={t.crewMasterField.nameKana}
            defaultValue={values.nameKana}
            placeholder="例: カトウ ヤマト"
          />
          <Input
            name="birthDate"
            type="date"
            label={t.crewMasterField.birthDate}
            defaultValue={values.birthDate}
            isRequired
            description="年齢はここから計算します（年齢そのものは入力しません）"
          />
          <Input
            label="年齢（計算した値）"
            value={age === null ? "—" : `${age}歳`}
            isReadOnly
            description="保存されない導出値です（要件定義書 12.3）"
          />
          <Input
            name="seamanBookNo"
            label={t.crewMasterField.seamanBookNo}
            defaultValue={values.seamanBookNo}
          />
          <Input
            name="bloodType"
            label={t.crewMasterField.bloodType}
            defaultValue={values.bloodType}
            placeholder="例: A"
          />
          <Input name="phone" label={t.crewMasterField.phone} defaultValue={values.phone} />
          <Input name="address" label={t.crewMasterField.address} defaultValue={values.address} />
          <Input
            name="position"
            label={t.crewMasterField.position}
            defaultValue={values.position}
            placeholder="例: 一等航海士"
          />
          <Input
            name="employmentType"
            label={t.crewMasterField.employmentType}
            defaultValue={values.employmentType}
            placeholder="例: 期間の定めのない雇用"
          />
          <Input
            name="hiredOn"
            type="date"
            label={t.crewMasterField.hiredOn}
            defaultValue={values.hiredOn}
          />
        </div>
      </Section>

      <Section title="緊急連絡先・家族構成">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            name="emergencyContactName"
            label={t.crewMasterField.emergencyContactName}
            defaultValue={values.emergencyContactName}
          />
          <Input
            name="emergencyContactRelation"
            label={t.crewMasterField.emergencyContactRelation}
            defaultValue={values.emergencyContactRelation}
            placeholder="例: 配偶者"
          />
          <Input
            name="emergencyContactPhone"
            label={t.crewMasterField.emergencyContactPhone}
            defaultValue={values.emergencyContactPhone}
          />
        </div>
        <Textarea
          name="familyNote"
          label={t.crewMasterField.familyNote}
          minRows={2}
          defaultValue={values.familyNote}
          placeholder="例: 配偶者・子2人（緊急時は配偶者へ）"
        />
      </Section>

      <Section title="健康に関する情報（要配慮個人情報）">
        {canEditSensitive ? (
          <>
            <Textarea
              name="medicalHistory"
              label={t.crewMasterField.medicalHistory}
              minRows={2}
              defaultValue={values.medicalHistory ?? ""}
              placeholder="例: 高血圧（内服で安定）"
            />
            <Textarea
              name="medication"
              label={t.crewMasterField.medication}
              minRows={2}
              defaultValue={values.medication ?? ""}
              placeholder="例: アムロジピン 5mg 朝1回"
            />
            <p className="text-xs text-foreground-500">
              この欄の内容は記録の中身を残しません。変更したことと項目名だけを履歴に残します
              （要件定義書 10.3 / 12.6）。
            </p>
          </>
        ) : (
          <p className="text-sm text-foreground-600">
            この項目は権限がある担当者のみ編集できます。
          </p>
        )}
      </Section>

      <Section title="保険の加入状況（写し・最終確認日つき）">
        <p className="text-xs text-foreground-500">
          正本は日本年金機構・協会けんぽ・ハローワークにあります。ここは写しなので、
          いつ・どうやって確認したかを必ず入れてください（要件定義書 12.2 / 12.4）。
        </p>
        {values.insurances.map((ins) => (
          <div key={ins.kind} className="flex flex-col gap-2">
            <p className="text-sm font-semibold">{t.insuranceKind[ins.kind]}</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <Input
                name={`ins.${ins.kind}.number`}
                label="記号番号"
                defaultValue={ins.number}
                placeholder="例: SI-4471-01"
              />
              <Input
                name={`ins.${ins.kind}.acquiredOn`}
                type="date"
                label="資格取得日"
                defaultValue={ins.acquiredOn}
              />
              <Input
                name={`ins.${ins.kind}.lastVerifiedOn`}
                type="date"
                label="最終確認日"
                defaultValue={ins.lastVerifiedOn}
              />
              <Select
                name={`ins.${ins.kind}.verifyMethod`}
                label="確認方法"
                defaultSelectedKeys={ins.verifyMethod ? [ins.verifyMethod] : []}
              >
                {INSURANCE_VERIFY_METHODS.map((m) => (
                  <SelectItem key={m}>{t.verifyMethod[m]}</SelectItem>
                ))}
              </Select>
            </div>
          </div>
        ))}
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          保存する
        </Button>
        {state.message ? (
          <p className={state.ok ? "text-sm font-semibold" : "text-sm text-danger"}>
            {state.ok ? "✓ " : "✕ "}
            {state.message}
            {state.ok && state.changed.length > 0 ? `（${state.changed.join("・")}）` : ""}
          </p>
        ) : null}
      </div>
      <p className="text-xs text-foreground-500">
        保存すると、前の内容を消さずに「新しい版」を追加します。誰がいつ何を変えたかは下の変更履歴で
        確認できます（要件定義書 12.3 / 12.6）。
      </p>
    </form>
  );
}
