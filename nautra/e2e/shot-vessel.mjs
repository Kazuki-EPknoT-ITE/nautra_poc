import { chromium } from "playwright";

/** 船内アプリの主要画面を撮る（サインインが要るので PIN を打つ） */
const b = await chromium.launch({ headless: true });
const c = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const p = await c.newPage();

await p.goto("http://localhost:3100/vessel/login", { waitUntil: "networkidle" });
await p.screenshot({ path: "shots/vessel-login.png" });

await p.getByRole("radio", { name: /中原/ }).click();
for (const d of ["3", "3", "3", "3"]) await p.getByRole("button", { name: d, exact: true }).click();
await p.waitForURL("http://localhost:3100/vessel", { timeout: 15000 });
await p.waitForTimeout(800);

for (const [path, name] of [
  ["/vessel", "vessel-menu"],
  ["/vessel/punch", "vessel-punch"],
  ["/vessel/ledger", "vessel-ledger"],
  ["/vessel/shift", "vessel-shift"],
  ["/vessel/history", "vessel-history"],
]) {
  await p.goto("http://localhost:3100" + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  await p.screenshot({ path: `shots/${name}.png` });
}
await b.close();
console.log("saved vessel shots");
