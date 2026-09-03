import { t } from "@/i18n/ja";
import { personName } from "@/lib/crew";
import { fmtDateLabel, fmtDateTime } from "@/lib/format";
import { RISK_SCALE } from "@/lib/safety-plain";
import { crewNameOf } from "@/server/master-service";
import { buildSafetyBoard, notifiedAtOf } from "@/server/safety-service";
import { hasShorePermission, requireShore } from "@/server/shore-session";
import { StatusChip } from "@/ui";
import { ShoreGuardNotice } from "../_components/guard";
import { IncidentPanel } from "./_components/incident-panel";
import { SmsForm } from "./_components/sms-form";
import { SmsStatusForm } from "./_components/sms-status-form";

export const dynamic = "force-dynamic";

/** 影響度・発生度の目盛（利用者向けの言い換え） */
const SEVERITY_LABEL: Record<number, string> = {
  1: "軽い",
  2: "やや軽い",
  3: "中くらい",
  4: "重い",
  5: "とても重い",
};
const LIKELIHOOD_LABEL: Record<number, string> = {
  1: "まれ",
  2: "たまに",
  3: "ときどき",
  4: "しばしば",
  5: "頻繁",
};

/**
 * 安全管理・事故報告（要件定義書 3.5.1 SMS / 3.5.2 事故・インシデント / 6.5 報告書ドラフト）。
 *
 * 見るのは全員（view_dashboard）。**記入は運航管理の権限（manage_fleet）を持つ人だけ**で、
 * Server Action の中でも同じ権限を再チェックしている。
 */
export default async function ShoreSafetyPage() {
  const guard = await requireShore("view_dashboard");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="安全管理・事故報告" />;
  const canWrite = await hasShorePermission("manage_fleet");

  const board = buildSafetyBoard();
  const maxNearMiss = Math.max(board.nearMissTarget, ...board.nearMiss.map((m) => m.count), 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">安全管理・事故報告</h1>
        <p className="text-sm text-foreground-500">
          {canWrite ? "記入できます" : "この画面は見るだけです（記入は運航管理の担当者が行います）"}
        </p>
      </div>

      {/* ── 3.5.1 安全方針・重点施策 ── */}
      <section aria-label="安全方針・重点施策" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">安全方針・重点施策</h2>
        {board.policies.length === 0 ? (
          <p className="text-sm text-foreground-500">安全方針は登録されていません。</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {board.policies.map((p) => (
              <li key={p.id} className="border-b border-[var(--glass-border)] pb-2 last:border-b-0">
                <p className="font-semibold">{p.title}</p>
                {p.body ? <p className="text-foreground-600">{p.body}</p> : null}
                <p className="text-xs text-foreground-500">
                  {fmtDateTime(p.occurredAt)}
                  {p.responsible ? ` / 担当 ${crewNameOf(p.responsible)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 3.5.1 リスクアセスメント（影響度 × 発生度） ── */}
      <section aria-label="リスクアセスメント" className="glass-tile p-4">
        <h2 className="mb-1 font-bold">リスクアセスメント</h2>
        <p className="mb-3 text-sm text-foreground-500">
          縦が「起きたときの重さ」、横が「起きやすさ」です。右上ほど先に手を打つべきものです。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">影響度 × 発生度 のリスクマトリクス（件数）</caption>
            <thead>
              <tr>
                <th className="px-2 py-1 text-left font-medium text-foreground-500">
                  重さ \ 起きやすさ
                </th>
                {RISK_SCALE.map((l) => (
                  <th key={l} className="px-2 py-1 font-medium text-foreground-500">
                    {l}
                    <span className="block text-xs font-normal">{LIKELIHOOD_LABEL[l]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...board.riskMatrix].reverse().map((row) => (
                <tr key={row[0].severity}>
                  <th className="px-2 py-1 text-left font-medium text-foreground-500">
                    {row[0].severity}
                    <span className="ml-1 text-xs font-normal">{SEVERITY_LABEL[row[0].severity]}</span>
                  </th>
                  {row.map((cell) => {
                    const n = cell.documents.length;
                    const high = cell.level === "violation";
                    const mid = cell.level === "caution";
                    return (
                      <td
                        key={`${cell.severity}-${cell.likelihood}`}
                        className={`px-2 py-2 text-center tabular-nums ${
                          high
                            ? "border-2 border-danger font-bold"
                            : mid
                              ? "border border-warning"
                              : "border border-[var(--glass-border)]"
                        } ${n > 0 ? "bg-foreground/10" : ""}`}
                      >
                        <span aria-hidden="true">{high ? "✕ " : mid ? "⚠ " : ""}</span>
                        {n > 0 ? `${n}件` : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-foreground-500">
          ✕ = 先に手を打つべき区画 / ⚠ = 対策を決めておく区画（区分けの基準は自社の安全管理の決めごとです）
        </p>

        {board.risks.length === 0 ? (
          <p className="mt-3 text-sm text-foreground-500">リスクアセスメントの記録はありません。</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {board.risks.map((r) => (
              <li key={r.id} className="border-b border-[var(--glass-border)] pb-2 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip
                    level={r.status === "closed" ? "ok" : "caution"}
                    size="sm"
                    label={t.findingStatus[r.status ?? "open"]}
                  />
                  <span className="font-semibold">{r.title}</span>
                  <span className="tabular-nums text-foreground-500">
                    重さ {r.severity ?? "—"} × 起きやすさ {r.likelihood ?? "—"}
                  </span>
                </div>
                {r.body ? <p className="text-foreground-600">{r.body}</p> : null}
                {r.correctiveAction ? (
                  <p className="text-foreground-600">対策: {r.correctiveAction}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 3.5.1 不適合・是正措置 ── */}
      <section aria-label="不適合・是正措置" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">
          不適合・是正措置
          <span className="ml-2 tabular-nums text-sm font-normal text-foreground-500">
            未完了 {board.nonconformities.filter((n) => n.status !== "closed").length}件
          </span>
        </h2>
        {board.nonconformities.length === 0 ? (
          <p className="text-sm text-foreground-500">不適合の記録はありません。</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {board.nonconformities.map((n) => (
              <li
                key={n.id}
                className={`flex flex-col gap-2 border-b border-[var(--glass-border)] pb-3 text-sm last:border-b-0 ${
                  n.status !== "closed" ? "border-l-2 border-l-warning pl-2" : ""
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip
                    level={n.status === "closed" ? "ok" : n.status === "in_progress" ? "caution" : "violation"}
                    size="sm"
                    label={t.findingStatus[n.status ?? "open"]}
                  />
                  <span className="font-semibold">{n.title}</span>
                  <span className="tabular-nums text-foreground-500">
                    {n.dueOn ? `期限 ${fmtDateLabel(n.dueOn)}` : "期限なし"}
                    {n.responsible ? ` / 担当 ${crewNameOf(n.responsible)}` : ""}
                  </span>
                </div>
                {n.body ? <p className="text-foreground-600">{n.body}</p> : null}
                {n.correctiveAction ? (
                  <p className="text-foreground-600">是正: {n.correctiveAction}</p>
                ) : null}
                {canWrite ? (
                  <SmsStatusForm
                    documentId={n.id}
                    status={n.status ?? "open"}
                    correctiveAction={n.correctiveAction}
                    dueOn={n.dueOn}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 3.5.1 内部監査 ── */}
      <section aria-label="内部監査" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">内部監査</h2>
        {board.audits.length === 0 ? (
          <p className="text-sm text-foreground-500">内部監査の記録はありません。</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {board.audits.map((a) => (
              <li key={a.id} className="border-b border-[var(--glass-border)] pb-2 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip
                    level={a.status === "closed" ? "ok" : "caution"}
                    size="sm"
                    label={t.findingStatus[a.status ?? "open"]}
                  />
                  <span className="font-semibold">{a.title}</span>
                  <span className="tabular-nums text-foreground-500">
                    {a.auditedOn ? `実施 ${fmtDateLabel(a.auditedOn)}` : "実施日なし"}
                    {a.auditor ? ` / 監査員 ${crewNameOf(a.auditor)}` : ""}
                  </span>
                </div>
                {a.body ? <p className="text-foreground-600">所見: {a.body}</p> : null}
                {a.correctiveAction ? (
                  <p className="text-foreground-600">是正: {a.correctiveAction}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canWrite ? <SmsForm /> : null}

      {/* ── 3.5.2 ヒヤリハットの件数推移 ── */}
      <section aria-label="ヒヤリハットの件数" className="glass-tile p-4">
        <h2 className="mb-1 font-bold">ヒヤリハットの報告件数（月別）</h2>
        <p className="mb-3 text-sm text-foreground-500">
          重点施策の目標は「月 {board.nearMissTarget}件以上」です。届かない月は報告しやすい雰囲気か
          見直してください。
        </p>
        <div className="flex items-end gap-4 overflow-x-auto pb-1">
          {board.nearMiss.map((m) => (
            <div key={m.month} className="flex w-16 shrink-0 flex-col items-center gap-1">
              <span className="text-xs tabular-nums">{m.count}件</span>
              <div
                className={`w-8 rounded-t-sm ${m.meetsTarget ? "bg-foreground" : "bg-foreground/35"}`}
                style={{ height: `${Math.max(4, (m.count / maxNearMiss) * 96)}px` }}
                aria-hidden="true"
              />
              <span className="text-xs tabular-nums text-foreground-500">{m.month.slice(5)}月</span>
              <span className={`text-xs ${m.meetsTarget ? "text-success" : "text-warning-700"}`}>
                {m.meetsTarget ? "✓ 達成" : "⚠ 未達"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3.5.2 事故・インシデント報告 ── */}
      <section aria-label="事故・インシデント" className="flex flex-col gap-3">
        <h2 className="font-bold">
          事故・ヒヤリハットの報告
          <span className="ml-2 tabular-nums text-sm font-normal text-foreground-500">
            対応が残っているもの {board.incidents.filter((i) => i.status !== "closed").length}件
          </span>
        </h2>
        {board.incidents.length === 0 ? (
          <p className="glass-tile p-4 text-sm text-foreground-500">報告はありません。</p>
        ) : (
          board.incidents.map((i) => (
            <article
              key={i.id}
              className={`glass-tile flex flex-col gap-2 p-4 ${
                i.status !== "closed" ? "border-l-2 border-l-warning" : ""
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <StatusChip
                  level={i.status === "closed" ? "ok" : i.status === "investigating" ? "caution" : "violation"}
                  size="sm"
                  label={t.incidentStatus[i.status]}
                />
                <span className="font-bold">{i.title}</span>
                <span className="text-foreground-500">{t.incidentKind[i.kind]}</span>
                <span className="tabular-nums text-foreground-500">{fmtDateTime(i.occurredAt)}</span>
                <span className="text-foreground-500">{i.location ?? "場所の記入なし"}</span>
                <span className="text-foreground-500">記録 {personName(i.recordedBy)}</span>
                <span className={i.reportedToAuthority ? "text-foreground-600" : "text-foreground-500"}>
                  役所への報告: {i.reportedToAuthority ? `済（${i.authorityReportedOn ?? "日付なし"}）` : "なし"}
                </span>
              </div>

              <dl className="flex flex-col gap-1 text-sm">
                <Row label="状況" value={i.description} />
                <Row label="被害" value={[i.injured, i.damage].filter(Boolean).join(" / ")} />
                <Row label="原因の分析" value={i.cause} missing="陸上でこれから記入します" />
                <Row
                  label="再発防止の策"
                  value={i.preventiveAction}
                  missing="陸上でこれから記入します"
                />
                <Row
                  label="付近の船への通報"
                  value={
                    i.notifiedNearbyShips
                      ? `済（${notifiedAtOf(i) ? fmtDateTime(notifiedAtOf(i)!) : "日時の記入なし"}）`
                      : undefined
                  }
                  missing={i.kind === "container_loss" ? "未通報（荷が落ちたときは通報が要ります）" : "該当なし"}
                />
              </dl>

              {canWrite ? (
                <IncidentPanel
                  incidentId={i.id}
                  status={i.status}
                  cause={i.cause}
                  preventiveAction={i.preventiveAction}
                  reportedToAuthority={i.reportedToAuthority ?? false}
                  authorityReportedOn={i.authorityReportedOn}
                  notifiedNearbyShips={i.notifiedNearbyShips ?? false}
                  notifiedNearbyShipsAt={notifiedAtOf(i)}
                  needsNearbyNotice={i.kind === "container_loss"}
                />
              ) : null}
            </article>
          ))
        )}
      </section>

      {/* ── 6.5 生成した報告書ドラフト ── */}
      <section aria-label="報告書の下書き" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">作った報告書の下書き</h2>
        {board.drafts.length === 0 ? (
          <p className="text-sm text-foreground-500">
            まだ下書きはありません。事故の欄から作れます（作った時点の内容がそのまま保存されます）。
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {board.drafts.map((d) => (
              <li key={d.id} className="flex flex-wrap gap-2">
                <span className="tabular-nums text-foreground-500">{d.generatedOn}</span>
                <span className="font-semibold">{d.title}</span>
                <span className="text-foreground-500">{d.subjectLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, missing }: { label: string; value?: string; missing?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <dt className="shrink-0 text-foreground-500">{label}</dt>
      <dd className={value ? "" : "text-foreground-500"}>{value || missing || "—"}</dd>
    </div>
  );
}
