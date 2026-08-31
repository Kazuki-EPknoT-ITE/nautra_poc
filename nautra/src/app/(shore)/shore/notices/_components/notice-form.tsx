"use client";

import { useActionState, useState } from "react";
import type { NoticeLevel } from "@/sync-protocol/records";
import { Button, Input, Radio, RadioGroup, Select, SelectItem, Textarea } from "@/ui";
import { publishNoticeAction, type NoticeFormState } from "../actions";

export interface NoticeOption {
  id: string;
  label: string;
}

const INITIAL: NoticeFormState = { ok: false, message: "" };

/** お知らせ・速報の配信フォーム。既存を選ぶと訂正（置き換え）として配信する */
export function NoticeForm({ options }: { options: NoticeOption[] }) {
  const [state, formAction, pending] = useActionState(publishNoticeAction, INITIAL);
  const [level, setLevel] = useState<NoticeLevel>("info");
  const [supersedesId, setSupersedesId] = useState("");

  return (
    <form action={formAction} className="glass-tile flex flex-col gap-3 p-4">
      <h2 className="font-bold">お知らせ・速報を配信</h2>
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="supersedesId" value={supersedesId} />
      <RadioGroup
        orientation="horizontal"
        label="区分"
        value={level}
        onValueChange={(v) => setLevel(v as NoticeLevel)}
      >
        <Radio value="info">お知らせ（通常）</Radio>
        <Radio value="urgent">速報（すぐ知らせる）</Radio>
      </RadioGroup>
      <Input name="title" label="見出し" placeholder="例: 台風19号 進路情報" isRequired />
      <Textarea
        name="body"
        label="本文"
        minRows={3}
        placeholder="例: 明朝までに東航路が時化る見込み。出港時刻を再確認してください。"
      />
      <Select
        label="訂正・取り消しする既存のお知らせ（任意）"
        selectedKeys={supersedesId ? [supersedesId] : []}
        onSelectionChange={(k) => setSupersedesId(String([...k][0] ?? ""))}
      >
        {options.map((o) => (
          <SelectItem key={o.id}>{o.label}</SelectItem>
        ))}
      </Select>
      <div className="flex items-center gap-3">
        <Button type="submit" color="primary" isLoading={pending}>
          配信する
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
