import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { SHORE_ROLES } from "@/domain/authz/shore-roles";
import { SHORE_USER_ROLES } from "@/sync-protocol/masters";

/**
 * 陸上アプリのアカウント（要件定義書 10.3 / デザイン正本 S-15・サインイン画面）。
 *
 * ここで見張るのは「招待が**本物のアカウント**になっているか」。
 * 招待しただけで一覧に出ない・サインインできない状態に戻ると、
 * 「送ったのに使えない」が区別できなくなる。
 *
 * ストアは `process.cwd()/.data/store.json` に永続化されるため、
 * **一時ディレクトリへ移ってから**サービスを読み込み、開発用のデモストアを汚さない。
 */

type Svc = typeof import("@/server/shore-user-service");
type Trash = typeof import("@/server/trash-service");

let svc: Svc;
let trash: Trash;
const ADMIN = "shore-yamaguchi";
const STRONG = "NautraDemo2026";

beforeAll(async () => {
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "nautra-user-")));
  svc = await import("@/server/shore-user-service");
  trash = await import("@/server/trash-service");
});

describe("ロールの二重定義", () => {
  it("同期スキーマのロールは domain の権限表と同じ並び", () => {
    // sync-protocol は domain を import しない（配信の型が判定に依存しないように）。
    // そのぶん、ずれていないことをここで確かめる。
    expect([...SHORE_USER_ROLES]).toEqual(SHORE_ROLES);
  });
});

describe("アカウントの一覧（種 + ストア）", () => {
  it("デモの種はそのまま出て、合言葉でサインインできる", () => {
    const users = svc.listShoreUsers();
    expect(users.map((u) => u.id)).toContain("shore-taniguchi");
    const signed = svc.authenticateShoreUser("taniguchi@shoun-kaiun.co.jp", "nautra-demo");
    expect(signed?.name).toBe("谷口 亮子");
  });

  it("種の招待中アカウントは一覧に出るが、サインインはできない", () => {
    const shintani = svc.shoreUserByEmail("shintani@shoun-kaiun.co.jp");
    expect(shintani?.status).toBe("invited");
    expect(shintani?.inviteCode).toBe("NTR-8F42-QK19");
    expect(svc.authenticateShoreUser("shintani@shoun-kaiun.co.jp", "nautra-demo")).toBeNull();
  });

  it("無効化されたアカウントはサインインできない", () => {
    expect(svc.shoreUserByEmail("okada@shoun-kaiun.co.jp")?.status).toBe("disabled");
    expect(svc.authenticateShoreUser("okada@shoun-kaiun.co.jp", STRONG)).toBeNull();
  });
});

describe("招待 → 登録（S-15 → サインイン画面）", () => {
  it("招待するとアカウントができ、招待コードで登録するとサインインできる", () => {
    const { user, inviteCode } = svc.inviteShoreUser({
      email: "Hayashi@shoun-kaiun.co.jp",
      role: "operations",
      name: "林 佳奈",
      scope: "all",
      actor: ADMIN,
    });
    // メールは正規化して保持する（大文字で招待しても本人は小文字で入れる）
    expect(user.email).toBe("hayashi@shoun-kaiun.co.jp");
    expect(user.status).toBe("invited");
    expect(inviteCode).toMatch(/^NTR-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    // 一覧に出る（「送ったのに返事がない」が見える）
    expect(svc.listShoreUsers().some((u) => u.email === "hayashi@shoun-kaiun.co.jp")).toBe(true);
    // 登録前はサインインできない
    expect(svc.authenticateShoreUser("hayashi@shoun-kaiun.co.jp", STRONG)).toBeNull();

    const activated = svc.activateShoreUser({
      email: "hayashi@shoun-kaiun.co.jp",
      inviteCode,
      password: STRONG,
      name: "林 佳奈",
    });
    expect(activated.status).toBe("active");
    // ロールは招待した管理者が決めたまま動かない
    expect(activated.role).toBe("operations");

    const signed = svc.authenticateShoreUser("hayashi@shoun-kaiun.co.jp", STRONG);
    expect(signed?.id).toBe(user.id);
    expect(svc.authenticateShoreUser("hayashi@shoun-kaiun.co.jp", "違うパスワード")).toBeNull();
  });

  it("使い終わった招待コードでは二人目が登録できない", () => {
    const { inviteCode } = svc.inviteShoreUser({
      email: "once@shoun-kaiun.co.jp",
      role: "clerk",
      actor: ADMIN,
    });
    svc.activateShoreUser({ email: "once@shoun-kaiun.co.jp", inviteCode, password: STRONG });
    expect(() =>
      svc.activateShoreUser({ email: "once@shoun-kaiun.co.jp", inviteCode, password: STRONG }),
    ).toThrow(/招待コード/);
  });

  it("弱いパスワードは受け付けない（画面の注記と同じ条件）", () => {
    const { inviteCode } = svc.inviteShoreUser({
      email: "weak@shoun-kaiun.co.jp",
      role: "clerk",
      actor: ADMIN,
    });
    expect(() =>
      svc.activateShoreUser({ email: "weak@shoun-kaiun.co.jp", inviteCode, password: "short" }),
    ).toThrow(/12文字以上/);
    expect(svc.checkPasswordStrength("alllowercase123")).not.toBeNull();
    expect(svc.checkPasswordStrength("NoDigitsHereAtAll")).not.toBeNull();
    expect(svc.checkPasswordStrength(STRONG)).toBeNull();
  });

  it("同じメールを二重に招待しない", () => {
    expect(() =>
      svc.inviteShoreUser({ email: "hayashi@shoun-kaiun.co.jp", role: "clerk", actor: ADMIN }),
    ).toThrow(/すでに登録/);
  });

  it("メールの形が正しくないものは弾く", () => {
    expect(() => svc.inviteShoreUser({ email: "not-an-email", role: "clerk", actor: ADMIN })).toThrow(
      /メールアドレス/,
    );
  });

  it("知らないロールでは招待できない", () => {
    expect(() =>
      svc.inviteShoreUser({ email: "role@shoun-kaiun.co.jp", role: "captain", actor: ADMIN }),
    ).toThrow(/ロール/);
  });
});

describe("パスワードの保管（10.3 / 12.6）", () => {
  it("平文はストアに残らない", () => {
    const row = svc
      .listShoreUsers()
      .find((u) => u.email === "hayashi@shoun-kaiun.co.jp");
    expect(row).toBeDefined();
    // 自分でパスワードを決めた人は、デモの合言葉を持たない（画面にも出ない）
    expect(row?.demoPassword).toBeUndefined();
    const dump = fs.readFileSync(path.join(process.cwd(), ".data", "store.json"), "utf8");
    expect(dump).not.toContain(STRONG);
    expect(dump).toContain("passwordHash");
  });

  it("監査ログに画像やパスワードではなく、状態の変化だけを残す", async () => {
    const ms = await import("@/server/master-service");
    const logs = ms.listAuditLogs(200).filter((l) => l.entityKind === "shore_user");
    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) {
      expect(JSON.stringify(l)).not.toContain(STRONG);
    }
  });
});

describe("パスワードの再設定", () => {
  it("コードを発行して新しいパスワードを決められる", () => {
    const { resetCode } = svc.requestPasswordReset("hayashi@shoun-kaiun.co.jp");
    expect(resetCode).toMatch(/^RST-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    svc.completePasswordReset({
      email: "hayashi@shoun-kaiun.co.jp",
      resetCode,
      password: "NautraNext2027",
    });
    expect(svc.authenticateShoreUser("hayashi@shoun-kaiun.co.jp", "NautraNext2027")).not.toBeNull();
    expect(svc.authenticateShoreUser("hayashi@shoun-kaiun.co.jp", STRONG)).toBeNull();
    // 使い終わったコードは通らない
    expect(() =>
      svc.completePasswordReset({
        email: "hayashi@shoun-kaiun.co.jp",
        resetCode,
        password: "NautraAgain2028",
      }),
    ).toThrow(/再設定コード/);
  });

  it("有効時間を過ぎたコードは通らない", () => {
    const now = new Date();
    const { resetCode } = svc.requestPasswordReset("once@shoun-kaiun.co.jp", now);
    const later = new Date(now.getTime() + (svc.RESET_CODE_MINUTES + 1) * 60_000);
    expect(() =>
      svc.completePasswordReset({
        email: "once@shoun-kaiun.co.jp",
        resetCode,
        password: "NautraLate2029",
        now: later,
      }),
    ).toThrow(/有効時間/);
  });

  it("登録前のアカウントは再設定ではなく招待コードから登録させる", () => {
    expect(() => svc.requestPasswordReset("shintani@shoun-kaiun.co.jp")).toThrow(/招待コード/);
  });
});

describe("ロール変更・無効化（S-15 → S-18）", () => {
  it("ロールを変えると次の判定からそのロールになる", () => {
    const user = svc.shoreUserByEmail("hayashi@shoun-kaiun.co.jp")!;
    const changed = svc.changeShoreUserRole(user.id, "admin", ADMIN);
    expect(changed.role).toBe("admin");
    expect(svc.shoreUserById(user.id)?.role).toBe("admin");
  });

  it("サインイン中の自分は無効化できない", () => {
    const user = svc.shoreUserByEmail("hayashi@shoun-kaiun.co.jp")!;
    expect(() => svc.disableShoreUser(user.id, user.id)).toThrow(/自分のアカウント/);
  });

  it("無効化するとサインインできなくなり、S-18 から戻すと元に戻る", () => {
    const user = svc.shoreUserByEmail("hayashi@shoun-kaiun.co.jp")!;
    svc.disableShoreUser(user.id, ADMIN);
    expect(svc.authenticateShoreUser("hayashi@shoun-kaiun.co.jp", "NautraNext2027")).toBeNull();

    const entry = trash.recordDeletion({
      entityKind: "ユーザー",
      entityId: user.id,
      entityLabel: `${user.name}（管理者）`,
      mode: "disable",
      action: "無効化",
      actor: ADMIN,
    });
    expect(trash.trashedEntityIds("ユーザー").has(user.id)).toBe(true);

    trash.restoreTrash(entry.id, ADMIN);
    // 復元の入口は S-18 の1つだけ。実体の状態もここで戻る
    expect(svc.shoreUserById(user.id)?.status).toBe("active");
    expect(svc.authenticateShoreUser("hayashi@shoun-kaiun.co.jp", "NautraNext2027")).not.toBeNull();
  });

  it("デモの種のアカウントもロールを変えられる（ストアの上書きが勝つ）", () => {
    svc.changeShoreUserRole("shore-okamoto", "operations", ADMIN);
    expect(svc.shoreUserById("shore-okamoto")?.role).toBe("operations");
    // 合言葉は変えていないのでサインインはそのまま通る
    expect(svc.authenticateShoreUser("okamoto@shoun-kaiun.co.jp", "nautra-demo")).not.toBeNull();
  });
});

describe("配信範囲（8.1）", () => {
  it("陸上ユーザーは船内へ配らない", async () => {
    const { isVesselDistributable } = await import("@/sync-protocol/events");
    expect(isVesselDistributable("shore_user")).toBe(false);
    expect(isVesselDistributable("crew_master")).toBe(true);
    // 未知の種別は落とさない（船内で隔離され、更新後に再処理されるため）
    expect(isVesselDistributable("future_kind")).toBe(true);
  });
});
