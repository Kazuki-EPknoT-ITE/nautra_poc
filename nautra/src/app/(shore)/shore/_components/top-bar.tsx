"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { parentOf, screenMeta } from "./screen-meta";

/**
 * 陸上ヘッダ（デザイン正本 `design/poc_design`）。高さ 64px の白い帯。
 *
 * 左は「← 親画面」と「画面名」だけ。右はサインイン中の人のメニュー。
 * 受信件数・競合件数・ルール版の札は**出さない**（レビュー LABOR-01。利用者には意味が通じない）。
 */
export function ShoreTopBar({
  staff,
  signOutAction,
}: {
  staff: { name: string; title: string; role: string; email: string; sensitive: boolean } | null;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const meta = screenMeta(pathname);
  const back = parentOf(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className="ui-bar sticky top-0 z-30 flex h-topbar items-center justify-between gap-6 px-8">
      <div className="flex min-w-0 items-center gap-3.5">
        {back ? (
          <Link
            href={back.href}
            title={`${back.label}へ戻る`}
            className="ui-btn-ghost h-[34px] flex-none px-3 text-xs"
          >
            <span aria-hidden="true" className="text-base leading-none">
              ←
            </span>
            <span className="max-w-[150px] truncate">{back.label}</span>
          </Link>
        ) : null}
        <h1 className="m-0 whitespace-nowrap text-2xl font-bold text-foreground-900">{meta.title}</h1>
      </div>

      <div className="flex flex-none items-center gap-2.5">

        {staff ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2 rounded-small border border-[var(--ui-hairline)] py-1 pl-1 pr-2"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#231F20] text-sm font-bold text-[#DFE1E0]">
                {staff.name.slice(0, 1)}
              </span>
              <span className="block text-left">
                <span className="block text-sm font-bold text-foreground-800">{staff.name}</span>
                <span className="block text-2xs tracking-normal text-foreground-400">{staff.title}</span>
              </span>
              <span aria-hidden="true" className="text-2xs tracking-normal text-foreground-500">
                ▾
              </span>
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-11 z-40 overflow-hidden rounded-large border border-[var(--ui-hairline-strong)] bg-content1 shadow-menu"
                style={{ width: 248 }}
              >
                <div className="border-b border-[var(--ui-hairline)] px-4 py-3.5">
                  <p className="m-0 text-base font-bold text-foreground-900">{staff.name}</p>
                  <p className="m-0 mt-[3px] font-mono text-xs text-foreground-400">{staff.email}</p>
                  <p className="m-0 mt-1.5 text-xs text-foreground-500">
                    ロール：{staff.role} ／ 要配慮情報 {staff.sensitive ? "閲覧可" : "非表示"}
                  </p>
                </div>
                <Link
                  href="/shore/settings"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block w-full border-b border-[var(--ui-hairline)] px-4 py-3 text-left text-base text-foreground-700 hover:bg-content2"
                >
                  設定・権限・監査を開く
                </Link>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    role="menuitem"
                    className="block w-full px-4 py-3 text-left text-base font-bold text-danger hover:bg-content2"
                  >
                    ログアウト
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        ) : (
          <Link href="/shore/login" className="ui-btn-primary h-[34px]">
            サインイン
          </Link>
        )}
      </div>
    </header>
  );
}
