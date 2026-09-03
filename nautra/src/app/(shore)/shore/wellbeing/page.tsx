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
import {
  ConsultationReplyForm,
  type ConsultationOption,
} from "./_components/consultation-reply-form";

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
        <p className="text-sm text-warning-700">
          ⚠ 回答が少ないため、個人が特定されないよう集計を表示しません（
          {summary.minResponses}件以上で表示します）。
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
export default async function ShoreWellbeingPage() {
  const guard = await requireShore("view_wellbeing");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="健康・相談窓口" />;

  const healthSurvey = buildWellbeingSummary("health_survey");
  const stressCheck = buildWellbeingSummary("stress_check");
  const consultations = listConsultations();
  const environments = buildVesselEnvironments();

  const consultationOptions: ConsultationOption[] = consultations.map((c) => ({
    id: c.id,
    label: `${fmtDateTime(c.occurredAt)} / ${t.wellbeingStatus[c.status]} / ${c.message.slice(0, 30)}…`,
    canReceive: c.status === "submitted",
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">健康・相談窓口</h1>
        <p className="text-sm text-foreground-500">
          船内から届いた匿名のアンケート・相談を受け付けます
        </p>
      </div>

      <section aria-label="匿名の扱い" className="ui-card border border-warning p-4">
        <h2 className="font-bold">⚠ 匿名で届いた内容を扱っています</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-foreground-600">
          <li>アンケートは誰が答えたかを持ちません。この画面には集計だけを出します。</li>
          <li>
            回答が {wellbeingRules.wellbeingMinResponses}
            件に満たないときは、集計から個人が推測できてしまうため集計を表示しません。
          </li>
          <li>相談の本文には書いた人の名前が付きません。回答も名前を伏せたまま船内へ届きます。</li>
          <li>相談の内容から個人を推測して船内に伝えることはしないでください。</li>
        </ul>
      </section>

      <SummarySection summary={healthSurvey} />
      <SummarySection summary={stressCheck} />

      <section aria-label="相談・通報" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">相談・通報（匿名）</h2>
        {consultations.length === 0 ? (
          <p className="ui-card p-4 text-sm text-foreground-500">届いている相談はありません。</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {consultations.map((c) => (
              <li key={c.id} className="ui-card flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="tabular-nums text-sm text-foreground-500">
                    {fmtDateTime(c.occurredAt)} に届きました
                  </span>
                  <span className="text-sm">
                    {c.status === "responded" ? "✓ " : c.status === "received" ? "・" : "⚠ "}
                    {t.wellbeingStatus[c.status]}
                  </span>
                </div>
                {/* 匿名の相談は氏名欄をそもそも描かない（匿名でない場合だけ名前を出す） */}
                {c.anonymous ? (
                  <p className="text-xs text-foreground-500">匿名で送られています</p>
                ) : (
                  <p className="text-xs text-foreground-500">記名: {c.displayName}</p>
                )}
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
              </li>
            ))}
          </ul>
        )}
        <ConsultationReplyForm consultations={consultationOptions} />
      </section>

      <section aria-label="船内環境の整備状況" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">船内環境の整備状況と求人票への反映</h2>
        <p className="ui-card p-4 text-sm text-foreground-600">
          求人に載せる船内の設備・通信環境は、事実と違ったり誤解を招く書き方をしてはいけません。
          内容が古いままなのも同じ扱いになるため、確認日から
          {wellbeingRules.jobPostingFreshnessDays}日 を過ぎたものは再確認をうながします。
          下の文面はそのまま求人票の設備欄に貼れます。
        </p>
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
                    <span className="text-warning-700">
                      ⚠ 確認から {v.daysSinceVerified}日 経っています。求人に出す前に見直してください
                    </span>
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
    </div>
  );
}
