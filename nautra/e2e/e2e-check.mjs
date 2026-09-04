import { chromium } from "playwright";

/**
 * E2E: 全画面を巡回し、コンソールエラー（ハイドレーション不整合を含む）を検出する。
 * ref/E2E_TESTING.md の「主要フローをブラウザで検証する」に対応。
 */

const BASE = "http://localhost:3100";

const SHORE = [
  "/shore",
  "/shore/crew",
  "/shore/crew/crew-sato",
  "/shore/crew/crew-sato/edit",
  "/shore/crew/crew-sato/credentials",
  "/shore/manning",
  "/shore/filings",
  "/shore/procedures",
  "/shore/training",
  "/shore/shifts",
  "/shore/fleet",
  "/shore/dispatch",
  "/shore/safety",
  "/shore/wellbeing",
  "/shore/evaluations",
  "/shore/office",
  "/shore/documents",
  "/shore/labor",
  "/shore/templates",
  "/shore/notices",
  "/shore/settings",
];

const VESSEL = [
  "/vessel/login",
  "/vessel",
  "/vessel/punch",
  "/vessel/ledger",
  "/vessel/approve",
  "/vessel/logbook",
  "/vessel/maintenance",
  "/vessel/safety",
  "/vessel/shift",
  "/vessel/work",
  "/vessel/sync",
  "/vessel/incident",
  "/vessel/wellbeing",
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

// 陸上は管理者でサインイン済みにする（権限ガードで中身が出ない画面を避ける）
await context.addCookies([
  { name: "nautra_shore_session", value: "shore-admin", url: BASE },
]);

const results = [];

async function visit(path, label) {
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  let status = 0;
  try {
    const res = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
    status = res?.status() ?? 0;
    await page.waitForTimeout(400); // ハイドレーション後のエラーを拾う
  } catch (e) {
    errors.push(`navigation: ${String(e).slice(0, 150)}`);
  }
  /*
   * 本文の読み取りは、遷移が走っている最中だと実行文脈ごと壊れる
   * （未サインインで /vessel を開くと /vessel/login へ飛ぶ、など）。
   * 落ち着くのを待ってから読み、それでも駄目なら本文なしとして先へ進める
   * （ここで測りたいのは HTTP と console のエラーであって、本文ではない）。
   */
  let text = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
      text = await page.evaluate(() => document.body?.innerText?.slice(0, 400) ?? "");
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  results.push({ label, path, status, errors, sample: text.replace(/\s+/g, " ").slice(0, 120) });
  await page.close();
}

for (const p of SHORE) await visit(p, "陸上");
for (const p of VESSEL) await visit(p, "船内");

await browser.close();

let bad = 0;
for (const r of results) {
  const ok = r.status === 200 && r.errors.length === 0;
  if (!ok) bad++;
  console.log(
    `${ok ? "OK  " : "NG  "} ${String(r.status).padEnd(3)} ${r.path.padEnd(34)} ${
      r.errors.length ? "errors=" + r.errors.length : ""
    }`,
  );
  for (const e of r.errors.slice(0, 2)) console.log(`        ! ${e}`);
}
console.log(`\n合計 ${results.length} 画面 / 問題 ${bad} 件`);
process.exit(bad === 0 ? 0 : 1);
