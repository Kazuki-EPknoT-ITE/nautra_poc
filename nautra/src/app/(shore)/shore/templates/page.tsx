import { t } from "@/i18n/ja";
import { personName } from "@/lib/crew";
import { fmtDateTime } from "@/lib/format";
import { getTemplateOverview } from "@/server/template-service";
import { VOYAGE_LOG_TYPES } from "@/sync-protocol/records";
import { TemplateItemForm, type TemplateTargetOption } from "./_components/template-item-form";

export const dynamic = "force-dynamic";

const USAGE_LABEL = { checklist: "点検表", voyage_log: "航海日誌" } as const;
const INPUT_LABEL = { check: "良否", number: "数値", text: "文章" } as const;

/**
 * 記録項目の配信（S-10 の一部・PoC）。点検表と航海日誌の記録項目を陸上から追加する。
 * 追加は新しい版の配信として追記され、船内は次回同期で新しい項目を表示する。
 */
export default function ShoreTemplatesPage() {
  const overview = getTemplateOverview();
  const options: TemplateTargetOption[] = [];
  for (const o of overview) {
    for (const tpl of o.templates) {
      options.push({
        value: `${o.usage}|${tpl.templateKey}|${tpl.name}`,
        label: `${USAGE_LABEL[o.usage]}: ${tpl.name}（版 ${tpl.version} / ${tpl.items.length}項目）`,
      });
    }
  }
  // まだ項目が配信されていない航海日誌の記録種別も追加先として選べるようにする
  const existingVoyageKeys = new Set(
    overview.find((o) => o.usage === "voyage_log")?.templates.map((tpl) => tpl.templateKey) ?? [],
  );
  for (const lt of VOYAGE_LOG_TYPES) {
    if (existingVoyageKeys.has(lt)) continue;
    options.push({
      value: `voyage_log|${lt}|航海日誌: ${t.voyageLogType[lt]}`,
      label: `航海日誌: ${t.voyageLogType[lt]}（未配信 / 0項目）`,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">記録項目の配信（点検表・航海日誌）</h1>
        <p className="text-sm text-foreground-500">
          追加は新しい版として配信され、過去の記録は当時の版のまま保持されます。
        </p>
      </div>

      <TemplateItemForm options={options} />

      {overview.map((o) => (
        <section key={o.usage} aria-label={`${USAGE_LABEL[o.usage]}のテンプレート`} className="glass-tile p-4">
          <h2 className="mb-3 font-bold">{USAGE_LABEL[o.usage]}（有効な版）</h2>
          {o.templates.length === 0 ? (
            <p className="text-sm text-foreground-500">配信済みの項目はありません。</p>
          ) : (
            <div className="flex flex-col gap-4">
              {o.templates.map((tpl) => (
                <div key={tpl.id}>
                  <p className="font-semibold">
                    {tpl.name}
                    <span className="ml-2 text-sm font-normal text-foreground-500">
                      版 {tpl.version} / {tpl.items.length}項目 / 配信 {fmtDateTime(tpl.publishedAt)}（
                      {personName(tpl.publishedBy)}）
                    </span>
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {tpl.items.map((it) => (
                      <li key={it.key}>
                        <span className="text-foreground-500">[{it.group}]</span> {it.label}
                        <span className="ml-1 text-foreground-500">
                          （{INPUT_LABEL[it.inputType]}
                          {it.unit ? ` ${it.unit}` : ""}）
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      <section aria-label="配信履歴" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">配信履歴（新しい順）</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {overview
            .flatMap((o) => o.history)
            .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
            .slice(0, 20)
            .map((tpl) => (
              <li key={tpl.id} className="flex flex-wrap gap-2">
                <span className="tabular-nums text-foreground-500">{fmtDateTime(tpl.publishedAt)}</span>
                <span className="font-semibold">{tpl.name}</span>
                <span>版 {tpl.version}</span>
                <span className="text-foreground-500">{tpl.items.length}項目</span>
                {tpl.changeNote ? <span className="text-foreground-500">— {tpl.changeNote}</span> : null}
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
