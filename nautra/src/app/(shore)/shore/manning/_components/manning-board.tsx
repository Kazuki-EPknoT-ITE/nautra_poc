"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { CheckLevel } from "@/domain/labor-law/types";
import { cn } from "@/lib/cn";
import { ConfirmDialog, CrewPhoto, FlashToast, SearchField, StatusChip, Whiteboard, WhiteboardFrame } from "@/ui";
import { moveCrewAction } from "../actions";

export interface BoardCrew {
  crewMemberId: string;
  name: string;
  position: string;
  age: number | null;
  photo?: string;
  /** 顔写真（縮小済みの data URL）。未登録なら頭文字の枠で描く */
  photoDataUrl?: string;
  level: CheckLevel;
  statusLabel: string;
  /** 配乗ブロックの事由（あれば確認ダイアログに出す） */
  blockNote: string | null;
  note: string;
  since: string | null;
}

export interface BoardVessel {
  vesselId: string;
  name: string;
  spec: string;
  requiredCrew: number | null;
  managedExternally: boolean;
  crew: BoardCrew[];
}

/**
 * 配乗ボード（デザイン正本 `design/poc_design` の S-05）。
 *
 * 左に「配乗待ち」、右に船の列。カードを列へドラッグして配置する。
 * 動かした結果は**乗下船イベントの追記**として記録され、手続きの連鎖生成も走る
 * （見た目は並べ替えでも、中身は登録と同じ経路。6.6①）。
 *
 * 配乗ブロックに当たる船員を落としたときは**確認を挟む**。候補から黙って消すと
 * 「なぜこの人を選べないのか」が分からず、解決にも進めないため（3.1.2）。
 */
export function ManningBoard({
  pool,
  vessels,
  selectedVesselId,
}: {
  pool: BoardCrew[];
  vessels: BoardVessel[];
  /** 詳細を開いている船（枠を強調する） */
  selectedVesselId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState<BoardCrew | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ crew: BoardCrew; vesselId: string | null; vesselName: string } | null>(
    null,
  );
  const [query, setQuery] = useState("");

  function run(crew: BoardCrew, vesselId: string | null, acknowledge: boolean) {
    startTransition(async () => {
      const res = await moveCrewAction(crew.crewMemberId, vesselId, crew.position, acknowledge);
      setFlash(res.message);
      if (res.ok) router.refresh();
    });
  }

  function drop(vesselId: string | null, vesselName: string) {
    setHover(null);
    const crew = dragging;
    setDragging(null);
    if (!crew) return;
    if (crew.blockNote) {
      setConfirm({ crew, vesselId, vesselName });
      return;
    }
    run(crew, vesselId, false);
  }

  const visiblePool = query
    ? pool.filter((c) => (c.name + c.position).includes(query))
    : pool;

  return (
    <>
      {pending ? <p className="m-0 text-sm text-primary">配信中…</p> : null}
      <Whiteboard label="配乗ボード">
        {/* 配乗待ち（船に乗っていない船員） */}
        <WhiteboardFrame
          title="配乗待ち"
          tone="muted"
          width={260}
          actions={<span className="font-mono text-sm text-foreground-500">{pool.length}名</span>}
          highlight={dragging !== null && hover === "pool"}
          onDropCard={() => drop(null, "配乗待ち")}
          meta={<SearchField value={query} onChange={setQuery} className="w-full" />}
        >
          {visiblePool.map((c) => (
            <CrewCard key={c.crewMemberId} crew={c} onDragStart={() => setDragging(c)} onDragEnd={() => setDragging(null)} />
          ))}
          {visiblePool.length === 0 ? (
            <p className="m-0 rounded-small border border-dashed border-[var(--ui-hairline-strong)] px-3 py-6 text-center text-sm text-foreground-500">
              配乗待ちの船員はいません
            </p>
          ) : null}
        </WhiteboardFrame>

        {/* 船の枠。名前の横の「詳細」で、その船の乗組み・見通し・乗下船の登録を開く（ASSIGN-03） */}
        {vessels.map((v) => {
          const gap = v.requiredCrew === null ? null : v.crew.length - v.requiredCrew;
          return (
            <WhiteboardFrame
              key={v.vesselId}
              title={v.name}
              width={280}
              highlight={selectedVesselId === v.vesselId}
              actions={
                <Link href={`/shore/manning?vessel=${v.vesselId}`} className="ui-btn-quiet" scroll={false}>
                  詳細 ›
                </Link>
              }
              onDropCard={v.managedExternally ? undefined : () => drop(v.vesselId, v.name)}
              meta={
                <StatusChip
                  level={v.managedExternally ? "none" : gap === null ? "none" : gap < 0 ? "violation" : "ok"}
                  size="sm"
                  className="self-start"
                  label={
                    v.managedExternally
                      ? "管理委託中"
                      : gap === null
                        ? "定員未登録"
                        : gap < 0
                          ? `${Math.abs(gap)}名 不足`
                          : `${v.crew.length}／${v.requiredCrew}名`
                  }
                />
              }
            >
              {v.crew.map((c) => (
                <CrewCard key={c.crewMemberId} crew={c} onDragStart={() => setDragging(c)} onDragEnd={() => setDragging(null)} />
              ))}
              <p className="m-0 rounded-small border border-dashed border-[var(--ui-hairline-strong)] px-3 py-3 text-center text-xs text-foreground-500">
                {v.managedExternally ? "管理委託中" : "ここへドラッグ"}
              </p>
            </WhiteboardFrame>
          );
        })}
      </Whiteboard>

      <ConfirmDialog
        open={confirm !== null}
        tone="danger"
        eyebrow="配乗ブロックの確認"
        title={`${confirm?.crew.name ?? ""} を ${confirm?.vesselName ?? ""} に配置しますか`}
        body={
          <>
            <p className="m-0">{confirm?.crew.blockNote}</p>
            <p className="m-0 mt-2 text-sm text-foreground-500">
              このまま登録すると、事由を承知のうえで配置したことが記録に残ります。
              届出が受理保留になる可能性があるため、先に不足を解消するのが原則です。
            </p>
          </>
        }
        primaryLabel="事由を承知で配置する"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) run(confirm.crew, confirm.vesselId, true);
          setConfirm(null);
        }}
      />

      <FlashToast message={flash} onDone={() => setFlash(null)} />
    </>
  );
}

/**
 * 船員カード（レビュー ASSIGN-02: 文字を減らす）。顔写真・氏名・職名と、状態の記号だけを出す。
 * 年齢・乗船日・止まっている事由は、札にマウスを載せると読める（説明の文はカードに置かない）。
 */
function CrewCard({
  crew,
  onDragStart,
  onDragEnd,
}: {
  crew: BoardCrew;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const detail = [
    crew.statusLabel,
    crew.age !== null ? `${crew.age}歳` : null,
    crew.since ? `乗船 ${crew.since}` : null,
    crew.note || null,
  ]
    .filter(Boolean)
    .join(" ／ ");
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", crew.crewMemberId);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      aria-label={`${crew.name}（${crew.position}）${crew.statusLabel}`}
      className={cn(
        "flex cursor-grab items-center gap-2.5 rounded-small border bg-content1 p-2 active:cursor-grabbing",
        crew.level === "violation" ? "border-danger" : crew.level === "caution" ? "border-primary" : "border-[var(--ui-hairline)]",
      )}
    >
      <CrewPhoto name={crew.name} initial={crew.photo} src={crew.photoDataUrl} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold text-foreground-900">{crew.name}</span>
        <span className="block truncate text-sm text-foreground-600">{crew.position}</span>
      </span>
      <StatusChip level={crew.level} size="sm" label="" hint={detail} />
    </div>
  );
}
