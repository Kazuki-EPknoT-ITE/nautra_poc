import { t } from "@/i18n/ja";
import { DEMO_VESSEL, personName } from "@/lib/crew";
import { fmtDateLabel, fmtDateTime } from "@/lib/format";
import { buildFleetOverview } from "@/server/crew-service";
import { EQUIPMENT_KINDS } from "@/sync-protocol/records";

export const dynamic = "force-dynamic";

const COND: Record<string, { cls: string; icon: string }> = {
  good: { cls: "text-success", icon: "✓" },
  attention: { cls: "text-warning-700", icon: "⚠" },
  defect: { cls: "text-danger", icon: "✕" },
};

/**
 * S-11 船舶・保守（PoC 版）。
 * 船内から届いた点検・保守の一次記録から、機器ごとの最新状態と要対応を集約する。
 * 検査証書の期限・入渠タスク・部品在庫は PoC 未実装（マスタが必要なため）。
 */
export default function ShoreFleetPage() {
  const { latestByEquipment, openIssues, recentChecklists } = buildFleetOverview();
  const latest = new Map(latestByEquipment);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">船舶・保守</h1>
        <p className="text-sm text-foreground-500">{DEMO_VESSEL.name}（船内の記録から集約）</p>
      </div>

      <section aria-label="要対応" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">
          要対応の機器
          <span className={`ml-2 tabular-nums ${openIssues.length > 0 ? "text-danger" : ""}`}>
            {openIssues.length}件
          </span>
        </h2>
        {openIssues.length === 0 ? (
          <p className="text-sm text-foreground-500">要注意・不良の機器はありません。</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {openIssues.map((r) => (
              <li key={r.id} className="border-b border-[var(--glass-border)] pb-2 last:border-b-0">
                <p>
                  <span className={`font-bold ${COND[r.condition].cls}`}>
                    {COND[r.condition].icon} {t.condition[r.condition]}
                  </span>
                  <span className="ml-2 font-semibold">{t.equipment[r.equipment]}</span>
                  <span className="ml-2 text-foreground-500">
                    {t.maintenanceRecordType[r.recordType]} / {fmtDateTime(r.occurredAt)} /{" "}
                    {personName(r.crewMemberId)}
                  </span>
                </p>
                {r.action ? <p className="text-foreground-500">{r.action}</p> : null}
                {r.nextDueDate ? (
                  <p className="text-xs text-foreground-500">次回予定: {fmtDateLabel(r.nextDueDate)}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="機器別の最新状態" className="glass-tile overflow-x-auto">
        <h2 className="px-4 pt-4 font-bold">機器別の最新状態</h2>
        <table className="mt-2 w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--glass-border)] text-left text-foreground-500">
              <th className="px-4 py-2 font-medium">機器</th>
              <th className="px-2 py-2 font-medium">状態</th>
              <th className="px-2 py-2 font-medium">最終記録</th>
              <th className="px-2 py-2 font-medium">種別</th>
              <th className="px-2 py-2 font-medium">運転時間</th>
              <th className="px-2 py-2 font-medium">記録者</th>
            </tr>
          </thead>
          <tbody>
            {EQUIPMENT_KINDS.map((eq) => {
              const r = latest.get(eq);
              return (
                <tr key={eq} className="border-b border-[var(--glass-border)] last:border-b-0">
                  <td className="px-4 py-2 font-semibold">{t.equipment[eq]}</td>
                  <td className={`px-2 py-2 font-semibold ${r ? COND[r.condition].cls : ""}`}>
                    {r ? `${COND[r.condition].icon} ${t.condition[r.condition]}` : "—"}
                  </td>
                  <td className="px-2 py-2 tabular-nums">{r ? fmtDateTime(r.occurredAt) : "記録なし"}</td>
                  <td className="px-2 py-2">{r ? t.maintenanceRecordType[r.recordType] : "—"}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {r?.runningHours !== undefined ? `${r.runningHours.toLocaleString()} h` : "—"}
                  </td>
                  <td className="px-2 py-2">{r ? personName(r.crewMemberId) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section aria-label="点検表の実施状況" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">点検表の実施状況（直近10件）</h2>
        {recentChecklists.length === 0 ? (
          <p className="text-sm text-foreground-500">実施記録がありません。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {recentChecklists.map((c) => (
              <li key={c.id} className="flex flex-wrap gap-2">
                <span className="tabular-nums text-foreground-500">{fmtDateTime(c.occurredAt)}</span>
                <span className="font-semibold">{t.checklistTemplate[c.templateId] ?? c.templateId}</span>
                <span className={c.overall === "pass" ? "text-success" : "text-danger"}>
                  {c.overall === "pass" ? "✓ 合格" : "✕ 不合格"}
                </span>
                <span className="text-foreground-500">
                  実施 {personName(c.recordedBy)} / 全{c.items.length}項目 / 版 {c.templateVersion}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-foreground-500">
        検査証書の期限管理・入渠タスク・部品在庫（S-11 の残り）と、配船・位置情報（S-12）は PoC
        未実装です。いずれも船舶マスタ・外部連携（AIS）が前提になります。
      </p>
    </div>
  );
}
