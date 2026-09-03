"use client";

import { Button, Input } from "@/ui";

/**
 * S-02 の氏名検索。
 * 絞り込みの状態は URL の searchParams に持たせ、一覧は Server Component のまま組み立てる
 * （陸上画面はサーバで組み立てる方針。基本設計書 2.3）。
 */
export function CrewSearchForm({ status, q }: { status: string; q: string }) {
  return (
    <form action="/shore/crew" method="get" className="flex items-end gap-2">
      {status && status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
      <Input
        name="q"
        size="sm"
        label="氏名でさがす"
        placeholder="例: 森"
        defaultValue={q}
        className="w-48"
      />
      <Button type="submit" variant="bordered" size="sm">
        さがす
      </Button>
    </form>
  );
}
