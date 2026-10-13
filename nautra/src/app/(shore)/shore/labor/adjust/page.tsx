import Link from "next/link";
import { ymdLocal } from "@/domain/labor-law/evaluate";
import { t } from "@/i18n/ja";
import { fmtDateLabel, fmtDateTime, fmtMinutes } from "@/lib/format";
import { CHECK_PLAIN_LABEL, describeCheck } from "@/lib/labor-plain";
import { buildProposalDay } from "@/server/labor-proposal-service";
import { ledgerCrewOptions } from "@/server/ledger-service";
import { requireShore, shoreStaffById } from "@/server/shore-session";
import { Section, StatusChip } from "@/ui";
import { ShoreGuardNotice } from "../../_components/guard";
import { AdjustForm } from "../_components/adjust-form";

export const dynamic = "force-dynamic";

/**
 * 打刻の修正を依頼する（レビュー LABOR-06。利用者の判断「修正案つきの差戻し」）。
 *
 * 警告・注意が出た日の打刻に、正しい時刻・作業と理由を添えて**本人へ差戻す**。陸上は打刻を書き換えない。
 * 本人が船内で「この内容で直す」を押すと本人名義の再入力として入り、警告が解消する。
 * 画面の下に、その日に送った修正案と、本人が反映したかどうかを並べる。
 */
export default async function LaborAdjustPage({
  searchParams,
}: {
  searchParams: Promise<{ crew?: string; date?: string; saved?: string }>;
}) {
  const guard = await requireShore("approve_labor_manager");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="打刻の修正依頼" />;

  const sp = await searchParams;
  const crews = ledgerCrewOptions();
  const crewMemberId = crews.find((c) => c.id === sp.crew)?.id ?? crews[0]!.id;
  // 既定は今日（ローカル日付。UTC で取ると朝9時まで前日になる）
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : ymdLocal(new Date());
  const day = buildProposalDay(crewMemberId, date);
  const failing = day.summary.checks.filter((c) => c.level !== "ok");
  const staffName = (id: string) => shoreStaffById(id)?.name ?? id;
  const back = `/shore/labor?crew=${crewMemberId}&month=${date.slice(0, 7)}&tab=chart`;
  const pendingTargets = new Set(
    day.proposals.filter((p) => p.status === "pending" && p.target).map((p) => p.target!.id),
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <section aria-label="対象の日" className="ui-card flex flex-wrap items-center gap-4 px-[18px] py-4">
        <div className="min-w-0">
          <p className="m-0 text-2xl font-bold text-foreground-900">
            {day.crewName}
            <span className="ml-3 font-mono text-xl tabular-nums text-foreground-700">{fmtDateLabel(date)}</span>
          </p>
          <p className="m-0 mt-1 font-mono text-base tabular-nums text-foreground-700">
            働いた時間 {fmtMinutes(day.summary.workedMinutes)}
          </p>
        </div>
        <StatusChip
          level={day.summary.level}
          size="lg"
          hint={failing.length > 0 ? failing.map((c) => describeCheck(c)).join(" ") : undefined}
        />
        <Link href={back} className="ui-btn-ghost ml-auto h-9">
          ← 労務・記録簿へ
        </Link>
      </section>

      {failing.length > 0 ? (
        <ul aria-label="この日の警告・注意" className="ui-card m-0 flex list-none flex-col gap-2 px-[18px] py-4">
          {failing.map((c) => (
            <li key={c.key} className="flex flex-wrap items-center gap-2 text-base">
              <StatusChip level={c.level} size="sm" hint={describeCheck(c)} />
              <span className="font-bold">{CHECK_PLAIN_LABEL[c.key]}</span>
              <span className="text-foreground-700">{describeCheck(c)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {sp.saved ? (
        <p role="status" className="ui-card m-0 px-[18px] py-3 text-base text-foreground-800">
          ✓ 修正案を送りました。本人が船内で「この内容で直す」を押すと反映され、警告の判定も直ります。
        </p>
      ) : null}

      {day.records.length === 0 ? (
        <p className="ui-card m-0 px-[18px] py-5 text-base text-foreground-500">この日の打刻はありません。</p>
      ) : null}
      <AdjustForm
        key={`${day.records.map((r) => r.id).join(",")}|${day.proposals.length}`}
        crewMemberId={crewMemberId}
        date={date}
        records={day.records.map((r) => ({
          id: r.id,
          occurredAt: r.occurredAt,
          workCategory: r.workCategory,
          action: r.action,
          pending: pendingTargets.has(r.id),
        }))}
      />

      <Section title="この日に送った修正案" note={`${day.proposals.length}件`} bodyClassName="p-0">
        {day.proposals.length === 0 ? (
          <p className="m-0 px-[18px] py-5 text-base text-foreground-500">まだ送っていません。</p>
        ) : (
          day.proposals.map(({ approval, target, status }) => {
            const p = approval.proposal!;
            return (
              <div key={approval.id} className="border-b border-[var(--ui-hairline)] px-[18px] py-3 last:border-b-0">
                <p className="m-0 flex flex-wrap items-baseline gap-2 text-base">
                  <span
                    className={
                      status === "applied"
                        ? "rounded-small bg-default-100 px-1.5 py-px text-xs font-semibold text-foreground-700"
                        : "rounded-small bg-warning-100 px-1.5 py-px text-xs font-semibold text-warning-700"
                    }
                  >
                    {status === "applied" ? "✓ 本人が反映" : "⚠ 本人の確認待ち"}
                  </span>
                  {target ? (
                    <>
                      <span className="font-mono tabular-nums text-foreground-500 line-through">
                        {fmtDateTime(target.occurredAt)} {t.workCategory[target.workCategory]}
                      </span>
                      <span aria-hidden="true">→</span>
                    </>
                  ) : (
                    <span className="font-bold">追加</span>
                  )}
                  <span className="font-mono font-bold tabular-nums text-foreground-900">
                    {fmtDateTime(p.occurredAt)} {t.workCategory[p.workCategory]}の{p.action === "start" ? "開始" : "終了"}
                  </span>
                </p>
                <p className="m-0 mt-1 text-sm text-foreground-700">理由: {approval.reason}</p>
                <p className="m-0 mt-0.5 font-mono text-xs text-foreground-500">
                  {fmtDateTime(approval.decidedAt)} ／ {staffName(approval.approvedBy)}
                </p>
              </div>
            );
          })
        )}
      </Section>
    </div>
  );
}
