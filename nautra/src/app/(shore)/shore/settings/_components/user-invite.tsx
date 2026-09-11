"use client";

import { useActionState, useState } from "react";
import { cn } from "@/lib/cn";
import { DataTable, StatusChip } from "@/ui";
import { inviteUserAction, type SettingsFormState } from "../actions";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  title: string;
  /** 招待したが未ログイン */
  pending: boolean;
  /** サインイン中の本人 */
  current: boolean;
  sensitive: boolean;
}

const INITIAL: SettingsFormState = { ok: false, message: "" };

/**
 * S-15 ユーザー管理（デザイン正本 `design/poc_design`）。
 *
 * **ロールは招待した管理者が決める**（利用者が選ぶものではない）ので、招待の欄に
 * ロールを置く。招待中（未ログイン）は状態の札で区別し、行を消さない——
 * 「送ったのに返事がない」ことが見えるようにするため。
 *
 * PoC の簡略化: 招待メールは送らず、アカウントの一覧に「招待中」として並べるところまで。
 */
export function UserInvitePanel({
  users,
  roles,
  vessels,
}: {
  users: UserRow[];
  roles: { value: string; label: string }[];
  vessels: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [state, formAction, pending] = useActionState(inviteUserAction, INITIAL);

  const visible = query
    ? users.filter((u) => (u.name + u.email + u.role + u.title).includes(query))
    : users;

  return (
    <section id="users" aria-label="ユーザー" className="ui-card scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ui-hairline-strong)] px-[18px] py-3.5">
        <h2 className="m-0 text-lg font-bold text-foreground-900">ユーザー</h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="氏名・メール・ロールでしぼる"
          className="h-8 min-w-[190px] max-w-[280px] flex-1 rounded-small border border-[var(--ui-hairline-strong)] bg-content1 px-2.5 text-sm"
        />
        <button type="button" onClick={() => setOpen((v) => !v)} className="ui-btn-primary h-[34px] text-xs">
          {open ? "閉じる" : "＋ ユーザーを招待"}
        </button>
      </div>

      {open ? (
        <form
          action={formAction}
          className="grid items-end gap-2.5 border-b border-[var(--ui-hairline)] bg-content2 px-[18px] py-3.5 lg:grid-cols-[1.4fr_1fr_1fr_108px]"
        >
          <label className="block">
            <span className="mb-1 block text-xs text-foreground-500">メールアドレス</span>
            <input
              name="email"
              type="email"
              required
              placeholder="例）shintani@shoun-kaiun.co.jp"
              className="ui-field py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-foreground-500">ロール</span>
            <select name="role" className="ui-field py-2 text-sm">
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-foreground-500">扱える船</span>
            <select name="scope" className="ui-field py-2 text-sm">
              <option value="all">すべての船</option>
              {vessels.map((v) => (
                <option key={v} value={v}>
                  {v} のみ
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={pending} className="ui-btn-primary h-9 text-xs">
            招待を送る
          </button>
          {state.message ? (
            <p
              className={cn(
                "m-0 text-sm lg:col-span-4",
                state.ok ? "font-semibold text-foreground-800" : "text-danger",
              )}
            >
              {state.ok ? "✓ " : "✕ "}
              {state.message}
            </p>
          ) : null}
        </form>
      ) : null}

      <DataTable
        isEmpty={visible.length === 0}
        empty="該当するユーザーはいません。"
        maxHeight={460}
        head={
          <>
            <th>ユーザー</th>
            <th>ロール</th>
            <th>要配慮情報</th>
            <th>状態</th>
          </>
        }
      >
        {visible.map((u) => (
          <tr key={u.id}>
            <td>
              <span className="block text-base text-foreground-800">
                {u.name}
                {u.current ? (
                  <span className="ml-1.5 text-xs text-foreground-400">（サインイン中）</span>
                ) : null}
              </span>
              <span className="mt-0.5 block font-mono text-xs text-foreground-400">{u.email}</span>
            </td>
            <td>
              {u.role}
              <span className="ml-1.5 text-xs text-foreground-400">{u.title}</span>
            </td>
            <td>
              <StatusChip level={u.sensitive ? "ok" : "none"} size="sm" label={u.sensitive ? "閲覧可" : "非表示"} />
            </td>
            <td>
              <StatusChip
                level={u.pending ? "caution" : "ok"}
                size="sm"
                label={u.pending ? "招待中（未ログイン）" : "有効"}
              />
            </td>
          </tr>
        ))}
      </DataTable>

      <p className="m-0 border-t border-[var(--ui-hairline)] px-[18px] py-3 text-xs text-foreground-500">
        ロールは招待した管理者が決めます（利用者は選べません）。PoC は招待メールを送らず、
        一覧に「招待中」として並べるところまでです。本番は Supabase Auth（管理者は多要素認証）と
        行レベルのアクセス制御を併用します（基本設計書 11.3）。
      </p>
    </section>
  );
}
