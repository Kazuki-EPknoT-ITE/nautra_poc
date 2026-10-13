"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/format";
import { useNotices } from "@/lib/vessel-hooks";
import type { NoticePayload } from "@/sync-protocol/records";

/**
 * お知らせ（横タブ V-12。`/vessel`）。
 *
 * **速報とお知らせだけ**を並べる（レビュー NEWS-01）。機能の入口は横タブにあるので、
 * ここに機能メニューや「あなたへの通知」は置かない。
 * 一覧には題名と日時だけを出し、押すと詳細が開く（NEWS-03）。開いたものが既読になるので、
 * 「確認しました」のような一括の操作は置かない（NEWS-02）。
 */
export default function VesselNoticesPage() {
  const { notices, unread } = useNotices();
  const unreadIds = new Set(unread.map((n) => n.id));
  const urgent = notices.filter((n) => n.level === "urgent");
  const info = notices.filter((n) => n.level !== "urgent");

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-4">
      <h1 className="sr-only">お知らせ</h1>
      <NoticeGroup title="速報" urgent items={urgent} unreadIds={unreadIds} empty="速報はありません" />
      <NoticeGroup title="お知らせ" items={info} unreadIds={unreadIds} empty="お知らせはありません" />
    </div>
  );
}

function NoticeGroup({
  title,
  urgent = false,
  items,
  unreadIds,
  empty,
}: {
  title: string;
  urgent?: boolean;
  items: NoticePayload[];
  unreadIds: Set<string>;
  empty: string;
}) {
  return (
    <section aria-label={title} className="ui-card">
      <h2 className="m-0 flex items-center gap-2 border-b border-[var(--ui-hairline-strong)] px-4 py-3 text-xl font-bold text-foreground-900">
        {urgent ? (
          <span aria-hidden="true" className="text-primary">
            ‼
          </span>
        ) : null}
        {title}
        <span className="font-mono text-base font-normal tabular-nums text-foreground-500">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="m-0 px-4 py-5 text-lg text-foreground-500">{empty}</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((n) => {
            const isUnread = unreadIds.has(n.id);
            return (
              <li key={n.id} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                <Link
                  href={`/vessel/notices/${encodeURIComponent(n.id)}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-content2"
                >
                  {/* 未読は点で示す（文字を足さない） */}
                  <span
                    aria-label={isUnread ? "未読" : undefined}
                    className={cn(
                      "h-2.5 w-2.5 flex-none rounded-full",
                      isUnread ? (urgent ? "bg-primary" : "bg-foreground-700") : "bg-transparent",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-lg text-foreground-900",
                        isUnread ? "font-bold" : "font-normal",
                      )}
                    >
                      {n.title}
                    </span>
                    <span className="mt-0.5 block font-mono text-sm tabular-nums text-foreground-500">
                      {fmtDateTime(n.publishedAt)}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-xl text-foreground-500">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
