"use client";

import { useActionState, useState } from "react";
import { Button, Input, Select, SelectItem } from "@/ui";
import {
  createBulkPermitAction,
  createCrewRegisterAction,
  createDrillRecordDocAction,
  type DocumentFormState,
} from "../actions";

const INITIAL: DocumentFormState = { ok: false, message: "" };

/** 送信ボタンと結果表示（3つのフォームで同じ形にする） */
function Submit({ label, pending, state }: { label: string; pending: boolean; state: DocumentFormState }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" color="primary" isLoading={pending}>
        {label}
      </Button>
      {state.message ? (
        <p className={state.ok ? "text-sm font-semibold" : "text-sm text-danger"}>
          {state.ok ? "✓ " : "✕ "}
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * 海員名簿の出力（要件定義書 9章「船舶ごとに備置き。届出時に提示」/ 6.2 B群）。
 *
 * 名簿は**入力しない**。乗下船の記録から組み立てるので、乗り降りを登録していれば
 * 常に最新の内容が出る（6.2「常時最新に自動維持」）。
 */
export function CrewRegisterForm({ vessels }: { vessels: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createCrewRegisterAction, INITIAL);
  const [vesselId, setVesselId] = useState(vessels[0]?.id ?? "");

  return (
    <form action={formAction} className="ui-card flex flex-col gap-3 p-4">
      <h2 className="font-bold">海員名簿を出す</h2>
      <p className="text-sm text-foreground-600">
        その船にいま乗っている船員を、乗下船の記録から組み立てます。入力する項目はありません。
        届出のときに提示する書類です。
      </p>
      <input type="hidden" name="vesselId" value={vesselId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="船"
          selectedKeys={vesselId ? [vesselId] : []}
          onSelectionChange={(k) => setVesselId(String([...k][0] ?? ""))}
          isRequired
        >
          {vessels.map((v) => (
            <SelectItem key={v.id}>{v.name}</SelectItem>
          ))}
        </Select>
      </div>
      <Submit label="海員名簿を作る" pending={pending} state={state} />
    </form>
  );
}

/**
 * 一括届出許可申請書・電子届出登録申請書（要件定義書 3.8.3 申請方法B / 6.6③）。
 *
 * 許可を受けると窓口へ出頭せずに電子届出ができるようになる。
 * 審査では管理体制を示す必要があるため、**蓄積済みの届出実績と労務管理の状況を
 * 疎明材料として自動で添える**（6.6③「労務管理データの蓄積自体を許可の疎明材料として活用」）。
 */
export function BulkPermitForm() {
  const [state, formAction, pending] = useActionState(createBulkPermitAction, INITIAL);

  return (
    <form action={formAction} className="ui-card flex flex-col gap-3 p-4">
      <h2 className="font-bold">一括届出の許可を申請する</h2>
      <p className="text-sm text-foreground-600">
        許可を受けると、窓口へ行かずに電子で届け出られるようになります。
        これまでの届出の実績と労務管理の状況を、申請書に自動で添えます。
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          name="office"
          label="提出先の運輸局"
          placeholder="例: 中国運輸局 海上安全環境部"
          isRequired
        />
      </div>
      <Submit label="申請書を作る" pending={pending} state={state} />
    </form>
  );
}

/**
 * 操練（訓練）実施記録（要件定義書 9章 / 3.3.2 / 3.9）。
 * 船内で記録した操練を、備置き・提示のために期間でまとめる。
 */
export function DrillRecordDocForm({ from, to }: { from: string; to: string }) {
  const [state, formAction, pending] = useActionState(createDrillRecordDocAction, INITIAL);

  return (
    <form action={formAction} className="ui-card flex flex-col gap-3 p-4">
      <h2 className="font-bold">操練の実施記録を出す</h2>
      <p className="text-sm text-foreground-600">
        船内で記録した操練を期間でまとめます。海上労働検査や内部監査で提示する書類です。
        次の実施期日は訓練の画面で確認できます。
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input type="date" name="from" label="開始日" defaultValue={from} isRequired />
        <Input type="date" name="to" label="終了日" defaultValue={to} isRequired />
      </div>
      <Submit label="実施記録を作る" pending={pending} state={state} />
    </form>
  );
}
