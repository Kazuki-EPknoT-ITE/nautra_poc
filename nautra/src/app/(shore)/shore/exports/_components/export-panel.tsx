"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Section } from "@/ui";

interface SetInfo {
  id: string;
  label: string;
  note: string;
  from: string;
  columns: string[];
}

/**
 * 書き出しの組み立て（デザイン正本 `design/poc_design` の S-17）。
 *
 * 左に「列を選ぶ → プレビュー → 実際に出る中身」、右に「体裁とファイル名」。
 * **選んだ結果がそのまま見える**ようにしてから落とす。Excel で開いてから列が
 * 足りないと気づくのが、この種の画面でいちばん多い失敗だから。
 */
export function ExportPanel({
  sets,
  activeId,
  columns,
  preview,
  totalRows,
}: {
  sets: SetInfo[];
  activeId: string;
  columns: string[];
  preview: string[][];
  totalRows: number;
}) {
  const [selected, setSelected] = useState<string[]>(columns);
  const [encoding, setEncoding] = useState<"utf8-bom" | "utf8" | "sjis">("utf8-bom");
  const [delimiter, setDelimiter] = useState<"comma" | "tab">("comma");

  // 対象を切り替えたら列の選択をその対象の全列に戻す（前の対象の列は意味を持たない）
  useEffect(() => {
    setSelected(columns);
  }, [columns]);

  const keep = columns.map((c, i) => (selected.includes(c) ? i : -1)).filter((i) => i >= 0);
  const head = keep.map((i) => columns[i]!);
  const body = preview.map((r) => keep.map((i) => r[i] ?? ""));

  const sep = delimiter === "tab" ? "\t" : ",";
  const raw = [head.join(sep), ...body.map((r) => r.join(sep))].join("\n");

  const fileName = `nautra-${activeId}-${new Date().toISOString().slice(0, 10)}.csv`;
  const href =
    `/api/v1/shore/export.csv?set=${encodeURIComponent(activeId)}` +
    `&cols=${encodeURIComponent(head.join(","))}` +
    `&delimiter=${delimiter}&encoding=${encoding}`;

  return (
    <>
      <section>
        <div className="mb-2.5 flex items-baseline justify-between gap-4">
          <h2 className="m-0 text-lg font-bold text-foreground-900">書き出すデータを選ぶ</h2>
          <p className="m-0 text-xs text-foreground-400">
            各管理ページの「CSVで書き出す」からも、この画面に対象を選んだ状態で入れます
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sets.map((s) => (
            <Link
              key={s.id}
              href={`/shore/exports?set=${s.id}`}
              className={cn(
                "ui-row flex flex-col gap-1 p-3.5 transition-colors hover:bg-content2",
                s.id === activeId && "border-primary bg-warning-100",
              )}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold text-foreground-900">{s.label}</span>
                <span className="font-mono text-xs text-foreground-400">{s.columns.length}列</span>
              </span>
              <span className="block text-xs leading-normal text-foreground-500">{s.note}</span>
              <span className="block text-2xs leading-normal tracking-normal text-foreground-400">
                出所 {s.from}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-3.5">
          <Section
            title={`列を選ぶ ／ ${sets.find((s) => s.id === activeId)?.label ?? ""}`}
            actions={<span className="font-mono text-sm text-foreground-500">{head.length}／{columns.length}列</span>}
            bodyClassName="flex flex-wrap gap-[7px] p-[18px]"
          >
            {columns.map((c) => {
              const on = selected.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setSelected((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))
                  }
                  className={cn("ui-btn-quiet", on && "ui-btn-selected")}
                >
                  {on ? "✓ " : "＋ "}
                  {c}
                </button>
              );
            })}
          </Section>

          <Section
            title="プレビュー"
            actions={
              <span className="text-xs text-foreground-400">
                先頭 {body.length} 行を表示（全 {totalRows} 行）
              </span>
            }
            bodyClassName="p-0"
          >
            <div className="overflow-auto">
              <table className="ui-table">
                <thead>
                  <tr>
                    {head.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j} className="whitespace-nowrap font-mono text-sm text-foreground-800">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {body.length === 0 ? (
              <p className="m-0 px-[18px] py-5 text-sm text-foreground-500">
                書き出せる行がありません。
              </p>
            ) : null}
          </Section>

          <div className="ui-dark px-[18px] py-4">
            <p className="m-0 font-mono text-2xs text-[#99877D]">RAW / 書き出される中身</p>
            <pre className="m-0 mt-3 overflow-auto font-mono text-sm leading-loose text-[#DFE1E0]">
              {raw}
            </pre>
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="ui-card flex flex-col gap-3.5 px-[18px] py-4">
            <div>
              <p className="m-0 mb-[7px] text-xs text-foreground-500">文字コード</p>
              <div className="flex flex-col gap-[7px]">
                {(
                  [
                    ["utf8-bom", "UTF-8（BOM 付き）"],
                    ["sjis", "Shift_JIS（CP932）"],
                    ["utf8", "UTF-8（BOM なし）"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={encoding === value}
                    onClick={() => setEncoding(value)}
                    className={cn(
                      "ui-btn-ghost h-9 justify-start",
                      encoding === value && "ui-btn-selected",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="m-0 mt-2 text-xs leading-normal text-foreground-400">
                {encoding === "sjis"
                  ? "古い Excel でも文字化けしません。Shift_JIS に無い文字（絵文字など）は ? に置き換わり、件数を監査ログに残します。"
                  : encoding === "utf8-bom"
                    ? "日本語 Windows の Excel でそのまま開けます。"
                    : "他システムへの取り込み向け。Excel で開くと文字化けすることがあります。"}
              </p>
            </div>
            <div>
              <p className="m-0 mb-[7px] text-xs text-foreground-500">区切り</p>
              <div className="flex gap-[7px]">
                {(
                  [
                    ["comma", "カンマ"],
                    ["tab", "タブ"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={delimiter === v}
                    onClick={() => setDelimiter(v)}
                    className={cn("ui-btn-ghost h-9 flex-1", delimiter === v && "ui-btn-selected")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-[var(--ui-hairline)] pt-3">
              <p className="m-0 text-xs text-foreground-500">ファイル名</p>
              <p className="m-0 mt-1.5 break-all font-mono text-base text-foreground-800">{fileName}</p>
              <a
                href={href}
                className={cn("ui-btn-primary mt-3 h-[46px] w-full", head.length === 0 && "pointer-events-none opacity-45")}
              >
                この内容で書き出す
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
