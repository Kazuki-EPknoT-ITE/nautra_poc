import { DEMO_TENANT_ID, DEMO_VESSEL, SHORE_PLANNER_ID } from "@/lib/crew";
import { ulid } from "@/lib/ids";
import { buildTemplateWithAddedItem, draftTemplate, effectiveTemplates } from "@/lib/record-templates";
import { makeIdempotencyKey, makeRecordEvent } from "@/sync-protocol/events";
import type { RecordTemplatePayload, TemplateInputType, TemplateUsage } from "@/sync-protocol/records";
import { getRecordsOfKind, pushToStore } from "./store";

/**
 * 陸上の記録項目テンプレート配信サービス（S-10 の一部。PoC）。
 * 点検表・航海日誌の記録項目を陸上から追加し、船内へ同期する。
 * 追記のみ: 追加は「項目を1つ足した新しい版」の配信で表現し、旧版は保持する
 * （過去の記録は記録時点の版を保持しているため意味が変わらない）。
 */

const SHORE_DEVICE = "shore-planner-device";

export interface TemplateOverview {
  usage: TemplateUsage;
  templates: RecordTemplatePayload[];
  /** 配信履歴（新しい順） */
  history: RecordTemplatePayload[];
}

export function getTemplateOverview(): TemplateOverview[] {
  const all = getRecordsOfKind("record_template");
  const history = [...all].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return (["checklist", "voyage_log"] as TemplateUsage[]).map((usage) => ({
    usage,
    templates: effectiveTemplates(all, usage),
    history: history.filter((tpl) => tpl.usage === usage),
  }));
}

export interface AddTemplateItemActionInput {
  usage: TemplateUsage;
  templateKey: string;
  /** 未配信の種別に最初の項目を足すときの表示名 */
  fallbackName?: string;
  label: string;
  group: string;
  inputType: TemplateInputType;
  unit?: string;
  changeNote?: string;
  /** 配信イベントID（冪等キーの元）。省略時はサーバで採番する（PoC） */
  changeId?: string;
}

/** 記録項目を1つ追加した新しい版を配信する */
export function publishTemplateItem(
  input: AddTemplateItemActionInput,
  now = new Date(),
): RecordTemplatePayload {
  const all = getRecordsOfKind("record_template");
  const current = effectiveTemplates(all, input.usage).find((tpl) => tpl.templateKey === input.templateKey);
  const template =
    current ??
    draftTemplate({
      usage: input.usage,
      templateKey: input.templateKey,
      name: input.fallbackName?.trim() || input.templateKey,
      tenantId: DEMO_TENANT_ID,
      vesselId: DEMO_VESSEL.id,
    });
  const payload = buildTemplateWithAddedItem({
    template,
    item: { label: input.label, group: input.group, inputType: input.inputType, unit: input.unit },
    id: input.changeId?.trim() || `tpl-${ulid().toLowerCase()}`,
    recordedBy: SHORE_PLANNER_ID,
    deviceId: SHORE_DEVICE,
    publishedBy: SHORE_PLANNER_ID,
    changeNote: input.changeNote,
    now,
  });
  const outcome = pushToStore(SHORE_DEVICE, [makeRecordEvent("record_template", payload, SHORE_DEVICE)]);
  const key = makeIdempotencyKey(SHORE_DEVICE, payload.id);
  if (!outcome.accepted.includes(key) && !outcome.duplicates.includes(key)) {
    throw new Error("配信できませんでした（イベントが受理されず隔離されました）");
  }
  return payload;
}
