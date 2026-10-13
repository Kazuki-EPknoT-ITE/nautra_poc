import Link from "next/link";
import { t } from "@/i18n/ja";
import { fmtDateLabel } from "@/lib/format";
import {
  buildManningCandidates,
  buildManningGantt,
  recentEmbarkations,
} from "@/server/manning-plan-service";
import { buildAshoreCrew, buildManningBoard, buildVesselManning } from "@/server/manning-service";
import { crewPhotoMap } from "@/server/crew-photo-service";
import { listVessels, todayLocal } from "@/server/master-service";
import { hasShorePermission, requireShore } from "@/server/shore-session";
import { StatusChip } from "@/ui";
import { ExportAction } from "../_components/export-action";
import { ShoreGuardNotice } from "../_components/guard";
import { EmbarkForm } from "./_components/embark-form";
import { ManningBoard } from "./_components/manning-board";

export const dynamic = "force-dynamic";

/**
 * S-05 配乗計画ボード（要件定義書 3.1.2 / 4.1 / 6.6①）。
 *
 * 船×期間で配乗の見通しを示し、**配乗ブロック該当者を警告付きで表示**する
 * （黙って候補から消さず、事由と解き方を添える）。乗下船の登録を起点に、
 * 手続き一式（届出・保険・記帳・チェック）が自動で起票される。
 */
export default async function ShoreManningPage({
  searchParams,
}: {
  searchParams: Promise<{ vessel?: string }>;
}) {
  const guard = await requireShore("manage_manning");
  if (!guard.ok) return <ShoreGuardNotice guard={guard} screen="配乗計画ボード" />;

  const sp = await searchParams;
  const now = new Date();
  const today = todayLocal(now);
  const vessels = buildVesselManning(now);
  const ashore = buildAshoreCrew(now);
  const gantt = buildManningGantt(now, 60);
  const candidates = buildManningCandidates(buildManningBoard(now));
  const recent = recentEmbarkations();
  const photos = crewPhotoMap();
  const maxCount = Math.max(1, ...gantt.rows.flatMap((r) => r.counts));

  /**
   * ボードに渡す形へ整える（判定はサービス層が済ませているので、ここは表示用の詰め替えだけ）。
   *
   * **乗船中の船員には「配乗不可」と出さない**。3.1.2 のブロック条件は
   * *これから配乗する候補*への判定で、乗っている人に同じ文言を出すと
   * 「今すぐ降ろせ」と読めてしまう。乗船中は「何を直す必要があるか」の言い方にする。
   */
  const toCard = (row: (typeof ashore)[number], onBoard = false) => ({
    crewMemberId: row.crewMemberId,
    name: row.name,
    position: row.position,
    age: row.age,
    photo: row.photo,
    photoDataUrl: photos.get(row.crewMemberId),
    level: row.eligibility.level,
    statusLabel: onBoard
      ? row.eligibility.status === "blocked"
        ? "要対応"
        : row.eligibility.status === "caution"
          ? "確認が要ります"
          : "問題ありません"
      : row.eligibility.status === "blocked"
        ? "配乗不可"
        : row.eligibility.status === "caution"
          ? "要注意"
          : "配乗可能",
    blockNote:
      row.eligibility.status === "blocked"
        ? row.eligibility.issues.map((i) => i.label).join("・")
        : null,
    note: row.eligibility.issues.map((i) => i.label).join("・"),
    since: row.boardedOn ?? null,
  });

  const canAddCrew = await hasShorePermission("edit_crew_master");
  const canAddVessel = await hasShorePermission("manage_fleet");

  /** 詳細を開いている船（?vessel=）。開いていなければボードだけを出す（ASSIGN-03） */
  const selected = vessels.find((v) => v.vesselId === sp.vessel);
  const selectedGantt = selected ? gantt.rows.find((r) => r.vesselId === selected.vesselId) : undefined;
  const selectedRecent = selected ? recent.filter((e) => e.vesselName === selected.vesselName) : [];

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap justify-end gap-2">
        <ExportAction set="manning" label="配乗計画を書き出す" />
        {/* 船・船員の登録はそれぞれの画面だけが行う（12.3）。ここは入口だけ置き、登録後はこの画面へ戻す */}
        {canAddCrew ? (
          <Link href="/shore/crew/new" className="ui-btn-ghost h-9">
            ＋ 船員を登録
          </Link>
        ) : null}
        {canAddVessel ? (
          <Link href="/shore/fleet/new?back=/shore/manning" className="ui-btn-ghost h-9">
            ＋ 船を登録
          </Link>
        ) : null}
      </div>

      <div className={selected ? "grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]" : "flex flex-col"}>
        <ManningBoard
          selectedVesselId={selected?.vesselId}
          pool={ashore.map((r) => toCard(r))}
          vessels={vessels.map((v) => ({
            vesselId: v.vesselId,
            name: v.vesselName,
            spec: `定員 ${v.requiredCrew ?? "—"}名`,
            requiredCrew: v.requiredCrew,
            managedExternally: (v.requiredCrew ?? 0) === 0,
            crew: v.onBoard.map((r) => toCard(r, true)),
          }))}
        />

        {selected ? (
          <section aria-label={`${selected.vesselName} の詳細`} className="ui-card flex flex-col gap-4 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="m-0 text-2xl font-bold text-foreground-900">{selected.vesselName}</h2>
                <p className="m-0 mt-1 text-base text-foreground-700">
                  定員 <span className="font-mono tabular-nums">{selected.requiredCrew ?? "—"}</span>名 ／ いま{" "}
                  <span className="font-mono tabular-nums">{selected.onBoard.length}</span>名
                </p>
              </div>
              <Link href="/shore/manning" scroll={false} className="ui-btn-quiet h-9 w-9 !p-0" aria-label="閉じる">
                ✕
              </Link>
            </div>

            <div>
              <h3 className="m-0 mb-1.5 text-base font-bold">乗っている船員</h3>
              {selected.onBoard.length === 0 ? (
                <p className="m-0 text-sm text-foreground-500">いません</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                  {selected.onBoard.map((row) => (
                    <li key={row.crewMemberId} className="flex flex-wrap items-center gap-2">
                      <StatusChip
                        size="sm"
                        level={row.eligibility.level}
                        label=""
                        hint={row.eligibility.issues.map((i) => i.label).join("・") || "問題ありません"}
                      />
                      <Link href={`/shore/crew/${row.crewMemberId}`} className="font-semibold text-primary underline-offset-2 hover:underline">
                        {row.name}
                      </Link>
                      <span className="text-foreground-600">{row.position}</span>
                      <span className="font-mono tabular-nums text-foreground-500">{row.boardedOn ?? "—"} から</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="m-0 mb-1.5 text-base font-bold">これからの乗下船</h3>
              {selected.planned.length === 0 ? (
                <p className="m-0 text-sm text-foreground-500">予定はありません</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                  {selected.planned
                    .slice()
                    .sort((x, y) => x.event.date.localeCompare(y.event.date))
                    .map(({ row, event }) => (
                      <li key={event.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-mono tabular-nums text-foreground-500">{event.date}</span>
                        <span className="font-semibold">{t.embarkationEvent[event.eventType]}</span>
                        <span>{row.name}</span>
                        {event.blockNoteAtPlanning ? <span className="text-warning-700">⚠ {event.blockNoteAtPlanning}</span> : null}
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {selectedGantt ? (
              <div>
                <h3 className="m-0 mb-1.5 text-base font-bold">60日の見通し</h3>
                <div className="flex h-10 items-end gap-px" aria-label={`${selected.vesselName} の60日の乗船人数`}>
                  {selectedGantt.counts.map((count, i) => (
                    <span
                      key={gantt.dates[i]}
                      title={`${gantt.dates[i]} ${count}名${selectedGantt.shortages[i] ? "（定員に足りません）" : ""}`}
                      className={selectedGantt.shortages[i] ? "w-[5px] bg-danger" : "w-[5px] bg-foreground-700"}
                      style={{ height: `${Math.max(6, (count / maxCount) * 100)}%` }}
                    />
                  ))}
                </div>
                <p className="m-0 mt-1 text-sm">
                  {selectedGantt.requiredCrew === null
                    ? "定員が未登録"
                    : selectedGantt.shortages.some(Boolean)
                      ? `✕ 定員に足りない日が ${selectedGantt.shortages.filter(Boolean).length}日`
                      : "✓ 60日のあいだ定員を満たしています"}
                </p>
              </div>
            ) : null}

            <EmbarkForm candidates={candidates} vessels={listVessels().filter((v) => v.id === selected.vesselId)} today={today} />

            {selectedRecent.length > 0 ? (
              <div>
                <h3 className="m-0 mb-1.5 text-base font-bold">最近の乗下船</h3>
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                  {selectedRecent.slice(0, 8).map((e) => (
                    <li key={e.id} className="flex flex-wrap gap-2">
                      <span className="font-mono tabular-nums text-foreground-500">{fmtDateLabel(e.date)}</span>
                      <span className="font-semibold">{t.embarkationEvent[e.eventType]}</span>
                      <span>{e.crewName}</span>
                      <span className="text-foreground-500">{t.embarkationStatus[e.status]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
