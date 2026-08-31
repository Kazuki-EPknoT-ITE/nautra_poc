import { PERMISSIONS, ROLE_PERMISSIONS, VESSEL_ROLES, can } from "@/domain/authz/roles";
import { t } from "@/i18n/ja";
import { fmtMinutes } from "@/lib/format";
import { DEFAULT_LABOR_RULE_SET } from "@/rules/default-rule-set";
import { DEFAULT_SAFETY_RULE_SET } from "@/rules/safety-rules";
import { getSyncStats } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * S-15 設定・権限。
 *
 * - **役職別の権限表**: `src/domain/authz/roles.ts` の表から生成する（手書きで二重管理しない）。
 * - **適用中のルール版**: 労働時間・休息・安全基準の閾値。判定はこの値を注入して行う（12.3）。
 * - 監査ログ・テナント設定・ユーザ管理は PoC 未実装。
 */
export default function ShoreSettingsPage() {
  const sync = getSyncStats();
  const labor = DEFAULT_LABOR_RULE_SET;
  const safety = DEFAULT_SAFETY_RULE_SET;

  const laborValues: [string, string][] = [
    ["1日の労働時間の上限", fmtMinutes(labor.values.dailyMaxMinutes)],
    ["1週間の労働時間の上限", fmtMinutes(labor.values.weeklyMaxMinutes)],
    ["1日の休息時間（合計）", fmtMinutes(labor.values.restMinDailyMinutes)],
    ["連続した休息の最低", fmtMinutes(labor.values.restLongestMinMinutes)],
    ["休息の分割回数の上限", `${labor.values.restSplitMax}回`],
    ["注意（黄）にする割合", `上限の ${Math.round(labor.values.cautionRatio * 100)}%`],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">設定・権限</h1>
        <p className="text-sm text-foreground-500">
          権限表と判定基準は実装（コード）から生成しています。表示のためだけの写しは持ちません。
        </p>
      </div>

      <section aria-label="役職別の権限表" className="glass-tile overflow-x-auto">
        <h2 className="px-4 pt-4 font-bold">役職別の権限表（船内アプリ）</h2>
        <p className="px-4 pb-2 pt-1 text-xs text-foreground-500">
          基本設計書 11.2 の権限マトリクスを船内画面に展開したもの。判定は
          <code className="mx-1">src/domain/authz/roles.ts</code>が唯一の情報源です。
        </p>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--glass-border)] text-left text-foreground-500">
              <th className="px-4 py-2 font-medium">できること</th>
              {VESSEL_ROLES.map((role) => (
                <th key={role} className="px-3 py-2 text-center font-medium">
                  {t.role[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p} className="border-b border-[var(--glass-border)] last:border-b-0">
                <td className="px-4 py-2">
                  {t.permission[p] ?? p}
                  <span className="ml-2 text-xs text-foreground-500">{p}</span>
                </td>
                {VESSEL_ROLES.map((role) => (
                  <td key={role} className="px-3 py-2 text-center">
                    {can(role, p) ? (
                      <span className="font-bold text-success">○</span>
                    ) : (
                      <span className="text-foreground-400">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-foreground-500">
          陸上の労務管理責任者は、船長の承認より優先する承認権を持ちます（役割優先。基本設計書 8.3）。
          承認は S-06 労務管理から行います。
        </p>
      </section>

      <section aria-label="ロール別の一覧" className="grid gap-3 sm:grid-cols-2">
        {VESSEL_ROLES.map((role) => (
          <div key={role} className="glass-tile p-4">
            <h3 className="font-bold">{t.role[role]}</h3>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {ROLE_PERMISSIONS[role].map((p) => (
                <span key={p} className="rounded-small bg-default-100 px-2 py-1">
                  {t.permission[p] ?? p}
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section aria-label="適用中の判定基準" className="grid gap-3 lg:grid-cols-2">
        <div className="glass-tile p-4">
          <h2 className="font-bold">労働時間・休息の基準</h2>
          <p className="text-xs text-foreground-500">
            版 {labor.version}（{labor.effectiveFrom} 適用）/ {labor.id}
          </p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {laborValues.map(([k, v]) => (
                <tr key={k} className="border-b border-[var(--glass-border)] last:border-b-0">
                  <td className="py-1.5">{k}</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-foreground-500">{labor.source}</p>
        </div>

        <div className="glass-tile p-4">
          <h2 className="font-bold">安全基準</h2>
          <p className="text-xs text-foreground-500">
            版 {safety.version}（{safety.effectiveFrom} 適用）/ {safety.id}
          </p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              <tr className="border-b border-[var(--glass-border)] last:border-b-0">
                <td className="py-1.5">アルコール検知の基準値</td>
                <td className="py-1.5 text-right tabular-nums font-semibold">
                  {safety.values.alcoholLimitMgPerL} mg/L
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-foreground-500">{safety.source}</p>
          <p className="mt-2 text-xs text-foreground-500">
            判定結果には適用した版を記録しています。基準を変えても過去の判定の意味は変わりません。
          </p>
        </div>
      </section>

      <section aria-label="同期・監査" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">同期・監査</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            サーバ版 <span className="tabular-nums font-bold">v{sync.serverVersion}</span>
          </span>
          <span>
            受信イベント <span className="tabular-nums font-bold">{sync.eventCount}</span> 件
          </span>
          <span>
            隔離 <span className="tabular-nums font-bold">{sync.quarantineCount}</span> 件
          </span>
          <span className={sync.conflictCount > 0 ? "text-danger" : undefined}>
            競合（要確認） <span className="tabular-nums font-bold">{sync.conflictCount}</span> 件
          </span>
        </div>
        <p className="mt-2 text-xs text-foreground-500">
          ユーザ・ロールの管理、テナント設定、監査ログの閲覧は PoC 未実装です。本番では
          Supabase Auth と監査ログ（改変不可）を用います（基本設計書 11.2 / 11.3）。
        </p>
      </section>
    </div>
  );
}
