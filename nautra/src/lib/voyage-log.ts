import { t } from "@/i18n/ja";
import type { VoyageLogPayload } from "@/sync-protocol/records";

/**
 * 航海日誌の記録の種類の名前。船長・陸上が作った種類（logType = custom）は、記録した時点の
 * 名前の写し（customTypeName）を使う。種類をあとで改名・しまっても過去の記録の読み方が変わらない。
 */
export function voyageLogLabel(r: Pick<VoyageLogPayload, "logType" | "customTypeName">): string {
  if (r.logType === "custom") return r.customTypeName?.trim() || t.voyageLogType.custom;
  return t.voyageLogType[r.logType] ?? r.logType;
}
