"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DeleteDialog, FlashToast } from "@/ui";
import { retireCrewAction } from "../actions";

/**
 * 船員の無効化（デザイン正本 `design/poc_design` の削除ダイアログ）。
 *
 * 退職・下船は「消す」ではなく**無効化**で扱うのが原則（デザインの `DELETE_RULES`）。
 * 打刻と日次レコードは改変できないので必ず残り、消えるのは配乗・当直・未完了タスクの
 * 紐付けだけ——それを実行の前に並べて見せる。30日以内なら S-18 から戻せる。
 */
export function RetireCrewButton({ crewMemberId, name }: { crewMemberId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("archive");
  const [flash, setFlash] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="ui-btn-ghost h-9 text-danger">
        退職・無効化にする
      </button>

      <DeleteDialog
        open={open}
        kind="船員"
        name={name}
        modes={[
          { value: "archive", label: "退職として無効化（推奨）" },
          { value: "delete", label: "登録を削除する" },
        ]}
        mode={mode}
        onModeChange={setMode}
        effects={[
          "配乗・当直シフト・未完了タスクから外れます",
          "打刻と日次レコードは改変できないため残ります（保存期間5年）",
          "提出済みの届出・帳票は、提出したときの内容のまま残ります",
        ]}
        runLabel={mode === "delete" ? "削除を実行する" : "この内容で無効化する"}
        onCancel={() => setOpen(false)}
        onRun={() => {
          setOpen(false);
          startTransition(async () => {
            const res = await retireCrewAction(
              crewMemberId,
              mode === "delete" ? "delete" : "archive",
            );
            setFlash(res.message);
            if (res.ok) router.refresh();
          });
        }}
      />

      <FlashToast message={flash} onDone={() => setFlash(null)} />
    </>
  );
}
