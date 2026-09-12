"use client";

import { useState, useTransition } from "react";
import { DeleteDialog, FlashToast } from "@/ui";
import { deleteTaskAction } from "../actions";

/**
 * 作業の取り消し（デザイン正本 `design/poc_design` の削除ダイアログ）。
 *
 * 押した瞬間に消さない。**何が外れて何が残るか**を先に見せ、確認を1つ通してから実行する。
 * このアプリの「消す」は見え方の操作で、記録そのものは残る——それを操作の前に伝える
 * ためのダイアログで、S-18 から30日以内に戻せることもここで言う。
 */
export function DeleteTaskButton({
  taskId,
  title,
  cycle,
  started,
}: {
  taskId: string;
  title: string;
  cycle: string;
  /** 着手済みか（残るものの説明が変わる） */
  started: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("archive");
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ui-btn-ghost h-[34px] w-[62px] text-xs font-normal text-danger"
      >
        削除
      </button>

      <DeleteDialog
        open={open}
        kind="作業タスク"
        name={`${title}（${cycle}）`}
        modes={[
          { value: "archive", label: "一覧から外す（推奨）" },
          { value: "delete", label: "削除する" },
        ]}
        mode={mode}
        onModeChange={setMode}
        effects={[
          "担当船員の持ち作業から外れ、船内の一覧にも出なくなります",
          started
            ? "着手済みの記録は作業記録として残ります"
            : "完了報告のない未着手の作業です",
          "割り当てた記録と取り消した記録は、監査ログに残ります（12.6）",
        ]}
        runLabel={mode === "delete" ? "削除を実行する" : "この内容で一覧から外す"}
        onCancel={() => setOpen(false)}
        onRun={() => {
          setOpen(false);
          startTransition(async () => {
            const res = await deleteTaskAction(taskId, mode === "delete" ? "delete" : "archive");
            setFlash(res.message);
          });
        }}
      />

      {pending ? null : <FlashToast message={flash} onDone={() => setFlash(null)} />}
    </>
  );
}
