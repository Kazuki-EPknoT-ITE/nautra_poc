import { chromium } from "playwright";

/**
 * 説明文の棚卸し（レビュー 0-1 / 0-2 / ADMIN-01 / ADMIN-03）。
 *
 * 陸上の各画面と、その画面のタブ（?tab=）を開き、**句点を含む 40 字を超える段落**を
 * 「説明の文」として数える。画面の作り（タブ・ボタンの名前・札・ホバー）で伝えられているかの目安で、
 * 0 件にすることが目的ではない（データとして入力された文や、必要な注意は残る）。
 * 増えたら、札（StatusChip の hint）か見出しの title へ移せないかを見る。
 *
 *   node e2e/text-audit.mjs          … 画面ごとの件数と、引っかかった文の先頭
 *   node e2e/text-audit.mjs --max=2  … 1枚に 2 件を超える画面があれば終了コード 1
 */
const BASE = "http://localhost:3100";
const max = Number(process.argv.find((a) => a.startsWith("--max="))?.split("=")[1] ?? NaN);

const SHORE = [
  "/shore", "/shore/crew", "/shore/crew/crew-nakahara", "/shore/crew/crew-nakahara/edit",
  "/shore/manning", "/shore/filings", "/shore/training", "/shore/shifts", "/shore/fleet",
  "/shore/dispatch", "/shore/safety", "/shore/wellbeing", "/shore/evaluations",
  "/shore/office", "/shore/documents", "/shore/labor", "/shore/templates",
  "/shore/notices", "/shore/settings", "/shore/tasks", "/shore/trash",
];

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await c.addCookies([{ name: "nautra_shore_session", value: "shore-yamaguchi", url: BASE }]);
const p = await c.newPage();

const results = [];
for (const path of SHORE) {
  await p.goto(BASE + path, { waitUntil: "networkidle" });
  const tabs = await p
    .locator('main nav a[href*="tab="]')
    .evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
  for (const href of [path, ...tabs.filter((h) => h && h !== path)]) {
    if (href !== path) await p.goto(BASE + href, { waitUntil: "networkidle" });
    const paras = await p.locator("main p").evaluateAll((ps) =>
      ps
        // 入力されたデータ（表のセルの中）は数えない
        .filter((x) => !x.closest("td, li, textarea, [data-user-text]"))
        .map((x) => {
          // 読み上げ用の文（札の sr-only）とホバーの吹き出しは、ふだん画面に出ないので数えない
          const c = x.cloneNode(true);
          c.querySelectorAll(".sr-only, [data-tip] > [aria-hidden]").forEach((n) => n.remove());
          return c.textContent.trim();
        })
        .filter((t) => t.length > 40 && /。/.test(t)),
    );
    results.push({ href, paras });
  }
}
await b.close();

let over = 0;
for (const r of results) {
  const flag = Number.isFinite(max) && r.paras.length > max;
  if (flag) over++;
  console.log(`${flag ? "OVER" : r.paras.length > 0 ? "note" : "ok  "}  ${String(r.paras.length).padStart(2)}  ${r.href}`);
  for (const t of r.paras) console.log("        - " + t.replace(/\s+/g, " ").slice(0, 90));
}
const total = results.reduce((n, r) => n + r.paras.length, 0);
console.log(`\n合計 ${results.length} 枚 / 説明の文 ${total} 件${Number.isFinite(max) ? ` / ${max}件超え ${over} 枚` : ""}`);
process.exit(over > 0 ? 1 : 0);
