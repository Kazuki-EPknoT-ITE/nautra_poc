import Link from "next/link";
import { PROCEDURE_GROUP_LABEL } from "@/domain/procedures/deadlines";
import { t } from "@/i18n/ja";
import { buildProcedureBoard, procedureFormOptions, type ProcedureRow } from "@/server/procedure-service";
import { requireShore } from "@/server/shore-session";
import { StatusChip } from "@/ui";
import { ShoreGuardNotice } from "../_components/guard";
import { CompleteButton } from "./_components/complete-button";
import { EventChainForm, NewProcedureForm } from "./_components/procedure-forms";

export const dynamic = "force-dynamic";

/**
 * S-08 手続き・期限管理（要件定義書 6.1 4群マップ / 6.2 / 6.5 / 6.6①②）。
 *
 * 6.6②「期限は提出期限でなく**着手期限**で管理する」に従い、各行に**着手期限**を必ず出す。
 * 着手期限は `dueOn − leadTimeDays` の導出値で、レコードには保存していない。
 */

function ProcedureTable({ rows }: { rows: ProcedureRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-foreground-500">この群の手続きはありません。</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-[var(--glass-border)] text-left text-foreground-500">
            <th className="px-2 py-2 font-medium">状態</th>
            <th className="px-2 py-2 font-medium">標題・根拠</th>
            <th className="px-2 py-2 font-medium">対象</th>
            <th className="px-2 py-2 font-medium">提出期限</th>
            <th className="px-2 py-2 font-medium">着手期限</th>
            <th className="px-2 py-2 font-medium">いまの状況</th>
            <th className="px-2 py-2 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ status, subjectLabel }) => (
            <tr key={status.task.id} className="border-b border-[var(--glass-border)] last:border-b-0">
              <td className="px-2 py-2">
                <StatusChip size="sm" level={status.level} label={t.procedureState[status.state]} />
              </td>
              <td className="px-2 py-2">
                <p className="font-semibold">{status.task.title}</p>
                {status.task.basis ? (
                  <p className="text-xs text-foreground-500">{status.task.basis}</p>
                ) : null}
                <p className="text-xs text-foreground-500">
                  {t.procedureStatus[status.task.status]}
                  {status.task.sourceEventId ? "／出来事から自動で起票" : ""}
                </p>
              </td>
              <td className="px-2 py-2">{subjectLabel}</td>
              <td className="px-2 py-2 tabular-nums">{status.task.dueOn ?? "—"}</td>
              <td className="px-2 py-2 tabular-nums">
                {status.startOn ?? "—"}
                {status.task.leadTimeDays !== undefined ? (
                  <span className="ml-1 text-xs text-foreground-500">
                    （準備 {status.task.leadTimeDays}日）
                  </span>
                ) : null}
              </td>
              <td className="px-2 py-2">{status.message}</td>
              <td className="px-2 py-2">
                {status.state === "done" || status.state === "canceled" ? (
                  <span className="text-foreground-500">—</span>
                ) : (
                  <CompleteButton taskId={status.task.id} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ShoreProceduresPage() {
  const guard = await requireShore("manage_procedures");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="手続き・期限管理" />;

  const board = buildProcedureBoard(new Date());
  const options = procedureFormOptions();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">手続き・期限</h1>
        <p className="text-sm text-foreground-500">
          提出期限ではなく「準備を始める日」で管理します（基準日 {board.today}）
        </p>
      </div>

      <section aria-label="いま気にすべき件数" className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "期限を過ぎたもの",
            value: board.summary.overdue,
            cls: board.summary.overdue > 0 ? "text-danger" : "",
            icon: board.summary.overdue > 0 ? "✕" : "✓",
          },
          {
            label: "期限が近いもの",
            value: board.summary.dueSoon,
            cls: board.summary.dueSoon > 0 ? "text-danger" : "",
            icon: board.summary.dueSoon > 0 ? "✕" : "✓",
          },
          {
            label: "準備を始める時期",
            value: board.summary.startDue,
            cls: board.summary.startDue > 0 ? "text-warning-700" : "",
            icon: board.summary.startDue > 0 ? "⚠" : "✓",
          },
        ].map((s) => (
          <div key={s.label} className="glass-tile p-4">
            <p className="text-sm text-foreground-600">{s.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${s.cls}`}>
              <span aria-hidden="true">{s.icon}</span> {s.value}件
            </p>
          </div>
        ))}
      </section>

      {board.byGroup.map(({ group, rows }) => (
        <section key={group} aria-label={PROCEDURE_GROUP_LABEL[group]} className="glass-tile p-4">
          <h2 className="mb-2 font-bold">
            {PROCEDURE_GROUP_LABEL[group]}{" "}
            <span className="tabular-nums font-normal text-foreground-500">{rows.length}件</span>
          </h2>
          <ProcedureTable rows={rows} />
        </section>
      ))}

      {/* 6.5「期限管理・アラート（3.1.1）」— 証書の期限も同じ画面で見る */}
      <section aria-label="証書の期限・鮮度" className="glass-tile p-4">
        <h2 className="mb-1 font-bold">
          証書の期限・鮮度{" "}
          <span className="tabular-nums font-normal text-foreground-500">
            {board.credentialAlerts.length}件
          </span>
        </h2>
        <p className="mb-2 text-sm text-foreground-600">
          期限切れ（不適合）と、期限内だが確認が古いもの（要再確認）を分けて出しています。
        </p>
        {board.credentialAlerts.length === 0 ? (
          <p className="text-sm text-foreground-500">気にすべき証書はありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-[var(--glass-border)] text-left text-foreground-500">
                  <th className="px-2 py-2 font-medium">状態</th>
                  <th className="px-2 py-2 font-medium">対象</th>
                  <th className="px-2 py-2 font-medium">証書</th>
                  <th className="px-2 py-2 font-medium">期限</th>
                  <th className="px-2 py-2 font-medium">確認</th>
                  <th className="px-2 py-2 font-medium">いまの状況</th>
                </tr>
              </thead>
              <tbody>
                {board.credentialAlerts.map((a) => (
                  <tr
                    key={`${a.subjectId}-${a.status.credential.id}`}
                    className="border-b border-[var(--glass-border)] last:border-b-0"
                  >
                    <td className="px-2 py-2">
                      <StatusChip
                        size="sm"
                        level={a.status.level}
                        label={t.expiryState[a.status.expiry]}
                      />
                    </td>
                    <td className="px-2 py-2">
                      {a.subjectType === "crew" ? (
                        <Link
                          href={`/shore/crew/${a.subjectId}`}
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          {a.subjectName}
                        </Link>
                      ) : (
                        a.subjectName
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span className="font-semibold">{a.status.credential.name}</span>
                      <span className="ml-2 text-xs text-foreground-500">
                        {t.credentialCategory[a.status.credential.category]}
                      </span>
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {a.status.credential.expiresOn ?? "期限なし"}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={
                          a.status.freshness === "fresh" ? "" : "font-semibold text-warning-700"
                        }
                      >
                        {a.status.freshness === "fresh" ? "✓ " : "⚠ "}
                        {t.freshnessState[a.status.freshness]}
                      </span>
                    </td>
                    <td className="px-2 py-2">{a.status.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <EventChainForm options={options} today={board.today} />
      <NewProcedureForm options={options} />

      <p className="text-xs text-foreground-500">
        着手期限・残り日数はいずれも導出値で、記録には保存していません。完了にしても元の記録は残り、
        「完了」の新しいレコードが追記されます。
      </p>
    </div>
  );
}
