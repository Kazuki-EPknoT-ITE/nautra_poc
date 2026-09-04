import { chromium } from "playwright";

/**
 * 9章の法定様式（海員名簿・一括届出許可申請書・操練実施記録）を実際に生成し、
 * 印刷ビューに中身が描かれることを確かめる。
 */
const BASE = "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "OK  " : "NG  "} ${name}${detail ? " — " + detail : ""}`);
};

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ viewport: { width: 1440, height: 1100 } });
await c.addCookies([{ name: "nautra_shore_session", value: "shore-admin", url: BASE }]);
const p = await c.newPage();
p.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 120)));

await p.goto(`${BASE}/shore/documents`, { waitUntil: "networkidle" });

// 3つのフォームが出ている
const text0 = await p.locator("main").innerText();
check(
  "帳票センターに法定様式の作成フォームが3つある",
  /海員名簿を出す/.test(text0) && /一括届出の許可を申請する/.test(text0) && /操練の実施記録を出す/.test(text0),
);

// 海員名簿を作る
await p.getByRole("button", { name: "海員名簿を作る" }).click();
await p.waitForTimeout(1500);
let text = await p.locator("main").innerText();
check("海員名簿を作成できる", /作成しました: 海員名簿/.test(text));

// 一括届出許可申請書を作る
await p.getByLabel("提出先の運輸局").fill("中国運輸局 海上安全環境部");
await p.getByRole("button", { name: "申請書を作る" }).click();
await p.waitForTimeout(1500);
text = await p.locator("main").innerText();
check("一括届出許可申請書を作成できる", /作成しました: 一括届出許可申請書/.test(text));

// 操練実施記録を作る（期間を広げる）
await p.getByLabel("開始日").fill("2000-01-01");
await p.getByRole("button", { name: "実施記録を作る" }).click();
await p.waitForTimeout(1500);
text = await p.locator("main").innerText();
check("操練実施記録を作成できる", /作成しました: 操練（訓練）実施記録/.test(text));

// 一覧に3件出て、印刷ビューが中身を描く
await p.goto(`${BASE}/shore/documents`, { waitUntil: "networkidle" });
const listText = await p.locator("main").innerText();
check(
  "一覧に3つの法定様式が並ぶ",
  /海員名簿/.test(listText) && /一括届出許可申請書/.test(listText) && /操練（訓練）実施記録/.test(listText),
);

// 印刷ビュー: それぞれ中身が出ること（「中身が保存されていません」に落ちない）
const links = await p.locator('a[href*="/print"]').all();
let checked = 0;
for (const link of links.slice(0, 6)) {
  const href = await link.getAttribute("href");
  if (!href) continue;
  const pp = await c.newPage();
  await pp.goto(BASE + href, { waitUntil: "networkidle" });
  const t = await pp.locator("main").innerText();
  const kind = t.match(/^(海員名簿|一括届出許可申請書・電子届出登録申請書|操練（訓練）実施記録)/m)?.[0];
  if (kind) {
    check(
      `印刷ビューに中身が描かれる: ${kind}`,
      !/中身が保存されていません/.test(t),
    );
    checked++;
  }
  await pp.close();
}
check("3つの印刷ビューを確認した", checked >= 3, `確認 ${checked} 件`);

await b.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n合計 ${results.length} 項目 / 失敗 ${bad.length} 件`);
process.exit(bad.length === 0 ? 0 : 1);
