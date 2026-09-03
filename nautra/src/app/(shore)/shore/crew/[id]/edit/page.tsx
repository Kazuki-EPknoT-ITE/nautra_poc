import Link from "next/link";
import { notFound } from "next/navigation";
import { t } from "@/i18n/ja";
import { fmtDateTime } from "@/lib/format";
import { buildCrewMasterHistory, insuranceRowsOf } from "@/server/crew-master-service";
import { ageOf, crewMasterOf, todayLocal } from "@/server/master-service";
import { hasShorePermission, requireShore, shoreStaffById } from "@/server/shore-session";
import { personName } from "@/lib/crew";
import { ShoreGuardNotice } from "../../../_components/guard";
import { CrewMasterForm, type CrewMasterFormValues } from "./_components/crew-master-form";

export const dynamic = "force-dynamic";

/** 陸上スタッフ・船員のどちらでも表示名を引く（監査ログの actor 表示） */
function actorName(id: string | undefined): string {
  if (!id) return "—";
  return shoreStaffById(id)?.name ?? personName(id);
}

/**
 * S-04 船員マスタ編集（要件定義書 3.1.1 / 12.3 / 12.4 / 12.6）。
 *
 * 要件定義書 12.3「同一項目を複数画面から更新できる導線を設けない。更新は所定の1画面に集約し、
 * 他画面からは参照のみとする」に従い、**船員マスタの唯一の更新画面**とする。
 * 資格・証書はマスタとは別のエンティティ（外部に正本がある写し）なので、
 * それ専用の1画面（/shore/crew/[id]/credentials）に分けている。
 */
export default async function ShoreCrewEditPage({ params }: { params: Promise<{ id: string }> }) {
  const guard = await requireShore("edit_crew_master");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="船員マスタの編集" />;

  const { id } = await params;
  const master = crewMasterOf(id);
  if (!master) notFound();

  const canEditSensitive = await hasShorePermission("view_sensitive_health");
  const age = ageOf(master.birthDate, todayLocal());
  const historyEntries = buildCrewMasterHistory(id);

  // 要配慮項目は権限がある場合だけクライアントへ渡す（権限が無ければ値そのものを送らない）
  const values: CrewMasterFormValues = {
    crewMemberId: id,
    name: master.name ?? "",
    nameKana: master.nameKana ?? "",
    birthDate: master.birthDate ?? "",
    seamanBookNo: master.seamanBookNo ?? "",
    address: master.address ?? "",
    bloodType: master.bloodType ?? "",
    phone: master.phone ?? "",
    position: master.position ?? "",
    employmentType: master.employmentType ?? "",
    hiredOn: master.hiredOn ?? "",
    emergencyContactName: master.emergencyContactName ?? "",
    emergencyContactRelation: master.emergencyContactRelation ?? "",
    emergencyContactPhone: master.emergencyContactPhone ?? "",
    familyNote: master.familyNote ?? "",
    medicalHistory: canEditSensitive ? (master.medicalHistory ?? "") : undefined,
    medication: canEditSensitive ? (master.medication ?? "") : undefined,
    insurances: insuranceRowsOf(master).map(({ kind, entry }) => ({
      kind,
      number: entry?.number ?? "",
      acquiredOn: entry?.acquiredOn ?? "",
      lastVerifiedOn: entry?.lastVerifiedOn ?? "",
      verifyMethod: entry?.verifyMethod ?? "",
    })),
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-balance text-2xl font-bold">{master.name} の船員マスタを編集</h1>
          <p className="text-sm text-foreground-500">
            船員の情報を直せるのはこの画面だけです。ほかの画面は参照専用にしてあります。
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
            href={`/shore/crew/${id}/credentials`}
            className="rounded-medium border border-[var(--ui-hairline)] px-3 py-1.5 text-sm"
          >
            資格・証書を登録／確認
          </Link>
        </div>
      </div>

      <CrewMasterForm values={values} age={age} canEditSensitive={canEditSensitive} />

      <section aria-label="この船員の変更履歴" className="ui-card p-4">
        <h2 className="mb-2 font-bold">この船員の変更履歴</h2>
        {historyEntries.length === 0 ? (
          <p className="text-sm text-foreground-500">変更の記録はありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {historyEntries.map((h) => (
              <li key={h.record.id} className="ui-inset flex flex-col gap-1 p-3">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="tabular-nums text-foreground-500">
                    {fmtDateTime(h.record.publishedAt ?? h.record.occurredAt)}
                  </span>
                  <span className="font-semibold">{actorName(h.audit?.actor ?? h.record.publishedBy)}</span>
                  <span className="text-foreground-500">
                    {h.audit ? t.auditChannel[h.audit.channel] : "陸上"}から
                    {h.record.supersedesId ? "変更" : "登録"}
                  </span>
                  {h.isCurrent ? (
                    <span className="rounded-small bg-default-100 px-2 py-0.5 text-xs">
                      いまの内容
                    </span>
                  ) : null}
                </p>
                {h.audit ? (
                  <>
                    <p className="text-sm">{h.audit.summary}</p>
                    <p className="text-xs text-foreground-500">
                      変更前: {h.audit.before ?? "—"}
                    </p>
                    <p className="text-xs text-foreground-500">変更後: {h.audit.after ?? "—"}</p>
                  </>
                ) : (
                  <p className="text-sm text-foreground-500">
                    最初の登録（デモデータの投入）です。
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-foreground-500">
          変更しても前の内容は消えません。既往歴・服薬状況は「変更あり」とだけ残し、値そのものは
          履歴に書きません（要件定義書 12.6）。
        </p>
      </section>
    </div>
  );
}
