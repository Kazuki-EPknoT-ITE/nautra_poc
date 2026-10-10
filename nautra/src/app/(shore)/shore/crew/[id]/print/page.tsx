import { notFound } from "next/navigation";
import { evaluateSeaService } from "@/domain/crew/sea-service";
import { t } from "@/i18n/ja";
import { isSensitiveCategory, type CrewFieldView } from "@/lib/crew-fields";
import { listCrewFields } from "@/server/crew-field-service";
import { crewCredentialStatuses, insuranceRowsOf, logSensitiveView } from "@/server/crew-master-service";
import { crewPhotoOf } from "@/server/crew-photo-service";
import { ageOf, crewMasterOf, effective, todayLocal, vesselNameOf, writeAuditLog } from "@/server/master-service";
import { hasShorePermission, requireShore } from "@/server/shore-session";
import { CrewPhoto } from "@/ui";
import { ShoreGuardNotice } from "../../../_components/guard";
import { KartePrintToolbar } from "./_components/karte-print-toolbar";

export const dynamic = "force-dynamic";

type Pair = readonly [string, string | undefined];

/** カルテには年まで載せる（「11/3(木)」では生年月日や入社日として読めない） */
function fullDate(ymd: string | undefined): string | undefined {
  if (!ymd) return undefined;
  const [y, m, d] = ymd.split("-").map(Number);
  return y && m && d ? `${y}年${m}月${d}日` : ymd;
}

/**
 * 船員カルテの印刷ビュー（レビュー CHART-05「カルテらしいデザインで PDF 書き出し」）。
 *
 * A4 縦に、顔写真・基本情報・連絡先・資格・健康・保険・乗船履歴を罫線の表で並べる。
 * PDF はブラウザの印刷で作る（帳票と同じ方式。外部ライブラリを増やさない）。
 * 要配慮個人情報（既往歴・服薬・健康の追加項目）は権限がある人にだけ載せ、載せたときは参照を記録する（10.3 / 12.6）。
 * カルテを書き出したこと自体も監査ログに残す（持ち出しの記録）。
 */
export default async function CrewKartePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const guard = await requireShore("view_crew");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="船員カルテの印刷" />;
  const { id } = await params;
  const master = crewMasterOf(id);
  if (!master) notFound();

  const today = todayLocal();
  const canSensitive = await hasShorePermission("view_sensitive_health");
  const age = ageOf(master.birthDate, today);
  const statuses = crewCredentialStatuses(id);
  const allEmbarkations = effective("embarkation").filter((e) => e.crewMemberId === id);
  const embarkations = [...allEmbarkations].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  const seaService = evaluateSeaService({ crewMemberId: id, embarkations: allEmbarkations, today });
  const fields = listCrewFields().filter((f) => canSensitive || !isSensitiveCategory(f.category));
  const custom = (c: CrewFieldView["category"]): Pair[] =>
    fields.filter((f) => f.category === c).map((f) => [f.label, master.customFields?.[f.fieldKey]] as const);

  if (canSensitive) {
    logSensitiveView({ crewMemberId: id, crewName: master.name, actor: guard.staff.id, screen: "船員カルテの印刷" });
  }
  writeAuditLog({
    action: "export",
    entityKind: "crew_karte",
    entityId: id,
    actor: guard.staff.id,
    channel: "shore",
    summary: `${master.name} のカルテを印刷・PDF 用に表示${canSensitive ? "（要配慮情報を含む）" : ""}`,
  });

  const basic: Pair[] = [
    [
      t.crewMasterField.birthDate,
      master.birthDate ? `${fullDate(master.birthDate)}${age === null ? "" : `（${age}歳）`}` : undefined,
    ],
    [t.crewMasterField.bloodType, master.bloodType ? `${master.bloodType}型` : undefined],
    [t.crewMasterField.seamanBookNo, master.seamanBookNo],
    [t.crewMasterField.phone, master.phone],
    [t.crewMasterField.address, master.address],
    [t.crewMasterField.employmentType, master.employmentType],
    [t.crewMasterField.hiredOn, fullDate(master.hiredOn)],
    ...custom("basic"),
  ];
  const emergency: Pair[] = [
    [t.crewMasterField.emergencyContactName, master.emergencyContactName],
    [t.crewMasterField.emergencyContactRelation, master.emergencyContactRelation],
    [t.crewMasterField.emergencyContactPhone, master.emergencyContactPhone],
    [t.crewMasterField.familyNote, master.familyNote],
    ...custom("emergency"),
  ];
  const health: Pair[] = canSensitive
    ? [
        [t.crewMasterField.medicalHistory, master.medicalHistory],
        [t.crewMasterField.medication, master.medication],
        ...custom("health"),
      ]
    : [];

  return (
    <div className="karte-print flex flex-col gap-4">
      {/* 印刷用のレイアウト（帳票の印刷ビューと同じく、用紙と非表示の指定はこの画面だけに持つ） */}
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          header, nav, .no-print { display: none !important; }
          main { padding: 0 !important; max-width: none !important; }
          .karte-sheet { border: none !important; padding: 0 !important; font-size: 9.5px; }
          .karte-table th, .karte-table td { padding: 2px 5px !important; }
          .karte-h { margin: 9px 0 4px !important; font-size: 11.5px !important; }
        }
        .karte-table { border-collapse: collapse; width: 100%; }
        .karte-table th, .karte-table td { border: 1px solid #767676; padding: 4px 6px; text-align: left; vertical-align: top; }
        .karte-table th { background: #F6F6F6; font-weight: 700; white-space: nowrap; width: 9em; }
        .karte-h { margin: 14px 0 6px; font-size: 13px; font-weight: 700; border-left: 4px solid #917351; padding-left: 6px; break-after: avoid; }
        .karte-table { break-inside: avoid; }
      `}</style>

      <KartePrintToolbar crewMemberId={id} />

      <article
        aria-label="船員カルテ"
        className="karte-sheet ui-card mx-auto w-full max-w-[210mm] px-8 py-7 text-sm text-foreground-900"
      >
        <div className="flex items-start justify-between gap-4 border-b-2 border-foreground-900 pb-3">
          <div>
            <p className="m-0 font-mono text-xs tracking-[0.14em] text-foreground-500">CREW RECORD</p>
            <h1 className="m-0 mt-1 text-2xl font-bold">船員カルテ</h1>
          </div>
          <p className="m-0 text-right font-mono text-xs text-foreground-600">
            作成日 {fullDate(today)}
            <br />
            船員ID {master.crewMemberId}
          </p>
        </div>

        <section className="mt-4 flex gap-5">
          <CrewPhoto name={master.name} initial={master.photo} src={crewPhotoOf(id)} size="xl" />
          <table className="karte-table">
            <tbody>
              <tr>
                <th>氏名</th>
                <td className="text-lg font-bold">
                  {master.name}
                  {master.nameKana ? (
                    <span className="ml-3 text-sm font-normal text-foreground-600">{master.nameKana}</span>
                  ) : null}
                </td>
              </tr>
              <tr>
                <th>職名</th>
                <td>{master.position ?? "—"}</td>
              </tr>
              {basic.map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{v || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <h2 className="karte-h">緊急連絡先・家族構成</h2>
        <PairTable rows={emergency} />

        <h2 className="karte-h">資格・証書</h2>
        <table className="karte-table">
          <thead>
            <tr>
              <th style={{ width: "auto" }}>名称</th>
              <th>区分</th>
              <th>有効期限</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {statuses.length === 0 ? (
              <tr>
                <td colSpan={4}>登録されている証書はありません</td>
              </tr>
            ) : (
              statuses.map((s) => (
                <tr key={s.credential.id}>
                  <td>{s.credential.name}</td>
                  <td>{t.credentialCategory[s.credential.category] ?? s.credential.category}</td>
                  <td className="font-mono tabular-nums">{s.credential.expiresOn ?? "—"}</td>
                  <td>
                    {t.expiryState[s.expiry]} ／ {t.freshnessState[s.freshness]}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {canSensitive ? (
          <>
            <h2 className="karte-h">健康（要配慮個人情報）</h2>
            <PairTable rows={health} />
          </>
        ) : null}

        <h2 className="karte-h">保険の加入状況</h2>
        <table className="karte-table">
          <thead>
            <tr>
              <th style={{ width: "auto" }}>区分</th>
              <th>記号番号</th>
              <th>資格取得日</th>
              <th>最終確認日</th>
            </tr>
          </thead>
          <tbody>
            {insuranceRowsOf(master).map(({ kind, entry }) => (
              <tr key={kind}>
                <td>{t.insuranceKind[kind]}</td>
                <td className="font-mono">{entry?.number ?? "（未確認）"}</td>
                <td className="font-mono">{entry?.acquiredOn ?? "—"}</td>
                <td className="font-mono">{entry?.lastVerifiedOn ?? "—"}</td>
              </tr>
            ))}
            {custom("insurance").map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td colSpan={3}>{v || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="karte-h">乗船履歴（直近12件）</h2>
        <p className="m-0 mb-1.5 text-xs text-foreground-600">{seaService.message}</p>
        <table className="karte-table">
          <thead>
            <tr>
              <th>日付</th>
              <th style={{ width: "auto" }}>船・内容</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {embarkations.length === 0 ? (
              <tr>
                <td colSpan={3}>乗下船の記録はありません</td>
              </tr>
            ) : (
              embarkations.map((e) => (
                <tr key={e.id}>
                  <td className="font-mono">{e.date}</td>
                  <td>
                    {vesselNameOf(e.targetVesselId)} を {t.embarkationEvent[e.eventType]}
                    {e.duty ? `（${e.duty}）` : ""}
                  </td>
                  <td>{t.embarkationStatus[e.status]}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </div>
  );
}

function PairTable({ rows }: { rows: Pair[] }) {
  return (
    <table className="karte-table">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th>{k}</th>
            <td>{v || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
