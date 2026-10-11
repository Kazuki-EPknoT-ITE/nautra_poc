import Link from "next/link";
import { t } from "@/i18n/ja";
import { fmtDateTime } from "@/lib/format";
import { requireShore } from "@/server/shore-session";
import {
  buildVesselEnvironments,
  buildWellbeingSummary,
  listConsultations,
  wellbeingRules,
  wifiLabel,
  type WellbeingSummary,
} from "@/server/wellbeing-service";
import { ShoreGuardNotice } from "../_components/guard";
import { StatusChip } from "@/ui";
import { ConsultationReplyForm } from "./_components/consultation-reply-form";

/** 答える（相談）と見る（集計・船内環境）をタブで分ける（レビュー HEALTH-04） */
const TABS = [
  { id: "consult", label: "相談に答える" },
  { id: "survey", label: "アンケートの集計" },
  { id: "env", label: "船内環境・求人票" },
] as const;

export const dynamic = "force-dynamic";

/** 平均を細い棒で表す（白黒基調。数値を必ず併記する） */
function AverageBar({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="inline-block h-2 w-24 rounded-full bg-default-100" aria-hidden="true">
        <span
          className="block h-2 rounded-full bg-foreground/70"
          style={{ width: `${Math.max(0, Math.min(value, 5)) * 20}%` }}
        />
      </span>
      <span className="tabular-nums text-sm">{value.toFixed(1)} / 5.0</span>
    </span>
  );
}

/** アンケート1種別の集計。回答が少ないときは集計を出さない */
function SummarySection({ summary }: { summary: WellbeingSummary }) {
  const title = t.wellbeingFormType[summary.formType];
  return (
    <section aria-label={title} className="ui-card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold">{title}</h2>
        <p className="tabular-nums text-sm text-foreground-500">
          回答 {summary.responseCount}件{summary.latestOn ? ` / 直近 ${summary.latestOn}` : ""}
        </p>
      </div>

      {summary.responseCount === 0 ? (
        <p className="text-sm text-foreground-500">まだ回答はありません。</p>
      ) : summary.suppressed ? (
        <p className="m-0">
          <StatusChip
            level="caution"
            label={`回答 ${summary.minResponses}件未満のため集計を出しません`}
            hint="少ない回答で集計を出すと、誰の回答か分かってしまうため（10.3）"
          />
        </p>
      ) : summary.items.length === 0 ? (
        <p className="text-sm text-foreground-500">集計できる設問がありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
                <th className="py-2 pr-3 font-medium">設問</th>
                <th className="py-2 pr-3 font-medium">平均</th>
                <th className="py-2 pr-3 font-medium">回答の分かれ方（1〜5）</th>
              </tr>
            </thead>
            <tbody>
              {summary.items.map((item) => (
                <tr key={item.key} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                  <td className="py-2 pr-3">{item.label}</td>
                  <td className="py-2 pr-3">
                    <AverageBar value={item.average} />
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-xs text-foreground-600">
                    {item.distribution.map((count, i) => `${i + 1}:${count}人`).join(" / ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * 健康・ハラスメント相談窓口の陸上受付側（要件定義書 3.5.3 / 10.3）。
 *
 * 匿名が原則のため、この画面には**個人を特定できる情報を渡していない**。
 * アンケートは集計だけを出し、回答が少ないときは集計自体を出さない。
 * 船内の環境情報は求人票へ正しく反映するため、確認日が古ければ再確認をうながす。
 */
export default async function ShoreWellbeingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const guard = await requireShore("view_wellbeing");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="健康・相談窓口" />;

  const healthSurvey = buildWellbeingSummary("health_survey");
  const stressCheck = buildWellbeingSummary("stress_check");
  const consultations = listConsultations();
  const environments = buildVesselEnvironments();

  const sp = await searchParams;
  const tab = TABS.some((x) => x.id === sp.tab) ? sp.tab! : "consult";
  // まだ答えていない相談を先に並べる
  const open = consultations.filter((c) => c.status !== "responded");
  const answered = consultations.filter((c) => c.status === "responded");

  return (
    <div className="flex flex-col gap-[18px]">
      <nav aria-label="健康・相談の主題" className="ui-card flex flex-wrap gap-2 p-3">
        {TABS.map((x) => (
          <Link
            key={x.id}
            href={`/shore/wellbeing?tab=${x.id}`}
            aria-current={x.id === tab ? "page" : undefined}
            className={`ui-btn-quiet ${x.id === tab ? "ui-btn-selected" : ""}`}
          >
            {x.label}
            {x.id === "consult" && open.length > 0 ? <span className="ml-1.5 font-mono text-xs">未回答 {open.length}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "consult" ? (
        <section aria-label="相談・通報" className="flex flex-col gap-3">
          {consultations.length === 0 ? (
            <p className="ui-card m-0 p-4 text-sm text-foreground-500">届いている相談はありません</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {[...open, ...answered.slice(0, 10)].map((c) => (

              <li key={c.id} className="ui-card flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="tabular-nums text-sm text-foreground-500">
                    {fmtDateTime(c.occurredAt)}
                  </span>
                  <StatusChip
                    level={c.status === "submitted" ? "caution" : "none"}
                    size="sm"
                    label={`${c.status === "responded" ? "✓ " : ""}${t.wellbeingStatus[c.status]}`}
                    hint={false}
                  />
                </div>
                {/* 匿名の相談は氏名欄をそもそも描かない（匿名でない場合だけ名前を出す） */}
                {c.anonymous ? null : <p className="m-0 text-xs text-foreground-500">記名: {c.displayName}</p>}
                <p className="whitespace-pre-wrap text-sm">{c.message}</p>
                {c.response ? (
                  <div className="ui-inset p-3">
                    <p className="text-xs text-foreground-500">
                      陸上からの回答
                      {c.respondedAt ? `（${fmtDateTime(c.respondedAt)}）` : ""}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{c.response}</p>
                  </div>
                ) : null}
                {c.status !== "responded" ? (
                  <ConsultationReplyForm responseId={c.id} canReceive={c.status === "submitted"} />
                ) : null}
              </li>

              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "survey" ? (
        <>
          <SummarySection summary={healthSurvey} />
          <SummarySection summary={stressCheck} />
        </>
      ) : null}

      {tab === "env" ? (
      <section aria-label="船内環境の整備状況" className="flex flex-col gap-3">
        {environments.length === 0 ? (
          <p className="ui-card p-4 text-sm text-foreground-500">船舶の情報が登録されていません。</p>
        ) : (
          environments.map((v) => (
            <div key={v.vesselId} className="ui-card flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">{v.name}</h3>
                <span className="text-sm">
                  {v.freshness === "fresh" ? (
                    <span>
                      ✓ 確認済み
                      <span className="ml-1 tabular-nums text-foreground-500">
                        {v.verifiedOn}（{v.daysSinceVerified}日前）
                      </span>
                    </span>
                  ) : v.freshness === "stale" ? (
                    <StatusChip
                      level="caution"
                      label={`確認から ${v.daysSinceVerified}日`}
                      hint={`求人に載せる設備・通信環境は事実と違ってはいけません。確認から ${wellbeingRules.jobPostingFreshnessDays}日を過ぎたら見直してください`}
                    />
                  ) : (
                    <span className="text-warning-700">⚠ 確認日が未登録です</span>
                  )}
                </span>
              </div>
              <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
                <dt className="text-foreground-500">通信環境</dt>
                <dd>
                  {wifiLabel(v.wifiAvailable)}
                  {v.wifiNote ? (
                    <span className="block text-xs text-foreground-600">{v.wifiNote}</span>
                  ) : null}
                </dd>
                <dt className="text-foreground-500">居室</dt>
                <dd>{v.cabinType ?? "未登録"}</dd>
                <dt className="text-foreground-500">設備</dt>
                <dd>{v.amenities ?? "未登録"}</dd>
              </dl>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold">求人票の設備欄に貼る文面</span>
                <textarea
                  readOnly
                  rows={7}
                  defaultValue={v.jobPostingText}
                  className="ui-inset w-full resize-y p-3 font-mono text-xs"
                  aria-label={`${v.name} の求人票向け文面`}
                />
              </label>
            </div>
          ))
        )}
      </section>
      ) : null}
    </div>
  );
}
