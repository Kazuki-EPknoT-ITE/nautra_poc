"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ymdLocal } from "@/domain/labor-law/evaluate";
import { buildIntervals } from "@/domain/labor-law/intervals";
import {
  EXCEPTIONAL_WORK_KINDS,
  PUNCH_CATEGORIES,
  type ExceptionalWorkKind,
  type WorkCategory,
} from "@/domain/labor-law/types";
import { assignedWorkFor } from "@/lib/assigned-work";
import { cn } from "@/lib/cn";
import { fmtElapsedClock, fmtTimeSec } from "@/lib/format";
import { useLocale } from "@/lib/use-locale";
import { recordPunch } from "@/lib/vessel-actions";
import { useCrewRecords, useNowTick, useSessionCrew, useShiftPlans } from "@/lib/vessel-hooks";
import { Eyebrow, FlashToast, StatusChip } from "@/ui";
import { GroupHeader } from "../_components/group-header";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
/**
 * 進行中のまま長時間経過した作業は「終了打刻の忘れ」の可能性が高い。
 * 並列打刻では開きっぱなしの作業が積み上がりやすいため、注意を促す（労働時間は
 * 進行中区間を現在時刻まで労働として集計するため、放置すると過大計上になる）。
 */
const LONG_OPEN_HOURS = 12;

/**
 * V-01 労働時間・打刻（デザイン正本 `design/poc_design` の `atPunch`）。
 *
 * - 打刻できるのは**サインイン中の本人のみ**（共用端末でも記録者を取り違えない。11.3）
 * - 作業種別は**割り当てられた当直シフトから選ぶ**（陸上・船長の計画と連携。8.3）
 * - 操作は**2段階**（作業をタップ → 確認して「はい」）。押し間違いを一度で確定させない（6.3）
 * - **並列打刻**に対応（当直しながら荷役監督など）。労働時間は和集合で集計される
 * - 時刻は秒まで表示し、打刻の証跡性を担保する
 */
export default function PunchPage() {
  const session = useSessionCrew();
  const { tr } = useLocale();
  const now = useNowTick(1000); // 秒表示のため毎秒更新
  const today = ymdLocal(now);

  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  /**
   * 2段階操作の2段目。作業をタップすると、確認のための問いかけを開く
   * （デザインの `punchConfirmOpen`）。ここで初めて記録が確定する。
   */
  const [pending, setPending] = useState<{ category: WorkCategory; action: "start" | "end" } | null>(
    null,
  );

  /**
   * 安全臨時労働・緊急作業の別枠（要件定義書 3.2.5⑥）。
   * **既定はオフ**。誤って常用されないよう、選んだ場合は理由を必須にする。
   */
  const [isExceptional, setIsExceptional] = useState(false);
  const [exceptionKind, setExceptionKind] = useState<ExceptionalWorkKind>("safety_emergency");
  const [exceptionNote, setExceptionNote] = useState("");

  function closeConfirm() {
    setPending(null);
    setIsExceptional(false);
    setExceptionKind("safety_emergency");
    setExceptionNote("");
    setError(null);
  }

  const myId = session?.id ?? "";
  const { watches } = useShiftPlans();
  const assigned = useMemo(
    () => (myId ? assignedWorkFor(myId, today, watches) : []),
    [myId, today, watches],
  );

  const myRecords = useCrewRecords(myId);

  const openIntervals = useMemo(
    () => buildIntervals(myRecords).filter((iv) => iv.endAt === null),
    [myRecords],
  );
  const openCategories = useMemo(
    () => new Set(openIntervals.map((iv) => iv.workCategory)),
    [openIntervals],
  );

  /** 本日の打刻（デザインの `todayRecords`）。新しい順に数件だけ出す */
  const todayRecords = useMemo(
    () =>
      myRecords
        .filter((r) => ymdLocal(new Date(r.occurredAt)) === today)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [myRecords, today],
  );

  async function commit() {
    if (!pending || !session) return;
    setError(null);
    // 別枠は開始打刻にだけ付く。理由は必須（後から「なぜ除外したのか」を検証できるようにする）
    const useException = pending.action === "start" && isExceptional;
    if (useException && !exceptionNote.trim()) {
      setError("緊急作業として記録するには理由を入力してください");
      return;
    }
    try {
      const rec = await recordPunch({
        crewMemberId: session.id,
        workCategory: pending.category,
        action: pending.action,
        exceptionKind: useException ? exceptionKind : undefined,
        note: useException ? exceptionNote.trim() : undefined,
      });
      setFlash(
        `${tr("workCategory", pending.category)} を${tr("action", pending.action)}しました（${fmtTimeSec(rec.occurredAt)}）` +
          (useException ? `／${tr("exceptionalWork", exceptionKind)}として上限の計算から外します` : ""),
      );
      closeConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!session) return null;

  /** 進行中のうち、いちばん長く開いている作業（暗い帯に出す主役） */
  const running = openIntervals
    .slice()
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="01" />

      {/*
        進行中の作業（暗い帯）。**いま何をしているか**と**どれだけ経ったか**だけを、
        離れて立っていても読める大きさで出す。進行中が無いときは現在時刻を主役にする。
      */}
      <div className="ui-dark flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div className="min-w-0">
          <Eyebrow tone="muted" className="text-[#99877D]">
            {running ? "進行中の作業" : "現在時刻"}
          </Eyebrow>
          <p className="m-0 mt-1.5 text-4xl font-bold text-white">
            {running ? tr("workCategory", running.workCategory) : `${now.getMonth() + 1}/${now.getDate()}（${WEEKDAYS[now.getDay()]}）`}
          </p>
          <p className="m-0 mt-1.5 text-lg text-[#DFE1E0]">
            {running
              ? `開始 ${fmtTimeSec(running.startAt.toISOString())}${openIntervals.length > 1 ? ` ／ ほかに${openIntervals.length - 1}件 進行中` : ""}`
              : `${session.name}（${tr("role", session.role)}）／ 打刻できるのはサインイン中の本人のみです`}
          </p>
        </div>
        <div className="flex-none text-right">
          <p className="m-0 font-mono text-6xl font-semibold leading-none tracking-[0.01em] tabular-nums text-white">
            {running
              ? fmtElapsedClock(now.getTime() - running.startAt.getTime())
              : `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`}
          </p>
          <p className="m-0 mt-1.5 text-lg text-[#99877D]">{running ? "経過" : "現在時刻"}</p>
        </div>
      </div>

      {running && now.getTime() - running.startAt.getTime() > LONG_OPEN_HOURS * 3600_000 ? (
        <p className="m-0 rounded-small bg-warning-100 px-4 py-3 text-lg text-warning-700">
          ⚠ {LONG_OPEN_HOURS}時間以上 進行中です。終了打刻の忘れがないか確認してください。
        </p>
      ) : null}

      {/* 作業のタイル（デザイン正本の `punchButtons`）。押すと確認の問いかけが開く（2段階の1段目）。
          **6種別を常に同じ大きさで出す**。割り当て外を折りたたむと、臨時の作業ほど
          押すまでの手数が増える——揺れる船上で手数が増えるのは打刻漏れの原因になる。
          割り当てられている種別は札で示し、どれが今日の当直かは分かるようにする。 */}
      <section aria-label="作業を打刻する" className="flex flex-col gap-2">
        <p className="m-0 text-base text-foreground-500">
          {assigned.length > 0
            ? "押すと確認の画面が出ます。複数の作業を同時に進行できます。「当直」の札は本日あなたに割り当てられた当直（04 シフト）です。"
            : "本日の割り当てはありません。必要な作業を選んで打刻してください。押すと確認の画面が出ます。"}
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PUNCH_CATEGORIES.map((category) => {
            const source = assigned.find((a) => a.category === category);
            return (
              <WorkTile
                key={category}
                category={category}
                assignment={source?.sources
                  .map((x) => `${tr("shiftType", x.shiftType)} ${x.from}–${x.to}`)
                  .join(" / ")}
                active={openCategories.has(category)}
                onSelect={() =>
                  setPending({
                    category,
                    action: openCategories.has(category) ? "end" : "start",
                  })
                }
                tr={tr}
              />
            );
          })}
        </div>
      </section>

      {/* 本日の打刻（デザインの `todayRecords`）。押した記録がその場で並ぶ */}
      <section aria-label="本日の打刻" className="ui-card">
        <div className="flex items-baseline justify-between gap-3 border-b border-[var(--ui-hairline-strong)] px-4 py-3">
          <h2 className="m-0 text-xl font-bold text-foreground-900">本日の打刻</h2>
          <p className="m-0 text-base text-foreground-500">
            直前の打刻：
            {todayRecords[0]
              ? `${fmtTimeSec(todayRecords[0].occurredAt)} ${tr("workCategory", todayRecords[0].workCategory)} ${tr("action", todayRecords[0].action)}`
              : "まだありません"}
          </p>
        </div>
        {todayRecords.slice(0, 8).map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3.5 border-b border-[var(--ui-hairline)] px-4 py-2.5"
          >
            <span className="flex-none basis-[104px] font-mono text-lg tabular-nums text-foreground-800">
              {fmtTimeSec(r.occurredAt)}
            </span>
            <span className="flex-1 text-lg text-foreground-700">
              {tr("workCategory", r.workCategory)}
            </span>
            <span className="flex-none basis-20 text-base text-foreground-500">
              {tr("action", r.action)}
            </span>
            {r.exceptionKind ? (
              <StatusChip level="caution" size="sm" label={`別枠 ${tr("exceptionalWork", r.exceptionKind)}`} />
            ) : (
              <StatusChip level="none" size="sm" label={tr("entryType", r.entryType)} />
            )}
          </div>
        ))}
        <p className="m-0 px-4 py-3 text-base leading-relaxed text-foreground-500">
          打刻はまず端末内に保存され、通信が戻ったときに自動で送られます。押した記録はあとから
          書き換えられません。
          <Link href="/vessel/history" className="ml-2 text-primary underline underline-offset-2">
            履歴・事後入力を見る →
          </Link>
        </p>
      </section>

      {/* 2段階目: 確認の問いかけ（デザインの `punchConfirmOpen`） */}
      {pending ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(10,10,10,0.55)] p-8">
          <div className="ui-card w-full max-w-[560px] border-[var(--ui-hairline-strong)] shadow-modal">
            <div className="border-b border-[var(--ui-hairline)] px-7 py-5">
              <Eyebrow>打刻の確認 ／ {fmtTimeSec(now.toISOString())}</Eyebrow>
              <h2 className="m-0 mt-2 text-4xl font-bold leading-snug text-foreground-900">
                {tr("workCategory", pending.category)} を{tr("action", pending.action)}します
              </h2>
              <p className="m-0 mt-2.5 text-xl leading-relaxed text-foreground-700">
                {session.name}（{tr("role", session.role)}）の記録として、いまの時刻で残します。
              </p>
              <p className="m-0 mt-2 text-base leading-relaxed text-foreground-500">
                記録した打刻はあとから書き換えできません。訂正が必要なときは陸上への差戻しになります。
              </p>
            </div>

            {/* 3.2.5⑥ 安全臨時労働・緊急作業の別枠。既定はオフ（誤って常用させない） */}
            {pending.action === "start" ? (
              <div className="flex flex-col gap-3 border-b border-[var(--ui-hairline)] px-7 py-4">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isExceptional}
                    onChange={(e) => {
                      setIsExceptional(e.target.checked);
                      if (!e.target.checked) {
                        setExceptionKind("safety_emergency");
                        setExceptionNote("");
                      }
                    }}
                    className="h-6 w-6"
                  />
                  <span className="text-lg text-foreground-800">
                    これは緊急作業・安全臨時労働です（労働時間の上限の計算から外します）
                  </span>
                </label>

                {isExceptional ? (
                  <div className="ui-inset flex flex-col gap-3 p-3.5">
                    <div className="flex flex-wrap gap-2">
                      {EXCEPTIONAL_WORK_KINDS.map((k) => (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={exceptionKind === k}
                          onClick={() => setExceptionKind(k)}
                          className={cn("ui-btn-ghost min-h-12", exceptionKind === k && "ui-btn-selected")}
                        >
                          {tr("exceptionalWork", k)}
                        </button>
                      ))}
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-base text-foreground-500">理由（必須）</span>
                      <input
                        value={exceptionNote}
                        onChange={(e) => setExceptionNote(e.target.value)}
                        placeholder="例: 荒天で係船索の増し取りが必要になったため"
                        className="ui-field min-h-[52px] text-lg"
                      />
                    </label>
                    <p className="m-0 text-base leading-relaxed text-foreground-500">
                      働いた時間は記録簿に実績として残ります。上限の計算からだけ外れ、理由とあわせて
                      後から確認できます。
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p className="m-0 border-b border-[var(--ui-hairline)] px-7 py-3 text-lg font-semibold text-danger">
                ✕ {error}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-3 px-7 py-5">
              <button type="button" onClick={closeConfirm} className="ui-btn-ghost min-h-16 text-2xl">
                いいえ
              </button>
              <button
                type="button"
                onClick={() => void commit()}
                className="ui-btn-primary min-h-16 text-2xl"
              >
                はい、{tr("action", pending.action)}する
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <FlashToast message={flash} onDone={() => setFlash(null)} />
    </div>
  );
}

/**
 * 作業タイル（2段階の1段目）。
 * 作業中は塗り＋「作業中」表示に変わり、終了すると元の見た目に戻る（色だけに依存しない）。
 */
/**
 * 作業種別ごとの注記（デザイン正本の `PUNCH_CATS.note`）。
 * **労働時間に入るかどうか**をタイルの上で言い切る。押したあとに気付くのでは遅い。
 */
const CATEGORY_NOTE: Record<string, string> = {
  navigation_watch: "労働時間に算入",
  cargo: "労働時間に算入",
  standby: "総員配置・待機も算入",
  maintenance: "労働時間に算入",
  other: "労働時間に算入",
  rest: "労働時間から除外",
};

function WorkTile({
  category,
  assignment,
  active,
  onSelect,
  tr,
}: {
  category: WorkCategory;
  /** 本日割り当てられた当直（割り当て外なら undefined） */
  assignment?: string;
  active: boolean;
  onSelect: () => void;
  /** 作業種別の表示言語（要件定義書 10.2） */
  tr: (group: string, key: string) => string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "ui-card flex min-h-24 flex-col items-center justify-center gap-1 p-3.5 text-center",
        active
          ? // globals.css の材質クラスは utilities より後に定義されるため、
            // 塗りつぶしは important 付きで指定しないと .ui-card の背景に負けて
            // 「白地に白文字」になる（作業中のタイルが読めなくなる）
            "border-primary !bg-primary !text-primary-foreground"
          : "border-[var(--ui-hairline-strong)] hover:bg-content2",
      )}
    >
      <span className="text-2xl font-bold leading-tight">{tr("workCategory", category)}</span>
      <span className={cn("text-base", active ? "opacity-90" : "text-foreground-500")}>
        {active ? "押すと終了します" : (CATEGORY_NOTE[category] ?? "")}
      </span>
      {assignment ? (
        <span
          className={cn(
            "mt-0.5 rounded-small px-1.5 py-0.5 text-xs",
            active ? "bg-white/20" : "bg-content2 text-foreground-500",
          )}
        >
          当直 {assignment}
        </span>
      ) : null}
    </button>
  );
}
