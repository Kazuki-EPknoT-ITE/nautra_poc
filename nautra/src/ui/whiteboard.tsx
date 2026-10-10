"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * ホワイトボード（レビュー ASSIGN-05 / ORDER-02「Miro のような UX」）。
 *
 * 点の方眼の上に「枠（フレーム）」を並べ、カードを枠から枠へドラッグして動かす。
 * - 何もない所をつかんでドラッグすると**画面ごと動かせる**（パン）
 * - 右上の −／＋／全体、または Ctrl＋ホイールで**拡大・縮小**できる
 * - 枠は内容に合わせて伸びる。カードの位置は自由配置ではなく枠の中に整列させる
 *   （配乗・割り当ては「どの枠に入っているか」が意味を持つため。置き場所の座標は記録しない）
 */
export function Whiteboard({
  children,
  height = 620,
  label,
}: {
  children: ReactNode;
  height?: number;
  label: string;
}) {
  const viewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 24, y: 24, z: 1 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const zoomBy = useCallback((factor: number) => {
    setView((v) => ({ ...v, z: Math.min(1.6, Math.max(0.4, Math.round(v.z * factor * 100) / 100)) }));
  }, []);

  /** 全体が入る倍率にする。min を渡すと、それより小さくはしない（文字が読めなくなるのを防ぐ） */
  const fit = useCallback(
    (min = 0.4) => {
      const vw = viewRef.current?.clientWidth ?? 0;
      const cw = contentRef.current?.scrollWidth ?? 0;
      const ch = contentRef.current?.scrollHeight ?? 0;
      if (!vw || !cw) return;
      const z = Math.min(1, (vw - 48) / cw, (height - 72) / Math.max(1, ch));
      setView({ x: 24, y: 24, z: Math.max(min, Math.round(z * 100) / 100) });
    },
    [height],
  );

  // 開いた直後はなるべく全体が見える倍率にする。ただし 80% より小さくはしない（あとは動かして見る）
  useEffect(() => {
    fit(0.8);
  }, [fit]);

  // Ctrl＋ホイールで拡大・縮小（ブラウザの拡大と取り合わないよう、ここで止める）
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  return (
    <section aria-label={label} className="ui-card relative overflow-hidden p-0">
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-small border border-[var(--ui-hairline-strong)] bg-content1 p-1">
        <button type="button" className="ui-btn-quiet h-8 w-8 !p-0" aria-label="縮小" onClick={() => zoomBy(1 / 1.15)}>
          −
        </button>
        <span className="w-12 text-center font-mono text-sm tabular-nums text-foreground-700">{Math.round(view.z * 100)}%</span>
        <button type="button" className="ui-btn-quiet h-8 w-8 !p-0" aria-label="拡大" onClick={() => zoomBy(1.15)}>
          ＋
        </button>
        <button type="button" className="ui-btn-quiet h-8 px-2" onClick={() => fit()}>
          全体
        </button>
      </div>
      <div
        ref={viewRef}
        className="relative cursor-grab touch-none select-none active:cursor-grabbing"
        style={{
          height,
          backgroundColor: "#F6F6F6",
          backgroundImage: "radial-gradient(#CCCCCC 1px, transparent 1px)",
          backgroundSize: `${20 * view.z}px ${20 * view.z}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        onPointerDown={(e) => {
          // カードや枠の上ではパンしない（ドラッグ＆ドロップを優先する）
          if (e.target !== e.currentTarget && e.target !== contentRef.current) return;
          drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setView((v) => ({ ...v, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <div
          ref={contentRef}
          className="absolute left-0 top-0 flex w-max items-start gap-8"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transformOrigin: "0 0" }}
        >
          {children}
        </div>
      </div>
    </section>
  );
}

/** ホワイトボードの枠。上に名前の札、中にカード。カードを落とすと onDropCard が呼ばれる */
export function WhiteboardFrame({
  title,
  meta,
  actions,
  width = 300,
  highlight,
  onDropCard,
  children,
  tone = "paper",
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  width?: number;
  highlight?: boolean;
  onDropCard?: (data: string) => void;
  children: ReactNode;
  tone?: "paper" | "muted";
}) {
  const [over, setOver] = useState(false);
  const accepts = Boolean(onDropCard);
  return (
    <div className="flex flex-none flex-col gap-1.5" style={{ width }}>
      <div className="flex items-end justify-between gap-2 px-1">
        <p className="m-0 truncate text-lg font-bold text-foreground-900">{title}</p>
        {actions}
      </div>
      <div
        role="group"
        aria-label={typeof title === "string" ? title : undefined}
        onDragOver={
          accepts
            ? (e: DragEvent) => {
                e.preventDefault();
                setOver(true);
              }
            : undefined
        }
        onDragLeave={accepts ? () => setOver(false) : undefined}
        onDrop={
          accepts
            ? (e: DragEvent) => {
                e.preventDefault();
                setOver(false);
                onDropCard?.(e.dataTransfer.getData("text/plain"));
              }
            : undefined
        }
        className={cn(
          "flex min-h-[140px] flex-col gap-2 rounded-[4px] border p-3",
          tone === "muted" ? "bg-[#DFE1E0]" : "bg-content1",
          over || highlight ? "border-primary ring-2 ring-primary/40" : "border-[var(--ui-hairline-strong)]",
        )}
      >
        {meta}
        {children}
      </div>
    </div>
  );
}
