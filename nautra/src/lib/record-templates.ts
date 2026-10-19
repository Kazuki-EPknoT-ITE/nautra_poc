import { CHECKLIST_TEMPLATES } from "./checklist-templates";
import {
  latestBySupersedes,
  recordTemplatePayloadSchema,
  type ChecklistItemResult,
  type RecordTemplatePayload,
  type TemplateInputType,
  type TemplateItem,
  type TemplateUsage,
} from "@/sync-protocol/records";
import { parseOptionalNumber } from "./format";

/**
 * 記録項目テンプレート（点検表・航海日誌の追加項目）の解決。
 *
 * テンプレートは船長（上司）と陸上から配信される追記型レコードで、項目の追加は
 * supersedesId 付きの新しい版で置き換える。ここでは受信済みレコードから
 * 「いま有効な版」を取り出すだけを行う（判定・生成はしない）。
 */

/** 同じ templateKey の中で最新の1版だけを残す（有効なテンプレート一覧） */
export function effectiveTemplates(
  all: RecordTemplatePayload[],
  usage: TemplateUsage,
): RecordTemplatePayload[] {
  const alive = latestBySupersedes(all).filter((tpl) => tpl.usage === usage);
  const byKey = new Map<string, RecordTemplatePayload>();
  for (const tpl of alive) {
    const current = byKey.get(tpl.templateKey);
    // 置き換え漏れ（分岐）があっても新しい配信を採用する
    if (!current || tpl.publishedAt > current.publishedAt) byKey.set(tpl.templateKey, tpl);
  }
  // しまった種類は選べないようにする（過去の記録は種類の名前を写して持つので読める）
  return [...byKey.values()]
    .filter((tpl) => !tpl.retired)
    .sort((a, b) => a.templateKey.localeCompare(b.templateKey));
}

/**
 * 版番号を1つ進める（末尾の数値を +1。数値がなければ ".2" を付ける）。
 * 過去の記録は記録時点の版を保持するため、版が変わっても意味が追える。
 */
export function nextTemplateVersion(version: string): string {
  const m = version.match(/^(.*?)(\d+)$/);
  if (!m) return `${version}.2`;
  return `${m[1]}${Number(m[2]) + 1}`;
}

/**
 * まだテンプレートが配信されていない端末向けの初期値（PoC のフォールバック）。
 * 通常はシードで配信され、この値は使われない。
 */
export function builtInChecklistTemplates(): RecordTemplatePayload[] {
  const now = new Date(0).toISOString();
  return Object.values(CHECKLIST_TEMPLATES).map((tpl) => ({
    id: `builtin-${tpl.id}`,
    tenantId: "tenant-demo",
    vesselId: "vessel-001",
    occurredAt: now,
    recordedBy: "system",
    deviceId: "builtin",
    usage: "checklist" as const,
    templateKey: tpl.id,
    name: tpl.name,
    description: tpl.description,
    version: tpl.version,
    items: tpl.items.map((it) => ({ ...it, inputType: "check" as const })),
    publishedAt: now,
    publishedBy: "system",
  }));
}

/**
 * まだテンプレートが無い記録種別に最初の項目を足すための下書き。
 * id が空のテンプレートは「まだ配信されていない」ことを表し、
 * buildTemplateWithAddedItem はこれを第1版（置き換えなし）として組み立てる。
 */
export function draftTemplate(input: {
  usage: TemplateUsage;
  templateKey: string;
  name: string;
  tenantId: string;
  vesselId: string;
}): RecordTemplatePayload {
  return {
    id: "",
    tenantId: input.tenantId,
    vesselId: input.vesselId,
    occurredAt: new Date(0).toISOString(),
    recordedBy: "system",
    deviceId: "draft",
    usage: input.usage,
    templateKey: input.templateKey,
    name: input.name,
    version: "0",
    items: [],
    publishedAt: new Date(0).toISOString(),
    publishedBy: "system",
  };
}

export interface AddTemplateItemInput {
  /** 追加元となる現在有効なテンプレート（この版を置き換える。draftTemplate なら第1版） */
  template: RecordTemplatePayload;
  item: { label: string; group: string; inputType: TemplateInputType; unit?: string };
  /** 新しい版のレコードID（呼び出し側で採番。冪等キーの元になる） */
  id: string;
  recordedBy: string;
  deviceId: string;
  publishedBy: string;
  changeNote?: string;
  now?: Date;
}

/**
 * 項目を1つ追加した「次の版」を組み立てる（純関数。保存・配信は呼び出し側）。
 * 船内（船長）と陸上のどちらから追加しても同じ形になるよう、ここに集約する。
 */
export function buildTemplateWithAddedItem(input: AddTemplateItemInput): RecordTemplatePayload {
  const label = input.item.label.trim();
  if (!label) throw new Error("項目名を入力してください");
  const group = input.item.group.trim() || "追加項目";
  const unit = input.item.unit?.trim() || undefined;
  if (input.item.inputType === "number" && !unit) throw new Error("数値項目は単位を入力してください");
  const now = input.now ?? new Date();
  const used = new Set(input.template.items.map((it) => it.key));
  let n = input.template.items.length + 1;
  let key = `added_${n}`;
  while (used.has(key)) key = `added_${++n}`;
  return recordTemplatePayloadSchema.parse({
    id: input.id,
    tenantId: input.template.tenantId,
    vesselId: input.template.vesselId,
    occurredAt: now.toISOString(),
    recordedAt: now.toISOString(),
    recordedBy: input.recordedBy,
    deviceId: input.deviceId,
    // 追記のみ: 旧版は残したまま、新版が旧版を無効化する（一次記録と同じ規則）
    supersedesId: input.template.id || undefined,
    usage: input.template.usage,
    templateKey: input.template.templateKey,
    name: input.template.name,
    description: input.template.description,
    version: input.template.id ? nextTemplateVersion(input.template.version) : "1",
    items: [...input.template.items, { key, label, group, inputType: input.item.inputType, unit }],
    publishedAt: now.toISOString(),
    publishedBy: input.publishedBy,
    changeNote: input.changeNote?.trim() || `項目「${label}」を追加`,
  });
}

/* ───────────── 項目を自由に足す・直す・外す・並べ替える（航海日誌。利用者の依頼 2026-10-14） ───────────── */

/** 船長・陸上が作った記録の種類のテンプレートキーの頭 */
export const CUSTOM_LOG_PREFIX = "custom:";

export function isCustomLogKey(templateKey: string): boolean {
  return templateKey.startsWith(CUSTOM_LOG_PREFIX);
}

/** 空欄では記録できない項目か。required が無い旧版は「数値だけ必須」（以前の決まり）のまま読む */
export function isItemRequired(item: Pick<TemplateItem, "inputType" | "required">): boolean {
  if (item.inputType === "check") return false; // 良否は既定で「良」が入る
  return item.required ?? item.inputType === "number";
}

/** 編集中の1項目（key が無いものは新しく足す項目） */
export interface DraftTemplateItem {
  key?: string;
  label: string;
  inputType: TemplateInputType;
  unit?: string;
  options?: string[];
  required?: boolean;
  /** 見出し（点検表の「機関」「甲板」など。項目ごとに持つ）。無ければ版の group を使う */
  group?: string;
}

/**
 * いまの版の項目を、編集中の形へ写す（項目を削除する・元に戻すで、残す項目をそのまま次の版へ載せる）。
 * key を引き継ぐので同じ項目として読める。必須は旧版の読み方（数値だけ必須）を保ったまま明示する
 */
export function itemsToDrafts(items: TemplateItem[]): DraftTemplateItem[] {
  return items.map((it) => ({
    key: it.key,
    label: it.label,
    inputType: it.inputType,
    unit: it.unit,
    options: it.options,
    required: isItemRequired(it),
  }));
}

/** 選択肢の入力（改行・読点・カンマ区切り）を、空と重複を除いた配列にする */
export function parseChoiceOptions(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[\n、,，]/)) {
    const v = part.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

export interface ReviseTemplateInput {
  /** 置き換える現在の版（draftTemplate なら第1版） */
  template: RecordTemplatePayload;
  /** 新しい版の項目（この順に並ぶ） */
  items: DraftTemplateItem[];
  /** 種類の名前を変える（船長・陸上が作った種類だけ） */
  name?: string;
  /** 種類をしまう（船長・陸上が作った種類だけ） */
  retired?: boolean;
  id: string;
  recordedBy: string;
  deviceId: string;
  publishedBy: string;
  /** 見出しの既定（航海日誌は種類の名前。項目が見出しを持たないときに使う） */
  group: string;
  now?: Date;
}

/**
 * 項目の一覧をまるごと受け取り、次の版を組み立てる（純関数。保存・配信は呼び出し側）。
 * 足す・直す・外す・並べ替えを1つの版にまとめて配信する。既存の項目は key を引き継ぐので、
 * 名前を直しても同じ項目として読める。外した項目は新しい版に載らないだけで、過去の記録には残る。
 */
export function buildTemplateRevision(input: ReviseTemplateInput): RecordTemplatePayload {
  const now = input.now ?? new Date();
  const name = input.name?.trim() ?? input.template.name;
  if (!name) throw new Error("種類の名前を入れてください");
  const labels = new Set<string>();
  let n = 0;
  const items: TemplateItem[] = input.items.map((d) => {
    const label = d.label.trim();
    if (!label) throw new Error("項目名が入っていない行があります。項目名を入れるか、「この項目を外す」で消してください");
    if (labels.has(label)) throw new Error(`「${label}」という項目名が2つあります。どちらかの名前を変えてください`);
    labels.add(label);
    // 新しい項目の key は版の ID（ULID）から作る。項目数から作ると、外した項目の key が後で別の項目に
    // 付き直し、古い記録を訂正したときに古い値が別の項目へ入ってしまう（sync-reviewer の指摘）。
    // 船長と陸上が同じ版へ同時に足しても重ならない
    const key = d.key ?? `item_${input.id.slice(-10).toLowerCase()}_${++n}`;
    const options = d.inputType === "choice" ? (d.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined;
    if (options && new Set(options).size < 2) throw new Error(`「${label}」の選べる答えを「、」で区切って2つ以上入れてください`);
    return {
      key,
      label,
      group: d.group?.trim() || input.group,
      inputType: d.inputType,
      unit: d.inputType === "number" ? d.unit?.trim() || undefined : undefined,
      options: options ? [...new Set(options)] : undefined,
      required: d.inputType === "check" ? undefined : Boolean(d.required),
    };
  });
  const before = new Map(input.template.items.map((it) => [it.key, it.label]));
  const after = new Set(items.map((it) => it.key));
  const notes: string[] = [];
  const added = items.filter((it) => !before.has(it.key)).map((it) => it.label);
  const removed = input.template.items.filter((it) => !after.has(it.key)).map((it) => it.label);
  if (added.length) notes.push(`追加: ${added.join("、")}`);
  if (removed.length) notes.push(`外した: ${removed.join("、")}`);
  if (name !== input.template.name) notes.push(`名前: ${name}`);
  if (input.retired) notes.push("種類をしまった");
  return recordTemplatePayloadSchema.parse({
    id: input.id,
    tenantId: input.template.tenantId,
    vesselId: input.template.vesselId,
    occurredAt: now.toISOString(),
    recordedAt: now.toISOString(),
    recordedBy: input.recordedBy,
    deviceId: input.deviceId,
    supersedesId: input.template.id || undefined,
    usage: input.template.usage,
    templateKey: input.template.templateKey,
    name,
    description: input.template.description,
    version: input.template.id ? nextTemplateVersion(input.template.version) : "1",
    items,
    publishedAt: now.toISOString(),
    publishedBy: input.publishedBy,
    changeNote: notes.join(" / ") || "項目を直した",
    retired: input.retired || undefined,
  });
}

/**
 * 入力欄の値（文字列）を、記録に載せる項目の結果へ変える。必須の空欄・数値でない値は理由つきで止める。
 * 任意で空欄の項目は記録に載せない（「該当なし」と区別するため）。
 */
export function collectTemplateValues(items: TemplateItem[], raw: Record<string, string>): ChecklistItemResult[] {
  const out: ChecklistItemResult[] = [];
  for (const it of items) {
    const v = raw[it.key]?.trim() ?? "";
    const base = { key: it.key, label: it.label, group: it.group };
    if (it.inputType === "check") {
      out.push({ ...base, result: v === "ng" ? "ng" : "ok" });
      continue;
    }
    if (!v) {
      if (isItemRequired(it)) throw new Error(`「${it.label}」が空欄です。入れてから記録してください`);
      continue;
    }
    if (it.inputType === "number") {
      const n = parseOptionalNumber(v);
      if (n === undefined) throw new Error(`「${it.label}」には数字を入れてください`);
      out.push({ ...base, result: "na", value: n, unit: it.unit });
      continue;
    }
    if (it.inputType === "choice" && it.options && !it.options.includes(v)) {
      throw new Error(`「${it.label}」は選べる答えの中から選んでください`);
    }
    if (it.inputType === "time" && !/^\d{2}:\d{2}$/.test(v)) throw new Error(`「${it.label}」には時刻を入れてください`);
    out.push({ ...base, result: "na", value: v });
  }
  return out;
}
