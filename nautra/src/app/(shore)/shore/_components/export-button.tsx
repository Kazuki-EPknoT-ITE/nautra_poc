"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Format = "xlsx" | "csv" | "tsv";
type Encoding = "utf8-bom" | "sjis" | "utf8";

/** 形式は用途と拡張子で見せる。"CSV" という言葉は画面に出さない（レビュー EXPORT-02） */
const FORMATS: { id: Format; title: string; ext: string; mime: string; desc: string }[] = [
  {
    id: "xlsx",
    title: "Excel",
    ext: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    desc: "Excel ブック",
  },
  { id: "csv", title: "カンマ区切り", ext: "csv", mime: "text/csv", desc: "カンマ区切りテキスト" },
  { id: "tsv", title: "タブ区切り", ext: "txt", mime: "text/plain", desc: "タブ区切りテキスト" },
];

const ENCODINGS: { id: Encoding; title: string }[] = [
  { id: "utf8-bom", title: "Windows の Excel 向け" },
  { id: "sjis", title: "古い Excel 向け" },
  { id: "utf8", title: "ほかのシステム向け" },
];

interface Preview {
  label: string;
  columns: string[];
  rows: string[][];
  total: number;
  fileBase: string;
}

/** File System Access API（Chrome / Edge）。無いブラウザではダウンロードに落とす */
type SavePicker = (opts: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ name: string; createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;

function savePicker(): SavePicker | null {
  const w = window as unknown as { showSaveFilePicker?: SavePicker };
  return typeof w.showSaveFilePicker === "function" ? w.showSaveFilePicker.bind(window) : null;
}

/**
 * 各画面の「◯◯を書き出す」（レビュー EXPORT-01〜03）。
 *
 * 押すと問いかけが開き、**形式（拡張子）→ 列 → 中身の確認 → ファイル名 → 保存先**の順に決めて保存する。
 * 保存先は一般的なデスクトップアプリと同じ「名前を付けて保存」の窓で選ぶ（Chrome / Edge）。
 * その窓を持たないブラウザでは、いつものダウンロード先に保存する。
 * 書き出したことはサーバで監査ログに残る（12.6）。
 */
export function ExportButton({ set, label, className }: { set: string; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [format, setFormat] = useState<Format>("xlsx");
  const [encoding, setEncoding] = useState<Encoding>("utf8-bom");
  const [fileBase, setFileBase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [hasPicker, setHasPicker] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setHasPicker(savePicker() !== null);
    setError(null);
    setDone(null);
    let alive = true;
    fetch(`/api/v1/shore/export?set=${encodeURIComponent(set)}&preview=1`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return (await r.json()) as Preview;
      })
      .then((p) => {
        if (!alive) return;
        setPreview(p);
        setSelected(p.columns);
        setFileBase(p.fileBase);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, set]);

  const fmt = FORMATS.find((f) => f.id === format)!;
  const columns = preview?.columns ?? [];
  const keep = columns.map((c, i) => (selected.includes(c) ? i : -1)).filter((i) => i >= 0);
  const fileName = `${fileBase.trim() || preview?.fileBase || label}.${fmt.ext}`;

  async function save() {
    setError(null);
    setDone(null);
    const head = keep.map((i) => columns[i]!);
    const href =
      `/api/v1/shore/export?set=${encodeURIComponent(set)}&cols=${encodeURIComponent(head.join(","))}` +
      `&format=${format}&encoding=${encoding}`;
    // 保存先の窓は「押した直後」にしか開けない（ブラウザの制約）ので、取得より先に開く
    const picker = savePicker();
    let handle: Awaited<ReturnType<SavePicker>> | null = null;
    if (picker) {
      try {
        handle = await picker({
          suggestedName: fileName,
          types: [{ description: fmt.desc, accept: { [fmt.mime]: [`.${fmt.ext}`] } }],
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // 窓を閉じた＝やめた
        handle = null;
      }
    }
    setBusy(true);
    try {
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      if (handle) {
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        setDone(`「${handle.name}」に保存しました`);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setDone(`「${fileName}」を保存しました`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={cn("ui-btn-ghost h-9", className)} onClick={() => setOpen(true)}>
        <span aria-hidden="true">⤓</span>
        {label}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            className="ui-modal flex max-h-[90vh] w-full max-w-[760px] flex-col outline-none"
          >
            <div className="flex items-center justify-between border-b border-[var(--ui-hairline-strong)] px-5 py-3.5">
              <h2 className="m-0 text-xl font-bold text-foreground-900">{label}</h2>
              <button type="button" aria-label="閉じる" className="ui-btn-quiet h-9 w-9 !p-0" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-2 text-sm font-bold text-foreground-700">形式</legend>
                <div className="grid grid-cols-3 gap-2">
                  {FORMATS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={format === f.id}
                      onClick={() => setFormat(f.id)}
                      className={cn(
                        "ui-btn-ghost flex h-auto flex-col !items-start gap-0.5 py-2.5 text-left",
                        format === f.id && "ui-btn-selected",
                      )}
                    >
                      <span className="text-lg font-bold">{f.title}</span>
                      <span className="font-mono text-sm font-normal opacity-80">.{f.ext}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              {format !== "xlsx" ? (
                <fieldset className="m-0 border-0 p-0">
                  <legend className="mb-2 text-sm font-bold text-foreground-700">開くソフト</legend>
                  <div className="flex flex-wrap gap-2">
                    {ENCODINGS.map((en) => (
                      <button
                        key={en.id}
                        type="button"
                        aria-pressed={encoding === en.id}
                        onClick={() => setEncoding(en.id)}
                        className={cn("ui-btn-quiet min-h-9 !text-sm", encoding === en.id && "ui-btn-selected")}
                      >
                        {en.title}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-2 flex w-full items-baseline justify-between text-sm font-bold text-foreground-700">
                  <span>
                    列 <span className="font-mono font-normal text-foreground-500">{keep.length}／{columns.length}</span>
                  </span>
                </legend>
                <div className="flex flex-wrap gap-[7px]">
                  {columns.map((c) => {
                    const on = selected.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setSelected((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))}
                        className={cn("ui-btn-quiet", on && "ui-btn-selected")}
                      >
                        {on ? "✓ " : "＋ "}
                        {c}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div>
                <p className="m-0 mb-2 flex items-baseline justify-between text-sm font-bold text-foreground-700">
                  <span>中身</span>
                  <span className="font-mono font-normal text-foreground-500">
                    {preview ? `${preview.total}行` : "読み込み中…"}
                  </span>
                </p>
                <div className="max-h-[200px] overflow-auto border border-[var(--ui-hairline)]">
                  <table className="ui-table">
                    <thead>
                      <tr>
                        {keep.map((i) => (
                          <th key={columns[i]}>{columns[i]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(preview?.rows ?? []).map((r, ri) => (
                        <tr key={ri}>
                          {keep.map((i) => (
                            <td key={i} className="whitespace-nowrap font-mono text-sm text-foreground-800">
                              {r[i] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold text-foreground-700">ファイル名</span>
                <span className="flex items-center gap-1">
                  <input
                    value={fileBase}
                    onChange={(e) => setFileBase(e.target.value)}
                    className="ui-field !py-2"
                    aria-label="ファイル名"
                  />
                  <span className="font-mono text-base text-foreground-600">.{fmt.ext}</span>
                </span>
              </label>

              {error ? <p className="m-0 text-base text-danger">✕ {error}</p> : null}
              {done ? (
                <p role="status" className="m-0 text-base text-foreground-800">
                  ✓ {done}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--ui-hairline)] px-5 py-3.5">
              <button type="button" className="ui-btn-ghost h-11 px-5" onClick={() => setOpen(false)}>
                {done ? "閉じる" : "やめる"}
              </button>
              <button
                type="button"
                className="ui-btn-primary h-11 px-6"
                disabled={busy || !preview || keep.length === 0}
                onClick={() => void save()}
              >
                {busy ? "保存中…" : hasPicker ? "保存先を選んで保存" : "保存する"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
