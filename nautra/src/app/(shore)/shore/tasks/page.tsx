import Link from "next/link";
import { cn } from "@/lib/cn";
import { crewPhotoMap } from "@/server/crew-photo-service";
import { buildVesselManning } from "@/server/manning-service";
import { todayLocal } from "@/server/master-service";
import { requireShore } from "@/server/shore-session";
import { listTasks, TASK_STATE_LABEL, type TaskRow } from "@/server/task-service";
import { ExportAction } from "../_components/export-action";
import { ShoreGuardNotice } from "../_components/guard";
import { TaskBoard, type BoardTask } from "./_components/task-board";

export const dynamic = "force-dynamic";

function levelOf(row: TaskRow) {
  if (row.task.state === "done") return "ok" as const;
  if (row.overdue) return "violation" as const;
  if (row.daysLeft !== null && row.daysLeft <= 1) return "caution" as const;
  return "none" as const;
}

function dueLabel(row: TaskRow): string {
  if (row.task.state === "done") return "完了";
  if (row.overdue) return `${Math.abs(row.daysLeft ?? 0)}日 超過`;
  if (row.daysLeft === null) return "期限なし";
  return row.daysLeft === 0 ? "きょうまで" : `あと${row.daysLeft}日`;
}

const VIEWS = [
  { id: "board", label: "ボード" },
  { id: "calendar", label: "カレンダー" },
];
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * S-16 作業指示・タスク（レビュー ORDER-02 / ORDER-04）。
 *
 * 「ボード」は配乗と同じホワイトボードで、船ごとに船員の列へ付箋（作業）を置いて割り当て・付け替えをする。
 * 「カレンダー」は船ごとに期限の日へ作業を並べたタスク表で、いつ何が詰まっているかを月で見る。
 * どちらも追記型（`work_task` の supersedes）で、誰がいつ割り当て・付け替えたかが履歴に残る（12.6）。
 */
export default async function ShoreTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; vessel?: string; month?: string }>;
}) {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="作業指示・タスク" />;

  const sp = await searchParams;
  const view = VIEWS.some((v) => v.id === sp.view) ? sp.view! : "board";
  const rows = listTasks();
  const photos = crewPhotoMap();
  const manning = buildVesselManning();
  const today = todayLocal();

  const vessels = manning.map((v) => ({
    vesselId: v.vesselId,
    vesselName: v.vesselName,
    crew: v.onBoard.map((r) => ({
      crewMemberId: r.crewMemberId,
      name: r.name,
      position: r.position,
      photo: r.photo,
      photoDataUrl: photos.get(r.crewMemberId),
    })),
  }));
  const tasks: BoardTask[] = rows.map((r) => ({
    id: r.task.id,
    title: r.task.title,
    vesselId: r.task.targetVesselId,
    assigneeCrewId: r.task.assigneeCrewId ?? null,
    assigneeName: r.assigneeName,
    dueAt: r.task.dueAt ? r.task.dueAt.slice(0, 10) : null,
    dueLabel: dueLabel(r),
    state: r.task.state,
    stateLabel: TASK_STATE_LABEL[r.task.state],
    cycle: r.task.cycle ?? "臨時",
    level: levelOf(r),
  }));

  // カレンダー（船ごとの月のタスク表）
  const calVessel = vessels.find((v) => v.vesselId === sp.vessel) ?? vessels[0];
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const lead = new Date(y!, m! - 1, 1).getDay();
  const daysInMonth = new Date(y!, m!, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const calTasks = tasks.filter((t) => t.vesselId === calVessel?.vesselId);
  const noDue = calTasks.filter((t) => !t.dueAt && t.state !== "done");
  const calHref = (o: { vessel?: string; month?: string }) =>
    `/shore/tasks?view=calendar&vessel=${o.vessel ?? calVessel?.vesselId ?? ""}&month=${o.month ?? month}`;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="表示の切り替え" className="flex gap-2">
          {VIEWS.map((v) => (
            <Link
              key={v.id}
              href={`/shore/tasks?view=${v.id}`}
              aria-current={v.id === view ? "page" : undefined}
              className={cn("ui-btn-quiet", v.id === view && "ui-btn-selected")}
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto" />
        <ExportAction set="task" label="作業指示・タスクを書き出す" />
      </div>

      {view === "board" ? (
        <TaskBoard vessels={vessels} tasks={tasks} />
      ) : (
        <section aria-label="船ごとのタスク表" className="ui-card flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="船">
              {vessels.map((v) => (
                <Link key={v.vesselId} href={calHref({ vessel: v.vesselId })} className={cn("ui-btn-quiet", v.vesselId === calVessel?.vesselId && "ui-btn-selected")}>
                  {v.vesselName}
                </Link>
              ))}
            </div>
            <span className="ml-auto flex items-center gap-1.5">
              <Link href={calHref({ month: shiftMonth(month, -1) })} className="ui-btn-quiet" aria-label="前の月">
                ◀
              </Link>
              <span className="min-w-[110px] text-center font-mono text-lg font-bold tabular-nums">
                {y}年{m}月
              </span>
              <Link href={calHref({ month: shiftMonth(month, 1) })} className="ui-btn-quiet" aria-label="次の月">
                ▶
              </Link>
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-center text-sm font-semibold text-foreground-600">
                {w}
              </span>
            ))}
            {cells.map((date, i) =>
              date ? (
                <div
                  key={date}
                  className={cn(
                    "flex min-h-[96px] flex-col gap-1 rounded-small border p-1.5",
                    date === today ? "border-primary" : "border-[var(--ui-hairline)]",
                  )}
                >
                  <span className="font-mono text-sm tabular-nums text-foreground-700">{Number(date.slice(8))}</span>
                  {calTasks
                    .filter((t) => t.dueAt === date)
                    .map((t) => (
                      <span
                        key={t.id}
                        title={`${t.title} ／ ${t.assigneeName} ／ ${t.stateLabel}`}
                        className={cn(
                          "truncate rounded-[3px] border px-1 py-0.5 text-xs",
                          t.state === "done"
                            ? "border-[var(--ui-hairline)] bg-content2 text-foreground-500 line-through"
                            : t.level === "violation"
                              ? "border-danger bg-danger-100 text-danger"
                              : t.level === "caution"
                                ? "border-primary bg-warning-100 text-warning-700"
                                : "border-[#E5D9C6] bg-[#FBF6EC] text-foreground-800",
                        )}
                      >
                        {t.assigneeName.slice(0, 2)} {t.title}
                      </span>
                    ))}
                </div>
              ) : (
                <span key={`blank-${i}`} />
              ),
            )}
          </div>
          {noDue.length > 0 ? (
            <p className="m-0 text-sm text-foreground-600">期限の無い作業: {noDue.map((t) => t.title).join("、")}</p>
          ) : null}
        </section>
      )}
    </div>
  );
}
