import { chromium } from "playwright";

/** 主要画面のスクリーンショットを scratchpad に保存する（ログの証跡用） */
const b = await chromium.launch({ headless: true });
const c = await b.newContext({ viewport: { width: 1440, height: 1100 } });
await c.addCookies([
  { name: "nautra_shore_session", value: "shore-admin", url: "http://localhost:3100" },
]);
const p = await c.newPage();
const pages = [
  ["/shore", "shore-dashboard"],
  ["/shore/manning", "shore-manning"],
  ["/shore/crew", "shore-crew-list"],
  ["/shore/crew/crew-sato", "shore-karte"],
  ["/shore/filings", "shore-filings"],
  ["/shore/procedures", "shore-procedures"],
  ["/shore/dispatch", "shore-dispatch"],
  ["/shore/settings", "shore-settings"],
];
for (const [path, name] of pages) {
  await p.goto("http://localhost:3100" + path, { waitUntil: "networkidle" });
  await p.screenshot({ path: `shots/${name}.png`, fullPage: true });
}
await b.close();
console.log("saved", pages.length, "screenshots");
