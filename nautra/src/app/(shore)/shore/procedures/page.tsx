import { redirect } from "next/navigation";

/**
 * 旧 S-08 手続き・期限。独立した画面をやめ、届出の「手続き・期限」と、船員カルテ・船の管理ページへ
 * 振り分けた（レビュー DEADLINE-02。利用者の判断「各ページへ分散」）。古いリンクから来た人は届出の一覧へ送る。
 */
export default function ShoreProceduresPage(): never {
  redirect("/shore/filings?tab=procedures");
}
