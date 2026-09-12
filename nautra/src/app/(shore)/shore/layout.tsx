import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { canShore, type ShorePermission } from "@/domain/authz/shore-roles";
import { PRODUCT_NAME, t } from "@/i18n/ja";
import { DEMO_COMPANY } from "@/lib/crew";
import { currentLaborRuleSet } from "@/server/labor-rules";
import { listVessels, writeAuditLog } from "@/server/master-service";
import { clearShoreSession, getShoreSession, responsibleManager } from "@/server/shore-session";
import { getSyncStats } from "@/server/store";
import { AppShell } from "@/ui";
import { NavLink } from "./_components/nav-link";
import { ShoreTopBar } from "./_components/top-bar";

/**
 * 陸上の画面（括弧内は基本設計書 6.2 の画面ID）。
 * `permission` はそのロールが権限を持つときだけメニューに出す（10.3）。
 * 権限判定は `domain/authz/shore-roles.ts` の表が唯一の情報源で、ここはその結果を使うだけ。
 *
 * 群の分けかたはデザイン正本 `design/poc_design` の `NAV` に合わせる
 * （全体 / 人 / 手続き / 船・運航 / 管理）。デザインの一覧に無い4画面
 * （安全・事故、健康・相談、傭船・経理、記録項目の配信、お知らせ・速報）は
 * 要件定義書 3.5 / 3.6 / 3.7 の対応として**同じ意匠のまま群に併記**する。
 */
const NAV_GROUPS: {
  title: string;
  links: { href: string; label: string; permission?: ShorePermission; alsoActiveOn?: string[] }[];
}[] = [
  {
    title: "全体",
    links: [
      { href: "/shore", label: "ダッシュボード", permission: "view_dashboard" },
      { href: "/shore/labor", label: "労務・記録簿", permission: "view_dashboard" },
    ],
  },
  {
    title: "人",
    links: [
      { href: "/shore/crew", label: "船員", permission: "view_crew" },
      { href: "/shore/crew/new", label: "船員の登録・編集", permission: "edit_crew_master" },
      { href: "/shore/manning", label: "配乗計画", permission: "manage_manning" },
      { href: "/shore/training", label: "訓練", permission: "manage_training" },
      { href: "/shore/shifts", label: "シフト作成", permission: "manage_manning" },
      { href: "/shore/tasks", label: "作業指示・タスク", permission: "manage_manning" },
      { href: "/shore/evaluations", label: "評価・人事考課", permission: "view_evaluation" },
      { href: "/shore/wellbeing", label: "健康・相談", permission: "view_wellbeing" },
    ],
  },
  {
    title: "手続き",
    links: [
      { href: "/shore/filings", label: "届出", permission: "manage_filing" },
      { href: "/shore/procedures", label: "手続き・期限", permission: "manage_procedures" },
      { href: "/shore/documents", label: "帳票・出力", permission: "manage_documents" },
      { href: "/shore/exports", label: "CSV書き出し", permission: "manage_documents" },
    ],
  },
  {
    title: "船・運航",
    links: [
      { href: "/shore/fleet", label: "船舶・保守・検査", permission: "manage_fleet" },
      { href: "/shore/dispatch", label: "配船・位置情報", permission: "manage_dispatch" },
      { href: "/shore/safety", label: "安全・事故", permission: "view_dashboard" },
    ],
  },
  {
    title: "管理",
    links: [
      { href: "/shore/office", label: "傭船・経理", permission: "manage_office" },
      { href: "/shore/templates", label: "記録項目の配信", permission: "view_dashboard" },
      { href: "/shore/notices", label: "お知らせ・速報", permission: "view_dashboard" },
      { href: "/shore/settings", label: "設定・権限・監査", permission: "manage_settings" },
      { href: "/shore/trash", label: "削除・アーカイブ", permission: "manage_settings" },
    ],
  },
];

/**
 * (shore) ルートグループのレイアウト。陸上画面は Server Components を活用する（2.3）。
 *
 * ナビゲーションは **252px の暗いサイドバー**（`#231F20`）。紙面（`#DFE1E0` の上の白カード）と
 * まったく別の層として置くことで、区切り線を足さずに「道具の枠」と「中身」を切り分ける。
 * 画面が20本を超えるため、横一列に畳むと探す作業になってしまうのを避ける狙いもある。
 */
export default async function ShoreLayout({ children }: { children: ReactNode }) {
  const staff = await getShoreSession();
  const manager = responsibleManager();

  async function signOutAction() {
    "use server";
    const s = await getShoreSession();
    if (s) {
      writeAuditLog({
        action: "sign_out",
        entityKind: "shore_session",
        entityId: s.id,
        actor: s.id,
        summary: `${s.name} が陸上アプリからサインアウト`,
      });
    }
    await clearShoreSession();
    redirect("/shore/login");
  }

  /**
   * 未サインインのときはサイドバーもヘッダも出さない
   * （サインイン画面をデザインどおり全面で見せるため）。
   * ただし本文の器（main）は残す。権限ガードの案内が、枠の無い素の文字列になるのを防ぐ。
   */
  if (!staff) {
    return (
      <AppShell theme="shore">
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-10">{children}</main>
      </AppShell>
    );
  }

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    links: g.links.filter((l) => !l.permission || canShore(staff.role, l.permission)),
  })).filter((g) => g.links.length > 0);

  const sync = getSyncStats();
  const ruleVersion = currentLaborRuleSet().version;
  const fleetCount = listVessels().length;

  return (
    <AppShell theme="shore">
      <div className="flex min-h-dvh items-stretch">
        <aside
          aria-label="陸上メニュー"
          className="ui-sidebar sticky top-0 hidden h-dvh w-sidebar flex-none flex-col pb-[18px] pt-[22px] lg:flex"
        >
          <div className="border-b border-[#333333] px-5 pb-[22px]">
            <Link href="/shore" className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-[0.02em] text-white">{PRODUCT_NAME}</span>
            </Link>
            <p className="mt-1.5 text-xs text-[#99877D]">
              {DEMO_COMPANY} ／ 船舶{fleetCount}隻
            </p>
          </div>

          <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
            {groups.map((g) => (
              <div key={g.title} className="flex flex-col gap-px">
                <p className="mb-1.5 px-2 font-mono text-2xs text-[#666666]">{g.title}</p>
                {g.links.map((l) => (
                  <NavLink key={l.href} href={l.href} label={l.label} alsoActiveOn={l.alsoActiveOn} />
                ))}
              </div>
            ))}
          </nav>

          <div className="flex flex-col gap-2.5 border-t border-[#333333] px-5 pt-3.5">
            <Link
              href="/vessel"
              className="flex w-full items-center justify-between rounded-small border border-[#666666] px-3 py-2.5 text-base text-[#DFE1E0]"
            >
              <span>船内アプリへ</span>
              <span aria-hidden="true" className="text-primary">
                →
              </span>
            </Link>
            {/* 承認の最終権限者。誰に上げれば止まっている案件が進むのかを常に見せる（3.2） */}
            <p className="m-0 text-xs leading-normal text-[#666666]">
              {manager.title}
              <br />
              <span className="text-[#99877D]">{manager.name}</span>
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <ShoreTopBar
            staff={{
              name: staff.name,
              title: staff.title,
              role: t.shoreRole[staff.role] ?? staff.role,
              email: staff.email,
              sensitive: canShore(staff.role, "view_sensitive_health"),
            }}
            sync={{ eventCount: sync.eventCount, conflictCount: sync.conflictCount }}
            ruleVersion={ruleVersion}
            signOutAction={signOutAction}
          />

          {/* 狭い画面ではサイドバーを畳み、同じ並び順の横メニューに置き換える */}
          <nav
            aria-label="陸上メニュー（狭い画面）"
            className="ui-bar flex flex-wrap items-center gap-x-3 gap-y-1 px-8 py-2 text-sm lg:hidden"
          >
            {groups
              .flatMap((g) => g.links)
              .map((l) => (
                <Link key={l.href} href={l.href} className="text-foreground-700 hover:underline">
                  {l.label}
                </Link>
              ))}
          </nav>

          <main className="flex flex-1 flex-col gap-5 px-8 pb-11 pt-7">{children}</main>
        </div>
      </div>
    </AppShell>
  );
}
