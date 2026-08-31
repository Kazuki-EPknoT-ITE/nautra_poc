import { personName } from "@/lib/crew";
import { fmtDateTime } from "@/lib/format";
import { getNoticeHistory, getNotices } from "@/server/notice-service";
import { NoticeForm, type NoticeOption } from "./_components/notice-form";

export const dynamic = "force-dynamic";

/**
 * 船内へのお知らせ・速報の配信（PoC）。
 * 配信したお知らせは同期で船内へ届き、機能メニュー右側のお知らせ欄に表示される。
 */
export default function ShoreNoticesPage() {
  const notices = getNotices();
  const history = getNoticeHistory();
  const options: NoticeOption[] = notices.map((n) => ({
    id: n.id,
    label: `${n.level === "urgent" ? "速報" : "お知らせ"}: ${n.title}（${fmtDateTime(n.publishedAt)}）`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">船内へのお知らせ・速報</h1>
        <p className="text-sm text-foreground-500">
          配信すると船内のメニュー右側に表示されます（船内からは配信できません）。
        </p>
      </div>

      <NoticeForm options={options} />

      <section aria-label="表示中のお知らせ" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">いま船内に表示されているもの</h2>
        {notices.length === 0 ? (
          <p className="text-sm text-foreground-500">表示中のお知らせはありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notices.map((n) => (
              <li key={n.id} className="border-b border-[var(--glass-border)] pb-2 last:border-b-0">
                <p className="font-semibold">
                  {n.level === "urgent" ? "‼ 速報: " : ""}
                  {n.title}
                </p>
                {n.body ? <p className="text-sm text-foreground-500">{n.body}</p> : null}
                <p className="text-xs text-foreground-500">
                  {fmtDateTime(n.publishedAt)} / {personName(n.publishedBy)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="配信履歴" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">配信履歴（訂正・取り消しを含む）</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {history.slice(0, 20).map((n) => (
            <li key={n.id} className="flex flex-wrap gap-2">
              <span className="tabular-nums text-foreground-500">{fmtDateTime(n.publishedAt)}</span>
              <span>{n.level === "urgent" ? "速報" : "お知らせ"}</span>
              <span className="font-semibold">{n.title}</span>
              {n.supersedesId ? <span className="text-foreground-500">（訂正）</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
