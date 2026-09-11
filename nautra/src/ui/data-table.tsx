import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 表（デザイン正本 `design/poc_design` の `data-scroll-table`）。
 *
 * デザインはデータを**表で読ませる**画面が多く、どれも
 * 「固定の見出し行 + 最大高さでスクロールする本文」という同じ作りをしている。
 * 材質（見出し 11px/#999、本文 13px/#333、行の下線 #E8E8E8）は globals.css の
 * `.ui-table` が持ち、ここは骨組みだけを与える。
 *
 * 列の右寄せ・等幅は `<th className="num">` / `<td className="num">` で指定する
 * （時刻・時間・件数は桁を揃えて縦に読み比べる）。
 */
export function DataTable({
  head,
  children,
  maxHeight = 460,
  className,
  /** 行が無いときに表の代わりに出す一文 */
  empty,
  isEmpty = false,
}: {
  head: ReactNode;
  children?: ReactNode;
  maxHeight?: number | null;
  className?: string;
  empty?: ReactNode;
  isEmpty?: boolean;
}) {
  if (isEmpty) {
    return (
      <p className="px-[18px] py-6 text-sm text-foreground-500">
        {empty ?? "該当するものはありません。"}
      </p>
    );
  }
  return (
    <div
      className={cn("ui-table-scroll", className)}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className="ui-table">
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
