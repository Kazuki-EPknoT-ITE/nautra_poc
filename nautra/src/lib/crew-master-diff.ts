import { t } from "@/i18n/ja";
import type { CrewMasterPayload, InsuranceEntry } from "@/sync-protocol/records";
import { INSURANCE_KINDS } from "@/sync-protocol/records";

/**
 * 船員マスタの「何がどう変わったか」を組み立てる純関数（UI・DB 非依存）。
 *
 * 要件定義書 12.6「すべてのマスター更新について、変更前後の値・変更者・変更日時・変更経路を保持する」
 * と 10.3「要配慮個人情報は閲覧権限を細分化する」を同時に満たすため、
 * **要配慮個人情報だけは値を持たず「(変更あり)」とだけ返す**。
 * 監査ログの本文も画面の表示も、この関数の結果だけを使う（対応表を画面ごとに持たない）。
 */

/** 要配慮個人情報（10.3）。値をログ・画面に載せない項目 */
export const SENSITIVE_CREW_FIELDS = ["medicalHistory", "medication"] as const;
export type SensitiveCrewField = (typeof SENSITIVE_CREW_FIELDS)[number];

/** 値を持たない項目に入れる文言（要配慮情報の変更点表示） */
export const SENSITIVE_PLACEHOLDER = "(変更あり)";

/** 値の無い項目の表示 */
export const EMPTY_PLACEHOLDER = "（未入力）";

/** 差分を取る通常項目（表示名は i18n の crewMasterField から引く） */
export const PLAIN_CREW_FIELDS = [
  "name",
  "nameKana",
  "birthDate",
  "seamanBookNo",
  "address",
  "bloodType",
  "phone",
  "position",
  "employmentType",
  "hiredOn",
  "emergencyContactName",
  "emergencyContactRelation",
  "emergencyContactPhone",
  "familyNote",
] as const;

export interface FieldChange {
  label: string;
  before: string;
  after: string;
  /** 要配慮個人情報。before/after に実際の値が入っていないことの目印 */
  sensitive: boolean;
}

/** 空文字と未入力を同じ「未入力」として扱う（"" と undefined を別の変更と数えない） */
export function normalizeField(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s === "" ? undefined : s;
}

const show = (v: string | undefined, dict?: Record<string, string>) =>
  v ? (dict?.[v] ?? v) : EMPTY_PLACEHOLDER;

/** 保険（写し）の比較対象。記号番号・資格取得日に加え、鮮度管理の2項目を必ず見る（12.4） */
const INSURANCE_COLUMNS: {
  key: keyof InsuranceEntry;
  label: string;
  dict?: Record<string, string>;
}[] = [
  { key: "number", label: "記号番号" },
  { key: "acquiredOn", label: "資格取得日" },
  { key: "lastVerifiedOn", label: "最終確認日" },
  { key: "verifyMethod", label: "確認方法", dict: t.verifyMethod },
];

/**
 * 変更点を「項目名 + 変更前後」に整理する。
 * `after` は差分ではなく**変更後の完全な姿**（publishMaster に渡すのと同じ形）を受け取る。
 */
export function diffCrewMaster(
  before: Pick<CrewMasterPayload, "insurances"> & Record<string, unknown>,
  after: Record<string, unknown>,
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const key of PLAIN_CREW_FIELDS) {
    const b = normalizeField(before[key]);
    const a = normalizeField(after[key]);
    if (b === a) continue;
    changes.push({
      label: t.crewMasterField[key] ?? key,
      before: show(b),
      after: show(a),
      sensitive: false,
    });
  }

  for (const key of SENSITIVE_CREW_FIELDS) {
    const b = normalizeField(before[key]);
    const a = normalizeField(after[key]);
    if (b === a) continue;
    changes.push({
      label: t.crewMasterField[key] ?? key,
      before: SENSITIVE_PLACEHOLDER,
      after: SENSITIVE_PLACEHOLDER,
      sensitive: true,
    });
  }

  const beforeIns = (before.insurances ?? []) as InsuranceEntry[];
  const afterIns = (after.insurances ?? []) as InsuranceEntry[];
  for (const kind of INSURANCE_KINDS) {
    const b = beforeIns.find((i) => i.kind === kind);
    const a = afterIns.find((i) => i.kind === kind);
    for (const col of INSURANCE_COLUMNS) {
      const bv = normalizeField(b?.[col.key]);
      const av = normalizeField(a?.[col.key]);
      if (bv === av) continue;
      changes.push({
        label: `${t.insuranceKind[kind]}の${col.label}`,
        before: show(bv, col.dict),
        after: show(av, col.dict),
        sensitive: false,
      });
    }
  }

  return changes;
}

/** 監査ログ本文（12.6）。要配慮情報は値を含まない */
export function describeChanges(changes: FieldChange[], side: "before" | "after"): string {
  return changes.map((c) => `${c.label}: ${c[side]}`).join(" / ");
}
