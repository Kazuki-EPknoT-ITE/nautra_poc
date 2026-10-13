"use client";

import Link from "next/link";

/** カルテの印刷ビューの操作（紙には出さない）。PDF はブラウザの印刷から「PDF に保存」で作る */
export function KartePrintToolbar({ crewMemberId }: { crewMemberId: string }) {
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button type="button" className="ui-btn-primary h-10 px-5" onClick={() => window.print()}>
        PDF で保存・印刷
      </button>
      <Link href={`/shore/crew/${crewMemberId}`} className="ui-btn-ghost h-10 px-4">
        カルテに戻る
      </Link>
      <span className="text-sm text-foreground-500">印刷の画面で「送信先: PDF に保存」を選ぶと PDF になります</span>
    </div>
  );
}
