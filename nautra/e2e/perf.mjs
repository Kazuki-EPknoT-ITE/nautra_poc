import { chromium } from "playwright";

/**
 * 遷移と初回表示の実測（本番ビルドに対して実行する）。
 *
 * 開発サーバ（npm run dev）は画面ごとにその場でコンパイルするため、ここで測っても
 * 実装の速さは分からない。**必ず npm run preview（本番ビルド）で起動してから**測る。
 *
 *   npm run preview      # 別のシェルで起動しておく
 *   node e2e/perf.mjs
 *
 * 目安: 遷移は 1秒以内、初回表示は 0.8秒以内（2026-09-12 実測で最大 826ms / 708ms）。
 */

const BASE = "http://localhost:3100";
const b = await chromium.launch({ headless: true });

const shore = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await shore.addCookies([{ name: "nautra_shore_session", value: "shore-yamaguchi", url: BASE }]);
const s = await shore.newPage();
await s.goto(`${BASE}/shore`, { waitUntil: "load" });
await s.waitForTimeout(1500); // 画面が落ち着いてから押す（実際の使われかた）

console.log("── 陸上: サイドバーから押して中身が出るまで ──");
for (const [href, sel] of [
  ["/shore/crew", "main table, main a[href^='/shore/crew/']"],
  ["/shore/manning", "main"],
  ["/shore/labor", "main"],
  ["/shore/shifts", "main"],
  ["/shore/fleet", "main"],
  ["/shore/documents", "main"],
  ["/shore/settings", "main"],
  ["/shore/trash", "main"],
  ["/shore", "main"],
]) {
  const link = s.locator(`aside a[href^="${href}"]`).first();
  if ((await link.count()) === 0) continue;
  await link.hover();
  const t = Date.now();
  await link.click();
  await s.waitForURL(`**${href}**`, { timeout: 20000 });
  await s.waitForSelector(sel, { state: "visible" });
  console.log(`  ${href.padEnd(18)} ${Date.now() - t}ms`);
}

const vessel = await b.newContext({ viewport: { width: 1280, height: 900 } });
const v = await vessel.newPage();
await v.goto(`${BASE}/vessel/login`, { waitUntil: "load" });
await v.getByRole("radio", { name: /中原/ }).click();
for (const d of ["3", "3", "3", "3"]) await v.getByRole("button", { name: d, exact: true }).click();
await v.waitForURL(`${BASE}/vessel`, { timeout: 20000 });
await v.waitForTimeout(1500);

console.log("── 船内: 横タブから押して中身が出るまで ──");
for (const href of [
  "/vessel/punch",
  "/vessel/history",
  "/vessel/ledger",
  "/vessel/logbook",
  "/vessel/maintenance",
  "/vessel/shift",
  "/vessel/sync",
  "/vessel",
]) {
  const link = v.locator(`a[href="${href}"]`).first();
  if ((await link.count()) === 0) {
    console.log(`  ${href.padEnd(18)} (リンクが見つからない)`);
    continue;
  }
  const t = Date.now();
  await link.click();
  await v.waitForURL(`**${href}`, { timeout: 20000 });
  await v.waitForSelector("main", { state: "visible" });
  console.log(`  ${href.padEnd(18)} ${Date.now() - t}ms`);
}

console.log("── アプリの行き来 ──");
{
  const t = Date.now();
  await v.locator('a[href="/shore"]').first().click();
  await v.waitForURL("**/shore**", { timeout: 30000 });
  await v.waitForSelector("main", { state: "visible" });
  console.log(`  船内 → 陸上        ${Date.now() - t}ms`);
}
{
  const t = Date.now();
  await s.locator('aside a[href="/vessel"]').first().click();
  await s.waitForURL("**/vessel**", { timeout: 30000 });
  await s.waitForSelector("main", { state: "visible" });
  console.log(`  陸上 → 船内        ${Date.now() - t}ms`);
}
await b.close();
