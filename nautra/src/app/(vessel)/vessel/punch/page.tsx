"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ymdLocal } from "@/domain/labor-law/evaluate";
import { buildIntervals } from "@/domain/labor-law/intervals";
import {
  EXCEPTIONAL_WORK_KINDS,
  WORK_CATEGORIES,
  type ExceptionalWorkKind,
  type WorkCategory,
} from "@/domain/labor-law/types";
import { assignedWorkFor } from "@/lib/assigned-work";
import { cn } from "@/lib/cn";
import { fmtElapsedClock, fmtTimeSec } from "@/lib/format";
import { useLocale } from "@/lib/use-locale";
import { recordPunch } from "@/lib/vessel-actions";
import {
  useCrewRecords,
  useNowTick,
  useSessionCrew,
  useShiftPlans,
} from "@/lib/vessel-hooks";
import {
  Button,
  Card,
  CardBody,
  Checkbox,
  Chip,
  Input,
  Radio,
  RadioGroup,
  SurfaceCard,
} from "@/ui";
import { GroupHeader } from "../_components/group-header";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
/**
 * 進行中のまま長時間経過した作業は「終了打刻の忘れ」の可能性が高い。
 * 並列打刻では開きっぱなしの作業が積み上がりやすいため、注意を促す（労働時間は
 * 進行中区間を現在時刻まで労働として集計するため、放置すると過大計上になる）。
 */
const LONG_OPEN_HOURS = 12;

/**
 * V-01 労働時間・打刻（履歴・事後入力を同一画面に統合）。
 *
 * - 打刻できるのは**サインイン中の本人のみ**（共用端末でも記録者を取り違えない。11.3）
 * - 作業種別は**割り当てられた当直シフトから選ぶ**（陸上・船長の計画と連携。8.3）
 * - 「作業をタップ → 作業開始/終了を押す」の2段階。開始中のボタンは色が変わる（誤操作防止。6.3）
 * - **並列打刻**に対応（当直しながら荷役監督など）。労働時間は和集合で集計される
 * - 時刻は秒まで表示し、打刻の証跡性を担保する
 */
export default function PunchPage() {
  const session = useSessionCrew();
  const { tr } = useLocale();
  const now = useNowTick(1000); // 秒表示のため毎秒更新
  const today = ymdLocal(now);

  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  /** 2段階操作の選択中カード（タップ → 作業開始/終了を押す） */
  const [selected, setSelected] = useState<WorkCategory | null>(null);

  /**
   * 安全臨時労働・緊急作業の別枠（要件定義書 3.2.5⑥）。
   * **既定はオフ**。誤って常用されないよう、選んだ場合は理由を必須にする。
   */
  const [isExceptional, setIsExceptional] = useState(false);
  const [exceptionKind, setExceptionKind] = useState<ExceptionalWorkKind>("safety_emergency");
  const [exceptionNote, setExceptionNote] = useState("");

  function clearException() {
    setIsExceptional(false);
    setExceptionKind("safety_emergency");
    setExceptionNote("");
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

  const assignedCategories = useMemo(() => assigned.map((a) => a.category), [assigned]);
  const otherCategories = useMemo(
    () => WORK_CATEGORIES.filter((c) => !assignedCategories.includes(c)),
    [assignedCategories],
  );

  async function punch(workCategory: WorkCategory, action: "start" | "end") {
    setError(null);
    if (!session) return;
    // 別枠は開始打刻にだけ付く。理由は必須（後から「なぜ除外したのか」を検証できるようにする）
    const useException = action === "start" && isExceptional;
    if (useException && !exceptionNote.trim()) {
      setError("緊急作業として記録するには理由を入力してください");
      return;
    }
    try {
      const rec = await recordPunch({
        crewMemberId: session.id,
        workCategory,
        action,
        exceptionKind: useException ? exceptionKind : undefined,
        note: useException ? exceptionNote.trim() : undefined,
      });
      setConfirmation(
        `${tr("workCategory", workCategory)} を${tr("action", action)}しました（${fmtTimeSec(rec.occurredAt)}）` +
          (useException ? `／${tr("exceptionalWork", exceptionKind)}として上限の計算から外します` : ""),
      );
      setSelected(null);
      clearException();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }


  if (!session) return null;

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="01" />

      {/* 現在時刻（秒まで）と打刻者 */}
      <SurfaceCard>
        <CardBody className="flex flex-row flex-wrap items-end justify-between gap-3 p-5">
          <div>
            <p className="text-sm text-foreground-600">
              {now.getMonth() + 1}/{now.getDate()}（{WEEKDAYS[now.getDay()]}）
            </p>
            <p className="tabular-nums text-5xl font-bold leading-none sm:text-6xl">
              {String(now.getHours()).padStart(2, "0")}:
              {String(now.getMinutes()).padStart(2, "0")}:
              {String(now.getSeconds()).padStart(2, "0")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">
              {session.name}（{tr("role", session.role)}）
            </p>
            <p className="text-sm text-foreground-600">打刻できるのはサインイン中の本人のみです</p>
          </div>
        </CardBody>
      </SurfaceCard>

      {/* 進行中の作業（並列可） */}
      <section aria-label="進行中の作業" className="flex flex-col gap-2">
        <h2 className="text-base font-bold">
          進行中の作業
          <span className="ml-2 tabular-nums text-foreground-600">{openIntervals.length}件</span>
        </h2>
        {openIntervals.length === 0 ? (
          <SurfaceCard>
            <CardBody className="p-4">
              <p className="text-foreground-600">
                進行中の作業はありません。下の作業をタップして「作業開始」を押してください。
              </p>
            </CardBody>
          </SurfaceCard>
        ) : (
          openIntervals.map((iv) => {
            const isSelected = selected === iv.workCategory;
            return (
              <SurfaceCard key={iv.startRecordId} className="border-2 border-primary">
                <CardBody className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-xl font-bold">
                      {tr("workCategory", iv.workCategory)}
                      <Chip size="sm" color="primary" radius="sm" className="ml-2 align-middle">
                        作業中
                      </Chip>
                    </p>
                    <p className="tabular-nums text-sm text-foreground-600">
                      開始 {fmtTimeSec(iv.startAt.toISOString())}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums text-3xl font-bold">
                      {fmtElapsedClock(now.getTime() - iv.startAt.getTime())}
                    </p>
                    {now.getTime() - iv.startAt.getTime() > LONG_OPEN_HOURS * 3600_000 ? (
                      <p className="text-sm font-semibold text-warning-700">
                        ⚠ {LONG_OPEN_HOURS}時間以上 進行中です。終了打刻の忘れがないか確認してください
                      </p>
                    ) : null}
                  </div>
                  {isSelected ? (
                    <div className="flex w-full gap-2">
                      <Button
                        color="danger"
                        radius="md"
                        className="min-h-14 flex-1 text-lg font-bold"
                        onPress={() => void punch(iv.workCategory, "end")}
                      >
                        {tr("workCategory", iv.workCategory)} を作業終了
                      </Button>
                      <Button
                        variant="bordered"
                        radius="md"
                        className="min-h-14 border-[var(--ui-hairline-strong)] text-foreground"
                        onPress={() => setSelected(null)}
                      >
                        やめる
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="bordered"
                      radius="md"
                      className="min-h-14 w-full border-[var(--ui-hairline-strong)] text-lg font-semibold text-foreground"
                      onPress={() => setSelected(iv.workCategory)}
                    >
                      この作業を終了する
                    </Button>
                  )}
                </CardBody>
              </SurfaceCard>
            );
          })
        )}
      </section>

      {/* 作業を開始する（割り当て作業から選ぶ） */}
      <section aria-label="作業を開始する" className="flex flex-col gap-2">
        <h2 className="text-base font-bold">作業を開始する</h2>
        <p className="text-sm text-foreground-600">
          {assigned.length > 0
            ? "本日あなたに割り当てられた当直（04 シフト）の作業です。タップしてから「作業開始」を押します。複数の作業を同時に進行できます。"
            : "本日の割り当てはありません。必要な作業を選んで打刻してください。"}
        </p>

        {assigned.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {assigned.map((a) => (
              <WorkTile
                key={a.category}
                category={a.category}
                assignment={a.sources
                  .map((s) => `${tr("shiftType", s.shiftType)} ${s.from}–${s.to}`)
                  .join(" / ")}
                active={openCategories.has(a.category)}
                selected={selected === a.category}
                onSelect={() => setSelected(selected === a.category ? null : a.category)}
                tr={tr}
              />
            ))}
          </div>
        ) : null}

        {otherCategories.length > 0 ? (
          <details className="ui-card p-4">
            <summary className="cursor-pointer text-base font-semibold">
              割り当て外の作業を打刻する（{otherCategories.length}件）
            </summary>
            <p className="mb-2 mt-2 text-sm text-foreground-600">
              臨時の作業はここから打刻できます。割り当てとの差異は 04 シフトの「計画と実績」で確認できます。
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {otherCategories.map((c) => (
                <WorkTile
                  key={c}
                  category={c}
                  active={openCategories.has(c)}
                  selected={selected === c}
                  onSelect={() => setSelected(selected === c ? null : c)}
                  tr={tr}
                />
              ))}
            </div>
          </details>
        ) : null}

        {/* 2段階目: 選択した作業の開始/終了を確定する */}
        {selected && !openCategories.has(selected) ? (
          <SurfaceCard className="border-2 border-primary">
            <CardBody className="flex flex-col gap-3 p-4">
              <p className="text-lg">
                <span className="font-bold">{tr("workCategory", selected)}</span> を開始します
              </p>

              {/* 3.2.5⑥ 安全臨時労働・緊急作業の別枠。既定はオフ（誤って常用させない） */}
              <Checkbox
                size="lg"
                isSelected={isExceptional}
                onValueChange={(v) => {
                  setIsExceptional(v);
                  if (!v) clearException();
                }}
              >
                これは緊急作業・安全臨時労働です（労働時間の上限の計算から外します）
              </Checkbox>

              {isExceptional ? (
                <div className="ui-inset flex flex-col gap-3 p-3">
                  <RadioGroup
                    orientation="horizontal"
                    label="別枠の区分"
                    value={exceptionKind}
                    onValueChange={(v) => setExceptionKind(v as ExceptionalWorkKind)}
                  >
                    {EXCEPTIONAL_WORK_KINDS.map((k) => (
                      <Radio key={k} value={k}>
                        {tr("exceptionalWork", k)}
                      </Radio>
                    ))}
                  </RadioGroup>
                  <Input
                    label="理由（必須）"
                    placeholder="例: 荒天で係船索の増し取りが必要になったため"
                    value={exceptionNote}
                    onValueChange={setExceptionNote}
                  />
                  <p className="text-pretty text-sm text-foreground-600">
                    働いた時間は記録簿に実績として残ります。上限の計算からだけ外れ、理由とあわせて
                    後から確認できます。
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="bordered"
                  radius="md"
                  className="min-h-14 border-[var(--ui-hairline-strong)] text-foreground"
                  onPress={() => {
                    setSelected(null);
                    clearException();
                  }}
                >
                  やめる
                </Button>
                <Button
                  color="primary"
                  radius="md"
                  className="min-h-14 px-8 text-lg font-bold"
                  onPress={() => void punch(selected, "start")}
                >
                  作業開始
                </Button>
              </div>
            </CardBody>
          </SurfaceCard>
        ) : null}
      </section>

      {error ? (
        <Card className="ui-card border border-danger" shadow="none">
          <CardBody>
            <p className="text-danger">✕ {error}</p>
          </CardBody>
        </Card>
      ) : null}
      {confirmation ? (
        <Card className="ui-card border border-[var(--ui-hairline-strong)]" shadow="none">
          <CardBody>
            <p className="font-semibold">✓ {confirmation}</p>
          </CardBody>
        </Card>
      ) : null}

      {/* 履歴と事後入力は V-02（/vessel/history）へ分けた。打刻の画面は「いま打刻する」
          ことだけに使い、確認・訂正は別のタブで行う（1画面1目的。基本設計書 6.3） */}
      <Link href="/vessel/history" className="ui-btn-ghost min-h-14 text-lg">
        打刻の履歴・事後入力を見る →
      </Link>
    </div>
  );
}

/**
 * 作業タイル（1段階目のタップ対象）。
 * 作業中は塗り＋「作業中」表示に変わり、終了すると元の見た目に戻る（色だけに依存しない）。
 */
function WorkTile({
  category,
  assignment,
  active,
  selected,
  onSelect,
  tr,
}: {
  category: WorkCategory;
  assignment?: string;
  active: boolean;
  selected: boolean;
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
        "ui-card flex min-h-24 flex-col items-start justify-center gap-1 p-4 text-left",
        active
          ? // globals.css の材質クラスは utilities より後に定義されるため、
            // 塗りつぶしは important 付きで指定しないと .ui-card の背景に負けて
            // 「白地に白文字」になる（作業中のタイルが読めなくなる）
            "border-2 border-primary !bg-primary !text-primary-foreground"
          : "border-2 border-transparent",
        selected && !active && "border-primary",
      )}
    >
      <span className="text-lg font-bold leading-tight">{tr("workCategory", category)}</span>
      {assignment ? (
        <span className={cn("text-xs", active ? "opacity-90" : "text-foreground-600")}>
          {assignment}
        </span>
      ) : null}
      <span className={cn("text-sm font-semibold", active ? "opacity-90" : "text-foreground-600")}>
        {active ? "● 作業中（タップで終了）" : selected ? "選択中" : "タップして選択"}
      </span>
    </button>
  );
}
