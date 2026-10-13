import { activeCrewFields, CREW_FIELD_CATEGORY_LABEL, type CrewFieldView } from "@/lib/crew-fields";
import { ulid } from "@/lib/ids";
import { carryOverFields } from "@/lib/master-fields";
import {
  CREW_FIELD_CATEGORIES,
  CREW_FIELD_INPUT_TYPES,
  type CrewFieldCategory,
  type CrewFieldInputType,
} from "@/sync-protocol/masters";
import { COMPANY_SCOPE_ID, effective, publishMaster, writeAuditLog } from "./master-service";

/**
 * 船員マスタの追加項目（レビュー CREWEDIT-04）。管理者が「基本情報」などの枠ごとに入力項目を足し、
 * 必須・入力例を決め、あとから直したり外したりできる。
 *
 * 定義は追記型（`crew_field_def`）。外しても入力済みの値は船員マスタの履歴に残る（消さない）。
 * 船員マスタの更新経路は従来どおり S-04 だけ（12.3）で、ここは「欄の定義」だけを扱う。
 */

export function listCrewFields(): CrewFieldView[] {
  return activeCrewFields(effective("crew_field_def"));
}

export interface CrewFieldInput {
  category: string;
  label: string;
  inputType: string;
  required: boolean;
  placeholder: string;
}

function check(input: CrewFieldInput) {
  const label = input.label.trim();
  if (!label) throw new Error("項目名を入力してください");
  if (label.length > 30) throw new Error("項目名は30文字までにしてください");
  if (!CREW_FIELD_CATEGORIES.includes(input.category as CrewFieldCategory)) throw new Error("枠が正しくありません");
  if (!CREW_FIELD_INPUT_TYPES.includes(input.inputType as CrewFieldInputType)) throw new Error("入力の種類が正しくありません");
  return {
    category: input.category as CrewFieldCategory,
    label,
    inputType: input.inputType as CrewFieldInputType,
    required: input.required || undefined,
    placeholder: input.placeholder.trim() || undefined,
  };
}

function sameLabelExists(category: CrewFieldCategory, label: string, exceptKey?: string) {
  return listCrewFields().some((f) => f.category === category && f.label === label && f.fieldKey !== exceptKey);
}

export function addCrewField(input: CrewFieldInput, actor: string, now = new Date()): CrewFieldView {
  const v = check(input);
  if (sameLabelExists(v.category, v.label)) throw new Error(`「${v.label}」は既にあります`);
  // 項目キーは作った時点で決め、以後変えない（値と結び付けるため）。並びは作った順
  const fieldKey = `cf-${ulid().toLowerCase()}`;
  publishMaster("crew_field_def", { fieldKey, ...v }, { vesselId: COMPANY_SCOPE_ID, actor, now });
  writeAuditLog({
    action: "create",
    entityKind: "crew_field_def",
    entityId: fieldKey,
    actor,
    channel: "shore",
    now,
    summary: `船員の項目を追加: ${CREW_FIELD_CATEGORY_LABEL[v.category]} ／ ${v.label}${v.required ? "（必須）" : ""}`,
  });
  return listCrewFields().find((f) => f.fieldKey === fieldKey)!;
}

function currentDef(fieldKey: string) {
  const row = effective("crew_field_def").find((d) => d.fieldKey === fieldKey && !d.removed);
  if (!row) throw new Error("この項目は既に外されたか、見つかりません。画面を開き直してください");
  return row;
}

export function updateCrewField(fieldKey: string, input: CrewFieldInput, actor: string, now = new Date()): void {
  const row = currentDef(fieldKey);
  const v = check({ ...input, category: row.category });
  if (sameLabelExists(row.category, v.label, fieldKey)) throw new Error(`「${v.label}」は既にあります`);
  publishMaster(
    "crew_field_def",
    { ...carryOverFields(row as unknown as Record<string, unknown>), fieldKey, ...v, category: row.category },
    { vesselId: COMPANY_SCOPE_ID, actor, now, supersedesId: row.id },
  );
  writeAuditLog({
    action: "update",
    entityKind: "crew_field_def",
    entityId: fieldKey,
    actor,
    channel: "shore",
    now,
    before: `${row.label}${row.required ? "（必須）" : ""}`,
    after: `${v.label}${v.required ? "（必須）" : ""}`,
    summary: `船員の項目を変更: ${row.label} → ${v.label}`,
  });
}

/** 項目を外す（追記で表す。入力済みの値は船員マスタの履歴に残る） */
export function removeCrewField(fieldKey: string, actor: string, now = new Date()): void {
  const row = currentDef(fieldKey);
  publishMaster(
    "crew_field_def",
    { ...carryOverFields(row as unknown as Record<string, unknown>), removed: true },
    { vesselId: COMPANY_SCOPE_ID, actor, now, supersedesId: row.id },
  );
  writeAuditLog({
    action: "update",
    entityKind: "crew_field_def",
    entityId: fieldKey,
    actor,
    channel: "shore",
    now,
    summary: `船員の項目を外した: ${CREW_FIELD_CATEGORY_LABEL[row.category]} ／ ${row.label}`,
  });
}
