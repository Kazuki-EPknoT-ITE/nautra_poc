import Link from "next/link";
import { t } from "@/i18n/ja";
import { fmtMinutes } from "@/lib/format";
import { buildCrewOverview } from "@/server/crew-service";

export const dynamic = "force-dynamic";

const LEVEL: Record<string, { cls: string; icon: string; label: string }> = {
  ok: { cls: "text-success", icon: "✓", label: "適合" },
  caution: { cls: "text-warning-700", icon: "⚠", label: "注意" },
  violation: { cls: "text-danger", icon: "✕", label: "警告" },
};

/**
 * S-02 船員一覧。写真（PoC はイニシャル）付きの一覧と、労務・承認の状況で絞り込むための手掛かりを示す。
 * 一人分の詳細は S-03 船員カルテ（/shore/crew/[id]）へ。編集（S-04）は PoC 未実装。
 */
export default function ShoreCrewPage() {
  const rows = buildCrewOverview();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-balance text-2xl font-bold">船員一覧</h1>
        <p className="text-sm text-foreground-500">
          直近7日の労務状況です。氏名を押すと一人分のカルテを開きます。
        </p>
      </div>

      <section aria-label="船員一覧" className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => {
          const level = LEVEL[r.weeklyLevel];
          return (
            <Link
              key={r.crew.id}
              href={`/shore/crew/${r.crew.id}`}
              className="glass-tile flex items-start gap-4 p-4 hover:opacity-90"
            >
              <span
                aria-hidden="true"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-default-100 text-lg font-bold"
              >
                {r.crew.initial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {r.crew.name}
                  <span className="ml-2 text-sm font-normal text-foreground-500">{r.crew.position}</span>
                </p>
                <p className="mt-1 text-sm">
                  直近7日 <span className="tabular-nums font-semibold">{fmtMinutes(r.weeklyMinutes)}</span>
                  <span className={`ml-2 font-semibold ${level.cls}`}>
                    {level.icon} {level.label}
                  </span>
                </p>
                <p className="mt-1 text-xs text-foreground-500">
                  警告 {r.violationDays}日 / 注意 {r.cautionDays}日 / 未承認 {r.pendingDays}日
                </p>
                <p className="mt-1 text-xs text-foreground-500">
                  本日の当直:{" "}
                  {r.todayWatches.length === 0
                    ? "なし"
                    : r.todayWatches
                        .map((w) => `${w.shiftType ? t.shiftType[w.shiftType] : ""} ${w.from}–${w.to}`)
                        .join(" / ")}
                </p>
              </div>
            </Link>
          );
        })}
      </section>

      <p className="text-xs text-foreground-500">
        船員マスタの編集（S-04: 基本情報・資格・健診・修了証）は PoC 未実装です。本番では本画面から
        単一経路で更新し、変更履歴（変更者・日時・経路）を保持します（要件定義書 12.2）。
      </p>
    </div>
  );
}
