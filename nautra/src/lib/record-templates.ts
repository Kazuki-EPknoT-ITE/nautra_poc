import { CHECKLIST_TEMPLATES } from "./checklist-templates";
import {
  latestBySupersedes,
  recordTemplatePayloadSchema,
  type RecordTemplatePayload,
  type TemplateInputType,
  type TemplateUsage,
} from "@/sync-protocol/records";

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
  return [...byKey.values()].sort((a, b) => a.templateKey.localeCompare(b.templateKey));
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
