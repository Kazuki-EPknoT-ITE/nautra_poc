import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 全画面のサーバ HTML を取得し、<p> の中に置けない要素が無いか一括で調べる。
 * ブラウザは <p> を勝手に閉じるため、これがあると必ずハイドレーションが壊れる。
 */
const BASE = "http://localhost:3100";
const PATHS = [
  "/", "/shore", "/shore/login", "/shore/crew", "/shore/crew/crew-sato",
  "/shore/crew/crew-sato/edit", "/shore/crew/crew-sato/credentials",
  "/shore/manning", "/shore/filings", "/shore/procedures", "/shore/training",
  "/shore/shifts", "/shore/fleet", "/shore/dispatch", "/shore/safety",
  "/shore/wellbeing", "/shore/evaluations", "/shore/office", "/shore/documents",
  "/shore/labor", "/shore/templates", "/shore/notices", "/shore/settings",
  "/vessel", "/vessel/login",
];

const FORBIDDEN = new Set([
  "div", "ul", "ol", "li", "table", "section", "article", "p",
  "h1", "h2", "h3", "h4", "h5", "h6", "form", "dl", "pre", "blockquote",
]);
const VOID = new Set([
  "br", "img", "input", "hr", "meta", "link", "source", "path", "circle",
  "line", "rect", "text", "g", "svg", "polyline", "polygon", "use", "defs",
]);

function scan(html) {
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  let m, inP = false;
  const found = [];
  while ((m = tag.exec(html))) {
    const [, slash, name, attrs] = m;
    const lower = name.toLowerCase();
    if (lower === "p") {
      if (slash) inP = false;
      else if (!inP) inP = true;
      else found.push({ name: "p", at: m.index });
      continue;
    }
    if (!inP || slash) continue;
    if (VOID.has(lower) || attrs.trimEnd().endsWith("/")) continue;
    if (FORBIDDEN.has(lower)) found.push({ name: lower, at: m.index, snippet: html.slice(m.index, m.index + 90) });
  }
  return found;
}

const dir = mkdtempSync(join(tmpdir(), "nest-"));
let total = 0;
for (const p of PATHS) {
  const f = join(dir, "page.html");
  try {
    execSync(
      `curl -s -b "nautra_shore_session=shore-admin" "${BASE}${p}" -o "${f}"`,
      { stdio: "ignore" },
    );
  } catch {
    console.log(`SKIP ${p}`);
    continue;
  }
  const found = scan(readFileSync(f, "utf8"));
  total += found.length;
  console.log(`${found.length === 0 ? "OK  " : "NG  "} ${p.padEnd(34)} ${found.length ? found.length + "件" : ""}`);
  for (const x of found.slice(0, 2)) console.log(`        <p> の中に <${x.name}>: ${(x.snippet ?? "").slice(0, 80)}`);
}
console.log(`\n不正なネスト 合計 ${total} 件`);
process.exit(total === 0 ? 0 : 1);
