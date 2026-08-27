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
import { buildTemplateWithAddedItem, draftTemplate } from "@/lib/record-templates";
import { appendRecord, newRecordBase } from "@/lib/vessel-actions";
import { usePermission, useRecords, useRecordTemplates, useSessionCrew } from "@/lib/vessel-hooks";
import {
  latestBySupersedes,
  VOYAGE_LOG_TYPES,
  type ChecklistItemResult,
  type RecordTemplatePayload,
  type TemplateInputType,
  type VoyageLogPayload,
  type VoyageLogType,
} from "@/sync-protocol/records";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Radio,
  RadioGroup,
  Select,
  SelectItem,
  Textarea,
  useDisclosure,
  useGlassModalProps,
} from "@/ui";
import { GroupHeader } from "../_components/group-header";
import { RecordTile } from "../_components/record-tile";
import { ReadOnlyNote } from "../_components/permission-gate";

const WEATHER = ["晴", "曇", "雨", "霧", "雪", "雷雨"];
const WIND = ["静穏", "北 3m/s", "北東 3m/s", "東 5m/s", "南東 5m/s", "南 4m/s", "南西 5m/s", "西 8m/s", "北西 10m/s"];
const SEA = ["波高 0.3m", "波高 0.5m", "波高 1.0m", "波高 1.5m", "波高 2.0m", "波高 3.0m 以上"];
const VIS = ["良好", "やや不良（2〜5海里）", "不良（2海里未満）", "濃霧"];

interface FormState {
  logType: VoyageLogType;
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

function emptyForm(logType: VoyageLogType): FormState {
  return {
    logType,
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
    logType: r.logType,
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

/**
 * V-05 航海日誌。出入港・船位・海象・特記の入力/一覧（要件定義書 3.3.1）。
 * 一次記録は追記のみ。訂正は supersedesId 付きの訂正記録を追記し、原本は「訂正済」として保持する。
 */
export default function LogbookPage() {
  // 記入できるのはサインイン中の本人のみ（記録者の取り違えを防ぐ。基本設計書 11.3）
  const session = useSessionCrew();
  const canWrite = usePermission("write_logbook"); // 記入は船長・航海士（11.2）
  const canManageTemplates = usePermission("manage_record_templates");
  const templates = useRecordTemplates("voyage_log");
  const logs = useRecords("voyage_log");
  const modal = useDisclosure();
  const glassModal = useGlassModalProps();
  const [form, setForm] = useState<FormState>(() => emptyForm("position"));
  const [supersedes, setSupersedes] = useState<VoyageLogPayload | null>(null);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const effective = useMemo(() => latestBySupersedes(logs), [logs]);
  const supersededIds = useMemo(
    () => new Set(logs.map((l) => l.supersedesId).filter((x): x is string => Boolean(x))),
    [logs],
  );
  const byDate = useMemo(() => {
    const map = new Map<string, typeof logs>();
    for (const l of logs) {
      const d = ymdLocal(new Date(l.occurredAt));
      map.set(d, [...(map.get(d) ?? []), l]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [logs]);

  /** 記録種別ごとの追加項目テンプレート（上司・陸上が配信。templateKey = 記録種別） */
  const templateFor = (logType: VoyageLogType): RecordTemplatePayload | undefined =>
    templates.find((tpl) => tpl.templateKey === logType);
  const formTemplate = templateFor(form.logType);

  function openNew(logType: VoyageLogType) {
    setSupersedes(null);
    setForm(emptyForm(logType));
    setExtra({});
    setError(null);
    modal.onOpen();
  }

  function openCorrection(r: VoyageLogPayload) {
    setSupersedes(r);
    setForm(formFromRecord(r));
    setExtra(Object.fromEntries((r.extraValues ?? []).map((v) => [v.key, String(v.value ?? "")])));
    setError(null);
    modal.onOpen();
  }

  // ── 記録項目の追加（船長。陸上からも配信される） ──
  const itemModal = useDisclosure();
  const [itemTarget, setItemTarget] = useState<VoyageLogType>("departure");
  const [itemLabel, setItemLabel] = useState("");
  const [itemType, setItemType] = useState<TemplateInputType>("number");
  const [itemUnit, setItemUnit] = useState("");
  const [itemError, setItemError] = useState<string | null>(null);

  function openAddItem() {
    setItemTarget(form.logType);
    setItemLabel("");
    setItemType("number");
    setItemUnit("");
    setItemError(null);
    itemModal.onOpen();
  }

  async function submitAddItem() {
    setItemError(null);
    try {
      if (!session) throw new Error("サインインが必要です");
      const b = await newRecordBase(session.id);
      const current =
        templateFor(itemTarget) ??
        draftTemplate({
          usage: "voyage_log",
          templateKey: itemTarget,
          name: `航海日誌: ${t.voyageLogType[itemTarget]}`,
          tenantId: b.tenantId,
          vesselId: b.vesselId,
        });
      const next = buildTemplateWithAddedItem({
        template: current,
        item: { label: itemLabel, group: t.voyageLogType[itemTarget], inputType: itemType, unit: itemUnit },
        id: b.id,
        recordedBy: session.id,
        deviceId: b.deviceId,
        publishedBy: session.id,
      });
      await appendRecord("record_template", next);
      setDone(`「${t.voyageLogType[itemTarget]}」に記録項目「${itemLabel.trim()}」を追加しました`);
      itemModal.onClose();
    } catch (e) {
      setItemError(e instanceof Error ? e.message : String(e));
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setError(null);
    try {
      const at = fromLocalInputValue(form.at);
      if (!at) throw new Error("日時を入力してください");
      if ((form.logType === "departure" || form.logType === "arrival") && !form.port.trim()) {
        throw new Error("港名を入力してください");
      }
      if (form.logType === "remark" && !form.remarks.trim()) {
        throw new Error("特記事項を入力してください");
      }
      if (!session) throw new Error("サインインが必要です");
      const extraValues: ChecklistItemResult[] = (formTemplate?.items ?? []).map((it) => {
        const raw = extra[it.key]?.trim() ?? "";
        if (it.inputType === "number") {
          const v = parseOptionalNumber(raw);
          if (v === undefined) throw new Error(`「${it.label}」に数値を入力してください`);
          return { key: it.key, label: it.label, group: it.group, result: "na", value: v, unit: it.unit };
        }
        if (it.inputType === "check") {
          return { key: it.key, label: it.label, group: it.group, result: raw === "ng" ? "ng" : "ok" };
        }
        return { key: it.key, label: it.label, group: it.group, result: "na", value: raw || undefined };
      });
      const b = await newRecordBase(session.id, at, supersedes?.id);
      const payload: VoyageLogPayload = {
        ...b,
        logType: form.logType,
        port: form.port.trim() || undefined,
        route: form.route.trim() || undefined,
        position: form.position.trim() || undefined,
        courseDeg: parseOptionalNumber(form.courseDeg),
        speedKnots: parseOptionalNumber(form.speedKnots),
        engineRpm: parseOptionalNumber(form.engineRpm),
        weather: form.weather || undefined,
        wind: form.wind || undefined,
        seaState: form.seaState || undefined,
        visibility: form.visibility || undefined,
        remarks: form.remarks.trim() || undefined,
        extraValues: extraValues.length > 0 ? extraValues : undefined,
      };
      await appendRecord("voyage_log", payload);
      setDone(
        supersedes
          ? "訂正記録を追記しました（元の記録は訂正済として保持されます）"
          : `${t.voyageLogType[form.logType]} を記録しました（${fmtTime(payload.occurredAt)}）`,
      );
      modal.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const showNav = form.logType === "departure" || form.logType === "arrival";
  const showPosition = form.logType === "position";
  const showWeather = form.logType !== "remark";

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group="03" subtitle="航海日誌" />
      <p className="text-sm text-foreground-600">
        記録者: {session ? `${session.name}（${session.position}）` : "—"}
      </p>

      {canWrite ? (
      <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {VOYAGE_LOG_TYPES.map((lt) => {
          const tpl = templateFor(lt);
          return (
            <RecordTile
              key={lt}
              label={t.voyageLogType[lt]}
              sublabel={tpl && tpl.items.length > 0 ? `追加項目 ${tpl.items.length}件` : undefined}
              onPress={() => openNew(lt)}
            />
          );
        })}
      </div>
      {canManageTemplates ? (
        <Button
          variant="bordered"
          radius="lg"
          className="min-h-12 self-start border-[var(--glass-border-strong)]"
          onPress={openAddItem}
        >
          日誌の記録項目を追加する
        </Button>
      ) : null}
      </>
      ) : (
        <ReadOnlyNote note="航海日誌の記入は船長・航海士が行います。" />
      )}

      {done ? (
        <Chip variant="flat" radius="sm" className="h-auto whitespace-normal py-1">
          ✓ {done}
        </Chip>
      ) : null}

      {byDate.length === 0 ? (
        <Card shadow="none" className="glass-tile">
          <CardBody>
            <p className="text-foreground-600">航海日誌の記録がありません。上のボタンから記入してください。</p>
          </CardBody>
        </Card>
      ) : null}

      {byDate.map(([date, entries]) => (
        <section key={date} aria-label={`${fmtDateLabel(date)} の航海日誌`} className="flex flex-col gap-2">
          <h2 className="text-base font-bold text-foreground-600">{fmtDateLabel(date)}</h2>
          {entries.map((r) => {
            const superseded = supersededIds.has(r.id);
            const isCorrection = Boolean(r.supersedesId);
            return (
              <Card key={r.id} shadow="none" className={cn("glass-tile", superseded && "opacity-60")}>
                <CardBody className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("tabular-nums text-lg font-bold", superseded && "line-through")}>
                      {fmtTime(r.occurredAt)}
                    </span>
                    <Chip size="sm" variant="flat" radius="sm">
                      {t.voyageLogType[r.logType]}
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
                    {r.extraValues && r.extraValues.length > 0 ? (
                      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
                        {r.extraValues.map((v) => (
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
                      className="self-end min-h-10 border-[var(--glass-border-strong)]"
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

      <p className="text-xs text-foreground-600">
        航海日誌は一次記録として追記のみ行い、削除・上書きはしません。訂正は訂正記録の追記で表現します
        （要件定義書 12.3）。
      </p>

      <Modal {...glassModal} isOpen={modal.isOpen} onOpenChange={modal.onOpenChange} placement="center" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>
            {supersedes ? "訂正記録の追記" : `航海日誌: ${t.voyageLogType[form.logType]}`}
          </ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            {supersedes ? (
              <p className="text-sm text-foreground-600">
                {fmtTime(supersedes.occurredAt)} の「{t.voyageLogType[supersedes.logType]}」を訂正します。
                元の記録は訂正済として保持されます。
              </p>
            ) : null}
            <Select
              label="記録種別"
              selectedKeys={[form.logType]}
              onSelectionChange={(keys) => {
                const k = [...keys][0];
                if (k) set("logType", k as VoyageLogType);
              }}
            >
              {VOYAGE_LOG_TYPES.map((lt) => (
                <SelectItem key={lt}>{t.voyageLogType[lt]}</SelectItem>
              ))}
            </Select>
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
            {formTemplate && formTemplate.items.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-bold text-foreground-600">追加の記録項目（版 {formTemplate.version}）</h3>
                {formTemplate.items.map((it) => (
                  <div key={it.key} className="glass-inset flex flex-wrap items-center justify-between gap-2 p-3">
                    <span>{it.label}</span>
                    {it.inputType === "check" ? (
                      <RadioGroup
                        orientation="horizontal"
                        aria-label={it.label}
                        value={extra[it.key] ?? "ok"}
                        onValueChange={(v) => setExtra((e) => ({ ...e, [it.key]: v }))}
                      >
                        <Radio value="ok">良</Radio>
                        <Radio value="ng">不良</Radio>
                      </RadioGroup>
                    ) : (
                      <Input
                        size="sm"
                        type={it.inputType === "number" ? "number" : "text"}
                        aria-label={it.label}
                        className="max-w-44"
                        endContent={it.unit ? <span className="text-sm text-foreground-600">{it.unit}</span> : null}
                        value={extra[it.key] ?? ""}
                        onValueChange={(v) => setExtra((e) => ({ ...e, [it.key]: v }))}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            <Textarea
              label={form.logType === "remark" ? "特記事項（海難・故障・特別な操船等）" : "備考"}
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

      <Modal {...glassModal} isOpen={itemModal.isOpen} onOpenChange={itemModal.onOpenChange} placement="center" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span>航海日誌の記録項目を追加</span>
            <span className="text-sm font-normal text-foreground-600">
              追加した項目は次の記録から全員に表示されます（過去の記録は当時の内容のまま保持）
            </span>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <Select
              label="追加先の記録種別"
              selectedKeys={[itemTarget]}
              onSelectionChange={(k) => {
                const v = [...k][0];
                if (v) setItemTarget(v as VoyageLogType);
              }}
            >
              {VOYAGE_LOG_TYPES.map((lt) => (
                <SelectItem key={lt}>{t.voyageLogType[lt]}</SelectItem>
              ))}
            </Select>
            <Input label="項目名" value={itemLabel} onValueChange={setItemLabel} placeholder="例: 燃料残量" />
            <RadioGroup
              orientation="horizontal"
              label="入力方法"
              value={itemType}
              onValueChange={(v) => setItemType(v as TemplateInputType)}
            >
              <Radio value="number">数値を入力</Radio>
              <Radio value="text">文章を入力</Radio>
              <Radio value="check">良否で答える</Radio>
            </RadioGroup>
            {itemType === "number" ? (
              <Input label="単位" value={itemUnit} onValueChange={setItemUnit} placeholder="例: kL / t / hPa" />
            ) : null}
            {itemError ? <p className="text-danger">✕ {itemError}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="bordered" onPress={itemModal.onClose}>
              キャンセル
            </Button>
            <Button color="primary" onPress={() => void submitAddItem()}>
              項目を追加して配信
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
