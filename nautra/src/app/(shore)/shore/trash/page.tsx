import { revalidatePath } from "next/cache";
import { fmtDateTime } from "@/lib/format";
import { personName } from "@/lib/crew";
import { requireShore } from "@/server/shore-session";
import {
  DELETE_RULES,
  listTrash,
  RESTORE_WINDOW_DAYS,
  restoreTrash,
  TRASH_MODE_LABEL,
} from "@/server/trash-service";
import { Section, StatusChip } from "@/ui";
import { ShoreGuardNotice } from "../_components/guard";

export const dynamic = "force-dynamic";

/**
 * S-18 削除・アーカイブ（デザイン正本 `design/poc_design`）。
 *
 * このアプリの「消す」は一次記録を消さない。何が外れ、何が残るかを操作の**あと**にも
 * 読めるようにし、30日以内なら元に戻せる。ここは要件定義書 12（正本管理・監査証跡）を
 * 利用者の目線で見せる画面で、ゴミ箱というより「取り消しの控え」に近い。
 */
export default async function ShoreTrashPage() {
  const guard = await requireShore("manage_settings");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="削除・アーカイブ" />;

  async function restoreAction(formData: FormData) {
    "use server";
    const g = await requireShore("manage_settings");
    if (!g.ok) return;
    restoreTrash(String(formData.get("entryId") ?? ""), g.staff.id);
    revalidatePath("/shore/trash");
  }

  const rows = listTrash();

  return (
    <>
      <section className="ui-dark flex items-center gap-6 px-[22px] py-[18px]">
        <div className="flex-1">
          <h2 className="m-0 text-xl font-bold text-white">{RESTORE_WINDOW_DAYS}日以内なら元に戻せます</h2>
          <p className="m-0 mt-1.5 text-xs leading-relaxed text-[#DFE1E0]">
            削除・無効化は「一覧から外す」操作です。打刻・日次レコード・届出などの一次記録は、
            法定保存期間のあいだ残り続けます（要件定義書 12）。
          </p>
        </div>
        <div className="text-right">
          <p className="m-0 text-xs text-[#99877D]">保持期間</p>
          <p className="m-0 mt-1 font-mono text-4xl font-semibold leading-none text-white">
            {RESTORE_WINDOW_DAYS} 日
          </p>
        </div>
      </section>

      <Section title="削除・アーカイブしたもの" note={`${rows.length}件`} bodyClassName="p-0">
        {rows.length === 0 ? (
          <p className="m-0 px-[18px] py-6 text-sm text-foreground-500">
            削除・アーカイブしたものはありません。
          </p>
        ) : (
          <div>
            {rows.map((r) => (
              <div
                key={r.entry.id}
                className="flex flex-wrap items-center gap-4 border-b border-[var(--ui-hairline)] px-[18px] py-3.5 last:border-b-0"
              >
                <span className="inline-flex flex-none items-center rounded-small bg-default-100 px-2.5 py-1 text-xs font-semibold text-foreground-700">
                  {r.entry.entityKind}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-lg font-bold text-foreground-900">{r.entry.entityLabel}</p>
                  <p className="m-0 mt-[3px] text-xs text-foreground-500">
                    {r.entry.action} ／ {TRASH_MODE_LABEL[r.entry.mode]} ／{" "}
                    {fmtDateTime(r.entry.occurredAt)} ／ {personName(r.entry.publishedBy)}
                  </p>
                  <p className="m-0 mt-0.5 text-xs text-foreground-400">{r.entry.effect}</p>
                </div>
                <StatusChip
                  level={r.entry.restoredAt ? "ok" : r.restorable ? (r.daysLeft <= 7 ? "caution" : "none") : "violation"}
                  size="sm"
                  label={
                    r.entry.restoredAt
                      ? "復元済み"
                      : r.restorable
                        ? `あと${r.daysLeft}日`
                        : "復元期限切れ"
                  }
                />
                {r.restorable ? (
                  <form action={restoreAction}>
                    <input type="hidden" name="entryId" value={r.entry.id} />
                    <button type="submit" className="ui-btn-primary h-8 text-xs">
                      元に戻す
                    </button>
                  </form>
                ) : (
                  <span className="ui-btn-ghost h-8 cursor-not-allowed text-xs font-normal opacity-45">
                    元に戻す
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="削除するとどうなるか" bodyClassName="p-0">
        {DELETE_RULES.map((d) => (
          <div
            key={d.kind}
            className="flex flex-wrap gap-4 border-b border-[var(--ui-hairline)] px-[18px] py-3.5 last:border-b-0"
          >
            <span className="flex-none basis-20 text-base font-bold text-foreground-800">{d.kind}</span>
            <span className="min-w-0 flex-1 text-sm leading-loose text-foreground-700">
              {d.effects.map((e) => (
                <span key={e} className="block">
                  ・{e}
                </span>
              ))}
            </span>
            <span className="flex-none basis-[300px] text-sm leading-loose text-primary">{d.advice}</span>
          </div>
        ))}
      </Section>
    </>
  );
}
