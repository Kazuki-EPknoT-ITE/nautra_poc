import { canShore } from "@/domain/authz/shore-roles";
import { getShoreSession } from "@/server/shore-session";
import { ExportButton } from "./export-button";

/**
 * 書き出しの入口（サーバ側）。書き出しの権限（`manage_documents`）が無い人には**ボタンごと出さない**
 * （レビュー 0-8。押してから「権限がありません」と言わない）。API 側でも同じ判定をしている。
 */
export async function ExportAction({ set, label, className }: { set: string; label: string; className?: string }) {
  const staff = await getShoreSession();
  if (!staff || !canShore(staff.role, "manage_documents")) return null;
  return <ExportButton set={set} label={label} className={className} />;
}
