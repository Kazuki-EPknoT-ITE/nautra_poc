import Link from "next/link";
import { t } from "@/i18n/ja";
import { fmtDateTime } from "@/lib/format";
import { todayLocal } from "@/server/master-service";
import { requireShore } from "@/server/shore-session";
import {
  buildCrewTrainingRows,
  buildDrillBoard,
  listOpenTrainingPlans,
  listTrainingMaterials,
  listTrainingPlans,
  STCW_BASIC_REQUIRED_FROM,
  trainingFormOptions,
} from "@/server/training-service";
import { StatusChip } from "@/ui";
import { ShoreGuardNotice } from "../_components/guard";
import {
  ArrangeTrainingForm,
  CompleteTrainingForm,
  MaterialForm,
  type OpenPlanOption,
} from "./_components/training-forms";

export const dynamic = "force-dynamic";

/**
 * S-09 訓練管理（要件定義書 3.9 / 4.4）。
 *
 * 修了の有無は**証書（credential）の有無から導出**する（訓練計画に二重に持たない・12.3）。
 * 未修了は 2026-02-14 以降の雇入届出で受理保留のリスクになるため、警告として明示する。
 * 操練の次回期日は `rules/drill-rules.ts` の実施間隔を `domain/training/drills.ts` が判定する。
 */
export default async function ShoreTrainingPage() {
  const guard = await requireShore("manage_training");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="訓練管理" />;

  const now = new Date();
  const today = todayLocal(now);
  const crewRows = buildCrewTrainingRows(now);
  const plans = listTrainingPlans();
  const materials = listTrainingMaterials();
  const drills = buildDrillBoard(now);
  const { crew } = trainingFormOptions();
  const riskCount = crewRows.filter((r) => r.hireRisk).length;

  const openPlans: OpenPlanOption[] = listOpenTrainingPlans().map((p) => ({
    id: p.id,
    label: `${p.crewName} / ${t.trainingKind[p.trainingKind]} / ${p.title}${p.scheduledOn ? `（${p.scheduledOn} 予定）` : ""}`,
    needsExpiry: p.trainingKind === "license_renewal",
    defaultName: p.title,
    defaultIssuer: p.institution ?? "",
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">訓練</h1>
        <p className="text-sm text-foreground-500">
          基本訓練・実技講習・更新講習の修了状況と、船内操練の期日（基準日 {today}）
        </p>
      </div>

      {/* ① 船員ごとの修了状況と未修了アラート */}
      <section aria-label="船員ごとの修了状況" className="glass-tile p-4">
        <h2 className="mb-1 font-bold">船員ごとの修了状況</h2>
        {riskCount > 0 ? (
          <p className="mb-2 text-sm font-semibold text-danger">
            ✕ {riskCount}名 に未修了があります。{STCW_BASIC_REQUIRED_FROM} 以降に雇入契約の届出を
            出すと、修了が確認できず受理が保留になることがあります。乗船の予定より前に受講を
            手配してください。
          </p>
        ) : (
          <p className="mb-2 text-sm font-semibold text-success">
            ✓ 雇入届出で問題になる未修了はありません。
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] text-left text-foreground-500">
                <th className="px-2 py-2 font-medium">船員</th>
                <th className="px-2 py-2 font-medium">全体</th>
                <th className="px-2 py-2 font-medium">基本訓練</th>
                <th className="px-2 py-2 font-medium">実技講習</th>
                <th className="px-2 py-2 font-medium">免状・更新講習</th>
              </tr>
            </thead>
            <tbody>
              {crewRows.map((row) => (
                <tr key={row.crewMemberId} className="border-b border-[var(--glass-border)] last:border-b-0">
                  <td className="px-2 py-2">
                    <Link
                      href={`/shore/crew/${row.crewMemberId}`}
                      className="font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-foreground-500">{row.position}</p>
                  </td>
                  <td className="px-2 py-2">
                    <StatusChip
                      size="sm"
                      level={row.level}
                      label={row.hireRisk ? "未修了あり" : row.level === "ok" ? "修了済み" : "手配中"}
                    />
                  </td>
                  {row.items.map((item) => (
                    <td key={item.category} className="px-2 py-2">
                      {!item.required ? (
                        <span className="text-foreground-500">対象外</span>
                      ) : (
                        <>
                          <span
                            className={
                              item.level === "violation"
                                ? "font-bold text-danger"
                                : item.level === "caution"
                                  ? "font-bold text-warning-700"
                                  : "font-bold text-success"
                            }
                          >
                            {item.level === "violation" ? "✕ 未修了" : item.level === "caution" ? "⚠ 手配中" : "✓ 修了"}
                          </span>
                          <p className="text-xs text-foreground-600">{item.message}</p>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ② 受講手配 */}
      <section aria-label="受講の手配" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">
          受講の手配 <span className="tabular-nums font-normal text-foreground-500">{plans.length}件</span>
        </h2>
        {plans.length === 0 ? (
          <p className="text-sm text-foreground-500">手配した訓練はありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-[var(--glass-border)] text-left text-foreground-500">
                  <th className="px-2 py-2 font-medium">船員</th>
                  <th className="px-2 py-2 font-medium">訓練の種類</th>
                  <th className="px-2 py-2 font-medium">名前</th>
                  <th className="px-2 py-2 font-medium">受講先</th>
                  <th className="px-2 py-2 font-medium">予定日</th>
                  <th className="px-2 py-2 font-medium">状態</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--glass-border)] last:border-b-0">
                    <td className="px-2 py-2 font-semibold">{p.crewName}</td>
                    <td className="px-2 py-2">{t.trainingKind[p.trainingKind]}</td>
                    <td className="px-2 py-2">{p.title}</td>
                    <td className="px-2 py-2">{p.institution ?? "—"}</td>
                    <td className="px-2 py-2 tabular-nums">{p.scheduledOn ?? "—"}</td>
                    <td className="px-2 py-2">{t.trainingStatus[p.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ArrangeTrainingForm crew={crew} today={today} />
      <CompleteTrainingForm plans={openPlans} today={today} />

      {/* ③ 船内操練の実施記録と次回期日 */}
      <section aria-label="船内操練の次回期日" className="glass-tile p-4">
        <h2 className="mb-1 font-bold">船内操練の次回期日</h2>
        <p className="mb-2 text-sm text-foreground-600">
          船内で記録された操練から、種別ごとの最後の実施日と次回の期日を出しています。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] text-left text-foreground-500">
                <th className="px-2 py-2 font-medium">状態</th>
                <th className="px-2 py-2 font-medium">操練の種別</th>
                <th className="px-2 py-2 font-medium">最後の実施</th>
                <th className="px-2 py-2 font-medium">経過</th>
                <th className="px-2 py-2 font-medium">次回の期日</th>
                <th className="px-2 py-2 font-medium">いまの状況</th>
              </tr>
            </thead>
            <tbody>
              {drills.statuses.map((s) => (
                <tr key={s.drillType} className="border-b border-[var(--glass-border)] last:border-b-0">
                  <td className="px-2 py-2">
                    <StatusChip size="sm" level={s.level} label={t.drillState[s.state]} />
                  </td>
                  <td className="px-2 py-2 font-semibold">{t.drillType[s.drillType]}</td>
                  <td className="px-2 py-2 tabular-nums">{s.lastDoneOn ?? "—"}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {s.daysSinceLast === null ? "—" : `${s.daysSinceLast}日`}
                  </td>
                  <td className="px-2 py-2 tabular-nums">{s.nextDueOn ?? "—"}</td>
                  <td className="px-2 py-2">{s.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-foreground-500">
          実施間隔は適用中のルール版から取っています（{drills.ruleSetId} / 版 {drills.ruleVersion}）。
          根拠: {drills.ruleSource}
        </p>

        <h3 className="mt-3 text-sm font-bold">最近の実施記録</h3>
        {drills.recent.length === 0 ? (
          <p className="text-sm text-foreground-500">操練の実施記録はありません。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {drills.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-2">
                <span className="tabular-nums text-foreground-500">{fmtDateTime(r.occurredAt)}</span>
                <span className="font-semibold">{t.drillType[r.drillType]}</span>
                <span className="text-foreground-600">指揮 {r.leaderName}</span>
                <span className="tabular-nums text-foreground-600">
                  参加 {r.participantCount}名 / {r.durationMinutes}分
                </span>
                {r.remarks ? <span className="text-foreground-500">{r.remarks}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ④ 教材・手順書の配信 */}
      <section aria-label="教材・手順書" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">
          配信した教材・手順書{" "}
          <span className="tabular-nums font-normal text-foreground-500">{materials.length}件</span>
        </h2>
        {materials.length === 0 ? (
          <p className="text-sm text-foreground-500">配信した教材はありません。</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {materials.map((m) => (
              <li key={m.id} className="border-b border-[var(--glass-border)] pb-2 last:border-b-0">
                <p className="font-semibold">
                  {m.materialName}
                  <span className="ml-2 font-normal text-foreground-600">
                    {m.crewName} / {t.trainingKind[m.trainingKind]}
                  </span>
                </p>
                {m.materialBody ? <p className="text-foreground-600">{m.materialBody}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <MaterialForm crew={crew} />

      <p className="text-xs text-foreground-500">
        修了しているかどうかは修了証（証書）の有無から都度判定しています。修了を登録すると証書が
        1件増え、届出の添付要件チェックと配乗可否の判定が同じ材料を見て自動で変わります。
      </p>
    </div>
  );
}
