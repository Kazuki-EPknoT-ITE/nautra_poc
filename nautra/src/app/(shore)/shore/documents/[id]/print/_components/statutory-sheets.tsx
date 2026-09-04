import { t } from "@/i18n/ja";
import { fmtMinutes } from "@/lib/format";
import type {
  BulkPermitSnapshot,
  CrewRegisterSnapshot,
  DrillRecordSnapshot,
} from "@/server/document-service";

/**
 * 9章の法定様式の紙面（海員名簿・一括届出許可申請書・操練実施記録）。
 *
 * いずれも**生成時点のスナップショットだけを描く**。現在のマスタは読み直さない
 * （提出済みの書類は書き換えない。要件定義書 12.3）。
 */

/** 海員名簿（船員法。船舶ごとに備置き、届出時に提示） */
export function CrewRegisterSheet({ snapshot }: { snapshot: CrewRegisterSnapshot }) {
  return (
    <>
      <section className="print-block flex flex-col gap-2">
        <h2 className="text-lg font-bold">海員名簿</h2>
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
          <dt className="text-foreground-500">船舶</dt>
          <dd className="font-semibold">{snapshot.vesselName}</dd>
          <dt className="text-foreground-500">基準日</dt>
          <dd className="tabular-nums">{snapshot.asOf} 現在</dd>
          <dt className="text-foreground-500">乗組員数</dt>
          <dd className="tabular-nums">{snapshot.rows.length} 名</dd>
          <dt className="text-foreground-500">作成</dt>
          <dd>
            <span className="tabular-nums">{snapshot.issuedOn}</span> / {snapshot.issuerLabel}
          </dd>
        </dl>
      </section>

      <section className="print-block">
        {snapshot.rows.length === 0 ? (
          <p className="text-sm text-foreground-500">この日に乗っている船員はいません。</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-[var(--ui-hairline)] text-left">
                <th className="py-2 pr-2 font-medium">No.</th>
                <th className="py-2 pr-2 font-medium">氏名</th>
                <th className="py-2 pr-2 font-medium">職務</th>
                <th className="py-2 pr-2 font-medium">生年月日</th>
                <th className="py-2 pr-2 font-medium">船員手帳番号</th>
                <th className="py-2 pr-2 font-medium">乗船日</th>
                <th className="py-2 font-medium">海技免状</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.rows.map((r) => (
                <tr key={r.no} className="border-b border-[var(--ui-hairline)]">
                  <td className="py-1.5 pr-2 tabular-nums">{r.no}</td>
                  <td className="py-1.5 pr-2">
                    <span className="font-semibold">{r.name}</span>
                    {r.nameKana ? (
                      <span className="ml-1 text-xs text-foreground-500">{r.nameKana}</span>
                    ) : null}
                    {r.address ? (
                      <span className="block text-xs text-foreground-500">{r.address}</span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-2">{r.duty || "—"}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{r.birthDate || "—"}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{r.seamanBookNo || "—"}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{r.boardedOn}</td>
                  <td className="py-1.5">{r.license || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-foreground-600">{snapshot.note}</p>
    </>
  );
}

/** 一括届出許可申請書・電子届出登録申請書（船員法第37条・施行規則） */
export function BulkPermitSheet({ snapshot }: { snapshot: BulkPermitSnapshot }) {
  return (
    <>
      <section className="print-block flex flex-col gap-2">
        <p className="text-right tabular-nums text-sm">{snapshot.issuedOn}</p>
        <p className="text-lg font-bold">{snapshot.office} 御中</p>
        <p className="text-right text-sm">{snapshot.issuerLabel}</p>
        <h2 className="mt-2 text-center text-lg font-bold">
          一括届出許可申請書・電子届出登録申請書
        </h2>
      </section>

      <section className="print-block flex flex-col gap-2 text-sm">
        {snapshot.paragraphs.map((p, i) => (
          <p key={i} className="text-pretty leading-relaxed">
            {p}
          </p>
        ))}
      </section>

      <section className="print-block flex flex-col gap-2">
        <h3 className="font-bold">記 1. 対象船舶</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-[var(--ui-hairline)] text-left">
              <th className="py-2 pr-2 font-medium">船名</th>
              <th className="py-2 pr-2 font-medium">総トン数</th>
              <th className="py-2 font-medium">航行区域</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.vessels.map((v) => (
              <tr key={v.name} className="border-b border-[var(--ui-hairline)]">
                <td className="py-1.5 pr-2 font-semibold">{v.name}</td>
                <td className="py-1.5 pr-2 tabular-nums">
                  {v.grossTonnage === null ? "—" : `${v.grossTonnage.toLocaleString("ja-JP")} トン`}
                </td>
                <td className="py-1.5">{v.navigationArea || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="print-block flex flex-col gap-2">
        <h3 className="font-bold">記 2. 届出の実績（{snapshot.filingRecord.period}）</h3>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
          <dt className="text-foreground-500">届出の件数</dt>
          <dd className="tabular-nums">{snapshot.filingRecord.total} 件</dd>
          <dt className="text-foreground-500">うち提出済み</dt>
          <dd className="tabular-nums">{snapshot.filingRecord.submitted} 件</dd>
          <dt className="text-foreground-500">うち受理済み</dt>
          <dd className="tabular-nums">{snapshot.filingRecord.accepted} 件</dd>
        </dl>
      </section>

      <section className="print-block flex flex-col gap-2">
        <h3 className="font-bold">記 3. 労務管理の体制</h3>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
          <dt className="text-foreground-500">管理している船員</dt>
          <dd className="tabular-nums">{snapshot.management.crewCount} 名</dd>
          <dt className="text-foreground-500">記録簿の作成月数</dt>
          <dd className="tabular-nums">{snapshot.management.ledgerMonths} か月分</dd>
          <dt className="text-foreground-500">監査証跡の件数</dt>
          <dd className="tabular-nums">{snapshot.management.auditLogCount} 件</dd>
        </dl>
      </section>

      <p className="text-xs text-foreground-600">根拠: {snapshot.legalBasis}</p>
    </>
  );
}

/** 操練（訓練）実施記録（船内操練の法定記録） */
export function DrillRecordSheet({ snapshot }: { snapshot: DrillRecordSnapshot }) {
  return (
    <>
      <section className="print-block flex flex-col gap-2">
        <h2 className="text-lg font-bold">操練（訓練）実施記録</h2>
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
          <dt className="text-foreground-500">船舶</dt>
          <dd className="font-semibold">{snapshot.vesselName || "—"}</dd>
          <dt className="text-foreground-500">期間</dt>
          <dd className="tabular-nums">
            {snapshot.periodFrom} 〜 {snapshot.periodTo}
          </dd>
          <dt className="text-foreground-500">実施回数</dt>
          <dd className="tabular-nums">{snapshot.rows.length} 回</dd>
          <dt className="text-foreground-500">作成</dt>
          <dd>
            <span className="tabular-nums">{snapshot.issuedOn}</span> / {snapshot.issuerLabel}
          </dd>
        </dl>
      </section>

      <section className="print-block flex flex-col gap-2">
        <h3 className="font-bold">種別ごとの実施状況</h3>
        {snapshot.countsByType.length === 0 ? (
          <p className="text-sm text-foreground-500">この期間に実施した操練はありません。</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-[var(--ui-hairline)] text-left">
                <th className="py-2 pr-2 font-medium">操練の種類</th>
                <th className="py-2 pr-2 font-medium">回数</th>
                <th className="py-2 font-medium">最後に実施した日</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.countsByType.map((c) => (
                <tr key={c.drillType} className="border-b border-[var(--ui-hairline)]">
                  <td className="py-1.5 pr-2">{t.drillType[c.drillType] ?? c.drillType}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{c.count} 回</td>
                  <td className="py-1.5 tabular-nums">{c.lastDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="print-block flex flex-col gap-2">
        <h3 className="font-bold">実施の記録</h3>
        {snapshot.rows.length === 0 ? (
          <p className="text-sm text-foreground-500">この期間に実施した操練はありません。</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-[var(--ui-hairline)] text-left">
                <th className="py-2 pr-2 font-medium">実施日</th>
                <th className="py-2 pr-2 font-medium">操練の種類</th>
                <th className="py-2 pr-2 font-medium">指揮者</th>
                <th className="py-2 pr-2 font-medium">参加者</th>
                <th className="py-2 pr-2 font-medium">所要</th>
                <th className="py-2 font-medium">所見</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.rows.map((r, i) => (
                <tr key={`${r.date}-${i}`} className="border-b border-[var(--ui-hairline)]">
                  <td className="py-1.5 pr-2 tabular-nums">{r.date}</td>
                  <td className="py-1.5 pr-2">{t.drillType[r.drillType] ?? r.drillType}</td>
                  <td className="py-1.5 pr-2">{r.leader}</td>
                  <td className="py-1.5 pr-2">{r.participants.join("・")}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{fmtMinutes(r.durationMinutes)}</td>
                  <td className="py-1.5 text-foreground-600">{r.remarks || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-foreground-600">{snapshot.note}</p>
    </>
  );
}
