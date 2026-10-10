import { redirect } from "next/navigation";

/**
 * 旧 S-17 CSV書き出し。書き出しは各画面の「◯◯を書き出す」に移した（レビュー EXPORT-01）ので、
 * 古いリンクやブックマークから来た人はダッシュボードへ送る。
 */
export default function ShoreExportsPage(): never {
  redirect("/shore");
}
