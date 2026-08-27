"use client";

import { useMemo, useState } from "react";
import { startOfLocalDay, ymdLocal } from "@/domain/labor-law/evaluate";
import { buildIntervals } from "@/domain/labor-law/intervals";
import { WORK_CATEGORIES, type TimeRecord, type WorkCategory } from "@/domain/labor-law/types";
import { t } from "@/i18n/ja";
import { assignedWorkFor } from "@/lib/assigned-work";
import { cn } from "@/lib/cn";
import { CREW_MEMBERS, personName } from "@/lib/crew";
import { fmtDateTime, fmtDateTimeSec, fmtElapsedClock, fmtTimeSec } from "@/lib/format";
import { recordPunch } from "@/lib/vessel-actions";
import {
  useApprovals,
  useCrewRecords,
  useNowTick,
  usePermission,
  useSessionCrew,
  useShiftPlans,
} from "@/lib/vessel-hooks";
import {
  Button,
  Card,
  CardBody,
  Chip,
  GlassCard,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  useDisclosure,
  useGlassModalProps,
} from "@/ui";
import { GroupHeader } from "../_components/group-header";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
/**
 * 進行中のまま長時間経過した作業は「終了打刻の忘れ」の可能性が高い。
 * 並列打刻では開きっぱなしの作業が積み上がりやすいため、注意を促す（労働時間は
 * 進行中区間を現在時刻まで労働として集計するため、放置すると過大計上になる）。
 */
const LONG_OPEN_HOURS = 12;

function parseLocal(dateStr: string, timeStr: string): Date {
  const d = startOfLocalDay(dateStr);
  const [h, m] = timeStr.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

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
  const canAfterEntry = usePermission("punch_after_entry");
  const canAdjustCrew = usePermission("adjust_crew_punch");
  const now = useNowTick(1000); // 秒表示のため毎秒更新
  const today = ymdLocal(now);

  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  /** 2段階操作の選択中カード（タップ → 作業開始/終了を押す） */
  const [selected, setSelected] = useState<WorkCategory | null>(null);

  const myId = session?.id ?? "";
  const { watches } = useShiftPlans();
  const assigned = useMemo(
    () => (myId ? assignedWorkFor(myId, today, watches) : []),
    [myId, today, watches],
  );

  // 履歴の対象船員（打刻は常に本人。船長のみ他船員の記録を参照・調整できる）
  const [historyCrewId, setHistoryCrewId] = useState<string>("");
  const viewCrewId = canAdjustCrew && historyCrewId ? historyCrewId : myId;
  const isViewingOther = viewCrewId !== myId;

  const myRecords = useCrewRecords(myId);
  const viewRecords = useCrewRecords(viewCrewId);
  const approvals = useApprovals();

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
    try {
      const rec = await recordPunch({ crewMemberId: session.id, workCategory, action });
      setConfirmation(
        `${t.workCategory[workCategory]} を${t.action[action]}しました（${fmtTimeSec(rec.occurredAt)}）`,
      );
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /* ───────── 事後入力・差戻し再入力（自分の記録のみ） ───────── */
  const afterModal = useDisclosure();
  const resubmitModal = useDisclosure();
  const glassModal = useGlassModalProps();
  const [afterDate, setAfterDate] = useState(today);
  const [afterFrom, setAfterFrom] = useState("08:00");
  const [afterTo, setAfterTo] = useState("12:00");
  const [afterCategory, setAfterCategory] = useState<WorkCategory>("cargo");
  const [resubmitTarget, setResubmitTarget] = useState<TimeRecord | null>(null);
  const [resubmitDate, setResubmitDate] = useState(today);
  const [resubmitTime, setResubmitTime] = useState("17:00");
  const [formError, setFormError] = useState<string | null>(null);

  const supersededIds = useMemo(
    () => new Set(viewRecords.filter((r) => r.supersedesId).map((r) => r.supersedesId as string)),
    [viewRecords],
  );
  const remandByRecordId = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of approvals) {
      if (a.decision === "remanded" && a.targetRecordId) map.set(a.targetRecordId, a.reason ?? "差戻し");
    }
    return map;
  }, [approvals]);

  const history = useMemo(
    () => [...viewRecords].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 50),
    [viewRecords],
  );

  async function submitAfterEntry() {
    setFormError(null);
    if (!session) return;
    try {
      const from = parseLocal(afterDate, afterFrom);
      const to = parseLocal(afterDate, afterTo);
      if (to.getTime() <= from.getTime()) {
        setFormError("終了時刻は開始時刻より後にしてください");
        return;
      }
      await recordPunch({
        crewMemberId: session.id,
        workCategory: afterCategory,
        action: "start",
        entryType: "after",
        occurredAt: from,
      });
      await recordPunch({
        crewMemberId: session.id,
        workCategory: afterCategory,
        action: "end",
        entryType: "after",
        occurredAt: to,
      });
      setConfirmation(`${t.workCategory[afterCategory]} を事後入力しました`);
      afterModal.onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  }

  function openResubmit(record: TimeRecord) {
    setResubmitTarget(record);
    const d = new Date(record.occurredAt);
    setResubmitDate(ymdLocal(d));
    setResubmitTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    setFormError(null);
    resubmitModal.onOpen();
  }

  async function submitResubmit() {
    if (!resubmitTarget || !session) return;
    setFormError(null);
    try {
      await recordPunch({
        crewMemberId: session.id,
        workCategory: resubmitTarget.workCategory,
        action: resubmitTarget.action,
        entryType: "resubmit",
        occurredAt: parseLocal(resubmitDate, resubmitTime),
        supersedesId: resubmitTarget.id,
      });
      setConfirmation("差戻し分を再入力しました（元の打刻は訂正済として保持されます）");
      resubmitModal.onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!session) return null;

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="01" />

      {/* 現在時刻（秒まで）と打刻者 */}
      <GlassCard blurred>
        <CardBody className="flex flex-wrap items-end justify-between gap-3 p-5">
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
              {session.name}（{t.role[session.role]}）
            </p>
            <p className="text-sm text-foreground-600">打刻できるのはサインイン中の本人のみです</p>
          </div>
        </CardBody>
      </GlassCard>

      {/* 進行中の作業（並列可） */}
      <section aria-label="進行中の作業" className="flex flex-col gap-2">
        <h2 className="text-base font-bold">
          進行中の作業
          <span className="ml-2 tabular-nums text-foreground-600">{openIntervals.length}件</span>
        </h2>
        {openIntervals.length === 0 ? (
          <GlassCard>
            <CardBody className="p-4">
              <p className="text-foreground-600">
                進行中の作業はありません。下の作業をタップして「作業開始」を押してください。
              </p>
            </CardBody>
          </GlassCard>
        ) : (
          openIntervals.map((iv) => {
            const isSelected = selected === iv.workCategory;
            return (
              <GlassCard key={iv.startRecordId} blurred className="border-2 border-primary">
                <CardBody className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-xl font-bold">
                      {t.workCategory[iv.workCategory]}
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
                        {t.workCategory[iv.workCategory]} を作業終了
                      </Button>
                      <Button
                        variant="bordered"
                        radius="md"
                        className="min-h-14 border-[var(--glass-border-strong)] text-foreground"
                        onPress={() => setSelected(null)}
                      >
                        やめる
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="bordered"
                      radius="md"
                      className="min-h-14 w-full border-[var(--glass-border-strong)] text-lg font-semibold text-foreground"
                      onPress={() => setSelected(iv.workCategory)}
                    >
                      この作業を終了する
                    </Button>
                  )}
                </CardBody>
              </GlassCard>
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
                  .map((s) => `${t.shiftType[s.shiftType]} ${s.from}–${s.to}`)
                  .join(" / ")}
                active={openCategories.has(a.category)}
                selected={selected === a.category}
                onSelect={() => setSelected(selected === a.category ? null : a.category)}
              />
            ))}
          </div>
        ) : null}

        {otherCategories.length > 0 ? (
          <details className="glass-tile p-4">
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
                />
              ))}
            </div>
          </details>
        ) : null}

        {/* 2段階目: 選択した作業の開始/終了を確定する */}
        {selected && !openCategories.has(selected) ? (
          <GlassCard blurred className="border-2 border-primary">
            <CardBody className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-lg">
                <span className="font-bold">{t.workCategory[selected]}</span> を開始します
              </p>
              <div className="flex gap-2">
                <Button
                  variant="bordered"
                  radius="md"
                  className="min-h-14 border-[var(--glass-border-strong)] text-foreground"
                  onPress={() => setSelected(null)}
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
          </GlassCard>
        ) : null}
      </section>

      {error ? (
        <Card className="glass-tile border border-danger" shadow="none">
          <CardBody>
            <p className="text-danger">✕ {error}</p>
          </CardBody>
        </Card>
      ) : null}
      {confirmation ? (
        <Card className="glass-tile border border-[var(--glass-border-strong)]" shadow="none">
          <CardBody>
            <p className="font-semibold">✓ {confirmation}</p>
          </CardBody>
        </Card>
      ) : null}

      {/* 履歴・事後入力（同一画面内） */}
      <section aria-label="打刻履歴" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold">
            打刻履歴
            <span className="ml-2 font-normal text-foreground-600">
              {isViewingOther ? `${personName(viewCrewId)}（参照）` : "自分の記録"}
            </span>
          </h2>
          {canAfterEntry && !isViewingOther ? (
            <Button
              color="primary"
              variant="bordered"
              radius="md"
              className="min-h-12 border-[var(--glass-border-strong)] font-semibold text-foreground"
              onPress={() => {
                setFormError(null);
                afterModal.onOpen();
              }}
            >
              事後入力
            </Button>
          ) : null}
        </div>

        {canAdjustCrew ? (
          <GlassCard>
            <CardBody className="flex flex-wrap items-center gap-3 p-4">
              <Select
                label="表示する船員（船長のみ）"
                size="sm"
                className="max-w-xs"
                selectedKeys={[viewCrewId]}
                onSelectionChange={(keys) => {
                  const k = [...keys][0];
                  setHistoryCrewId(k ? String(k) : "");
                }}
              >
                {CREW_MEMBERS.map((c) => (
                  <SelectItem key={c.id}>{`${c.name}（${c.position}）`}</SelectItem>
                ))}
              </Select>
              <p className="text-sm text-foreground-600">
                他船員の打刻は参照のみです。誤りがある場合は 02 の船内承認から本人へ差戻し、本人が再入力します。
              </p>
            </CardBody>
          </GlassCard>
        ) : null}

        {history.length === 0 ? (
          <GlassCard>
            <CardBody className="p-4">
              <p className="text-foreground-600">
                打刻がありません。上の作業から打刻するか、「事後入力」で記録してください。
              </p>
            </CardBody>
          </GlassCard>
        ) : null}

        {history.map((r) => {
          const isSuperseded = supersededIds.has(r.id);
          const remandReason = !isSuperseded ? remandByRecordId.get(r.id) : undefined;
          return (
            <Card
              key={r.id}
              shadow="none"
              className={cn("glass-row", remandReason && "border border-danger")}
            >
              <CardBody className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "tabular-nums text-lg font-bold",
                      isSuperseded && "line-through opacity-60",
                    )}
                  >
                    {fmtDateTimeSec(r.occurredAt)}
                  </span>
                  <span className={cn("font-semibold", isSuperseded && "line-through opacity-60")}>
                    {t.workCategory[r.workCategory]} {t.action[r.action]}
                  </span>
                  <Chip size="sm" variant="flat" radius="sm">
                    {t.entryType[r.entryType]}
                  </Chip>
                  {isSuperseded ? (
                    <Chip size="sm" variant="flat" radius="sm">
                      訂正済（再入力で無効化・原本保持）
                    </Chip>
                  ) : null}
                  {remandReason ? (
                    <Chip size="sm" variant="flat" color="danger" radius="sm">
                      ✕ 差戻し
                    </Chip>
                  ) : null}
                </div>
                {remandReason ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-danger">{remandReason}</p>
                    {canAfterEntry && !isViewingOther ? (
                      <Button
                        size="sm"
                        color="danger"
                        radius="md"
                        className="min-h-11 self-start"
                        onPress={() => openResubmit(r)}
                      >
                        正しい時刻で再入力する
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardBody>
            </Card>
          );
        })}
      </section>

      {/* 事後入力 */}
      <Modal {...glassModal} isOpen={afterModal.isOpen} onOpenChange={afterModal.onOpenChange} placement="center">
        <ModalContent>
          <ModalHeader>事後入力（打刻し忘れた作業の記録）</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <Select
              label="作業種別"
              selectedKeys={[afterCategory]}
              onSelectionChange={(keys) => {
                const k = [...keys][0];
                if (k) setAfterCategory(k as WorkCategory);
              }}
            >
              {WORK_CATEGORIES.map((c) => (
                <SelectItem key={c}>{t.workCategory[c]}</SelectItem>
              ))}
            </Select>
            <Input type="date" label="対象日" value={afterDate} max={today} onValueChange={setAfterDate} />
            <div className="flex gap-3">
              <Input type="time" label="開始" value={afterFrom} onValueChange={setAfterFrom} />
              <Input type="time" label="終了" value={afterTo} onValueChange={setAfterTo} />
            </div>
            {formError ? <p className="text-danger">✕ {formError}</p> : null}
            <p className="text-sm text-foreground-600">
              未来の日時は入力できません（日付誤り防止ガード）。記録は「事後入力」として区別されます。
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={afterModal.onClose}>
              キャンセル
            </Button>
            <Button color="primary" onPress={() => void submitAfterEntry()}>
              登録する
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 差戻し再入力 */}
      <Modal
        {...glassModal}
        isOpen={resubmitModal.isOpen}
        onOpenChange={resubmitModal.onOpenChange}
        placement="center"
      >
        <ModalContent>
          <ModalHeader>差戻し分の再入力</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            {resubmitTarget ? (
              <p className="text-sm text-foreground-600">
                対象: {t.workCategory[resubmitTarget.workCategory]} {t.action[resubmitTarget.action]}
                （{fmtDateTime(resubmitTarget.occurredAt)}）。正しい日時で再入力すると、元の打刻は
                「訂正済」となり集計から除外されます（元レコードは保全されます）。
              </p>
            ) : null}
            <Input
              type="date"
              label="正しい日付"
              value={resubmitDate}
              max={today}
              onValueChange={setResubmitDate}
            />
            <Input type="time" label="正しい時刻" value={resubmitTime} onValueChange={setResubmitTime} />
            {formError ? <p className="text-danger">✕ {formError}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={resubmitModal.onClose}>
              キャンセル
            </Button>
            <Button color="danger" onPress={() => void submitResubmit()}>
              再入力を登録
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
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
}: {
  category: WorkCategory;
  assignment?: string;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "glass-tile flex min-h-24 flex-col items-start justify-center gap-1 p-4 text-left",
        active
          ? "border-2 border-primary bg-primary text-primary-foreground"
          : "border-2 border-transparent",
        selected && !active && "border-primary",
      )}
    >
      <span className="text-lg font-bold leading-tight">{t.workCategory[category]}</span>
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
