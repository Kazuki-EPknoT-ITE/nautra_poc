import type { TimeRecord, WorkInterval } from "./types";

/**
 * 有効レコードの抽出。
 * - 同一 ID の重複（同期の再送等）は最初の1件のみ採用（冪等）
 * - 差戻し再入力（supersedesId）で無効化されたレコードを除外（元レコードは物理保持のまま）
 */
export function effectiveRecords(records: TimeRecord[]): TimeRecord[] {
  const byId = new Map<string, TimeRecord>();
  for (const r of records) {
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  const superseded = new Set<string>();
  for (const r of byId.values()) {
    if (r.supersedesId) superseded.add(r.supersedesId);
  }
  return [...byId.values()].filter((r) => !superseded.has(r.id));
}

/**
 * 打刻レコード（開始/終了）から作業区間を構成する。
 *
 * 方針: **作業種別ごとに独立して開始・終了する（並列打刻）**。
 * 船内では航海当直をしながら荷役の監督に就くなど、複数の作業が同時に進行する。
 * このため開始打刻は他の作業を終了させず、同じ作業種別の開始/終了だけを対応づける。
 * - 同一種別で開始が続いた場合は、直前の区間を新しい開始時刻で閉じて開き直す
 *   （打ち忘れ・再送に備え、どの開始レコードも区間の起点として残す）
 * - 対応する開始のない終了打刻は無視する（集計を壊さない）
 *
 * 注: 重なり合う区間があるため、労働時間の合計は区間長の単純合計ではなく
 * 和集合で求める（evaluateDaily 側で実施）。
 */
export function buildIntervals(records: TimeRecord[]): WorkInterval[] {
  const effective = effectiveRecords(records);
  const byCrew = new Map<string, TimeRecord[]>();
  for (const r of effective) {
    const list = byCrew.get(r.crewMemberId) ?? [];
    list.push(r);
    byCrew.set(r.crewMemberId, list);
  }

  const intervals: WorkInterval[] = [];
  for (const [crewMemberId, list] of byCrew) {
    list.sort((a, b) =>
      a.occurredAt === b.occurredAt
        ? a.id.localeCompare(b.id)
        : a.occurredAt.localeCompare(b.occurredAt),
    );
    // 作業種別ごとの進行中区間（並列に保持する）
    const open = new Map<string, WorkInterval>();
    for (const r of list) {
      const at = new Date(r.occurredAt);
      const current = open.get(r.workCategory);
      if (r.action === "start") {
        if (current) {
          // 同一種別の開始が続いた: 直前の区間を新しい開始時刻で閉じる（連続扱い）
          current.endAt = at;
          current.endRecordId = r.id;
          intervals.push(current);
        }
        open.set(r.workCategory, {
          crewMemberId,
          workCategory: r.workCategory,
          startAt: at,
          endAt: null,
          startRecordId: r.id,
        });
      } else if (current) {
        current.endAt = at;
        current.endRecordId = r.id;
        intervals.push(current);
        open.delete(r.workCategory);
      }
      // 対応する開始のない終了打刻は無視
    }
    for (const iv of open.values()) intervals.push(iv); // 進行中区間（複数可）
  }
  intervals.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return intervals;
}

/** 区間 [aStart,aEnd) と [bStart,bEnd) の重なり（分） */
export function overlapMinutes(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): number {
  const s = Math.max(aStart.getTime(), bStart.getTime());
  const e = Math.min(aEnd.getTime(), bEnd.getTime());
  return e > s ? Math.round((e - s) / 60000) : 0;
}

/**
 * 区間の和集合（重なりを1回だけ数える）。
 * 並列作業でも「同時刻に2倍働いた」とはならないよう、労働時間の合計はこの和集合で求める。
 */
export function mergeRanges(
  ranges: { start: Date; end: Date }[],
): { start: Date; end: Date }[] {
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: { start: Date; end: Date }[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start.getTime() <= last.end.getTime()) {
      if (r.end.getTime() > last.end.getTime()) last.end = r.end;
    } else {
      merged.push({ start: r.start, end: r.end });
    }
  }
  return merged;
}
