"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";

type Tab = "login" | "register" | "reset";

const TABS: { id: Tab; label: string }[] = [
  { id: "login", label: "サインイン" },
  { id: "register", label: "新規登録" },
  { id: "reset", label: "パスワード再設定" },
];

/**
 * サインインのカード（デザイン正本 `design/poc_design` の `authTabs`）。
 *
 * 3つの用件を1枚のカードのタブで切り替える。画面を分けないのは、招待された人が
 * 最初に開くのがこのカードで、そこから迷わず登録・再設定へ行ければ十分だから。
 *
 * PoC の簡略化: パスワードはデモ値の平文比較。**どのアカウントで入ると何が見えるか**が
 * デモの要点なので、選べるアカウントとその合言葉をカードの下に明示する。
 */
export function SignInPanel({
  tab,
  error,
  sent,
  email,
  demoAccounts,
  signInAction,
  registerAction,
  resetAction,
}: {
  tab: Tab;
  error: string | null;
  sent: boolean;
  email: string;
  demoAccounts: { email: string; name: string; title: string; password: string }[];
  signInAction: (formData: FormData) => Promise<void>;
  registerAction: (formData: FormData) => Promise<void>;
  resetAction: (formData: FormData) => Promise<void>;
}) {
  const [active, setActive] = useState<Tab>(tab);
  const [value, setValue] = useState(email);
  const demoPassword = demoAccounts[0]?.password ?? "";

  return (
    <div className="rounded-[6px] bg-content1 px-[30px] py-7">
      <div className="mb-5 flex gap-2">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setActive(x.id)}
            aria-pressed={active === x.id}
            className={cn(
              "h-9 flex-1 rounded-small border text-sm",
              active === x.id
                ? "border-primary bg-primary font-bold text-primary-foreground"
                : "border-[var(--ui-hairline-strong)] bg-content1 text-foreground-700",
            )}
          >
            {x.label}
          </button>
        ))}
      </div>

      {error === "invalid" ? (
        <p className="mb-3.5 rounded-small bg-danger-100 px-3.5 py-3 text-sm text-danger">
          メールアドレスかパスワードが違います。下のデモ用アカウントでお試しください。
        </p>
      ) : null}
      {error === "unknown_invite" ? (
        <p className="mb-3.5 rounded-small bg-danger-100 px-3.5 py-3 text-sm text-danger">
          この招待コード・メールアドレスの組み合わせは見つかりませんでした。
        </p>
      ) : null}
      {sent ? (
        <p className="mb-3.5 rounded-small bg-warning-100 px-3.5 py-3 text-sm text-warning-700">
          再設定リンクを送信した扱いにしました（PoC はメール送信経路が未接続です）。
        </p>
      ) : null}

      {active === "login" ? (
        <form action={signInAction} className="flex flex-col gap-3.5">
          <label className="block">
            <span className="mb-[5px] block text-sm text-foreground-500">メールアドレス</span>
            <input
              name="email"
              type="email"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="ui-field font-mono"
            />
          </label>
          <label className="block">
            <span className="mb-[5px] block text-sm text-foreground-500">パスワード</span>
            <input
              name="password"
              type="password"
              required
              defaultValue={demoPassword}
              className="ui-field font-mono tracking-[0.2em]"
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-foreground-700">
              <input type="checkbox" name="remember" defaultChecked className="h-[18px] w-[18px]" />
              この端末を記憶する
            </label>
            <button
              type="button"
              onClick={() => setActive("reset")}
              className="text-sm text-primary underline"
            >
              パスワードを忘れた
            </button>
          </div>
          <button type="submit" className="ui-btn-primary h-[50px] w-full text-xl">
            サインイン
          </button>
        </form>
      ) : null}

      {active === "register" ? (
        <form action={registerAction} className="flex flex-col gap-3.5">
          <label className="block">
            <span className="mb-[5px] block text-sm text-foreground-500">招待コード</span>
            <input name="invite" defaultValue="NTR-8F42-QK19" className="ui-field font-mono" />
          </label>
          <label className="block">
            <span className="mb-[5px] block text-sm text-foreground-500">氏名</span>
            <input name="name" placeholder="例）新谷 実" className="ui-field" />
          </label>
          <label className="block">
            <span className="mb-[5px] block text-sm text-foreground-500">メールアドレス</span>
            <input
              name="email"
              type="email"
              required
              defaultValue="shintani@shoun-kaiun.co.jp"
              className="ui-field font-mono"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-[5px] block text-sm text-foreground-500">パスワード</span>
              <input name="password" type="password" className="ui-field font-mono tracking-[0.2em]" />
            </label>
            <label className="block">
              <span className="mb-[5px] block text-sm text-foreground-500">パスワード（確認）</span>
              <input name="password2" type="password" className="ui-field font-mono tracking-[0.2em]" />
            </label>
          </div>
          <p className="m-0 text-xs leading-relaxed text-foreground-400">
            12文字以上・英大文字小文字と数字を含めてください。付与されるロールは招待した
            管理者が決めます（利用者は選べません）。
          </p>
          <button type="submit" className="ui-btn-primary h-[50px] w-full text-xl">
            登録してサインイン
          </button>
        </form>
      ) : null}

      {active === "reset" ? (
        <form action={resetAction} className="flex flex-col gap-3.5">
          <label className="block">
            <span className="mb-[5px] block text-sm text-foreground-500">メールアドレス</span>
            <input name="email" type="email" required defaultValue={value} className="ui-field font-mono" />
          </label>
          <button type="submit" className="ui-btn-primary h-[50px] w-full text-xl">
            再設定リンクを送る
          </button>
          <button
            type="button"
            onClick={() => setActive("login")}
            className="ui-btn-ghost h-11 w-full font-normal"
          >
            サインインに戻る
          </button>
        </form>
      ) : null}

      <div className="mt-5 border-t border-[var(--ui-hairline)] pt-4">
        <p className="m-0 text-xs text-foreground-500">
          デモ用アカウント（パスワードは共通 <code className="font-mono">{demoPassword}</code>）。
          押すとメール欄に入ります。
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {demoAccounts.map((a) => (
            <button
              key={a.email}
              type="button"
              onClick={() => {
                setActive("login");
                setValue(a.email);
              }}
              className="ui-btn-quiet"
            >
              {a.name}
              <span className="text-foreground-400">／{a.title}</span>
            </button>
          ))}
        </div>
        <p className="m-0 mt-3 text-xs leading-relaxed text-foreground-400">
          PoC の簡略化: パスワードはデモ値です。本番は Supabase Auth（管理者ロールは MFA）と
          RLS によるテナント・行レベルの制御を併用します。権限判定の経路（
          <code className="font-mono">domain/authz/shore-roles.ts</code>）は本番と同じです。
          <Link href="/" className="ml-1 text-primary underline">
            入口へ戻る
          </Link>
        </p>
      </div>
    </div>
  );
}
