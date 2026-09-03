"use client";

import { useActionState, useState } from "react";
import { t } from "@/i18n/ja";
import { TRAINING_KINDS, type TrainingKind } from "@/sync-protocol/records";
import { Button, Input, Select, SelectItem, Textarea } from "@/ui";
import {
  arrangeTrainingAction,
  completeTrainingAction,
  publishMaterialAction,
  type TrainingFormState,
} from "../actions";

const INITIAL: TrainingFormState = { ok: false, message: "" };

export interface CrewOption {
  id: string;
  name: string;
  position: string;
}

export interface OpenPlanOption {
  id: string;
  label: string;
  /** 更新講習は新しい有効期限を入れる欄を出す */
  needsExpiry: boolean;
  defaultName: string;
  defaultIssuer: string;
}

function Result({ state }: { state: TrainingFormState }) {
  if (!state.message) return null;
  return (
    <p className={state.ok ? "text-sm font-semibold" : "text-sm text-danger"}>
      {state.ok ? "✓ " : "✕ "}
      {state.message}
    </p>
  );
}

/** 4.4② 受講の手配（登録実技講習機関・予定日） */
export function ArrangeTrainingForm({ crew, today }: { crew: CrewOption[]; today: string }) {
  const [state, formAction, pending] = useActionState(arrangeTrainingAction, INITIAL);
  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <h2 className="font-bold">受講を手配する</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select name="crewMemberId" label="船員" defaultSelectedKeys={crew[0] ? [crew[0].id] : []}>
          {crew.map((c) => (
            <SelectItem key={c.id} textValue={c.name}>
              {c.name}（{c.position}）
            </SelectItem>
          ))}
        </Select>
        <Select name="trainingKind" label="訓練の種類" defaultSelectedKeys={["stcw_basic"]}>
          {TRAINING_KINDS.map((k) => (
            <SelectItem key={k}>{t.trainingKind[k]}</SelectItem>
          ))}
        </Select>
      </div>
      <Input name="title" label="訓練の名前" placeholder="例: STCW 基本訓練（生存・消火・応急・保安）" isRequired />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="institution" label="受講先（登録実技講習機関など）" placeholder="例: 海技教育機構 清水校" />
        <Input type="date" name="scheduledOn" label="受講予定日" defaultValue={today} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          受講を手配する
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

/** 4.4③ 修了の登録（修了証を作り、届出の添付要件へ自動連携する） */
export function CompleteTrainingForm({ plans, today }: { plans: OpenPlanOption[]; today: string }) {
  const [state, formAction, pending] = useActionState(completeTrainingAction, INITIAL);
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const selected = plans.find((p) => p.id === planId);

  if (plans.length === 0) {
    return (
      <div className="glass-tile p-4">
        <h2 className="mb-2 font-bold">修了を登録する</h2>
        <p className="text-sm text-foreground-500">修了を登録できる訓練はありません。</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <h2 className="font-bold">修了を登録する</h2>
      <p className="text-sm text-foreground-600">
        登録すると修了証が作られ、届出の添付要件チェックがその場で「適合」に変わります。
      </p>
      <input type="hidden" name="planId" value={planId} />
      <Select
        label="修了した訓練"
        selectedKeys={planId ? [planId] : []}
        onSelectionChange={(k) => setPlanId(String([...k][0] ?? ""))}
      >
        {plans.map((p) => (
          <SelectItem key={p.id}>{p.label}</SelectItem>
        ))}
      </Select>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input type="date" name="completedOn" label="修了日" defaultValue={today} isRequired />
        <Input
          name="credentialName"
          label="修了証の名前"
          key={`name-${planId}`}
          defaultValue={selected?.defaultName ?? ""}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          name="issuer"
          label="発行・登録機関"
          key={`issuer-${planId}`}
          defaultValue={selected?.defaultIssuer ?? ""}
        />
        <Input name="number" label="番号" placeholder="任意" />
        <Input
          type="date"
          name="expiresOn"
          label="新しい有効期限"
          description={selected?.needsExpiry ? "更新講習では新しい満了日を入れます" : "修了証に期限が無ければ空のまま"}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending} isDisabled={!planId}>
          修了を登録する
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

/** 3.9 主要機能④ 教材・手順書の配信 */
export function MaterialForm({ crew }: { crew: CrewOption[] }) {
  const [state, formAction, pending] = useActionState(publishMaterialAction, INITIAL);
  const [trainingKind, setTrainingKind] = useState<TrainingKind>("internal");

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <h2 className="font-bold">教材・手順書を配信する</h2>
      <input type="hidden" name="trainingKind" value={trainingKind} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select name="crewMemberId" label="配信先の船員" defaultSelectedKeys={crew[0] ? [crew[0].id] : []}>
          {crew.map((c) => (
            <SelectItem key={c.id} textValue={c.name}>
              {c.name}（{c.position}）
            </SelectItem>
          ))}
        </Select>
        <Select
          label="種類"
          selectedKeys={[trainingKind]}
          onSelectionChange={(k) => setTrainingKind(String([...k][0] ?? "internal") as TrainingKind)}
        >
          {TRAINING_KINDS.map((k) => (
            <SelectItem key={k}>{t.trainingKind[k]}</SelectItem>
          ))}
        </Select>
      </div>
      <Input name="title" label="表題" placeholder="例: 船内教育: 係船作業の手順と合図" />
      <Input name="materialName" label="教材・手順書の名前" placeholder="例: 係船作業 手順書 rev.4" isRequired />
      <Textarea
        name="materialBody"
        label="内容"
        minRows={3}
        placeholder="例: ①合図は無線で統一する ②索の張力がかかる範囲に立たない ③指差呼称を行う"
        isRequired
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          配信する
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}
