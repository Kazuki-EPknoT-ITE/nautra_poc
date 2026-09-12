import Link from "next/link";
import { notFound } from "next/navigation";
import { evaluateCredentials } from "@/domain/crew/freshness";
import { fmtDateTime } from "@/lib/format";
import { DEFAULT_CREDENTIAL_RULE_SET } from "@/rules/credential-rules";
import { buildFleetBoard } from "@/server/fleet-service";
import { credentialsOf, listVessels, todayLocal } from "@/server/master-service";
import { requireShore } from "@/server/shore-session";
import { listTasksForVessel, TASK_STATE_LABEL } from "@/server/task-service";
import { crewPhotoMap } from "@/server/crew-photo-service";
import { buildVesselOverview } from "@/server/vessel-overview-service";
import { CrewPhoto, DataTable, Section, StatusChip } from "@/ui";
import { ShoreGuardNotice } from "../../_components/guard";

export const dynamic = "force-dynamic";

/**
 * S-11D 船舶ごとの管理ページ（デザイン正本 `design/poc_design`）。
 *
 * 船を軸に「乗組員 / 証書・検査 / 入渠・保守 / 作業」を1画面に集める。
 * 船の担当者は**船単位で物を考える**ため、機能別の画面をまたいで同じ船を探し直す
 * 手間をなくす。数字は S-01 のカードと同じ集計（`vessel-overview-service`）から取り、
 * 画面ごとに数え直さない。
 */
export default async function VesselDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const guard = await requireShore("manage_fleet");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="船の管理ページ" />;

  const { id } = await params;
  if (!listVessels().some((v) => v.id === id)) notFound();

  const v = buildVesselOverview(id);
  if (!v) notFound();

  const board = buildFleetBoard(id);
  const today = todayLocal();
  const certStatuses = evaluateCredentials(
    credentialsOf("vessel", id),
    today,
    DEFAULT_CREDENTIAL_RULE_SET,
  );
  const tasks = listTasksForVessel(id);
  const photos = crewPhotoMap();

  return (
    <>
      <section className="ui-dark flex flex-wrap items-center gap-7 px-6 py-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="m-0 text-3xl font-bold text-white">{v.name}</h2>
            <StatusChip level={v.stateLevel} size="sm" label={v.state} />
            {v.route ? <span className="text-sm text-[#DFE1E0]">{v.route}</span> : null}
          </div>
          <p className="m-0 mt-2 text-sm text-[#DFE1E0]">{v.spec}</p>
          <p className="m-0 mt-[3px] font-mono text-xs text-[#99877D]">
            {v.master?.imoNumber ?? "IMO 未登録"} ／ MMSI {v.master?.mmsi ?? "—"} ／{" "}
            {v.master?.navigationArea ?? "航行区域 未登録"}
          </p>
        </div>
        <div className="text-right">
          <p className="m-0 text-xs text-[#99877D]">乗組員 ／ 定員</p>
          <p className="m-0 mt-1.5 font-mono text-4xl font-semibold leading-none text-white">
            {v.onBoard.length}／{v.requiredCrew ?? "—"}
          </p>
        </div>
        <div className="flex flex-none flex-col gap-2">
          <Link href="/shore/manning" className="ui-btn-primary h-9">
            船員を配乗する
          </Link>
          <Link href="/shore/shifts" className="ui-btn-ghost h-9 border-[#666666] bg-transparent font-normal text-white">
            シフトを作る
          </Link>
          <Link href="/shore/tasks" className="ui-btn-ghost h-9 border-[#666666] bg-transparent font-normal text-white">
            作業を割り当てる
          </Link>
          <Link
            href="/shore/exports?set=vessel"
            className="ui-btn-ghost h-9 border-[#666666] bg-transparent font-normal text-[#DFE1E0]"
          >
            CSVで書き出す
          </Link>
        </div>
      </section>

      <section className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Section
          title="乗組員"
          note={`直近7日 注意${v.cautionDays}日 ／ 警告${v.violationDays}日 ／ 承認待${v.pendingApprovals}件`}
          bodyClassName="p-0"
        >
          {v.onBoard.length === 0 ? (
            <p className="m-0 px-[18px] py-5 text-base leading-relaxed text-foreground-500">
              この船に配乗されている船員はいません。「船員を配乗する」から配乗ボードで割り当てられます。
            </p>
          ) : (
            v.onBoard.map((c) => (
              <div
                key={c.crewMemberId}
                className="flex flex-wrap items-center gap-3.5 border-b border-[var(--ui-hairline)] px-[18px] py-3 last:border-b-0"
              >
                <CrewPhoto name={c.name} initial={c.photo} src={photos.get(c.crewMemberId)} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-lg font-bold text-foreground-900">{c.name}</p>
                  <p className="m-0 mt-0.5 text-xs text-foreground-500">
                    {c.position} ／ {c.age ?? "—"}歳 ／ 乗船 {c.boardedOn ?? "—"}
                  </p>
                </div>
                {/* 乗っている船員に「配乗不可」とは出さない（3.1.2 はこれから配乗する
                    候補への判定で、乗船中の人に出すと「今すぐ降ろせ」と読める） */}
                <StatusChip
                  level={c.eligibility.level}
                  size="sm"
                  label={
                    c.eligibility.status === "blocked"
                      ? "要対応"
                      : c.eligibility.status === "caution"
                        ? "確認が要ります"
                        : "問題ありません"
                  }
                />
                <Link href={`/shore/crew/${c.crewMemberId}`} className="ui-btn-quiet h-8">
                  カルテ
                </Link>
              </div>
            ))
          )}
        </Section>

        <div className="flex flex-col gap-3.5">
          <Section title="証書・検査の期限" bodyClassName="p-0">
            {certStatuses.length === 0 ? (
              <p className="m-0 px-[18px] py-5 text-sm text-foreground-500">
                この船の証書は登録されていません。
              </p>
            ) : (
              certStatuses.map((s) => (
                <div
                  key={s.credential.id}
                  className="flex items-center gap-3 border-b border-[var(--ui-hairline)] px-[18px] py-3 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 text-base text-foreground-800">{s.credential.name}</span>
                  <span className="font-mono text-sm text-foreground-700">
                    {s.credential.expiresOn ?? "期限なし"}
                  </span>
                  <StatusChip
                    level={s.level}
                    size="sm"
                    label={
                      s.daysToExpiry === null
                        ? "期限なし"
                        : s.daysToExpiry < 0
                          ? `${Math.abs(s.daysToExpiry)}日 超過`
                          : `あと${s.daysToExpiry}日`
                    }
                  />
                </div>
              ))
            )}
          </Section>

          <Section title="入渠・保守" bodyClassName="p-0">
            {board.docks.length === 0 ? (
              <p className="m-0 px-[18px] py-5 text-sm text-foreground-500">入渠の計画はありません。</p>
            ) : (
              board.docks.map((d) => (
                <div
                  key={d.dock.id}
                  className="flex items-center gap-3 border-b border-[var(--ui-hairline)] px-[18px] py-3"
                >
                  <span className="min-w-0 flex-1 text-base text-foreground-800">{d.dock.title}</span>
                  <span className="font-mono text-sm text-foreground-500">
                    {d.dock.plannedFrom ?? "—"}
                    {d.dock.plannedTo ? ` 〜 ${d.dock.plannedTo.slice(5)}` : ""}
                  </span>
                  <StatusChip level={d.level} size="sm" label={d.message} />
                </div>
              ))
            )}
            <div className="flex flex-col gap-2 px-[18px] py-3.5">
              <p className="m-0 text-sm leading-relaxed text-foreground-700">
                部品在庫: 発注点割れ {board.stocks.filter((s) => s.level !== "ok").length} 件 ／ 登録{" "}
                {board.stocks.length} 品目
              </p>
              <p className="m-0 text-sm leading-relaxed text-foreground-500">
                船内環境の確認日: {v.master?.environmentVerifiedOn ?? "未確認"} ／ Wi-Fi{" "}
                {v.master?.wifiAvailable ? "あり" : "なし"}
              </p>
            </div>
          </Section>
        </div>
      </section>

      <Section
        title="この船の作業・タスク"
        actions={
          <Link href="/shore/tasks" className="ui-btn-ghost h-8 text-xs">
            作業指示の画面へ
          </Link>
        }
        bodyClassName="p-0"
      >
        <DataTable
          isEmpty={tasks.length === 0}
          empty="この船に割り当てられた作業はありません。"
          maxHeight={340}
          head={
            <>
              <th>作業</th>
              <th>担当</th>
              <th className="num">期限</th>
              <th>状態</th>
            </>
          }
        >
          {tasks.map((t) => (
            <tr key={t.task.id}>
              <td>{t.task.title}</td>
              <td>{t.assigneeName}</td>
              <td className="num">{t.task.dueAt ? fmtDateTime(t.task.dueAt) : "—"}</td>
              <td>
                <StatusChip
                  level={t.task.state === "done" ? "ok" : t.overdue ? "violation" : "none"}
                  size="sm"
                  label={TASK_STATE_LABEL[t.task.state]}
                />
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>

      <Section title="この船に関係する期限" note={`${v.deadlines.length}件`} bodyClassName="p-0">
        <DataTable
          isEmpty={v.deadlines.length === 0}
          empty="期限が近いものはありません。"
          head={
            <>
              <th>状態</th>
              <th>対象</th>
              <th>内容</th>
              <th className="num">着手まで</th>
            </>
          }
        >
          {v.deadlines.map((d) => (
            <tr key={d.key}>
              <td>
                <StatusChip level={d.level} size="sm" />
              </td>
              <td>{d.subject}</td>
              <td>
                <p className="m-0">{d.title}</p>
                <p className="m-0 mt-0.5 text-xs text-foreground-500">{d.message}</p>
              </td>
              <td className="num">
                {d.days === null ? "—" : d.days < 0 ? `${Math.abs(d.days)}日 超過` : `${d.days}日`}
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>
    </>
  );
}
