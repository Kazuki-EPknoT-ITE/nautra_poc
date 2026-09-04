import { chromium } from "playwright";

/** 生成した法定様式の印刷ビューを撮る */
const BASE = "http://localhost:3100";
const b = await chromium.launch({ headless: true });
const c = await b.newContext({ viewport: { width: 1100, height: 1400 } });
await c.addCookies([{ name: "nautra_shore_session", value: "shore-admin", url: BASE }]);
const p = await c.newPage();

await p.goto(`${BASE}/shore/documents`, { waitUntil: "networkidle" });
const links = await p.locator('a[href*="/print"]').all();
const seen = new Set();
for (const link of links) {
  const href = await link.getAttribute("href");
  if (!href) continue;
  const pp = await c.newPage();
  await pp.goto(BASE + href, { waitUntil: "networkidle" });
  const t = await pp.locator("main").innerText();
  const map = [
    ["海員名簿", "doc-crew-register"],
    ["一括届出許可申請書", "doc-bulk-permit"],
    ["操練（訓練）実施記録", "doc-drill-record"],
  ];
  for (const [needle, name] of map) {
    if (t.includes(needle) && !seen.has(name)) {
      seen.add(name);
      await pp.screenshot({ path: `shots/${name}.png`, fullPage: true });
    }
  }
  await pp.close();
  if (seen.size === 3) break;
}
await b.close();
console.log("saved", [...seen].join(", "));
