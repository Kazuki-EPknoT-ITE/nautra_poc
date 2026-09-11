import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * S-16 作業指示 / S-18 削除・アーカイブ。
 *
 * 見張りたいのは2点:
 * - **消したものが消えていない**こと（削除は見え方の操作で、実体は追記型のまま残る）
 * - **状態の変更が追記**であること（書き換えると誰がいつ進めたかが失われる）
 *
 * ストアは `process.cwd()/.data/store.json` に永続化されるため、
 * 一時ディレクトリへ移ってからサービスを読み込み、開発用のデモストアを汚さない。
 */

type TaskService = typeof import("@/server/task-service");
type TrashService = typeof import("@/server/trash-service");
type MasterService = typeof import("@/server/master-service");

let tasks: TaskService;
let trash: TrashService;
let ms: MasterService;
const ACTOR = "shore-yamaguchi";

beforeAll(async () => {
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "nautra-store-")));
  ms = await import("@/server/master-service");
  tasks = await import("@/server/task-service");
  trash = await import("@/server/trash-service");
});

describe("S-16 作業指示（追記型・付け替えは supersedesId）", () => {
  it("割り当てた作業は未着手で一覧に出る", () => {
    const before = tasks.listTasks().length;
    const task = tasks.assignTask({
      title: "E2E 試験用の作業",
      assigneeCrewId: "crew-takamatsu",
      targetVesselId: "vessel-001",
      dueAt: "2026-12-01",
      actor: ACTOR,
    });
    expect(task.state).toBe("todo");
    const rows = tasks.listTasks();
    expect(rows.length).toBe(before + 1);
    expect(rows.find((r) => r.task.id === task.id)?.assigneeName).toBe("高松 誠");
  });

  it("状態を進めても元のレコードは残る（書き換えではなく追記）", () => {
    const task = tasks.assignTask({
      title: "状態遷移の確認",
      targetVesselId: "vessel-001",
      actor: ACTOR,
    });
    const doing = tasks.advanceTask(task.id, ACTOR);
    expect(doing.state).toBe("doing");
    expect(doing.supersedesId).toBe(task.id);

    const done = tasks.advanceTask(doing.id, ACTOR);
    expect(done.state).toBe("done");

    // 有効なのは最新の1件だけ。古い版は履歴として残っている
    const alive = ms.effective("work_task").filter((t) => t.title === "状態遷移の確認");
    expect(alive).toHaveLength(1);
    expect(ms.history("work_task").filter((t) => t.title === "状態遷移の確認").length).toBe(3);
  });
});

describe("S-18 削除・アーカイブ（一次記録は消えない）", () => {
  it("削除しても実体は残り、一覧から外れるだけ", () => {
    const task = tasks.assignTask({
      title: "削除される作業",
      targetVesselId: "vessel-001",
      actor: ACTOR,
    });
    trash.recordDeletion({
      entityKind: "作業タスク",
      entityId: task.id,
      entityLabel: task.title,
      mode: "delete",
      action: "タスクを削除",
      actor: ACTOR,
    });

    // 一覧からは消える
    expect(tasks.listTasks().some((r) => r.task.id === task.id)).toBe(false);
    // しかしレコードそのものは残っている（12 正本管理・監査証跡）
    expect(ms.effective("work_task").some((t) => t.id === task.id)).toBe(true);
  });

  it("30日以内なら復元でき、復元も追記で記録される", () => {
    const task = tasks.assignTask({
      title: "復元される作業",
      targetVesselId: "vessel-001",
      actor: ACTOR,
    });
    const entry = trash.recordDeletion({
      entityKind: "作業タスク",
      entityId: task.id,
      entityLabel: task.title,
      mode: "delete",
      action: "タスクを削除",
      actor: ACTOR,
    });
    expect(tasks.listTasks().some((r) => r.task.id === task.id)).toBe(false);

    const restored = trash.restoreTrash(entry.id, ACTOR);
    expect(restored.restoredAt).toBeTruthy();
    expect(restored.supersedesId).toBe(entry.id);
    expect(tasks.listTasks().some((r) => r.task.id === task.id)).toBe(true);
  });

  it("復元は一度だけ（二重復元は弾く）", () => {
    const entry = trash.recordDeletion({
      entityKind: "ユーザー",
      entityId: "shore-dummy",
      entityLabel: "試験用ユーザー",
      mode: "disable",
      action: "招待を取り消し",
      actor: ACTOR,
    });
    const restored = trash.restoreTrash(entry.id, ACTOR);
    expect(() => trash.restoreTrash(restored.id, ACTOR)).toThrow(/すでに復元/);
  });

  it("削除の跡は監査ログにも残る（12.6）", () => {
    const task = tasks.assignTask({
      title: "監査ログ確認用",
      targetVesselId: "vessel-001",
      actor: ACTOR,
    });
    trash.recordDeletion({
      entityKind: "作業タスク",
      entityId: task.id,
      entityLabel: task.title,
      mode: "delete",
      action: "タスクを削除",
      actor: ACTOR,
    });
    const log = ms.listAuditLogs(200).find((a) => a.entityId === task.id && a.action === "update");
    expect(log?.summary).toContain("監査ログ確認用");
  });
});
