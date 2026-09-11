import Link from "next/link";
import { fmtDateTime } from "@/lib/format";
import { listCrewMasters, listVessels, todayLocal } from "@/server/master-service";
import { requireShore } from "@/server/shore-session";
import {
  listTasks,
  openTaskCountByCrew,
  TASK_STATE_LABEL,
  type TaskRow,
} from "@/server/task-service";
import { CrewPhoto, DataTable, Section, StatusChip } from "@/ui";
import type { WorkTaskState } from "@/sync-protocol/masters";
import { ShoreGuardNotice } from "../_components/guard";
import { advanceTaskAction, assignTaskAction, deleteTaskAction } from "./actions";

export const dynamic = "force-dynamic";

const COLUMNS: { state: WorkTaskState; label: string }[] = [
  { state: "todo", label: "未着手" },
  { state: "doing", label: "着手中" },
  { state: "done", label: "完了" },
];

/** 次に進めるボタンの文言。完了した作業には進める先が無い */
function advanceLabel(state: WorkTaskState): string | null {
  if (state === "todo") return "着手にする";
  if (state === "doing") return "完了にする";
  return null;
}

function levelOf(row: TaskRow) {
  if (row.task.state === "done") return "ok" as const;
  if (row.overdue) return "violation" as const;
  if (row.daysLeft !== null && row.daysLeft <= 1) return "caution" as const;
  return "none" as const;
}

/**
 * S-16 作業指示・タスク割当（デザイン正本 `design/poc_design`）。
 *
 * 打刻（一次記録）が「いつ働いたか」を残すのに対し、この画面は「**誰が何をやるか**」を
 * 決める。3列（未着手 / 着手中 / 完了）に並べ、止まっている作業が誰の手元にあるかを
 * 一目で分かるようにする。割り当ての変更・取り消しは追記で記録される（12.6）。
 */
export default async function ShoreTasksPage() {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="作業指示・タスク" />;

  const rows = listTasks();
  const vessels = listVessels();
  const crews = listCrewMasters();
  const openByCrew = openTaskCountByCrew();
  /** 顔写真は船員マスタから引く（画面ごとに持たない） */
  const photoOf = (crewMemberId?: string) =>
    crews.find((c) => c.crewMemberId === crewMemberId)?.photoDataUrl;
  const today = todayLocal();

  return (
    <>
      <Section
        title="新しい作業を割り当てる"
        actions={
          <Link href="/shore/exports?set=task" className="ui-btn-ghost h-8 text-xs">
            CSVで書き出す
          </Link>
        }
        divided={false}
        bodyClassName="pt-0"
      >
        <form action={assignTaskAction} className="grid items-end gap-3 lg:grid-cols-[2fr_1.2fr_1fr_1fr_132px]">
          <label className="block">
            <span className="mb-1 block text-xs text-foreground-500">作業の内容</span>
            <input
              name="title"
              required
              placeholder="例）出港前点検の実施と記録"
              className="ui-field text-base"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-foreground-500">担当船員</span>
            <select name="assigneeCrewId" className="ui-field text-base">
              <option value="">未割当</option>
              {crews.map((c) => (
                <option key={c.crewMemberId} value={c.crewMemberId}>
                  {c.name}（{c.position ?? "—"}）
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-foreground-500">対象船</span>
            <select name="targetVesselId" className="ui-field text-base">
              {vessels.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-foreground-500">期限</span>
            <input name="dueAt" type="date" defaultValue={today} className="ui-field font-mono text-base" />
          </label>
          <button type="submit" className="ui-btn-primary h-[42px]">
            割り当てる
          </button>
        </form>
      </Section>

      <section className="grid gap-3.5 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const cards = rows.filter((r) => r.task.state === col.state);
          return (
            <div key={col.state} className="ui-card">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--ui-hairline-strong)] px-[18px] py-3.5">
                <h2 className="m-0 text-base font-bold text-foreground-900">{col.label}</h2>
                <span className="font-mono text-sm text-foreground-500">{cards.length}</span>
              </div>
              <div className="flex flex-col gap-2.5 p-3">
                {cards.length === 0 ? (
                  <p className="m-0 px-1 py-3 text-sm text-foreground-500">この状態の作業はありません。</p>
                ) : null}
                {cards.map((r) => (
                  <div key={r.task.id} className="rounded-small border border-[var(--ui-hairline)] p-3">
                    <p className="m-0 text-base font-bold leading-snug text-foreground-900">{r.task.title}</p>
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <CrewPhoto
                        name={r.assigneeName}
                        src={photoOf(r.task.assigneeCrewId)}
                        size="xs"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-foreground-700">{r.assigneeName}</span>
                        <span className="block text-xs text-foreground-400">{r.vesselName}</span>
                      </span>
                      <StatusChip
                        level={levelOf(r)}
                        size="sm"
                        label={
                          r.task.state === "done"
                            ? "完了"
                            : r.overdue
                              ? `${Math.abs(r.daysLeft ?? 0)}日 超過`
                              : r.daysLeft === null
                                ? "期限なし"
                                : `あと${r.daysLeft}日`
                        }
                      />
                    </div>
                    <p className="m-0 mt-2 font-mono text-xs text-foreground-500">
                      期限 {r.task.dueAt ? fmtDateTime(r.task.dueAt) : "—"} ／ {r.task.cycle ?? "臨時"}
                    </p>
                    <div className="mt-2.5 flex gap-2">
                      {advanceLabel(r.task.state) ? (
                        <form action={advanceTaskAction} className="flex-1">
                          <input type="hidden" name="taskId" value={r.task.id} />
                          <button type="submit" className="ui-btn-ghost h-[34px] w-full text-xs font-normal">
                            {advanceLabel(r.task.state)}
                          </button>
                        </form>
                      ) : (
                        <span className="flex-1" />
                      )}
                      <form action={deleteTaskAction} className="flex-none">
                        <input type="hidden" name="taskId" value={r.task.id} />
                        <button
                          type="submit"
                          className="ui-btn-ghost h-[34px] w-[62px] text-xs font-normal text-danger"
                        >
                          削除
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <Section title="船員ごとの持ち作業（未完了）" bodyClassName="p-[18px]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {crews.map((c) => (
            <div key={c.crewMemberId} className="flex items-center gap-2.5 rounded-small bg-[#DFE1E0] px-3 py-2.5">
              <CrewPhoto
                name={c.name}
                initial={c.photo}
                src={c.photoDataUrl}
                size="xs"
                className="!bg-content1"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-foreground-800">{c.name}</span>
                <span className="block text-xs text-foreground-500">{c.position ?? "—"}</span>
              </span>
              <span className="font-mono text-lg text-foreground-900">
                {openByCrew.get(c.crewMemberId) ?? 0}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="割り当ての一覧" note={`${rows.length}件`} bodyClassName="p-0">
        <DataTable
          isEmpty={rows.length === 0}
          empty="割り当てられた作業はありません。"
          head={
            <>
              <th>状態</th>
              <th>作業</th>
              <th>担当</th>
              <th>対象船</th>
              <th className="num">期限</th>
            </>
          }
        >
          {rows.map((r) => (
            <tr key={r.task.id}>
              <td>
                <StatusChip level={levelOf(r)} size="sm" label={TASK_STATE_LABEL[r.task.state]} />
              </td>
              <td>
                <p className="m-0 font-medium text-foreground-800">{r.task.title}</p>
                <p className="m-0 mt-0.5 text-xs text-foreground-400">{r.task.cycle ?? "臨時"}</p>
              </td>
              <td>{r.assigneeName}</td>
              <td>{r.vesselName}</td>
              <td className="num">{r.task.dueAt ? fmtDateTime(r.task.dueAt) : "—"}</td>
            </tr>
          ))}
        </DataTable>
      </Section>
    </>
  );
}
