import Link from "next/link";
import { notFound } from "next/navigation";
import { t } from "@/i18n/ja";
import { expiryLevel, freshnessLevel } from "@/lib/credential-plain";
import { fmtDateTime } from "@/lib/format";
import { crewCredentialStatuses } from "@/server/crew-master-service";
import { crewMasterOf, history } from "@/server/master-service";
import { requireShore } from "@/server/shore-session";
import { StatusChip } from "@/ui";
import { ShoreGuardNotice } from "../../../_components/guard";
import { CredentialForm } from "./_components/credential-form";
import { VerifyOriginalForm } from "./_components/verify-original-form";

export const dynamic = "force-dynamic";

/**
 * S-04 の一部: 資格・証書の登録／原本確認（要件定義書 3.1.3 / 12.2 / 12.4）。
 *
 * 免状・健康証明書・修了証は**外部に正本があり、アプリが持つのは写し**である。
 * そのため「有効期限（不適合）」と「最終確認日からの鮮度（要再確認）」を**別物として**描き分け、
 * 「原本を確認した」操作で鮮度だけを解消できるようにする（12.4）。
 */
export default async function ShoreCrewCredentialsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const guard = await requireShore("edit_crew_master");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="資格・証書の登録" />;

  const { id } = await params;
  const master = crewMasterOf(id);
  if (!master) notFound();

  const statuses = crewCredentialStatuses(id);
  const expiredCount = statuses.filter((s) => s.expiry === "expired").length;
  const staleCount = statuses.filter((s) => s.freshness !== "fresh").length;
  const changeLog = history("credential").filter(
    (c) => c.subjectType === "crew" && c.subjectId === id,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-balance text-2xl font-bold">{master.name} の資格・証書</h1>
          <p className="text-sm text-foreground-500">
            期限が切れているもの（配乗できません）と、確認から日が経ったもの（要再確認）は別物です。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/shore/crew/${id}`}
            className="rounded-medium bg-default-100 px-3 py-1.5 text-sm"
          >
            ← カルテへ戻る
          </Link>
          <Link
            href={`/shore/crew/${id}/edit`}
            className="rounded-medium border border-[var(--ui-hairline)] px-3 py-1.5 text-sm"
          >
            船員マスタを編集
          </Link>
        </div>
      </div>

      <section aria-label="要点" className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "登録されている証書", value: `${statuses.length}件` },
          { label: "期限切れ（配乗できません）", value: `${expiredCount}件` },
          { label: "要再確認（原本の確認が必要）", value: `${staleCount}件` },
        ].map((s) => (
          <div key={s.label} className="ui-card p-4">
            <p className="text-sm text-foreground-500">{s.label}</p>
            <p className="tabular-nums text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </section>

      <section aria-label="証書の一覧" className="flex flex-col gap-3">
        {statuses.length === 0 ? (
          <p className="text-sm text-foreground-500">登録されている証書はありません。</p>
        ) : (
          statuses.map((s) => (
            <article key={s.credential.id} className="ui-card flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold">{s.credential.name}</h2>
                <span className="text-sm text-foreground-500">
                  {t.credentialCategory[s.credential.category] ?? s.credential.category}
                </span>
              </div>

              {/* 12.4: 期限（不適合）と鮮度（要再確認）を別の行として描き分ける */}
              <div className="flex flex-col gap-1">
                {/* Chip は div を描くため p に入れない（不正なネストはハイドレーションを壊す） */}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-24 shrink-0 text-foreground-500">有効期限</span>
                  <StatusChip level={expiryLevel(s.expiry)} size="sm" label={t.expiryState[s.expiry]} />
                  <span className="tabular-nums text-foreground-600">
                    {s.credential.expiresOn ?? "期限なし"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-24 shrink-0 text-foreground-500">原本の確認</span>
                  <StatusChip
                    level={freshnessLevel(s.freshness)}
                    size="sm"
                    label={t.freshnessState[s.freshness]}
                  />
                  <span className="tabular-nums text-foreground-600">
                    {s.credential.lastVerifiedOn
                      ? `${s.credential.lastVerifiedOn}（${
                          s.credential.verifyMethod
                            ? t.verifyMethod[s.credential.verifyMethod]
                            : "方法の記録なし"
                        }）`
                      : "一度も確認していません"}
                  </span>
                </div>
              </div>

              <p className="text-sm text-foreground-600">{s.message}</p>

              <p className="text-xs text-foreground-500">
                <span className="tabular-nums">
                  交付 {s.credential.issuedOn ?? "—"}
                  {s.credential.number ? ` / 番号 ${s.credential.number}` : ""}
                </span>
                {s.credential.grade ? ` / ${s.credential.grade}` : ""}
                {s.credential.issuer ? ` / ${s.credential.issuer}` : ""}
                {s.credential.attachmentName ? ` / 添付 ${s.credential.attachmentName}` : ""}
              </p>

              <VerifyOriginalForm credentialId={s.credential.id} crewMemberId={id} />
            </article>
          ))
        )}
      </section>

      <CredentialForm crewMemberId={id} />

      <section aria-label="証書の変更履歴" className="ui-card p-4">
        <h2 className="mb-2 font-bold">証書の変更履歴（訂正・確認を含む）</h2>
        {changeLog.length === 0 ? (
          <p className="text-sm text-foreground-500">変更の記録はありません。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {changeLog.slice(0, 30).map((c) => (
              <li key={c.id} className="flex flex-wrap gap-2">
                <span className="tabular-nums text-foreground-500">
                  {fmtDateTime(c.publishedAt ?? c.occurredAt)}
                </span>
                <span className="font-semibold">{c.name}</span>
                <span className="tabular-nums text-foreground-500">
                  最終確認 {c.lastVerifiedOn ?? "未確認"}
                </span>
                {c.supersedesId ? <span className="text-foreground-500">（更新）</span> : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-foreground-500">
          「原本を確認した」を押すと、確認日を今日にした新しい記録を追加します。前の記録は消えません
          （要件定義書 12.3 / 12.6）。期限そのものが切れている証書は、確認だけでは配乗できるように
          なりません（12.4）。
        </p>
      </section>
    </div>
  );
}
