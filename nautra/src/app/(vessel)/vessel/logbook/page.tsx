"use client";

import { useMemo, useState } from "react";
import { ymdLocal } from "@/domain/labor-law/evaluate";
import { t } from "@/i18n/ja";
import { cn } from "@/lib/cn";
import { personName } from "@/lib/crew";
import {
  fmtDateLabel,
  fmtTime,
  fromLocalInputValue,
  parseOptionalNumber,
  toLocalInputValue,
} from "@/lib/format";
import {
  buildTemplateRevision,
  collectTemplateValues,
  CUSTOM_LOG_PREFIX,
  draftTemplate,
  isCustomLogKey,
  itemsToDrafts,
  type DraftTemplateItem,
} from "@/lib/record-templates";
import { appendRecord, newRecordBase } from "@/lib/vessel-actions";
import { usePermission, useRecords, useRecordTemplates, useSessionCrew } from "@/lib/vessel-hooks";
import { voyageLogLabel } from "@/lib/voyage-log";
import {
  latestBySupersedes,
  VOYAGE_LOG_TYPES,
  type RecordTemplatePayload,
  type TemplateItem,
  type VoyageLogPayload,
  type VoyageLogType,
} from "@/sync-protocol/records";
import { LineIcon, useModalProps } from "@/ui";
import { Button, Card, CardBody, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem, Textarea, useDisclosure } from "@/ui/heroui";
import { GroupHeader } from "../_components/group-header";
import { RecordMark, RecordTile } from "../_components/record-tile";
import { TemplateItemField } from "../_components/template-item-field";
import {
  PastEmpty,
  PastFilterBar,
  RecordModeSwitch,
  ShowMoreButton,
  usePastList,
  type RecordMode,
} from "../_components/record-mode";
import { isFilterActive } from "@/lib/record-filter";
import { LogTypeDesigner } from "./_components/log-type-designer";
import { LogTypeManager, type ManagedLogType } from "./_components/log-type-manager";

const WEATHER = ["晴", "曇", "雨", "霧", "雪", "雷雨"];
const WIND = ["静穏", "北 3m/s", "北東 3m/s", "東 5m/s", "南東 5m/s", "南 4m/s", "南西 5m/s", "西 8m/s", "北西 10m/s"];
const SEA = ["波高 0.3m", "波高 0.5m", "波高 1.0m", "波高 1.5m", "波高 2.0m", "波高 3.0m 以上"];
const VIS = ["良好", "やや不良（2〜5海里）", "不良（2海里未満）", "濃霧"];

interface FormState {
  /** 記録の種類。組み込みの4種は logType、船長・陸上が作った種類は "custom:…"（テンプレートのキー） */
  kind: string;
  at: string;
  port: string;
  route: string;
  position: string;
  courseDeg: string;
  speedKnots: string;
  engineRpm: string;
  weather: string;
  wind: string;
  seaState: string;
  visibility: string;
  remarks: string;
}

function emptyForm(kind: string): FormState {
  return {
    kind,
    at: toLocalInputValue(new Date()),
    port: "",
    route: "",
    position: "",
    courseDeg: "",
    speedKnots: "",
    engineRpm: "",
    weather: "晴",
    wind: "北東 3m/s",
    seaState: "波高 0.5m",
    visibility: "良好",
    remarks: "",
  };
}

function formFromRecord(r: VoyageLogPayload): FormState {
  return {
    kind: r.logType === "custom" ? (r.customTypeKey ?? CUSTOM_LOG_PREFIX) : r.logType,
    at: toLocalInputValue(new Date(r.occurredAt)),
    port: r.port ?? "",
    route: r.route ?? "",
    position: r.position ?? "",
    courseDeg: r.courseDeg?.toString() ?? "",
    speedKnots: r.speedKnots?.toString() ?? "",
    engineRpm: r.engineRpm?.toString() ?? "",
    weather: r.weather ?? "晴",
    wind: r.wind ?? "北東 3m/s",
    seaState: r.seaState ?? "波高 0.5m",
    visibility: r.visibility ?? "良好",
    remarks: r.remarks ?? "",
  };
}

/** 種類をしまった・項目を外したあとの訂正でも、元の記録に入っていた項目をそのまま直せるようにする */
function itemsFromRecord(r: VoyageLogPayload): TemplateItem[] {
  return (r.extraValues ?? []).map((v) => ({
    key: v.key,
    label: v.label,
    group: v.group,
    inputType: v.result !== "na" ? "check" : typeof v.value === "number" ? "number" : "text",
    unit: v.unit,
  }));
}

/**
 * V-05 航海日誌。出入港・船位・海象・特記の入力/一覧（要件定義書 3.3.1）。
 * 一次記録は追記のみ。訂正は supersedesId 付きの訂正記録を追記し、原本は「訂正済」として保持する。
 *
 * 記録項目は船長が**記録の入力画面の中で**足す・直す・外す・並べ替える（利用者の依頼 2026-10-14
 * 「もっと直感的かつ自由に」）。投錨・給油など組み込み以外の**記録の種類**も作れる（logType = custom）。
 * どちらも record_template の新しい版として配信され、過去の記録は当時の内容のまま残る。
 */
export default function LogbookPage() {
  // 記入できるのはサインイン中の本人のみ（記録者の取り違えを防ぐ。基本設計書 11.3）
  const session = useSessionCrew();
  const canWrite = usePermission("write_logbook"); // 記入は船長・航海士（11.2）
  const canManageTemplates = usePermission("manage_record_templates");
  const templates = useRecordTemplates("voyage_log");
  const logs = useRecords("voyage_log");
  const modal = useDisclosure();
  const modalProps = useModalProps();
  const [form, setForm] = useState<FormState>(() => emptyForm("position"));
  const [supersedes, setSupersedes] = useState<VoyageLogPayload | null>(null);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  /**
   * 種類を作る・記録する項目を直す画面（手順つき）。記録の入力画面とは分ける（利用者の指摘 2026-10-16:
   * 「項目を決める」と「記録を書く」が1枚に混ざっていて初めての人に分かりにくい）。
   * fromRecord: 記録の入力画面から来たら、保存したあと入力画面へ戻す
   */
  const designerModal = useDisclosure();
  const [designer, setDesigner] = useState<{ mode: "create"; n: number } | { mode: "edit"; kind: string; fromRecord: boolean; n: number }>({
    mode: "create",
    n: 0,
  });
  /** 種類と項目を編集・削除する画面（手順つき。利用者の依頼 2026-10-19） */
  const managerModal = useDisclosure();
  const [managerN, setManagerN] = useState(0);
  /** 直前の削除を元に戻すための、削除の前と後の版 */
  const [undo, setUndo] = useState<{ before: RecordTemplatePayload; after: RecordTemplatePayload } | null>(null);
  /** 作ったばかりで、まだ一覧に届いていない種類（作ってすぐ項目を足せるように） */
  const [created, setCreated] = useState<Record<string, RecordTemplatePayload>>({});

  const [pickedMode, setMode] = useState<RecordMode>("record");
  // 書けない人（甲板部員・機関長）には記録の入口を出さず、過去の日誌だけを見せる（レビュー 0-9: 権限のないものは出さない）
  const mode: RecordMode = canWrite ? pickedMode : "past";
  const effective = useMemo(() => latestBySupersedes(logs), [logs]);
  // 過去の日誌は期間とキーワードで探す（レビュー LOG-03）。種別・港・船位・海象・特記・追加項目・記録者が対象
  const past = usePastList(
    logs,
    (l) => l.occurredAt,
    (l) =>
      [
        voyageLogLabel(l),
        l.port,
        l.route,
        l.position,
        l.weather,
        l.wind,
        l.seaState,
        l.visibility,
        l.remarks,
        ...(l.extraValues ?? []).map((v) => `${v.label} ${v.value ?? ""}`),
        personName(l.recordedBy),
      ]
        .filter(Boolean)
        .join(" "),
  );
  const supersededIds = useMemo(
    () => new Set(logs.map((l) => l.supersedesId).filter((x): x is string => Boolean(x))),
    [logs],
  );
  const byDate = useMemo(() => {
    const map = new Map<string, typeof logs>();
    for (const l of past.shown) {
      const d = ymdLocal(new Date(l.occurredAt));
      map.set(d, [...(map.get(d) ?? []), l]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [past.shown]);

  /** 記録の種類ごとの項目テンプレート（上司・陸上が配信。templateKey = 記録の種類） */
  const templateFor = (kind: string): RecordTemplatePayload | undefined =>
    templates.find((tpl) => tpl.templateKey === kind) ?? created[kind];
  const customTypes = useMemo(() => {
    const byKey = new Map<string, RecordTemplatePayload>();
    for (const tpl of Object.values(created)) if (!tpl.retired) byKey.set(tpl.templateKey, tpl);
    for (const tpl of templates) if (isCustomLogKey(tpl.templateKey)) byKey.set(tpl.templateKey, tpl);
    for (const tpl of Object.values(created)) if (tpl.retired) byKey.delete(tpl.templateKey);
    // 作った順（キーの ULID）に並べる。項目を直しても札の位置が動かないように
    return [...byKey.values()].sort((a, b) => a.templateKey.localeCompare(b.templateKey));
  }, [templates, created]);

  const isCustom = isCustomLogKey(form.kind);
  const formTemplate = templateFor(form.kind);
  const kindLabel = isCustom
    ? (formTemplate?.name ?? supersedes?.customTypeName ?? t.voyageLogType.custom)
    : t.voyageLogType[form.kind];
  // 訂正では、種類をしまった・項目を外した後でも元の記録の項目を落とさない（訂正で値が消えないように）
  const formItems: TemplateItem[] = useMemo(() => {
    const current = formTemplate?.items ?? [];
    if (!supersedes) return current;
    const keys = new Set(current.map((it) => it.key));
    return [...current, ...itemsFromRecord(supersedes).filter((it) => !keys.has(it.key))];
  }, [formTemplate, supersedes]);

  function openNew(kind: string) {
    setSupersedes(null);
    setForm(emptyForm(kind));
    setExtra({});
    setError(null);
    modal.onOpen();
  }

  function openCorrection(r: VoyageLogPayload) {
    setSupersedes(r);
    setForm(formFromRecord(r));
    setExtra(Object.fromEntries((r.extraValues ?? []).map((v) => [v.key, v.result !== "na" ? v.result : String(v.value ?? "")])));
    setError(null);
    modal.onOpen();
  }

  const kindName = (kind: string) =>
    isCustomLogKey(kind) ? (templateFor(kind)?.name ?? t.voyageLogType.custom) : t.voyageLogType[kind];
  const takenNames = [...VOYAGE_LOG_TYPES.map((lt) => t.voyageLogType[lt]), ...customTypes.map((c) => c.name)];

  function openCreate() {
    setDesigner((d) => ({ mode: "create", n: d.n + 1 }));
    designerModal.onOpen();
  }

  /** 記録の入力画面から項目を直しに行く（入力画面は閉じ、保存したら戻ってくる） */
  function openEditFromRecord() {
    modal.onClose();
    setDesigner((d) => ({ mode: "edit", kind: form.kind, fromRecord: true, n: d.n + 1 }));
    designerModal.onOpen();
  }

  /** 種類を作る、または項目の変更を1つの新しい版として全員の端末へ送る（足す・直す・外す・並べ替え・種類の名前） */
  async function saveDesign(items: DraftTemplateItem[], name?: string) {
    if (!session) throw new Error("サインインが必要です");
    const b = await newRecordBase(session.id);
    if (designer.mode === "create") {
      const typeName = name?.trim() ?? "";
      const key = `${CUSTOM_LOG_PREFIX}${b.id}`;
      const next = buildTemplateRevision({
        template: draftTemplate({ usage: "voyage_log", templateKey: key, name: typeName, tenantId: b.tenantId, vesselId: b.vesselId }),
        items,
        id: b.id,
        recordedBy: session.id,
        deviceId: b.deviceId,
        publishedBy: session.id,
        group: typeName,
      });
      await appendRecord("record_template", next);
      setCreated((c) => ({ ...c, [key]: next }));
      setUndo(null);
      designerModal.onClose();
      setDone(`「${next.name}」を作りました。札を押すと記録できます`);
      return;
    }
    const kind = designer.kind;
    const label = kindName(kind);
    const custom = isCustomLogKey(kind);
    const current =
      templateFor(kind) ??
      draftTemplate({ usage: "voyage_log", templateKey: kind, name: `航海日誌: ${label}`, tenantId: b.tenantId, vesselId: b.vesselId });
    const next = buildTemplateRevision({
      template: current,
      items,
      name: custom ? name : undefined,
      id: b.id,
      recordedBy: session.id,
      deviceId: b.deviceId,
      publishedBy: session.id,
      group: (custom && name?.trim()) || label,
    });
    await appendRecord("record_template", next);
    if (custom) setCreated((c) => ({ ...c, [next.templateKey]: next }));
    setUndo(null);
    designerModal.onClose();
    setDone(`「${custom ? next.name : label}」の記録する項目を保存しました（全員の端末に届きます）`);
    if (designer.fromRecord) openNew(kind);
  }

  /** いまの版を置き換える新しい版を1つ配信する（項目の削除・種類の削除・元に戻すで共用） */
  async function publishRevision(
    tpl: RecordTemplatePayload,
    items: DraftTemplateItem[],
    opts: { retired?: boolean; name?: string } = {},
  ): Promise<RecordTemplatePayload> {
    if (!session) throw new Error("サインインが必要です");
    const b = await newRecordBase(session.id);
    const custom = isCustomLogKey(tpl.templateKey);
    const next = buildTemplateRevision({
      template: tpl,
      items,
      name: opts.name,
      retired: opts.retired,
      id: b.id,
      recordedBy: session.id,
      deviceId: b.deviceId,
      publishedBy: session.id,
      group: custom ? (opts.name ?? tpl.name) : kindName(tpl.templateKey),
    });
    await appendRecord("record_template", next);
    if (custom) setCreated((c) => ({ ...c, [next.templateKey]: next }));
    return next;
  }

  /**
   * 船長・陸上が作った種類を削除する（札から消え、新しい記録では選べなくなる）。
   * 実体は消さず retired の版を追記する（ガードレール2）。これまでの記録は種類の名前を写して持つので残る
   */
  async function deleteType(kind: string) {
    const tpl = templateFor(kind);
    if (!tpl) return;
    const next = await publishRevision(tpl, itemsToDrafts(tpl.items), { retired: true });
    setUndo({ before: tpl, after: next });
    designerModal.onClose();
    managerModal.onClose();
    setDone(`「${tpl.name}」を削除しました（これまでの記録は残ります）`);
  }

  /** 項目を削除する（その項目を載せない版を配信する。これまでの記録に入っている値は残る） */
  async function deleteItems(kind: string, keys: string[]) {
    const tpl = templateFor(kind);
    if (!tpl) return;
    const gone = tpl.items.filter((it) => keys.includes(it.key));
    const next = await publishRevision(tpl, itemsToDrafts(tpl.items.filter((it) => !keys.includes(it.key))));
    setUndo({ before: tpl, after: next });
    managerModal.onClose();
    setDone(
      `「${kindName(kind)}」の${gone.length === 1 ? `「${gone[0].label}」` : `追加した項目${gone.length}つ`}を削除しました（これまでの記録は残ります）`,
    );
  }

  /** 直前の削除を元に戻す（削除の前の項目・名前で、もう1つ新しい版を配信する） */
  async function restoreDeleted() {
    if (!undo) return;
    const { before, after } = undo;
    await publishRevision(after, itemsToDrafts(before.items), {
      retired: false,
      name: isCustomLogKey(before.templateKey) ? before.name : undefined,
    });
    setUndo(null);
    setDone(`「${isCustomLogKey(before.templateKey) ? before.name : kindName(before.templateKey)}」を元に戻しました`);
  }

  function openManager() {
    setManagerN((n) => n + 1);
    managerModal.onOpen();
  }

  /** 編集・削除の画面から、項目を直す手順の画面へ */
  function editFromManager(kind: string) {
    managerModal.onClose();
    setDesigner((d) => ({ mode: "edit", kind, fromRecord: false, n: d.n + 1 }));
    designerModal.onOpen();
  }

  const managedTypes: ManagedLogType[] = [
    ...VOYAGE_LOG_TYPES.map((lt) => ({ kind: lt, name: t.voyageLogType[lt], builtIn: true, items: templateFor(lt)?.items ?? [] })),
    ...customTypes.map((tpl) => ({ kind: tpl.templateKey, name: tpl.name, builtIn: false, items: tpl.items })),
  ];

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setError(null);
    try {
      const at = fromLocalInputValue(form.at);
      if (!at) throw new Error("日時を入力してください");
      if ((form.kind === "departure" || form.kind === "arrival") && !form.port.trim()) {
        throw new Error("港名を入力してください");
      }
      if (form.kind === "remark" && !form.remarks.trim()) {
        throw new Error("特記事項を入力してください");
      }
      if (!session) throw new Error("サインインが必要です");
      const extraValues = collectTemplateValues(formItems, extra);
      const b = await newRecordBase(session.id, at, supersedes?.id);
      const payload: VoyageLogPayload = {
        ...b,
        logType: isCustom ? "custom" : (form.kind as VoyageLogType),
        customTypeKey: isCustom ? form.kind : undefined,
        customTypeName: isCustom ? kindLabel : undefined,
        port: form.port.trim() || undefined,
        route: form.route.trim() || undefined,
        position: form.position.trim() || undefined,
        courseDeg: parseOptionalNumber(form.courseDeg),
        speedKnots: parseOptionalNumber(form.speedKnots),
        engineRpm: parseOptionalNumber(form.engineRpm),
        weather: showWeather ? form.weather || undefined : undefined,
        wind: showWeather ? form.wind || undefined : undefined,
        seaState: showWeather ? form.seaState || undefined : undefined,
        visibility: showWeather ? form.visibility || undefined : undefined,
        remarks: form.remarks.trim() || undefined,
        extraValues: extraValues.length > 0 ? extraValues : undefined,
      };
      await appendRecord("voyage_log", payload);
      setUndo(null);
      setDone(
        supersedes
          ? "訂正記録を追記しました（元の記録は訂正済として保持されます）"
          : `${kindLabel} を記録しました（${fmtTime(payload.occurredAt)}）`,
      );
      modal.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const showNav = form.kind === "departure" || form.kind === "arrival";
  const showPosition = form.kind === "position";
  // 船長・陸上が作った種類は、日時・足した項目・備考だけ（要る項目は自由に足せる）
  const showWeather = !isCustom && form.kind !== "remark";

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="03" />
      {canWrite ? (
        <RecordModeSwitch
          mode={mode}
          onChange={setMode}
          pastLabel="過去の日誌"
          actions={
            canManageTemplates ? (
              <button type="button" className="ui-btn-ghost min-h-12 px-4 text-lg" onClick={openManager}>
                <LineIcon name="edit" size={20} />
                種類と項目を編集・削除する
              </button>
            ) : null
          }
        />
      ) : null}

      {done ? (
        <div className="flex flex-wrap items-center gap-2">
          <Chip variant="flat" radius="sm" className="h-auto whitespace-normal py-1">
            ✓ {done}
          </Chip>
          {undo ? (
            <button type="button" className="ui-btn-quiet min-h-11 !text-base" onClick={() => void restoreDeleted()}>
              元に戻す
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === "record" ? (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {VOYAGE_LOG_TYPES.map((lt) => {
          const tpl = templateFor(lt);
          return (
            <RecordTile
              key={lt}
              label={t.voyageLogType[lt]}
              sublabel={tpl && tpl.items.length > 0 ? `追加した項目 ${tpl.items.length}つ` : undefined}
              onPress={() => openNew(lt)}
            />
          );
        })}
        {customTypes.map((tpl) => (
          <RecordTile
            key={tpl.templateKey}
            label={tpl.name}
            sublabel={tpl.items.length > 0 ? `記録する項目 ${tpl.items.length}つ` : undefined}
            onPress={() => openNew(tpl.templateKey)}
          />
        ))}
        {canManageTemplates ? (
          // 種類を作る札は点線にして、記録を始める札と見分ける
          <button
            type="button"
            onClick={openCreate}
            className="ui-card record-tile record-tile-new flex min-h-20 items-center gap-3 p-4 text-left"
          >
            <span className="flex flex-1 flex-col gap-1">
              <span className="text-lg font-bold leading-tight">日誌の種類を増やす</span>
              <span className="text-sm text-foreground-600">例: 投錨・給油</span>
            </span>
            <RecordMark />
          </button>
        ) : null}
      </div>
      ) : null}

      {mode === "past" ? (
      <>
      <PastFilterBar
        value={past.filter}
        onChange={past.setFilter}
        count={past.matched.length}
        placeholder="港・船位・特記事項などで探す"
      />
      {byDate.length === 0 ? <PastEmpty filtered={isFilterActive(past.filter)} /> : null}

      {byDate.map(([date, entries]) => (
        <section key={date} aria-label={`${fmtDateLabel(date)} の航海日誌`} className="flex flex-col gap-2">
          <h2 className="text-base font-bold text-foreground-600">{fmtDateLabel(date)}</h2>
          {entries.map((r) => {
            const superseded = supersededIds.has(r.id);
            const isCorrection = Boolean(r.supersedesId);
            // 任意の項目で空欄だったものは出さない（「該当なし」と読ませない）
            const shownValues = (r.extraValues ?? []).filter((v) => v.result !== "na" || (v.value !== undefined && v.value !== ""));
            return (
              <Card key={r.id} shadow="none" className={cn("ui-card", superseded && "opacity-60")}>
                <CardBody className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("tabular-nums text-lg font-bold", superseded && "line-through")}>
                      {fmtTime(r.occurredAt)}
                    </span>
                    <Chip size="sm" variant="flat" radius="sm">
                      {voyageLogLabel(r)}
                    </Chip>
                    {isCorrection ? (
                      <Chip size="sm" variant="flat" color="warning" radius="sm">
                        訂正記録
                      </Chip>
                    ) : null}
                    {superseded ? (
                      <Chip size="sm" variant="flat" radius="sm">
                        訂正済（原本保持）
                      </Chip>
                    ) : null}
                    <span className="ml-auto text-sm text-foreground-600">記録者 {personName(r.recordedBy)}</span>
                  </div>
                  <div className={cn("flex flex-col gap-1", superseded && "line-through")}>
                    {r.port ? (
                      <p>
                        <span className="font-semibold">{r.port}</span>
                        {r.route ? <span className="ml-2 text-foreground-600">航路: {r.route}</span> : null}
                      </p>
                    ) : null}
                    {r.position || r.courseDeg !== undefined || r.speedKnots !== undefined || r.engineRpm !== undefined ? (
                      <p className="tabular-nums">
                        {r.position ? <span className="font-semibold">{r.position}</span> : null}
                        {r.courseDeg !== undefined ? <span className="ml-2">針路 {r.courseDeg}°</span> : null}
                        {r.speedKnots !== undefined ? <span className="ml-2">速力 {r.speedKnots} kt</span> : null}
                        {r.engineRpm !== undefined ? <span className="ml-2">主機 {r.engineRpm} rpm</span> : null}
                      </p>
                    ) : null}
                    {r.weather || r.wind || r.seaState || r.visibility ? (
                      <p className="text-sm text-foreground-600">
                        海象: {[r.weather, r.wind, r.seaState, r.visibility ? `視程 ${r.visibility}` : null].filter(Boolean).join(" / ")}
                      </p>
                    ) : null}
                    {shownValues.length > 0 ? (
                      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
                        {shownValues.map((v) => (
                          <span key={v.key}>
                            <span className="text-foreground-600">{v.label}: </span>
                            {v.value !== undefined && v.value !== ""
                              ? `${v.value}${v.unit ? ` ${v.unit}` : ""}`
                              : t.checkResult[v.result]}
                          </span>
                        ))}
                      </p>
                    ) : null}
                    {r.remarks ? <p className="text-pretty">{r.remarks}</p> : null}
                  </div>
                  {canWrite && !superseded && effective.some((e) => e.id === r.id) ? (
                    <Button
                      size="sm"
                      variant="bordered"
                      className="self-end min-h-10 border-[var(--ui-hairline-strong)]"
                      onPress={() => openCorrection(r)}
                    >
                      訂正記録を追記
                    </Button>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}
        </section>
      ))}
      {past.hasMore ? <ShowMoreButton onPress={past.showMore} /> : null}
      </>
      ) : null}

      <Modal {...modalProps} size="2xl" isOpen={modal.isOpen} onOpenChange={modal.onOpenChange} placement="center" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>
            {supersedes ? `訂正記録の追記: ${kindLabel}` : `航海日誌: ${kindLabel}`}
          </ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            {supersedes ? (
              <p className="text-sm text-foreground-600">
                {fmtTime(supersedes.occurredAt)} の「{voyageLogLabel(supersedes)}」を訂正します。
                元の記録は訂正済として保持されます。
              </p>
            ) : null}
            <Input
              type="datetime-local"
              label="日時"
              value={form.at}
              max={toLocalInputValue(new Date())}
              onValueChange={(v) => set("at", v)}
            />
            {showNav ? (
              <>
                <Input label="港名・バース" value={form.port} onValueChange={(v) => set("port", v)} placeholder="例: 名古屋港（金城埠頭）" />
                <Input label="航路" value={form.route} onValueChange={(v) => set("route", v)} placeholder="例: 横浜 → 名古屋" />
              </>
            ) : null}
            {showPosition ? (
              <>
                <Input label="船位（緯度経度・地点）" value={form.position} onValueChange={(v) => set("position", v)} placeholder="例: 34°35'N 138°50'E（御前崎沖）" />
                <div className="grid grid-cols-3 gap-2">
                  <Input type="number" label="針路 (°)" value={form.courseDeg} onValueChange={(v) => set("courseDeg", v)} />
                  <Input type="number" label="速力 (kt)" value={form.speedKnots} onValueChange={(v) => set("speedKnots", v)} />
                  <Input type="number" label="主機 (rpm)" value={form.engineRpm} onValueChange={(v) => set("engineRpm", v)} />
                </div>
              </>
            ) : null}
            {showWeather ? (
              <div className="grid grid-cols-2 gap-2">
                <Select label="天候" selectedKeys={[form.weather]} onSelectionChange={(k) => set("weather", String([...k][0] ?? ""))}>
                  {WEATHER.map((w) => (
                    <SelectItem key={w}>{w}</SelectItem>
                  ))}
                </Select>
                <Select label="風" selectedKeys={[form.wind]} onSelectionChange={(k) => set("wind", String([...k][0] ?? ""))}>
                  {WIND.map((w) => (
                    <SelectItem key={w}>{w}</SelectItem>
                  ))}
                </Select>
                <Select label="海面状態" selectedKeys={[form.seaState]} onSelectionChange={(k) => set("seaState", String([...k][0] ?? ""))}>
                  {SEA.map((w) => (
                    <SelectItem key={w}>{w}</SelectItem>
                  ))}
                </Select>
                <Select label="視程" selectedKeys={[form.visibility]} onSelectionChange={(k) => set("visibility", String([...k][0] ?? ""))}>
                  {VIS.map((w) => (
                    <SelectItem key={w}>{w}</SelectItem>
                  ))}
                </Select>
              </div>
            ) : null}

            {formItems.length > 0 || (canManageTemplates && !supersedes) ? (
              <section aria-label="この日誌で記録する項目" className="flex flex-col gap-2">
                <h3 className="m-0 text-base font-bold text-foreground-700">この日誌で記録する項目</h3>
                {formItems.length === 0 ? <p className="m-0 text-foreground-600">まだ項目がありません</p> : null}
                {formItems.map((it) => (
                  <TemplateItemField
                    key={it.key}
                    item={it}
                    value={extra[it.key] ?? ""}
                    onChange={(v) => setExtra((e) => ({ ...e, [it.key]: v }))}
                  />
                ))}
                {/* 項目を決めるのは別の画面（手順つき）。ここは記録を書くことだけにする */}
                {canManageTemplates && !supersedes ? (
                  <button type="button" className="ui-btn-quiet min-h-11 self-start !text-base" onClick={openEditFromRecord}>
                    記録する項目を増やす・直す
                  </button>
                ) : null}
              </section>
            ) : null}

            <Textarea
              label={form.kind === "remark" ? "特記事項（海難・故障・特別な操船等）" : "備考"}
              value={form.remarks}
              onValueChange={(v) => set("remarks", v)}
              minRows={2}
            />
            {error ? <p className="text-danger">✕ {error}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={modal.onClose}>
              キャンセル
            </Button>
            <Button color="primary" onPress={() => void submit()}>
              {supersedes ? "訂正記録を追記" : "記録する"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        {...modalProps}
        size="2xl"
        isOpen={designerModal.isOpen}
        onOpenChange={designerModal.onOpenChange}
        // 項目が増えても画面が上下に動かないよう上に固定する（続けて押すボタンの位置がずれない）
        placement="top"
        scrollBehavior="inside"
      >
        {designer.mode === "create" ? (
          <LogTypeDesigner key={designer.n} mode="create" items={[]} takenNames={takenNames} onSave={saveDesign} onClose={designerModal.onClose} />
        ) : (
          <LogTypeDesigner
            key={designer.n}
            mode="edit"
            typeName={isCustomLogKey(designer.kind) ? kindName(designer.kind) : undefined}
            fixedName={kindName(designer.kind)}
            items={templateFor(designer.kind)?.items ?? []}
            takenNames={takenNames}
            onSave={saveDesign}
            onRetire={isCustomLogKey(designer.kind) && templateFor(designer.kind) ? () => deleteType(designer.kind) : undefined}
            onClose={designerModal.onClose}
          />
        )}
      </Modal>

      <Modal {...modalProps} size="2xl" isOpen={managerModal.isOpen} onOpenChange={managerModal.onOpenChange} placement="top" scrollBehavior="inside">
        <LogTypeManager
          key={managerN}
          types={managedTypes}
          onEdit={editFromManager}
          onDeleteType={deleteType}
          onDeleteItems={deleteItems}
          onClose={managerModal.onClose}
        />
      </Modal>
    </div>
  );
}
