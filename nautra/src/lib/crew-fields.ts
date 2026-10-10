import type {
  CrewFieldCategory,
  CrewFieldDefPayload,
  CrewFieldInputType,
} from "@/sync-protocol/masters";

/**
 * 船員マスタの追加項目（レビュー CREWEDIT-04）の純関数。画面とサーバの両方が使う。
 */

export const CREW_FIELD_CATEGORY_LABEL: Record<CrewFieldCategory, string> = {
  basic: "基本情報",
  emergency: "緊急連絡先・家族構成",
  health: "健康に関する情報",
  insurance: "保険の加入状況",
};

export const CREW_FIELD_INPUT_LABEL: Record<CrewFieldInputType, string> = {
  text: "文字",
  number: "数字",
  date: "日付",
  textarea: "長い文",
};

/** 健康の枠に足した項目は要配慮個人情報として扱う（値を監査ログに載せない・権限の無い人に出さない） */
export function isSensitiveCategory(c: CrewFieldCategory): boolean {
  return c === "health";
}

export interface CrewFieldView {
  fieldKey: string;
  category: CrewFieldCategory;
  label: string;
  inputType: CrewFieldInputType;
  required: boolean;
  placeholder?: string;
}

/** いま有効な項目（削除したものを除き、作った順） */
export function activeCrewFields(defs: readonly CrewFieldDefPayload[]): CrewFieldView[] {
  return defs
    .filter((d) => !d.removed)
    .sort((a, b) => a.fieldKey.localeCompare(b.fieldKey))
    .map((d) => ({
      fieldKey: d.fieldKey,
      category: d.category,
      label: d.label,
      inputType: d.inputType,
      required: Boolean(d.required),
      placeholder: d.placeholder,
    }));
}

/**
 * 入力値を整えて検査する。必須が空・数字欄に数字以外・日付の形式違いは理由つきで断る。
 * 見られない項目（権限の無い健康の項目）は検査しない（その人は入力できないため）。
 */
export function validateCustomFields(
  fields: readonly CrewFieldView[],
  values: Record<string, string>,
  canEditSensitive: boolean,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (isSensitiveCategory(f.category) && !canEditSensitive) continue;
    const v = (values[f.fieldKey] ?? "").trim();
    if (!v) {
      if (f.required) throw new Error(`「${f.label}」を入力してください`);
      continue;
    }
    if (f.inputType === "number" && !Number.isFinite(Number(v.replace(/,/g, "")))) {
      throw new Error(`「${f.label}」は数字で入力してください`);
    }
    if (f.inputType === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      throw new Error(`「${f.label}」の日付の形式が正しくありません`);
    }
    out[f.fieldKey] = v;
  }
  return out;
}
