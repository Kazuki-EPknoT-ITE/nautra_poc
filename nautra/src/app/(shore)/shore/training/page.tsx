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
import { TRAINING_KINDS, type TrainingKind } from "@/sync-protocol/records";
import { Section, StatusChip } from "@/ui";
import { ShoreGuardNotice } from "../_components/guard";
import {
  ArrangeTrainingForm,
  CompleteTrainingForm,
  MaterialForm,
  type OpenPlanOption,
} from "./_components/training-forms";

export const dynamic = "force-dynamic";

/** 修了状況の列 → 手配するときの訓練の種類（列から「手配する」を押したときに入れておく） */
const KIND_BY_CATEGORY: Record<string, TrainingKind> = {
  stcw_basic: "stcw_basic",
  stcw_practical: "stcw_practical",
  license: "license_renewal",
};

/**
 * S-09 訓練管理（要件定義書 3.9 / 4.4）。
 *
 * 修了の有無は**証書（credential）の有無から導出**する（訓練計画に二重に持たない・12.3）。
 * 未修了は 2026-02-14 以降の雇入届出で受理保留のリスクになるため、警告として明示する。
 * 操練の次回期日は `rules/drill-rules.ts` の実施間隔を `domain/training/drills.ts` が判定する。
 */
/**
 * この画面の主題（タブ）。**1画面1主題**にして、目的の節まで延々とめくらずに済むようにする
 * （デザイン正本 S-15 と同じやりかた。1枚が 3000px を超えないようにする）。
 */
const TABS = [
  { id: "crew", label: "修了状況" },
  { id: "plans", label: "受講の予定" },
  { id: "drills", label: "船内操練" },
  { id: "materials", label: "教材・手順書" },
];

export default async function ShoreTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; do?: string; crew?: string; kind?: string; plan?: string }>;
}) {
  const sp = await searchParams;
  /** いま開いている主題。未指定なら先頭 */
  const tab = TABS.some((x) => x.id === sp.tab) ? sp.tab! : TABS[0]!.id;

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
  const action = sp.do === "arrange" || sp.do === "complete" ? sp.do : null;
  const presetKind = (TRAINING_KINDS as readonly string[]).includes(sp.kind ?? "") ? (sp.kind as TrainingKind) : undefined;

  const openPlans: OpenPlanOption[] = listOpenTrainingPlans().map((p) => ({
    id: p.id,
    label: `${p.crewName} / ${t.trainingKind[p.trainingKind]} / ${p.title}${p.scheduledOn ? `（${p.scheduledOn} 予定）` : ""}`,
    needsExpiry: p.trainingKind === "license_renewal",
    defaultName: p.title,
    defaultIssuer: p.institution ?? "",
  }));
  const openPlanIds = new Set(openPlans.map((p) => p.id));

  return (
    <div className="flex flex-col gap-[18px]">
      {/* 主題の切替（サーバ側で組み立てるためリンクで切り替える） */}
      <nav aria-label="訓練管理の主題" className="ui-card flex flex-wrap gap-2 p-3">
        {TABS.map((x) => (
          <Link
            key={x.id}
            href={`/shore/training?tab=${x.id}`}
            aria-current={x.id === tab ? "page" : undefined}
            className={`ui-btn-quiet ${x.id === tab ? "ui-btn-selected" : ""}`}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      {tab === "crew" ? (
        <>
      {/* ① 船員ごとの修了状況と未修了アラート */}
      <Section
        title="船員ごとの修了状況"
        note={`${crewRows.length}名`}
        actions={
          riskCount > 0 ? (
            <StatusChip
              level="violation"
              size="sm"
              label={`未修了あり ${riskCount}名`}
              hint={`${STCW_BASIC_REQUIRED_FROM} 以降の雇入の届出は、修了が確認できないと受理が保留になることがあります。乗船の予定より前に受講を手配してください`}
            />
          ) : (
            <StatusChip level="ok" size="sm" label="雇入届出で問題になる未修了なし" />
          )
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="ui-table min-w-[840px]">
            <thead>
              <tr>
                <th>船員</th>
                <th>全体</th>
                <th>基本訓練</th>
                <th>実技講習</th>
                <th>免状・更新講習</th>
              </tr>
            </thead>
            <tbody>
              {crewRows.map((row) => (
                <tr key={row.crewMemberId}>
                  <td>
                    <Link
                      href={`/shore/crew/${row.crewMemberId}`}
                      className="font-semibold text-foreground-800 underline-offset-2 hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="m-0 mt-0.5 text-xs text-foreground-400">{row.position}</p>
                  </td>
                  <td>
                    <StatusChip
                      size="sm"
                      level={row.level}
                      label={row.hireRisk ? "未修了あり" : row.level === "ok" ? "修了済み" : "手配中"}
                    />
                  </td>
                  {row.items.map((item) => (
                    <td key={item.category}>
                      {!item.required ? (
                        <span className="text-foreground-400">対象外</span>
                      ) : (
                        <>
                          <span className="flex flex-wrap items-center gap-1.5">
                            <StatusChip
                              size="sm"
                              level={item.level}
                              label={
                                item.level === "violation"
                                  ? "未修了"
                                  : item.level === "caution"
                                    ? "手配中"
                                    : "修了"
                              }
                              hint={item.message}
                            />
                            {!item.completed && item.plan ? (
                              <Link href={`/shore/training?tab=plans&do=complete&plan=${item.plan.id}`} className="ui-btn-quiet !px-2 !py-0.5 text-xs">
                                修了を登録
                              </Link>
                            ) : !item.completed ? (
                              <Link
                                href={`/shore/training?tab=plans&do=arrange&crew=${row.crewMemberId}&kind=${KIND_BY_CATEGORY[item.category] ?? "stcw_basic"}`}
                                className="ui-btn-quiet !px-2 !py-0.5 text-xs"
                              >
                                手配する
                              </Link>
                            ) : null}
                          </span>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

        </>
      ) : null}

      {tab === "plans" ? (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="受講の操作">
            <Link
              href="/shore/training?tab=plans&do=arrange"
              aria-current={action === "arrange" ? "true" : undefined}
              className={action === "arrange" ? "ui-btn-primary" : "ui-btn-ghost"}
            >
              ＋ 受講を手配する
            </Link>
            <Link
              href="/shore/training?tab=plans&do=complete"
              aria-current={action === "complete" ? "true" : undefined}
              className={action === "complete" ? "ui-btn-primary" : "ui-btn-ghost"}
            >
              ✓ 修了を登録する
            </Link>
          </div>
          {action === "arrange" ? (
            <ArrangeTrainingForm
              key={`${sp.crew ?? ""}-${presetKind ?? ""}`}
              crew={crew}
              today={today}
              presetCrew={sp.crew}
              presetKind={presetKind}
            />
          ) : null}
          {action === "complete" ? (
            <CompleteTrainingForm key={sp.plan ?? ""} plans={openPlans} today={today} presetPlan={sp.plan} />
          ) : null}
      <section aria-label="受講の手配" className="ui-card p-4">
        {plans.length === 0 ? (
          <p className="m-0 text-sm text-foreground-500">手配した訓練はありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
                  <th className="px-2 py-2 font-medium">船員</th>
                  <th className="px-2 py-2 font-medium">訓練の種類</th>
                  <th className="px-2 py-2 font-medium">名前</th>
                  <th className="px-2 py-2 font-medium">受講先</th>
                  <th className="px-2 py-2 font-medium">予定日</th>
                  <th className="px-2 py-2 font-medium">状態</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                    <td className="px-2 py-2 font-semibold">{p.crewName}</td>
                    <td className="px-2 py-2">{t.trainingKind[p.trainingKind]}</td>
                    <td className="px-2 py-2">{p.title}</td>
                    <td className="px-2 py-2">{p.institution ?? "—"}</td>
                    <td className="px-2 py-2 tabular-nums">{p.scheduledOn ?? "—"}</td>
                    <td className="px-2 py-2">{t.trainingStatus[p.status]}</td>
                    <td className="px-2 py-2 text-right">
                      {openPlanIds.has(p.id) ? (
                        <Link href={`/shore/training?tab=plans&do=complete&plan=${p.id}`} className="ui-btn-quiet">
                          修了を登録
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

        </>
      ) : null}


      {tab === "drills" ? (
      /* ③ 船内操練の実施記録と次回期日 */
      <section aria-label="船内操練の次回期日" className="ui-card p-4">
        <h2 className="mb-2 font-bold">次回の期日</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
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
                <tr key={s.drillType} className="border-b border-[var(--ui-hairline)] last:border-b-0">
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

      ) : null}

      {tab === "materials" ? (
        <>
      {/* ④ 教材・手順書の配信 */}
      <section aria-label="教材・手順書" className="ui-card p-4">
        <h2 className="mb-2 font-bold">
          配信した教材・手順書{" "}
          <span className="tabular-nums font-normal text-foreground-500">{materials.length}件</span>
        </h2>
        {materials.length === 0 ? (
          <p className="text-sm text-foreground-500">配信した教材はありません。</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {materials.map((m) => (
              <li key={m.id} className="border-b border-[var(--ui-hairline)] pb-2 last:border-b-0">
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
        </>
      ) : null}

    </div>
  );
}
