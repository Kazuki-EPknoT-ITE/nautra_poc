"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type DragEvent } from "react";
import type { CheckLevel } from "@/domain/labor-law/types";
import { cn } from "@/lib/cn";
import { ConfirmDialog, CrewPhoto, FlashToast, SearchField, StatusChip } from "@/ui";
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
export function ManningBoard({ pool, vessels }: { pool: BoardCrew[]; vessels: BoardVessel[] }) {
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
    return (e: DragEvent) => {
      e.preventDefault();
      setHover(null);
      const crew = dragging;
      setDragging(null);
      if (!crew) return;
      if (crew.blockNote) {
        setConfirm({ crew, vesselId, vesselName });
        return;
      }
      run(crew, vesselId, false);
    };
  }

  function allowDrop(key: string) {
    return (e: DragEvent) => {
      e.preventDefault();
      setHover(key);
    };
  }

  const visiblePool = query
    ? pool.filter((c) => (c.name + c.position).includes(query))
    : pool;

  return (
    <>
      <section className="ui-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ui-hairline-strong)] px-[18px] pb-3 pt-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="m-0 text-lg font-bold text-foreground-900">配乗ボード</h2>
            <p className="m-0 text-sm text-foreground-500">
              船員カードを船の枠へドラッグして配置します。船から外すには「配乗待ち」へドラッグ
            </p>
          </div>
          {pending ? <span className="text-sm text-primary">配信中…</span> : null}
        </div>

        <div className="grid min-h-[420px] grid-cols-1 xl:grid-cols-[260px_repeat(3,minmax(0,1fr))]">
          {/* 配乗待ち */}
          <div
            onDragOver={allowDrop("pool")}
            onDragLeave={() => setHover(null)}
            onDrop={drop(null, "配乗待ち")}
            className={cn(
              "flex min-w-0 flex-col border-b border-r border-[var(--ui-hairline)] bg-content2 p-3.5 xl:border-b-0",
              hover === "pool" && "bg-warning-100",
            )}
          >
            <div className="mb-3 flex items-baseline justify-between">
              <p className="m-0 font-mono text-2xs text-foreground-500">POOL / 配乗待ち</p>
              <span className="font-mono text-sm text-foreground-500">{pool.length}名</span>
            </div>
            <SearchField value={query} onChange={setQuery} className="mb-3 w-full" />
            <div className="flex flex-col gap-2">
              {visiblePool.map((c) => (
                <CrewCard key={c.crewMemberId} crew={c} onDragStart={() => setDragging(c)} onDragEnd={() => setDragging(null)} />
              ))}
              {visiblePool.length === 0 ? (
                <p className="m-0 rounded-small border border-dashed border-[var(--ui-hairline-strong)] px-3 py-6 text-center text-sm text-foreground-400">
                  配乗待ちの船員はいません
                </p>
              ) : null}
            </div>
          </div>

          {/* 船の列 */}
          {vessels.map((v) => {
            const gap = v.requiredCrew === null ? null : v.crew.length - v.requiredCrew;
            return (
              <div
                key={v.vesselId}
                onDragOver={allowDrop(v.vesselId)}
                onDragLeave={() => setHover(null)}
                onDrop={drop(v.vesselId, v.name)}
                className={cn(
                  "flex min-w-0 flex-col border-b border-r border-[var(--ui-hairline)] p-3.5 last:border-r-0 xl:border-b-0",
                  hover === v.vesselId && "bg-warning-100",
                )}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div>
                    <p className="m-0 text-xl font-bold text-foreground-900">{v.name}</p>
                    <p className="m-0 mt-0.5 text-xs text-foreground-500">{v.spec}</p>
                  </div>
                  <StatusChip
                    level={
                      v.managedExternally ? "none" : gap === null ? "none" : gap < 0 ? "violation" : "ok"
                    }
                    size="sm"
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
                </div>
                <div className="mt-3 flex flex-1 flex-col gap-2">
                  {v.crew.map((c) => (
                    <CrewCard
                      key={c.crewMemberId}
                      crew={c}
                      onDragStart={() => setDragging(c)}
                      onDragEnd={() => setDragging(null)}
                    />
                  ))}
                  <div
                    className={cn(
                      "rounded-small border border-dashed px-3 py-4 text-center text-xs",
                      hover === v.vesselId
                        ? "border-primary text-primary"
                        : "border-[var(--ui-hairline-strong)] text-foreground-400",
                    )}
                  >
                    {v.managedExternally
                      ? "管理委託中のため自社配乗はありません"
                      : "ここへドラッグして配乗"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

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

/** 船員カード。つまむ位置（⋮⋮）と顔写真の枠を持つ */
function CrewCard({
  crew,
  onDragStart,
  onDragEnd,
}: {
  crew: BoardCrew;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", crew.crewMemberId);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-grab rounded-small border bg-content1 p-2.5 active:cursor-grabbing",
        crew.level === "violation" ? "border-danger" : "border-[var(--ui-hairline)]",
      )}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="mt-6 font-mono text-lg tracking-[-2px] text-foreground-400">
          ⋮⋮
        </span>
        <CrewPhoto name={crew.name} initial={crew.photo} src={crew.photoDataUrl} size="sm" />
        {/* 氏名・職名・状態は縦に積む。横に並べると、列が狭いときに氏名が
            1文字ずつ折り返して読めなくなる */}
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-base font-bold text-foreground-900">{crew.name}</p>
          <p className="m-0 mt-px text-xs leading-normal text-foreground-500">
            {crew.position}
            {crew.age !== null ? ` ／ ${crew.age}歳` : ""}
          </p>
          {crew.since ? (
            <p className="m-0 mt-px font-mono text-2xs tracking-normal text-foreground-400">
              乗船 {crew.since}
            </p>
          ) : null}
          <StatusChip level={crew.level} size="sm" className="mt-1.5" label={crew.statusLabel} />
        </div>
      </div>
      {crew.note ? (
        <p className="m-0 mt-2 text-xs leading-normal text-foreground-500">{crew.note}</p>
      ) : null}
    </div>
  );
}
