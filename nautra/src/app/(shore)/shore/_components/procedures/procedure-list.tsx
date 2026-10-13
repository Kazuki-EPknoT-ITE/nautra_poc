import Link from "next/link";
import { t } from "@/i18n/ja";
import { fmtDateLabel } from "@/lib/format";
import type { ProcedureRow } from "@/server/procedure-service";
import { StatusChip } from "@/ui";
import { CompleteButton } from "./complete-button";

/**
 * 手続き・期限の一覧（レビュー DEADLINE-01/02）。独立した画面をやめ、関係する画面に置く:
 * 船員カルテ（その船員の手続き）・船の管理ページ（その船の手続き）・届出（会社と全体）。
 *
 * 1行ごとに「**何をすればよいか**」を一文で出し、作業する場所へのリンクを添える
 * （DEADLINE-01「具体的にどう作業するページなのか分からない」への答え）。
 * 期限は提出期限ではなく**準備を始める日**（着手期限。導出値で保存しない。6.6②）で並べる。
 */
export function ProcedureList({
  rows,
  canComplete,
  empty = "手続きはありません",
  showSubject = false,
}: {
  rows: ProcedureRow[];
  /** 「完了にした」を押せるか（manage_procedures） */
  canComplete: boolean;
  empty?: string;
  /** 対象（船員名・船名・事業者）を出すか（届出の一覧のように対象が混ざるときだけ） */
  showSubject?: boolean;
}) {
  const open = rows.filter((r) => r.status.state !== "done" && r.status.state !== "canceled");
  if (open.length === 0) return <p className="m-0 text-sm text-foreground-500">✓ {empty}</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {open.map(({ status, subjectLabel }) => {
        const where = whereToDo(status.task);
        return (
          <li key={status.task.id} className="ui-inset flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3">
            <StatusChip level={status.level} size="sm" label={t.procedureState[status.state]} hint={status.message} />
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-foreground-900" title={status.task.basis}>
                {status.task.title}
                {showSubject ? <span className="ml-2 font-normal text-foreground-600">{subjectLabel}</span> : null}
              </span>
              <span className="block text-sm text-foreground-700">{status.message}</span>
            </span>
            <span className="font-mono text-sm tabular-nums text-foreground-700">
              準備 {status.startOn ? fmtDateLabel(status.startOn) : "—"} ／ 期限 {status.task.dueOn ? fmtDateLabel(status.task.dueOn) : "—"}
            </span>
            {where ? (
              <Link href={where.href} className="ui-btn-quiet">
                {where.label} ›
              </Link>
            ) : null}
            {canComplete ? <CompleteButton taskId={status.task.id} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** その手続きを実際にする場所（届出なら届出の作成、船員の証書なら資格・証書の登録） */
function whereToDo(task: ProcedureRow["status"]["task"]): { href: string; label: string } | null {
  const text = `${task.title} ${task.basis ?? ""}`;
  if (/届|申請|報告|登録|名簿|記帳/.test(text)) return { href: "/shore/filings", label: "届出を作る" };
  if (task.subjectType === "crew" && task.subjectId && /免状|証|講習|健康|訓練/.test(text)) {
    return { href: `/shore/crew/${task.subjectId}/credentials`, label: "資格・証書へ" };
  }
  if (task.subjectType === "vessel" && task.subjectId) return { href: `/shore/fleet/${task.subjectId}`, label: "船の管理へ" };
  return null;
}
