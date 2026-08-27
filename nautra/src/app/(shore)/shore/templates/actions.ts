"use server";

import { revalidatePath } from "next/cache";
import { publishTemplateItem } from "@/server/template-service";
import type { TemplateInputType, TemplateUsage } from "@/sync-protocol/records";

export interface TemplateItemFormState {
  ok: boolean;
  message: string;
}

/** 記録項目の追加配信（Server Action。入出力の変換だけ行いドメインサービスへ委譲） */
export async function publishTemplateItemAction(
  _prev: TemplateItemFormState,
  formData: FormData,
): Promise<TemplateItemFormState> {
  try {
    const target = String(formData.get("target") ?? ""); // "usage|templateKey|name"
    const [usage, templateKey, fallbackName] = target.split("|");
    if (!usage || !templateKey) throw new Error("追加先を選択してください");
    const published = publishTemplateItem({
      usage: usage as TemplateUsage,
      templateKey,
      fallbackName,
      label: String(formData.get("label") ?? ""),
      group: String(formData.get("group") ?? ""),
      inputType: String(formData.get("inputType") ?? "check") as TemplateInputType,
      unit: String(formData.get("unit") ?? ""),
      changeNote: String(formData.get("changeNote") ?? ""),
    });
    revalidatePath("/shore/templates");
    return {
      ok: true,
      message: `配信しました: ${published.name} 版 ${published.version}（船内の次回同期で記録項目に追加されます）`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
