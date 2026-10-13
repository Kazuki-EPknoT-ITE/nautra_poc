"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { fmtDateTime } from "@/lib/format";
import { markNoticeRead } from "@/lib/vessel-actions";
import { useNotices } from "@/lib/vessel-hooks";

/**
 * 速報・お知らせの詳細（レビュー NEWS-03）。
 *
 * 一覧には題名だけを出し、本文はここで読む。**開いた時点で既読**にする
 * （「確認しました」を押させない。NEWS-02）。データは端末内の写しから読むので、
 * 通信が切れていても開ける（ガードレール①。サーバでは組み立てない）。
 */
export default function VesselNoticeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { notices } = useNotices();
  const notice = notices.find((n) => n.id === id);

  useEffect(() => {
    if (notice) void markNoticeRead(notice.id);
  }, [notice]);

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-4">
      <Link href="/vessel" className="ui-btn-ghost min-h-12 self-start px-4 text-lg">
        <span aria-hidden="true">←</span> お知らせ
      </Link>

      {notice ? (
        <article className="ui-card px-6 py-5">
          <p className="m-0 flex items-center gap-2 text-base">
            <span
              className={
                notice.level === "urgent"
                  ? "rounded-small bg-primary px-2 py-0.5 font-bold text-primary-foreground"
                  : "rounded-small bg-content2 px-2 py-0.5 text-foreground-700"
              }
            >
              {notice.level === "urgent" ? "‼ 速報" : "お知らせ"}
            </span>
            <span className="font-mono tabular-nums text-foreground-500">{fmtDateTime(notice.publishedAt)}</span>
          </p>
          <h1 className="m-0 mt-3 text-3xl font-bold leading-snug text-foreground-900">{notice.title}</h1>
          {notice.body ? (
            <p className="m-0 mt-4 whitespace-pre-wrap text-xl leading-relaxed text-foreground-800">{notice.body}</p>
          ) : null}
        </article>
      ) : (
        <p className="ui-card m-0 px-6 py-5 text-lg text-foreground-500">
          このお知らせは見つかりませんでした（取り消されたか、期限が過ぎています）。
        </p>
      )}
    </div>
  );
}
