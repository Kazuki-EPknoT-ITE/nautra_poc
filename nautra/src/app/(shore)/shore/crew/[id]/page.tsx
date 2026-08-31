import Link from "next/link";
import { notFound } from "next/navigation";
import { ROLE_PERMISSIONS } from "@/domain/authz/roles";
import { t } from "@/i18n/ja";
import { fmtDateTime, fmtMinutes } from "@/lib/format";
import { buildCrewKarte } from "@/server/crew-service";

export const dynamic = "force-dynamic";

const LEVEL: Record<string, { cls: string; icon: string; label: string }> = {
  ok: { cls: "text-success", icon: "✓", label: "適合" },
  caution: { cls: "text-warning-700", icon: "⚠", label: "注意" },
  violation: { cls: "text-danger", icon: "✕", label: "警告" },
};

/**
 * S-03 船員カルテ。一人分の状況を1ページに集約した**参照ビュー**。
 * 編集は各マスタ画面（S-04）へ誘導する設計で、ここでは値を変更しない。
 */
export default async function ShoreCrewKartePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const karte = buildCrewKarte(id);
  if (!karte) notFound();
  const { row, stations, recentRecords } = karte;
  const level = LEVEL[row.weeklyLevel];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-default-100 text-xl font-bold"
          >
            {row.crew.initial}
          </span>
          <div>
            <h1 className="text-balance text-2xl font-bold">{row.crew.name}</h1>
            <p className="text-sm text-foreground-500">
              {row.crew.position}（権限ロール: {t.role[row.crew.role]}）
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/shore/crew" className="rounded-medium bg-default-100 px-3 py-1.5 text-sm">
            ← 船員一覧
          </Link>
          <Link
            href={`/shore/labor?crew=${row.crew.id}`}
            className="rounded-medium bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
          >
            労務管理を開く
          </Link>
        </div>
      </div>

      <section aria-label="労務の状況" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "直近7日の労働時間", value: fmtMinutes(row.weeklyMinutes), tone: "" },
          { label: "7日間の判定", value: `${level.icon} ${level.label}`, tone: level.cls },
          { label: "警告だった日", value: `${row.violationDays}日`, tone: "text-danger" },
          { label: "未承認", value: `${row.pendingDays}日`, tone: "text-warning-700" },
        ].map((s) => (
          <div key={s.label} className="glass-tile p-4">
            <p className="text-sm text-foreground-500">{s.label}</p>
            <p className={`tabular-nums text-2xl font-bold ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </section>

      <section aria-label="本日の当直と持ち場" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">本日の当直・持ち場</h2>
        <p className="text-sm">
          当直:{" "}
          {row.todayWatches.length === 0
            ? "なし"
            : row.todayWatches
                .map((w) => `${w.shiftType ? t.shiftType[w.shiftType] : ""} ${w.from}–${w.to}`)
                .join(" / ")}
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {stations.map((s) => (
            <li key={s.id}>
              <span className="text-foreground-500">
                {s.scenario ? t.stationScenario[s.scenario] : "配置"}:{" "}
              </span>
              <span className="font-semibold">{s.station}</span>
              {s.duty ? <span className="ml-2 text-foreground-500">{s.duty}</span> : null}
            </li>
          ))}
          {stations.length === 0 ? <li className="text-foreground-500">配置の登録がありません。</li> : null}
        </ul>
      </section>

      <section aria-label="このロールでできること" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">このロールでできること（船内アプリ）</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          {ROLE_PERMISSIONS[row.crew.role].map((p) => (
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

      <section aria-label="最近の記録" className="glass-tile p-4">
        <h2 className="mb-2 font-bold">最近の記録（本人が関わったもの）</h2>
        {recentRecords.length === 0 ? (
          <p className="text-sm text-foreground-500">記録がありません。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {recentRecords.map((r, i) => (
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
        本画面は参照ビューです。要配慮情報（既往歴・服薬・健診結果）は PoC では扱っていません。本番では
        権限による表示制御とアクセスログが必須です（要件定義書 10.3 / 基本設計書 11.2）。
      </p>
    </div>
  );
}
