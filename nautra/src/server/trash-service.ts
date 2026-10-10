import { SHORE_PLANNER_ID } from "@/lib/crew";
import { trashedIdsOf } from "@/lib/trash";
import { carryOverFields } from "@/lib/master-fields";
import { COMPANY_SCOPE_ID } from "@/lib/seed-masters";
import { unretireCrewMaster } from "@/server/crew-master-service";
import { effective, publishMaster, todayLocal, writeAuditLog } from "@/server/master-service";
import { enableShoreUser } from "@/server/shore-user-service";
import type { TrashEntryPayload, TrashMode } from "@/sync-protocol/masters";

/**
 * S-18 削除・アーカイブ（デザイン正本 `design/poc_design`）。
 *
 * このアプリで「消す」は**見え方を変える操作**で、一次記録は消えない
 * （打刻・日次レコード・届出は法定保存期間のあいだ残る。要件定義書 12 / ガードレール②）。
 * だから削除は取り消せるべきで、**30日間は元に戻せる**枠を用意する。
 * 復元も追記（supersedesId 付きの新レコード）で表し、操作の履歴を消さない。
 */

/** 復元できる期間（日）。デザインの「30日以内なら元に戻せます」 */
export const RESTORE_WINDOW_DAYS = 30;

export const TRASH_MODE_LABEL: Record<TrashMode, string> = {
  archive: "アーカイブ（一覧から隠す）",
  disable: "無効化（ログイン・配乗から外す）",
  delete: "削除",
};

/**
 * 種別ごとの「消すとどうなるか」。削除ダイアログと S-18 の説明が
 * 食い違わないよう、文言はここだけに置く（画面ごとに書き分けない）。
 */
export const DELETE_RULES: { kind: string; effects: string[]; advice: string }[] = [
  {
    kind: "船舶",
    effects: [
      "配乗計画・シフト・証書期限の紐付けが解除されます",
      "過去の労務記録簿と届出は法定保存期間のあいだ残ります",
    ],
    advice: "運航終了のアーカイブを推奨（一覧から隠れ、記録は参照可）",
  },
  {
    kind: "船員",
    effects: [
      "配乗・当直シフト・未完了タスクから外れます",
      "打刻と日次レコードは改変できないため残ります",
    ],
    advice: "退職・下船は「無効化」で扱うのが原則です",
  },
  {
    kind: "ユーザー",
    effects: [
      "ただちにログインできなくなります",
      "その人が行った承認・書き出しの監査ログは残ります",
    ],
    advice: "一時的な停止は「無効化」を使ってください",
  },
  {
    kind: "作業タスク",
    effects: ["割り当てが取り消され、船内の一覧から消えます", "完了報告済みの作業は記録として残ります"],
    advice: "着手済みの作業は完了にしてから消すと履歴が残ります",
  },
  {
    kind: "当直シフト",
    effects: ["配信前の下書きは船内に届きません", "配信済みの当直は取り消しの配信として船内に伝わります"],
    advice: "配信済みのものは削除ではなく「変更の配信」で直します",
  },
];

export function deleteRuleFor(kind: string) {
  return DELETE_RULES.find((r) => r.kind === kind) ?? null;
}

export interface TrashRow {
  entry: TrashEntryPayload;
  /** 復元できる残り日数（0以下なら期限切れ） */
  daysLeft: number;
  restorable: boolean;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from.slice(0, 10)}T00:00:00`);
  const b = new Date(`${to.slice(0, 10)}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function listTrash(now = new Date()): TrashRow[] {
  const today = todayLocal(now);
  return effective("trash_entry")
    .slice()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .map((entry) => {
      const daysLeft = daysBetween(today, entry.restorableUntil);
      return { entry, daysLeft, restorable: !entry.restoredAt && daysLeft > 0 };
    });
}

/**
 * いま「消えている」ことになっている対象のID。
 *
 * 実体（船員・作業・船舶）は追記型なので消せない。一覧から外すかどうかは
 * **この集合だけ**で決める。画面ごとに条件を書くと、復元したのに片方の画面に
 * 出てこない、といったずれが起きるため。
 */
export function trashedEntityIds(kind?: string): Set<string> {
  return trashedIdsOf(effective("trash_entry"), kind);
}

export interface RecordDeletionInput {
  entityKind: string;
  entityId: string;
  entityLabel: string;
  mode: TrashMode;
  action: string;
  effect?: string;
  actor?: string;
  now?: Date;
}

/** 削除・無効化を記録する（実体の状態変更は各サービスが行い、ここは「跡」を残す） */
export function recordDeletion(input: RecordDeletionInput): TrashEntryPayload {
  const now = input.now ?? new Date();
  const until = new Date(now);
  until.setDate(until.getDate() + RESTORE_WINDOW_DAYS);
  const entry = publishMaster(
    "trash_entry",
    {
      entityKind: input.entityKind,
      entityId: input.entityId,
      entityLabel: input.entityLabel,
      mode: input.mode,
      action: input.action,
      effect: input.effect,
      restorableUntil: todayLocal(until),
    },
    { vesselId: COMPANY_SCOPE_ID, actor: input.actor, now },
  );
  writeAuditLog({
    action: "update",
    entityKind: input.entityKind,
    entityId: input.entityId,
    after: TRASH_MODE_LABEL[input.mode],
    actor: input.actor,
    summary: `${input.entityLabel} を${input.action}`,
    now,
  });
  return entry;
}

/** 復元（追記で表す。元の削除記録は残したまま「戻した」ことを足す） */
export function restoreTrash(entryId: string, actor?: string, now = new Date()): TrashEntryPayload {
  const current = effective("trash_entry").find((t) => t.id === entryId);
  if (!current) throw new Error("この記録は見つかりませんでした（更新済みの可能性があります）");
  if (current.restoredAt) throw new Error("すでに復元されています");
  if (daysBetween(todayLocal(now), current.restorableUntil) <= 0) {
    throw new Error(`復元できる期間（${RESTORE_WINDOW_DAYS}日）を過ぎています`);
  }
  const restored = publishMaster(
    "trash_entry",
    {
      ...carryOverFields(current as unknown as Record<string, unknown>),
      restoredAt: now.toISOString(),
    },
    { vesselId: COMPANY_SCOPE_ID, supersedesId: current.id, actor, now },
  );
  /**
   * 実体の側にも状態を持つ種別は、ここで元へ戻す。
   * **復元の入口を1つにする**ため（種別ごとに別のボタンを置くと、戻したつもりで
   * 片方だけ戻っている状態が生まれる）。作業・当直シフトは trash_entry だけで
   * 見え方が決まるので、ここでは何もしなくてよい。
   */
  if (current.entityKind === "船員") {
    unretireCrewMaster(current.entityId, actor ?? SHORE_PLANNER_ID, now);
  }
  if (current.entityKind === "ユーザー") {
    enableShoreUser(current.entityId, actor ?? SHORE_PLANNER_ID, now);
  }

  writeAuditLog({
    action: "update",
    entityKind: current.entityKind,
    entityId: current.entityId,
    after: "復元",
    actor,
    summary: `${current.entityLabel} を復元した`,
    now,
  });
  return restored;
}
