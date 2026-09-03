import Link from "next/link";
import { notFound } from "next/navigation";
import { ROLE_PERMISSIONS, VESSEL_ROLES, type VesselRole } from "@/domain/authz/roles";
import { evaluateSeaService } from "@/domain/crew/sea-service";
import { t } from "@/i18n/ja";
import { expiryLevel, freshnessLevel } from "@/lib/credential-plain";
import { fmtDateTime, fmtMinutes } from "@/lib/format";
import { buildCrewKarte } from "@/server/crew-service";
import {
  crewCredentialStatuses,
  insuranceRowsOf,
  logSensitiveView,
} from "@/server/crew-master-service";
import { buildManningRow } from "@/server/manning-service";
import {
  ageOf,
  crewMasterOf,
  effective,
  todayLocal,
  vesselNameOf,
} from "@/server/master-service";
import { hasShorePermission, requireShore } from "@/server/shore-session";
import { StatusChip } from "@/ui";
import { ShoreGuardNotice } from "../../_components/guard";

export const dynamic = "force-dynamic";

/** 定義リストの1行（同じ形を何度も書かないための小さな部品） */
function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-wrap gap-x-2 border-b border-[var(--ui-hairline)] py-1.5 last:border-b-0">
      <dt className="w-40 shrink-0 text-sm text-foreground-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm">{value ? value : "（未登録）"}</dd>
    </div>
  );
}

/**
 * S-03 船員カルテ（要件定義書 3.1.4 / 12.3 / 10.3）。
 *
 * **一人一ページの参照ビュー**であり、ここでは値を変更しない。
 * 更新は S-04 船員マスタ編集（/shore/crew/[id]/edit）の1画面に集約する（12.3）。
 * 年齢・配乗可否は保持せず、生年月日とマスタ・証書から**そのつど算出**する。
 * 要配慮個人情報（既往歴・服薬状況）は権限がある場合だけ表示し、
 * 表示したこと自体を監査ログに残す（10.3 / 12.6）。
 */
export default async function ShoreCrewKartePage({ params }: { params: Promise<{ id: string }> }) {
  const guard = await requireShore("view_crew");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="船員カルテ" />;

  const { id } = await params;
  const master = crewMasterOf(id);
  const row = buildManningRow(id);
  if (!master || !row) notFound();

  const today = todayLocal();
  const age = ageOf(master.birthDate, today);
  const karte = buildCrewKarte(id);
  const statuses = crewCredentialStatuses(id);
  const medical = statuses.filter((s) => s.credential.category === "medical");
  const embarkations = effective("embarkation")
    .filter((e) => e.crewMemberId === id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const evaluations = effective("evaluation").filter((e) => e.crewMemberId === id);
  // 6.2 C群: 免状更新の乗船履歴要件（5年内1年以上）を乗下船の記録から判定する（導出値）
  const seaService = evaluateSeaService({ crewMemberId: id, embarkations, today });
  const role = VESSEL_ROLES.includes(master.role as VesselRole)
    ? (master.role as VesselRole)
    : undefined;

  const canSensitive = await hasShorePermission("view_sensitive_health");
  const canEdit = await hasShorePermission("edit_crew_master");
  if (canSensitive) {
    // 10.3 / 12.6: 要配慮個人情報は「参照した」ことも記録する（値はログに載せない）
    logSensitiveView({
      crewMemberId: id,
      crewName: master.name,
      actor: guard.staff.id,
      screen: "船員カルテ（S-03）",
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-default-100 text-xl font-bold"
          >
            {master.photo ?? master.name.slice(0, 1)}
          </span>
          <div>
            <h1 className="text-balance text-2xl font-bold">{master.name}</h1>
            <p className="text-sm text-foreground-500">
              {master.nameKana ? `${master.nameKana} / ` : ""}
              {master.position}
              {role ? `（船内での権限: ${t.role[role]}）` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/shore/crew" className="rounded-medium bg-default-100 px-3 py-1.5 text-sm">
            ← 船員一覧
          </Link>
          <Link
            href={`/shore/labor?crew=${id}`}
            className="rounded-medium border border-[var(--ui-hairline)] px-3 py-1.5 text-sm"
          >
            労務管理を開く
          </Link>
          {canEdit ? (
            <Link
              href={`/shore/crew/${id}/edit`}
              className="rounded-medium bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
            >
              船員マスタを編集
            </Link>
          ) : null}
        </div>
      </div>

      {/* ── 業務: 配乗可否（導出値）とブロック事由 ── */}
      <section aria-label="配乗できるか" className="ui-card p-4">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="font-bold">配乗できるか</h2>
          <StatusChip
            level={row.eligibility.level}
            label={t.manningStatus[row.eligibility.status]}
          />
        </div>
        {row.eligibility.issues.length === 0 ? (
          <p className="text-sm">
            止まっている事由はありません。証書・保険・直近の労働時間はいずれも基準内です。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {row.eligibility.issues.map((issue) => (
              <li key={issue.key} className="ui-inset flex flex-col gap-1 p-3">
                {/* Chip は div を描くため p に入れない（不正なネストはハイドレーションを壊す） */}
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <StatusChip
                    level={issue.severity === "block" ? "violation" : "caution"}
                    size="sm"
                    label={issue.severity === "block" ? "配乗できません" : "確認が要ります"}
                  />
                  {issue.label}
                </div>
                <p className="text-sm text-foreground-600">{issue.detail}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-foreground-500">
          この判定は入力項目ではなく、免状・健康証明書・基本訓練・保険の確認状況と直近の労働時間から
          算出しています（要件定義書 12.3）。
        </p>
      </section>

      {/* ── 基本情報 ── */}
      <section aria-label="基本情報" className="ui-card p-4">
        <h2 className="mb-2 font-bold">基本情報</h2>
        <dl>
          <Row label={t.crewMasterField.name} value={master.name} />
          <Row label={t.crewMasterField.nameKana} value={master.nameKana} />
          <Row label={t.crewMasterField.birthDate} value={master.birthDate} />
          <Row label="年齢" value={age === null ? null : `${age}歳（生年月日から計算）`} />
          <Row label={t.crewMasterField.bloodType} value={master.bloodType ? `${master.bloodType}型` : null} />
          <Row label={t.crewMasterField.seamanBookNo} value={master.seamanBookNo} />
          <Row label={t.crewMasterField.address} value={master.address} />
          <Row label={t.crewMasterField.phone} value={master.phone} />
          <Row label={t.crewMasterField.position} value={master.position} />
          <Row label={t.crewMasterField.employmentType} value={master.employmentType} />
          <Row label={t.crewMasterField.hiredOn} value={master.hiredOn} />
          {master.retiredOn ? (
            <Row label={t.crewMasterField.retiredOn} value={master.retiredOn} />
          ) : null}
        </dl>
      </section>

      {/* ── 資格・訓練 ── */}
      <section aria-label="資格・訓練" className="ui-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">資格・訓練</h2>
          {canEdit ? (
            <Link
              href={`/shore/crew/${id}/credentials`}
              className="rounded-medium border border-[var(--ui-hairline)] px-3 py-1.5 text-sm"
            >
              資格・証書を登録／確認
            </Link>
          ) : null}
        </div>
        {statuses.length === 0 ? (
          <p className="text-sm text-foreground-500">登録されている証書はありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {statuses.map((s) => (
              <li key={s.credential.id} className="ui-inset flex flex-col gap-1 p-3">
                {/* Chip は div を描くため p に入れない（不正なネストはハイドレーションを壊す） */}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{s.credential.name}</span>
                  <span className="text-foreground-500">
                    {t.credentialCategory[s.credential.category] ?? s.credential.category}
                  </span>
                  <StatusChip level={expiryLevel(s.expiry)} size="sm" label={t.expiryState[s.expiry]} />
                  <StatusChip
                    level={freshnessLevel(s.freshness)}
                    size="sm"
                    label={t.freshnessState[s.freshness]}
                  />
                </div>
                <p className="text-sm text-foreground-600">{s.message}</p>
                <p className="text-xs text-foreground-500">
                  <span className="tabular-nums">
                    交付 {s.credential.issuedOn ?? "—"} / 期限 {s.credential.expiresOn ?? "なし"} /
                    最終確認 {s.credential.lastVerifiedOn ?? "未確認"}
                  </span>
                  {s.credential.issuer ? ` / ${s.credential.issuer}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 健康（要配慮個人情報を含む） ── */}
      <section aria-label="健康" className="ui-card p-4">
        <h2 className="mb-2 font-bold">健康</h2>
        {medical.length === 0 ? (
          <p className="text-sm text-foreground-500">健康証明書が登録されていません。</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {medical.map((s) => (
              <li key={s.credential.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{s.credential.name}</span>
                <span className="tabular-nums text-foreground-500">
                  期限 {s.credential.expiresOn ?? "—"}
                </span>
                <StatusChip level={expiryLevel(s.expiry)} size="sm" label={t.expiryState[s.expiry]} />
                <StatusChip
                  level={freshnessLevel(s.freshness)}
                  size="sm"
                  label={t.freshnessState[s.freshness]}
                />
                <span className="text-foreground-600">{s.message}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="ui-inset mt-3 p-3">
          <h3 className="text-sm font-bold">既往歴・服薬状況（要配慮個人情報）</h3>
          {canSensitive ? (
            <>
              <dl className="mt-1">
                <Row label={t.crewMasterField.medicalHistory} value={master.medicalHistory} />
                <Row label={t.crewMasterField.medication} value={master.medication} />
              </dl>
              <p className="mt-2 text-xs text-foreground-500">
                この欄を開いたことは記録されます（誰が・いつ見たかを残す決まりです）。
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-foreground-600">
              要配慮情報のため表示されません。
            </p>
          )}
        </div>
      </section>

      {/* ── 業務: 労務・乗船履歴・評価 ── */}
      <section aria-label="業務の状況" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "直近7日の労働時間", value: fmtMinutes(karte.labor.weeklyMinutes), tone: "" },
          { label: "7日間の判定", value: t.level[karte.labor.weeklyLevel], tone: "" },
          { label: "警告だった日", value: `${karte.labor.violationDays}日`, tone: "" },
          { label: "未承認", value: `${karte.labor.pendingDays}日`, tone: "" },
        ].map((s) => (
          <div key={s.label} className="ui-card p-4">
            <p className="text-sm text-foreground-500">{s.label}</p>
            <p className={`tabular-nums text-2xl font-bold ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </section>

      <section aria-label="乗船履歴" className="ui-card p-4">
        <h2 className="mb-2 font-bold">乗船履歴・予定</h2>

        {/* 6.2 C群「海技免状の更新」: 乗船履歴要件（5年内1年以上）の充足を自動判定する。
            足りない場合は更新講習という別の経路があるため、可否ではなく経路を示す */}
        <div className="ui-inset mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
          <StatusChip
            level={seaService.level}
            size="sm"
            label={seaService.meetsRequirement ? "履歴で更新できます" : "履歴が不足"}
          />
          <p className="min-w-0 flex-1 text-sm">{seaService.message}</p>
          <p className="text-xs text-foreground-500">
            免状更新の乗船履歴要件（
            <span className="tabular-nums">{seaService.from}</span> 以降に
            <span className="tabular-nums"> {seaService.requiredDays}</span> 日以上）に対する充足を、
            乗下船の記録から計算しています。
          </p>
        </div>

        {embarkations.length === 0 ? (
          <p className="text-sm text-foreground-500">乗下船の記録はありません。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {embarkations.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums text-foreground-500">{e.date}</span>
                <span className="font-semibold">
                  {vesselNameOf(e.targetVesselId)} を {t.embarkationEvent[e.eventType]}
                </span>
                <span className="text-foreground-500">{t.embarkationStatus[e.status]}</span>
                {e.duty ? <span className="text-foreground-500">{e.duty}</span> : null}
                {e.contractType ? (
                  <span className="text-foreground-500">{t.embarkationContract[e.contractType]}</span>
                ) : null}
                {e.blockNoteAtPlanning ? (
                  <span className="text-warning-700">⚠ {e.blockNoteAtPlanning}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="人事考課" className="ui-card p-4">
        <h2 className="mb-2 font-bold">人事考課</h2>
        <p className="text-sm">
          {evaluations.length === 0
            ? "記録された考課はありません。"
            : `記録が ${evaluations.length}件 あります（直近の対象期間: ${
                evaluations
                  .map((e) => e.periodTo)
                  .sort()
                  .at(-1) ?? "—"
              }）。`}
        </p>
        <p className="mt-1 text-xs text-foreground-500">
          点数・所見はカルテには出しません。閲覧できる担当者は{" "}
          <Link href="/shore/evaluations" className="text-primary underline-offset-2 hover:underline">
            人事考課
          </Link>{" "}
          で確認してください（閲覧者を限定する決まりです。要件定義書 3.1.5）。
        </p>
      </section>

      {/* ── 緊急 ── */}
      <section aria-label="緊急連絡先・家族構成" className="ui-card p-4">
        <h2 className="mb-2 font-bold">緊急連絡先・家族構成</h2>
        <dl>
          <Row label={t.crewMasterField.emergencyContactName} value={master.emergencyContactName} />
          <Row
            label={t.crewMasterField.emergencyContactRelation}
            value={master.emergencyContactRelation}
          />
          <Row
            label={t.crewMasterField.emergencyContactPhone}
            value={master.emergencyContactPhone}
          />
          <Row label={t.crewMasterField.familyNote} value={master.familyNote} />
        </dl>
      </section>

      {/* ── 保険（写し。正本は外部機関） ── */}
      <section aria-label="保険の加入状況" className="ui-card p-4">
        <h2 className="mb-2 font-bold">保険の加入状況</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--ui-hairline)] text-left text-foreground-500">
                <th className="py-1 pr-3 font-normal">区分</th>
                <th className="py-1 pr-3 font-normal">記号番号</th>
                <th className="py-1 pr-3 font-normal">資格取得日</th>
                <th className="py-1 pr-3 font-normal">最終確認日</th>
                <th className="py-1 font-normal">確認方法</th>
              </tr>
            </thead>
            <tbody>
              {insuranceRowsOf(master).map(({ kind, entry }) => (
                <tr key={kind} className="border-b border-[var(--ui-hairline)] last:border-b-0">
                  <td className="py-1.5 pr-3">{t.insuranceKind[kind]}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{entry?.number ?? "（未確認）"}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{entry?.acquiredOn ?? "—"}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{entry?.lastVerifiedOn ?? "—"}</td>
                  <td className="py-1.5">
                    {entry?.verifyMethod ? t.verifyMethod[entry.verifyMethod] : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-foreground-500">
          加入状況の正本は日本年金機構・協会けんぽ・ハローワークにあり、ここは写しです。最終確認日から
          日が経つと「要再確認」になります（要件定義書 12.2 / 12.4）。
        </p>
      </section>

      {/* ── 船内での持ち場・権限・最近の記録 ── */}
      <section aria-label="本日の当直と持ち場" className="ui-card p-4">
        <h2 className="mb-2 font-bold">本日の当直・持ち場</h2>
        <p className="text-sm">
          当直:{" "}
          {karte.labor.todayWatches.length === 0
            ? "なし"
            : karte.labor.todayWatches
                .map((w) => `${w.shiftType ? t.shiftType[w.shiftType] : ""} ${w.from}–${w.to}`)
                .join(" / ")}
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {karte.stations.map((s) => (
            <li key={s.id}>
              <span className="text-foreground-500">
                {s.scenario ? t.stationScenario[s.scenario] : "配置"}:{" "}
              </span>
              <span className="font-semibold">{s.station}</span>
              {s.duty ? <span className="ml-2 text-foreground-500">{s.duty}</span> : null}
            </li>
          ))}
          {karte.stations.length === 0 ? (
            <li className="text-foreground-500">配置の登録がありません。</li>
          ) : null}
        </ul>
      </section>

      {role ? (
        <section aria-label="このロールでできること" className="ui-card p-4">
          <h2 className="mb-2 font-bold">このロールでできること（船内アプリ）</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {ROLE_PERMISSIONS[role].map((p) => (
              <span key={p} className="rounded-small bg-default-100 px-2 py-1">
                {t.permission[p] ?? p}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-foreground-500">
            判定は権限表（src/domain/authz）が唯一の情報源です。一覧は{" "}
            <Link href="/shore/settings" className="text-primary underline-offset-2 hover:underline">
              設定・権限
            </Link>
            で確認できます。
          </p>
        </section>
      ) : null}

      <section aria-label="最近の記録" className="ui-card p-4">
        <h2 className="mb-2 font-bold">最近の記録（本人が関わったもの）</h2>
        {karte.recentRecords.length === 0 ? (
          <p className="text-sm text-foreground-500">記録がありません。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {karte.recentRecords.map((r, i) => (
              <li key={`${r.kind}-${i}`} className="flex flex-wrap gap-2">
                <span className="tabular-nums text-foreground-500">{fmtDateTime(r.occurredAt)}</span>
                <span className="font-semibold">{r.kind}</span>
                <span className="text-foreground-500">{r.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-foreground-500">
        この画面は参照専用です。
        {canEdit
          ? "内容を直すときは「船員マスタを編集」から更新してください。"
          : "内容を直せるのは船員マスタの担当者だけです。直したい点があれば担当者へ連絡してください。"}
        同じ項目をいくつもの画面から書き換えられるようにはしていません（要件定義書 12.3）。
      </p>
    </div>
  );
}
