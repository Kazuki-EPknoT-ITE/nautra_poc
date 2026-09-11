"use client";

import { Button, SearchField } from "@/ui";

/**
 * S-02 の氏名検索。
 * 絞り込みの状態は URL の searchParams に持たせ、一覧は Server Component のまま組み立てる
 * （陸上画面はサーバで組み立てる方針。基本設計書 2.3）。
 */
export function CrewSearchForm({ status, q }: { status: string; q: string }) {
  return (
    <form action="/shore/crew" method="get" className="flex items-center gap-2">
      {status && status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
      <SearchField
        name="q"
        defaultValue={q}
        placeholder="氏名・フリガナでさがす"
        className="w-60"
      />
      <Button type="submit" variant="bordered" size="sm">
        さがす
      </Button>
    </form>
  );
}
