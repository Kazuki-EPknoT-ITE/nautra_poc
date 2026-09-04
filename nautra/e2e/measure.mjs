import { chromium } from "playwright";

/**
 * 全画面の描画後の高さを測る。
 * 一覧を全件出している画面は極端に縦長になるため、閾値を超えたものを洗い出す。
 */
const BASE = "http://localhost:3100";
const THRESHOLD = 3000; // これを超えたら「読むのに延々とめくる」状態

const SHORE = [
  "/shore", "/shore/crew", "/shore/crew/crew-sato", "/shore/crew/crew-sato/edit",
  "/shore/crew/crew-sato/credentials", "/shore/manning", "/shore/filings",
  "/shore/procedures", "/shore/training", "/shore/shifts", "/shore/fleet",
  "/shore/dispatch", "/shore/safety", "/shore/wellbeing", "/shore/evaluations",
  "/shore/office", "/shore/documents", "/shore/labor", "/shore/templates",
  "/shore/notices", "/shore/settings",
];
const VESSEL = [
  "/vessel", "/vessel/punch", "/vessel/ledger", "/vessel/approve", "/vessel/logbook",
  "/vessel/maintenance", "/vessel/safety", "/vessel/shift", "/vessel/work",
  "/vessel/sync", "/vessel/incident", "/vessel/wellbeing",
];

const b = await chromium.launch({ headless: true });
const shore = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await shore.addCookies([{ name: "nautra_shore_session", value: "shore-admin", url: BASE }]);

const rows = [];
async function measure(ctx, path) {
  const p = await ctx.newPage();
  await p.goto(BASE + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(700);
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  const overflow = await p.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  rows.push({ path, h, overflow });
  await p.close();
}

for (const path of SHORE) await measure(shore, path);

// 船内はサインインが要る
const vessel = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const v = await vessel.newPage();
await v.goto(`${BASE}/vessel/login`, { waitUntil: "networkidle" });
await v.getByRole("radio", { name: /佐藤/ }).click();
for (const d of ["2", "2", "2", "2"]) await v.getByRole("button", { name: d, exact: true }).click();
await v.waitForURL(`${BASE}/vessel`, { timeout: 15000 });
await v.close();
for (const path of VESSEL) await measure(vessel, path);

await b.close();

rows.sort((a, b2) => b2.h - a.h);
let bad = 0;
for (const r of rows) {
  const tall = r.h > THRESHOLD;
  if (tall || r.overflow) bad++;
  console.log(
    `${tall ? "TALL" : "ok  "} ${String(r.h).padStart(5)}px ${r.overflow ? "横スクロール有 " : "              "}${r.path}`,
  );
}
console.log(`\n${rows.length} 画面 / 要確認 ${bad} 件（閾値 ${THRESHOLD}px）`);
