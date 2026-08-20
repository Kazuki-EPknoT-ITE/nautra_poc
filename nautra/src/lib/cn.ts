/** クラス結合ユーティリティ（PoC 最小実装） */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
