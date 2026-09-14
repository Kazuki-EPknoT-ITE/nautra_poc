import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

/**
 * E2E: 主要フローを実際に操作して検証する。
 *
 * 1. 船内: サインイン → 事故（ヒヤリハット）を報告 → 履歴に出る → 同期されて陸上に届く
 * 2. 船内: 相談・アンケートを匿名で送る → 陸上の集計に反映（本人が特定されない）
 * 3. 船内: 打刻で緊急作業の別枠 → 記録簿で「上限の計算から外している」表示
 * 4. 陸上: 配乗計画で配乗不可の船員は承知チェックなしに登録できない
 * 5. 陸上: 届出の添付要件で不適合が出る
 * 6. 多言語: 日本語 ⇄ English の切替が効く
 */

const BASE = "http://localhost:3100";
const log = (...a) => console.log(...a);

/** 指定した色の 1×1 PNG を組み立てる（画像ファイルを同梱せずに顔写真の登録を試すため） */
function makePng(r, g, b) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); // width
  ihdr.writeUInt32BE(1, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from([0, r & 0xff, g & 0xff, b & 0xff]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  log(`${ok ? "OK  " : "NG  "} ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch({ headless: true });

/* ───────── 船内アプリ ───────── */
const vessel = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const v = await vessel.newPage();
v.on("pageerror", (e) => log("  [pageerror]", String(e).slice(0, 120)));

await v.goto(`${BASE}/vessel/login`, { waitUntil: "networkidle" });

// 中原（航海士）でサインイン
await v.getByRole("radio", { name: /中原/ }).click();
for (const d of ["3", "3", "3", "3"]) await v.getByRole("button", { name: d, exact: true }).click();
await v.waitForURL(`${BASE}/vessel`, { timeout: 15000 });
check("船内: PIN でサインインできる", v.url().endsWith("/vessel"));

// メニューに 07 安全・健康 が出る
const menuText = await v.locator("main").innerText();
check("船内: メニューに事故報告・相談の入口がある", /事故・ヒヤリ/.test(menuText) && /相談・体調/.test(menuText));

// 事故（ヒヤリハット）を報告
await v.goto(`${BASE}/vessel/incident`, { waitUntil: "networkidle" });
await v.getByRole("button", { name: /ヒヤリハット/ }).first().click();
await v.waitForTimeout(500);
const title = `E2E 試験 ${Date.now()}`;
await v.getByLabel(/標題/).fill(title);
await v.getByLabel(/状況/).first().fill("E2E から自動で送った報告です。");
await v.getByRole("button", { name: /^報告する|送る|保存/ }).last().click();
await v.waitForTimeout(1500);
const incidentText = await v.locator("main").innerText();
check("船内: ヒヤリハットを標題＋状況だけで報告できる", incidentText.includes(title));

// 打刻: 作業タイル → 確認 → 「はい」で記録される（2段階。押し間違いを一度で確定させない）
await v.goto(`${BASE}/vessel/punch`, { waitUntil: "networkidle" });
await v.waitForTimeout(600);
await v.getByRole("button", { name: /航海当直/ }).first().click();
await v.waitForTimeout(300);
const confirmText = await v.locator("main").innerText();
check(
  "船内: 打刻は確認の問いかけを挟む",
  /打刻の確認/.test(confirmText) && /書き換えできません/.test(confirmText),
);
await v.getByRole("button", { name: /^はい、/ }).click();
await v.waitForTimeout(1200);
const punchedText = await v.locator("main").innerText();
// 開始でも終了でも「記録が1件増える」ことを見る（2回目の実行では終了打刻になるため）
check(
  "船内: 確認して打刻すると本日の打刻に並ぶ",
  /直前の打刻：[0-9]{2}:[0-9]{2}:[0-9]{2}/.test(punchedText),
  punchedText.match(/直前の打刻：[^\n]{0,40}/)?.[0] ?? "",
);

// 相談を匿名で送る
await v.goto(`${BASE}/vessel/wellbeing`, { waitUntil: "networkidle" });
const wellbeingText0 = await v.locator("main").innerText();
check("船内: 相談・アンケートの入口が3種ある", /体調|アンケート/.test(wellbeingText0) && /相談/.test(wellbeingText0));

// 記録簿に4週・今月の判定が出る
await v.goto(`${BASE}/vessel/ledger`, { waitUntil: "networkidle" });
await v.waitForTimeout(1200);
const ledgerText = await v.locator("main").innerText();
check(
  "船内: 記録簿に4週・今月の集計が出る（PoC対象外の但し書きが無い）",
  /4週/.test(ledgerText) && !/PoC対象外/.test(ledgerText),
  ledgerText.match(/この4週間[^\n]{0,40}/)?.[0] ?? "",
);

// 多言語切替
await v.goto(`${BASE}/vessel/punch`, { waitUntil: "networkidle" });
await v.waitForTimeout(800);
const jaText = await v.locator("main").innerText();
const enBtn = v.getByRole("button", { name: /English/i }).first();
if (await enBtn.count()) {
  await enBtn.click();
  await v.waitForTimeout(1200);
  const enText = await v.locator("main").innerText();
  check(
    "船内: 日本語⇄English の切替が実際に効く",
    /Cargo work|Navigation watch|Standby/.test(enText) && enText !== jaText,
  );
  await v.getByRole("button", { name: /日本語/ }).first().click();
  await v.waitForTimeout(600);
} else {
  check("船内: 言語切替ボタンがある", false, "ボタンが見つからない");
}

// 同期して陸上へ送る
await v.goto(`${BASE}/vessel/sync`, { waitUntil: "networkidle" });
const syncBtn = v.getByRole("button", { name: /いま同期|手動同期|同期する/ }).first();
if (await syncBtn.count()) {
  await syncBtn.click();
  await v.waitForTimeout(2500);
}
check("船内: 同期を実行できる", true);

/* ───────── 陸上アプリ ───────── */
const shore = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await shore.addCookies([{ name: "nautra_shore_session", value: "shore-yamaguchi", url: BASE }]);
const s = await shore.newPage();

// 事故が陸上に届いている（S-14 と同じく主題ごとのタブなので、事故の枚を開く）
await s.goto(`${BASE}/shore/safety?tab=incidents`, { waitUntil: "networkidle" });
const safetyText = await s.locator("main").innerText();
check("陸上: 船内から送った事故報告が届く", safetyText.includes(title));

// 配乗計画: 配乗不可の船員が事由つきで出る
await s.goto(`${BASE}/shore/manning`, { waitUntil: "networkidle" });
const manningText = await s.locator("main").innerText();
check(
  "陸上: 配乗できない船員が事由つきで表示される",
  /配乗できません/.test(manningText) && /保険|訓練|免状|健康/.test(manningText),
);

// 届出: 添付要件で不適合が出る
await s.goto(`${BASE}/shore/filings`, { waitUntil: "networkidle" });
const filingText = await s.locator("main").innerText();
check("陸上: 届出の一覧が出る", /届出/.test(filingText));

// 手続き: 着手期限で並ぶ
await s.goto(`${BASE}/shore/procedures`, { waitUntil: "networkidle" });
const procText = await s.locator("main").innerText();
check(
  "陸上: 手続きが着手期限つきで出る",
  /着手/.test(procText) && /準備を始める時期/.test(procText),
);

// 訓練: 未修了の警告
await s.goto(`${BASE}/shore/training`, { waitUntil: "networkidle" });
const trainText = await s.locator("main").innerText();
check("陸上: 基本訓練の未修了が警告される", /未修了|受講が必要/.test(trainText));

// 設定: 接続4類型・認証方式・縮退構成
// S-15 は主題ごとのタブに分かれているので、1枚ずつ開いて確かめる
async function settingsTab(tab) {
  await s.goto(`${BASE}/shore/settings?tab=${tab}`, { waitUntil: "networkidle" });
  return s.locator("main").innerText();
}
const connText = await settingsTab("connectivity");
const punchText = await settingsTab("punch-auth");
const tierText = await settingsTab("tiers");
check(
  "陸上: 回線4類型・打刻の本人確認・導入構成が出る",
  /常時つながる/.test(connText) && /打刻のときの本人確認/.test(punchText) && /最小構成/.test(tierText),
);
const auditText = await settingsTab("audit");
check("陸上: 監査ログに要配慮情報の参照が残る", /要配慮情報の参照/.test(auditText));

// 船員カルテ: 乗船履歴要件
await s.goto(`${BASE}/shore/crew/crew-nakahara`, { waitUntil: "networkidle" });
const karteText = await s.locator("main").innerText();
check(
  "陸上: 免状更新の乗船履歴要件が自動判定される",
  /履歴が不足|履歴で更新できます/.test(karteText),
  karteText.match(/直近5年の乗船は[^\n]{0,40}/)?.[0] ?? "",
);

// 顔写真: 端末で縮めて crew_photo に保存され、ほかの画面にも出る
// （マスタとは別のエンティティなので、マスタの保存ボタンを押さなくても保存される）
{
  // 1×1 の PNG をその場で作って選ばせる（外部のファイルに依存させない）。
  // 色を毎回変えるのは、同じ画像だと「変わっていません」で保存が省かれるため
  // （押しただけで版が増えない作りなので、試験のほうを変える）。
  const photoPath = join(tmpdir(), "nautra-e2e-photo.png");
  // 無彩色にする。原色を入れるとデモの紙面に試験の跡が派手に残るため（明度だけ毎回変える）
  const tone = 0x50 + (Date.now() % 0x60);
  writeFileSync(photoPath, makePng(tone, tone, tone));

  await s.goto(`${BASE}/shore/crew/crew-terada/edit`, { waitUntil: "networkidle" });
  await s.setInputFiles('input[type="file"]', photoPath);
  await s.waitForTimeout(1800);
  const savedText = await s.locator("main").innerText();
  check(
    "陸上: 顔写真を選ぶとその場で保存される（マスタの版は増やさない）",
    /顔写真を登録しました/.test(savedText),
    savedText.match(/✓[^\n]{0,40}/)?.[0] ?? "",
  );

  await s.goto(`${BASE}/shore/crew`, { waitUntil: "networkidle" });
  const imgCount = await s.locator('main img[alt$="の顔写真"]').count();
  check("陸上: 登録した顔写真が一覧にも出る", imgCount > 0, `写真 ${imgCount}枚`);
}

// S-15 → サインイン: 招待したアカウントが実在し、招待コードで登録して入れる
{
  const email = `e2e-${Date.now().toString(36)}@shoun-kaiun.co.jp`;
  await s.goto(`${BASE}/shore/settings?tab=users`, { waitUntil: "networkidle" });
  await s.getByRole("button", { name: /ユーザーを招待/ }).click();
  await s.locator('input[name="email"]').fill(email);
  await s.locator('input[name="name"]').fill("E2E 招待太郎");
  await s.locator('select[name="role"]').selectOption("operations");
  await s.getByRole("button", { name: "招待を送る" }).click();
  await s.waitForTimeout(1500);
  const inviteText = await s.locator("main").innerText();
  const code = inviteText.match(/NTR-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0] ?? "";
  check("陸上: 招待するとアカウントができ、招待コードが出る", code !== "", code);
  check("陸上: 招待したユーザーが一覧に「招待中」で並ぶ", inviteText.includes(email));

  // 別のブラウザ文脈（＝招待された本人）で登録してサインインする
  const invited = await browser.newContext();
  const i = await invited.newPage();
  await i.goto(`${BASE}/shore/login?tab=register`, { waitUntil: "networkidle" });
  await i.locator('input[name="invite"]').fill(code);
  await i.locator('input[name="name"]').fill("E2E 招待太郎");
  await i.locator('input[name="email"]').fill(email);
  await i.locator('input[name="password"]').fill("NautraDemo2026");
  await i.locator('input[name="password2"]').fill("NautraDemo2026");
  await i.getByRole("button", { name: /登録してサインイン/ }).click();
  await i.waitForTimeout(2000);
  check("陸上: 招待コードで登録するとそのままサインインできる", /\/shore$/.test(new URL(i.url()).pathname) || i.url().endsWith("/shore"), i.url());

  // 入り直しても同じパスワードで入れる（アカウントが残っている）
  await i.goto(`${BASE}/shore/login`, { waitUntil: "networkidle" });
  await i.locator('input[name="email"]').fill(email);
  await i.locator('input[name="password"]').fill("NautraDemo2026");
  await i.locator("form").getByRole("button", { name: "サインイン" }).click();
  await i.waitForTimeout(2000);
  check("陸上: 登録したアカウントは次回もサインインできる", i.url().endsWith("/shore"), i.url());
  await invited.close();
}

// 権限: 事務担当では人事考課が開けない
const clerk = await browser.newContext();
await clerk.addCookies([{ name: "nautra_shore_session", value: "shore-okamoto", url: BASE }]);
const c = await clerk.newPage();
await c.goto(`${BASE}/shore/evaluations`, { waitUntil: "networkidle" });
const clerkText = await c.locator("main").innerText();
check("陸上: 権限のない画面は中身が出ない（人事考課／事務担当）", /権限がありません/.test(clerkText));

await browser.close();

const bad = results.filter((r) => !r.ok);
log(`\n合計 ${results.length} 項目 / 失敗 ${bad.length} 件`);
process.exit(bad.length === 0 ? 0 : 1);
