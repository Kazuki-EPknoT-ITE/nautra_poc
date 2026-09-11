import { chromium } from "playwright";

/** デザイン刷新の確認用スクリーンショット（ログの証跡） */
const b = await chromium.launch({ headless: true });
const c = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await c.addCookies([
  { name: "nautra_shore_session", value: "shore-yamaguchi", url: "http://localhost:3100" },
]);
const p = await c.newPage();
for (const [path, name] of [
  ["/shore", "dash"],
  ["/shore/manning", "manning"],
  ["/shore/tasks", "tasks"],
  ["/shore/exports", "exports"],
  ["/shore/trash", "trash"],
  ["/shore/fleet/vessel-001", "vessel-detail"],
  ["/shore/crew", "crew-list"],
  ["/shore/login", "shore-login"],
]) {
  await p.goto("http://localhost:3100" + path, { waitUntil: "networkidle" });
  await p.screenshot({ path: `shots/${name}.png` });
}
await b.close();
console.log("ok");
