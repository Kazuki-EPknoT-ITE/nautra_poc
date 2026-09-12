"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { DataTable, DeleteDialog, FlashToast, SearchField, StatusChip } from "@/ui";
import {
  changeUserRoleAction,
  disableUserAction,
  inviteUserAction,
  type SettingsFormState,
} from "../actions";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  /** ロールのキー（変更を送るときに使う） */
  roleKey: string;
  /** ロールの表示名 */
  role: string;
  title: string;
  status: "invited" | "active" | "disabled";
  scope: string;
  /** 招待中のあいだだけ入る。本人へ渡すコード */
  inviteCode?: string;
  /** サインイン中の本人 */
  current: boolean;
  sensitive: boolean;
}

const INITIAL: SettingsFormState = { ok: false, message: "" };

const STATUS_LABEL: Record<UserRow["status"], { level: "ok" | "caution" | "none"; label: string }> = {
  active: { level: "ok", label: "有効" },
  invited: { level: "caution", label: "招待中（未登録）" },
  disabled: { level: "none", label: "無効" },
};

/**
 * S-15 ユーザー管理（デザイン正本 `design/poc_design`）。
 *
 * **ロールは招待した管理者が決める**（利用者が選ぶものではない）ので、招待の欄と
 * 行の中にロールを置く。招待中（未登録）は状態の札で区別し、行を消さない——
 * 「送ったのに返事がない」ことが見えるようにするため。
 *
 * 招待は**アカウントの実体を作る**。メール送信経路が無いので、招待コードをこの画面に出し、
 * 管理者が本人へ渡す。本人はサインイン画面の「新規登録」でコードとパスワードを入れる。
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [invite, inviteAction, inviting] = useActionState(inviteUserAction, INITIAL);
  const [flash, setFlash] = useState<string | null>(null);
  const [target, setTarget] = useState<UserRow | null>(null);
  const [mode, setMode] = useState("disable");
  const [, startTransition] = useTransition();

  const visible = query
    ? users.filter((u) => (u.name + u.email + u.role + u.title).includes(query))
    : users;

  function run(work: Promise<SettingsFormState>) {
    startTransition(async () => {
      const res = await work;
      setFlash(res.message);
      if (res.ok) router.refresh();
    });
  }

  return (
    <section id="users" aria-label="ユーザー" className="ui-card scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ui-hairline-strong)] px-[18px] py-3.5">
        <h2 className="m-0 text-lg font-bold text-foreground-900">ユーザー</h2>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="氏名・メール・ロールでしぼる"
          className="min-w-[190px] max-w-[280px] flex-1"
        />
        <button type="button" onClick={() => setOpen((v) => !v)} className="ui-btn-primary h-[34px] text-xs">
          {open ? "閉じる" : "＋ ユーザーを招待"}
        </button>
      </div>

      {open ? (
        <form
          action={inviteAction}
          className="grid items-end gap-2.5 border-b border-[var(--ui-hairline)] bg-content2 px-[18px] py-3.5 lg:grid-cols-[1.4fr_1fr_1fr_1fr_108px]"
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
            <span className="mb-1 block text-xs text-foreground-500">氏名（任意）</span>
            <input name="name" placeholder="例）新谷 実" className="ui-field py-2 text-sm" />
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
          <button type="submit" disabled={inviting} className="ui-btn-primary h-9 text-xs">
            招待を送る
          </button>
          {invite.message ? (
            <p
              className={cn(
                "m-0 text-sm lg:col-span-5",
                invite.ok ? "font-semibold text-foreground-800" : "text-danger",
              )}
            >
              {invite.ok ? "✓ " : "✕ "}
              {invite.message}
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
            <th className="w-[92px]">操作</th>
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
              {u.inviteCode ? (
                <span className="mt-1 block text-xs text-foreground-500">
                  招待コード <span className="font-mono text-primary">{u.inviteCode}</span> を本人へ
                </span>
              ) : null}
            </td>
            <td>
              {/* ロールは管理者が決める。選び直して「変更」で送る（利用者側には出さない） */}
              <div className="flex items-center gap-1.5">
                <select
                  defaultValue={u.roleKey}
                  aria-label={`${u.name} のロール`}
                  className="ui-field h-8 w-[128px] py-0 text-xs"
                  onChange={(e) => {
                    const role = e.target.value;
                    if (role !== u.roleKey) run(changeUserRoleAction(u.id, role));
                  }}
                >
                  {roles.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <span className="mt-0.5 block text-xs text-foreground-400">
                {u.title || "—"}
                {u.scope && u.scope !== "all" ? ` ／ ${u.scope} のみ` : ""}
              </span>
            </td>
            <td>
              <StatusChip level={u.sensitive ? "ok" : "none"} size="sm" label={u.sensitive ? "閲覧可" : "非表示"} />
            </td>
            <td>
              <StatusChip
                level={STATUS_LABEL[u.status].level}
                size="sm"
                label={STATUS_LABEL[u.status].label}
              />
            </td>
            <td>
              {u.current ? (
                <span className="text-xs text-foreground-400">—</span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMode("disable");
                    setTarget(u);
                  }}
                  className="ui-btn-quiet text-danger"
                >
                  無効化
                </button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>

      <DeleteDialog
        open={target !== null}
        kind="ユーザー"
        name={target ? `${target.name}（${target.role}）` : ""}
        modes={[
          { value: "disable", label: "無効化（推奨）" },
          { value: "delete", label: "アカウントを削除" },
        ]}
        mode={mode}
        onModeChange={setMode}
        effects={[
          "ただちにサインインできなくなります",
          "その人が行った承認・書き出しの監査ログは残ります",
          "承認まちの案件は、別の担当者へ引き継いでください",
        ]}
        runLabel={mode === "delete" ? "削除を実行する" : "この内容で無効化する"}
        onCancel={() => setTarget(null)}
        onRun={() => {
          const u = target;
          setTarget(null);
          if (u) run(disableUserAction(u.id, mode === "delete" ? "delete" : "disable"));
        }}
      />

      <FlashToast message={flash} onDone={() => setFlash(null)} />

      <p className="m-0 border-t border-[var(--ui-hairline)] px-[18px] py-3 text-xs text-foreground-500">
        ロールは招待した管理者が決めます（利用者は選べません）。招待するとアカウントができ、
        本人がサインイン画面の「新規登録」で招待コードとパスワードを入れると使えるようになります。
        無効化したユーザーは「削除・アーカイブ」から30日以内なら戻せます。
        PoC の簡略化: 招待メールは送らず、招待コードをこの画面に出して手渡しします。本番は
        Supabase Auth（管理者は多要素認証）と行レベルのアクセス制御を併用します（基本設計書 11.3）。
      </p>
    </section>
  );
}
