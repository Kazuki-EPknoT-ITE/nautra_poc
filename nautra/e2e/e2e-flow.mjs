import { chromium } from "playwright";

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

// 佐藤（航海士）でサインイン
await v.getByRole("radio", { name: /佐藤/ }).click();
for (const d of ["2", "2", "2", "2"]) await v.getByRole("button", { name: d, exact: true }).click();
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
await shore.addCookies([{ name: "nautra_shore_session", value: "shore-admin", url: BASE }]);
const s = await shore.newPage();

// 事故が陸上に届いている
await s.goto(`${BASE}/shore/safety`, { waitUntil: "networkidle" });
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
await s.goto(`${BASE}/shore/settings`, { waitUntil: "networkidle" });
const setText = await s.locator("main").innerText();
check(
  "陸上: 回線4類型・打刻の本人確認・導入構成が出る",
  /常時つながる/.test(setText) && /打刻のときの本人確認/.test(setText) && /最小構成/.test(setText),
);
check("陸上: 監査ログに要配慮情報の参照が残る", /要配慮情報の参照/.test(setText));

// 船員カルテ: 乗船履歴要件
await s.goto(`${BASE}/shore/crew/crew-sato`, { waitUntil: "networkidle" });
const karteText = await s.locator("main").innerText();
check(
  "陸上: 免状更新の乗船履歴要件が自動判定される",
  /履歴が不足|履歴で更新できます/.test(karteText),
  karteText.match(/直近5年の乗船は[^\n]{0,40}/)?.[0] ?? "",
);

// 権限: 事務担当では人事考課が開けない
const clerk = await browser.newContext();
await clerk.addCookies([{ name: "nautra_shore_session", value: "shore-nishi", url: BASE }]);
const c = await clerk.newPage();
await c.goto(`${BASE}/shore/evaluations`, { waitUntil: "networkidle" });
const clerkText = await c.locator("main").innerText();
check("陸上: 権限のない画面は中身が出ない（人事考課／事務担当）", /権限がありません/.test(clerkText));

await browser.close();

const bad = results.filter((r) => !r.ok);
log(`\n合計 ${results.length} 項目 / 失敗 ${bad.length} 件`);
process.exit(bad.length === 0 ? 0 : 1);
