"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CheckLevel } from "@/domain/labor-law/types";
import { cn } from "@/lib/cn";
import { CrewPhoto, FlashToast, StatusChip, Whiteboard, WhiteboardFrame } from "@/ui";
import { advanceTaskOnBoardAction, createTaskOnBoardAction, reassignTaskAction } from "../actions";
import { DeleteTaskButton } from "./delete-task";

export interface BoardTask {
  id: string;
  title: string;
  vesselId: string;
  assigneeCrewId: string | null;
  assigneeName: string;
  dueAt: string | null;
  dueLabel: string;
  state: "todo" | "doing" | "done";
  stateLabel: string;
  cycle: string;
  level: CheckLevel | "none";
}

export interface BoardVesselCrew {
  vesselId: string;
  vesselName: string;
  crew: { crewMemberId: string; name: string; position: string; photo?: string; photoDataUrl?: string }[];
}

const STATE_MARK: Record<BoardTask["state"], string> = { todo: "○", doing: "◐", done: "●" };

/**
 * 作業指示のホワイトボード（レビュー ORDER-02「配乗計画と同様の Miro のような UX で、船ごとに各船員への仕事の割り当て・確認」）。
 *
 * 船ごとの枠の中に、乗っている船員の列と「未割当」の列を並べ、作業を付箋で置く。
 * - 付箋を別の船員の列へ**ドラッグすると付け替え**（追記で履歴に残る）
 * - 列の「＋」から、その人の作業を**その場で作る**
 * - 付箋を**押すと**右に内容が出て、状態を進める・取り消すができる
 */
export function TaskBoard({ vessels, tasks }: { vessels: BoardVesselCrew[]; tasks: BoardTask[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  function run(action: () => Promise<{ ok: boolean; message: string }>, after?: () => void) {
    startTransition(async () => {
      const res = await action();
      setFlash(res.message);
      if (res.ok) {
        after?.();
        router.refresh();
      }
    });
  }

  function moveTo(vesselId: string, crewId: string | null) {
    return (taskId: string) => {
      const t = tasks.find((x) => x.id === taskId);
      if (!t || t.vesselId !== vesselId || t.assigneeCrewId === crewId) return; // 別の船への移動は扱わない
      run(() => reassignTaskAction(taskId, crewId));
    };
  }

  return (
    <div className={cn("grid items-start gap-4", selected && "2xl:grid-cols-[minmax(0,1fr)_340px]")}>
      <div className="flex flex-col gap-2">
        {pending ? <p className="m-0 text-sm text-primary">保存中…</p> : null}
        <Whiteboard label="作業指示のボード" height={600}>
          {vessels.map((v) => {
            const lanes: { key: string; crewId: string | null; title: string; crew?: BoardVesselCrew["crew"][number] }[] = [
              { key: "none", crewId: null, title: "未割当" },
              ...v.crew.map((c) => ({ key: c.crewMemberId, crewId: c.crewMemberId, title: c.name, crew: c })),
            ];
            const vesselTasks = tasks.filter((t) => t.vesselId === v.vesselId && t.state !== "done");
            return (
              <div key={v.vesselId} className="flex flex-col gap-2">
                <p className="m-0 px-1 text-xl font-bold text-foreground-900">
                  {v.vesselName}
                  <span className="ml-2 font-mono text-sm font-normal text-foreground-500">{vesselTasks.length}件</span>
                </p>
                <div className="flex items-start gap-3 rounded-[4px] border border-[var(--ui-hairline-strong)] bg-content1/60 p-3">
                  {lanes.map((lane) => {
                    const items = vesselTasks.filter((t) => (t.assigneeCrewId ?? null) === lane.crewId);
                    const addKey = `${v.vesselId}|${lane.key}`;
                    return (
                      <WhiteboardFrame
                        key={lane.key}
                        width={210}
                        tone={lane.crewId ? "paper" : "muted"}
                        title={
                          <span className="flex items-center gap-2">
                            {lane.crew ? (
                              <CrewPhoto name={lane.crew.name} initial={lane.crew.photo} src={lane.crew.photoDataUrl} size="xs" />
                            ) : null}
                            <span className="truncate text-base">{lane.title}</span>
                          </span>
                        }
                        actions={
                          <button
                            type="button"
                            className="ui-btn-quiet h-7 w-7 !p-0"
                            aria-label={`${v.vesselName} ${lane.title} に作業を足す`}
                            onClick={() => setAdding(adding === addKey ? null : addKey)}
                          >
                            ＋
                          </button>
                        }
                        onDropCard={moveTo(v.vesselId, lane.crewId)}
                      >
                        {adding === addKey ? (
                          <AddTask
                            pending={pending}
                            onCancel={() => setAdding(null)}
                            onAdd={(title, dueAt) =>
                              run(
                                () =>
                                  createTaskOnBoardAction({
                                    title,
                                    dueAt,
                                    targetVesselId: v.vesselId,
                                    assigneeCrewId: lane.crewId ?? undefined,
                                  }),
                                () => setAdding(null),
                              )
                            }
                          />
                        ) : null}
                        {items.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", t.id);
                            }}
                            onClick={() => setSelectedId(t.id)}
                            aria-label={`${t.title}（${t.stateLabel}・${t.dueLabel}）`}
                            className={cn(
                              "flex cursor-grab flex-col gap-1 rounded-[3px] border p-2 text-left shadow-none active:cursor-grabbing",
                              t.level === "violation"
                                ? "border-danger bg-danger-100"
                                : t.level === "caution"
                                  ? "border-primary bg-warning-100"
                                  : "border-[#E5D9C6] bg-[#FBF6EC]",
                              selectedId === t.id && "ring-2 ring-primary",
                            )}
                          >
                            <span className="text-sm font-bold leading-snug text-foreground-900">{t.title}</span>
                            <span className="flex items-center gap-1.5 font-mono text-xs text-foreground-600">
                              <span aria-hidden="true">{STATE_MARK[t.state]}</span>
                              {t.dueLabel}
                            </span>
                          </button>
                        ))}
                        {items.length === 0 && adding !== addKey ? (
                          <p className="m-0 py-3 text-center text-xs text-foreground-500">ここへドラッグ</p>
                        ) : null}
                      </WhiteboardFrame>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Whiteboard>
      </div>

      {selected ? (
        <section aria-label="作業の内容" className="ui-card flex flex-col gap-3 border-primary p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="m-0 text-lg font-bold leading-snug text-foreground-900">{selected.title}</p>
            <button type="button" className="ui-btn-quiet h-8 w-8 !p-0" aria-label="閉じる" onClick={() => setSelectedId(null)}>
              ✕
            </button>
          </div>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-base">
            <dt className="text-foreground-500">担当</dt>
            <dd className="m-0">{selected.assigneeName}</dd>
            <dt className="text-foreground-500">船</dt>
            <dd className="m-0">{vessels.find((v) => v.vesselId === selected.vesselId)?.vesselName ?? "—"}</dd>
            <dt className="text-foreground-500">期限</dt>
            <dd className="m-0 flex items-center gap-2">
              <span className="font-mono">{selected.dueAt ?? "—"}</span>
              <StatusChip level={selected.level} size="sm" label={selected.dueLabel} />
            </dd>
            <dt className="text-foreground-500">状態</dt>
            <dd className="m-0">{selected.stateLabel}</dd>
            <dt className="text-foreground-500">周期</dt>
            <dd className="m-0">{selected.cycle}</dd>
          </dl>
          <div className="flex flex-wrap gap-2 border-t border-[var(--ui-hairline)] pt-3">
            {selected.state !== "done" ? (
              <button
                type="button"
                className="ui-btn-primary h-10 flex-1"
                disabled={pending}
                onClick={() => run(() => advanceTaskOnBoardAction(selected.id), () => setSelectedId(null))}
              >
                {selected.state === "todo" ? "着手にする" : "完了にする"}
              </button>
            ) : null}
            <DeleteTaskButton taskId={selected.id} title={selected.title} cycle={selected.cycle} started={selected.state !== "todo"} />
          </div>
        </section>
      ) : null}

      <FlashToast message={flash} onDone={() => setFlash(null)} />
    </div>
  );
}

function AddTask({
  pending,
  onAdd,
  onCancel,
}: {
  pending: boolean;
  onAdd: (title: string, dueAt?: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  return (
    <div className="flex flex-col gap-1.5 rounded-[3px] border border-primary bg-content1 p-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="作業の内容"
        aria-label="作業の内容"
        className="ui-field !py-1.5 !text-sm"
      />
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="期限" className="ui-field !py-1.5 font-mono !text-sm" />
      <div className="flex gap-1.5">
        <button type="button" className="ui-btn-quiet flex-1" onClick={onCancel}>
          やめる
        </button>
        <button
          type="button"
          className="ui-btn-primary h-8 flex-1 text-sm"
          disabled={pending || !title.trim()}
          onClick={() => onAdd(title.trim(), due || undefined)}
        >
          追加
        </button>
      </div>
    </div>
  );
}
