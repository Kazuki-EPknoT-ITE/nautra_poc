"use server";

import { revalidatePath } from "next/cache";
import { publishNotice } from "@/server/notice-service";
import type { NoticeLevel } from "@/sync-protocol/records";

export interface NoticeFormState {
  ok: boolean;
  message: string;
}

/** 船内へのお知らせ・速報を配信する（Server Action。薄い入出力層としサービスへ委譲） */
export async function publishNoticeAction(
  _prev: NoticeFormState,
  formData: FormData,
): Promise<NoticeFormState> {
  try {
    const published = publishNotice({
      level: String(formData.get("level") ?? "info") as NoticeLevel,
      title: String(formData.get("title") ?? ""),
      body: String(formData.get("body") ?? ""),
      supersedesId: String(formData.get("supersedesId") ?? "") || undefined,
    });
    revalidatePath("/shore/notices");
    return { ok: true, message: `配信しました: ${published.title}（船内の画面にすぐ表示されます）` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
