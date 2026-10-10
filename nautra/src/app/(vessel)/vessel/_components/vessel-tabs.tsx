"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { can, type Permission } from "@/domain/authz/roles";
import { cn } from "@/lib/cn";
import { pendingProposals } from "@/lib/labor-proposals";
import { useApprovals, useCrewRecords, useSessionCrew } from "@/lib/vessel-hooks";

/**
 * 船内のタブ（デザイン正本 `design/poc_design` の `VESSEL_TABS`）。
 *
 * 共用タブレットは**横幅を記録に使う**ため、サイドバーを置かずヘッダ直下の横一列にする。
 * 現在地は下辺 3px のブロンズ線で示す（塗りにすると、隣のタブと押し間違えたときに
 * 気づきにくいため）。1画面1目的を保ったまま、どこからでも1タップで移れる。
 *
 * デザインの10タブに、要件定義書 3.5「安全（操練・アルコール検知）」と 3.7「お知らせ」の
 * 2つを足した12本。承認は船長だけに出す（権限の無い画面はタブごと出さない。11.2）。
 */
const TABS: { id: string; label: string; href: string; permission?: Permission; alsoActiveOn?: string[] }[] = [
  { id: "V-01", label: "打刻", href: "/vessel/punch" },
  { id: "V-02", label: "履歴", href: "/vessel/history" },
  { id: "V-03", label: "労働", href: "/vessel/ledger" },
  { id: "V-04", label: "承認", href: "/vessel/approve", permission: "approve_labor" },
  { id: "V-05", label: "日誌", href: "/vessel/logbook" },
  { id: "V-06", label: "点検", href: "/vessel/maintenance" },
  { id: "V-07", label: "作業記録", href: "/vessel/work" },
  { id: "V-08", label: "配置表", href: "/vessel/shift" },
  { id: "V-09", label: "同期", href: "/vessel/sync" },
  { id: "V-10", label: "相談", href: "/vessel/wellbeing" },
  { id: "V-11", label: "安全", href: "/vessel/safety", alsoActiveOn: ["/vessel/incident"] },
  { id: "V-12", label: "お知らせ", href: "/vessel" },
];

/** タブが指す先（先読みに使う） */
export const VESSEL_TAB_HREFS = TABS.map((x) => x.href);

export function VesselTabs() {
  const pathname = usePathname();
  const session = useSessionCrew();
  // 陸上からの修正の依頼（LABOR-06）は履歴タブの件数で知らせる（開くまで気付かない、を防ぐ）
  const approvals = useApprovals();
  const myRecords = useCrewRecords(session?.id ?? "");
  const proposalCount = session ? pendingProposals(approvals, myRecords, session.id).length : 0;
  if (!session) return null;

  const visible = TABS.filter((x) => !x.permission || can(session.role, x.permission));

  return (
    <nav aria-label="船内メニュー" className="ui-bar flex flex-none overflow-x-auto">
      {visible.map((x) => {
        // お知らせの詳細（/vessel/notices/…）を開いているときも「お知らせ」を現在地にする
        const active =
          x.href === "/vessel"
            ? pathname === "/vessel" || pathname.startsWith("/vessel/notices")
            : pathname.startsWith(x.href) || (x.alsoActiveOn ?? []).some((p) => pathname.startsWith(p));
        return (
          <Link
            key={x.id}
            href={x.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center border-b-[3px] border-r border-r-default-100 px-2 py-[15px] text-xl font-bold transition-colors",
              active ? "border-b-primary text-foreground-900" : "border-b-transparent text-foreground-500",
            )}
          >
            {x.label}
            {x.id === "V-02" && proposalCount > 0 ? (
              <span
                aria-label={`修正の依頼 ${proposalCount}件`}
                className="ml-1.5 rounded-full bg-primary px-1.5 font-mono text-sm leading-5 text-primary-foreground"
              >
                {proposalCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
