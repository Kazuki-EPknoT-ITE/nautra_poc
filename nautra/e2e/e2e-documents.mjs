import { chromium } from "playwright";

/**
 * 9章の法定様式（海員名簿・一括届出許可申請書・操練実施記録）を実際に生成し、
 * 印刷ビューに中身が描かれることを確かめる。
 * 帳票の画面は「作った書類／書類を作る／待機・荷役の実績」のタブ（レビュー FORM-02/04/05/06）。
 */
const BASE = process.env.NAUTRA_BASE ?? "http://localhost:3100"; // 別の作業が 3100 を使っているときは NAUTRA_BASE で変える
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "OK  " : "NG  "} ${name}${detail ? " — " + detail : ""}`);
};

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ viewport: { width: 1440, height: 1100 } });
await c.addCookies([{ name: "nautra_shore_session", value: "shore-yamaguchi", url: BASE }]);
const p = await c.newPage();
p.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 120)));

// 「書類を作る」: 選んだ書類の入力だけが出る
await p.goto(`${BASE}/shore/documents?tab=make`, { waitUntil: "networkidle" });
const kinds = await p.getByRole("navigation", { name: "作る書類" }).innerText();
check(
  "書類を作るタブに、作れる書類が並ぶ（法定様式3つを含む）",
  /海員名簿/.test(kinds) && /一括届出の許可申請/.test(kinds) && /操練の実施記録/.test(kinds),
);

// 海員名簿を作る → そのまま「印刷する →」へ進める
await p.getByRole("navigation", { name: "作る書類" }).getByRole("link", { name: "海員名簿" }).click();
await p.waitForURL(/make=register/);
check("選んだ書類の入力だけが出る", (await p.getByRole("button", { name: "申請書を作る" }).count()) === 0);
await p.getByRole("button", { name: "海員名簿を作る" }).click();
await p.waitForTimeout(1500);
let text = await p.locator("main").innerText();
check("海員名簿を作成できる", /作成しました: 海員名簿/.test(text));
check("作ったらその場から印刷へ進める（レビュー FORM-06）", (await p.getByRole("link", { name: "印刷する →" }).count()) > 0);

// 一括届出許可申請書を作る
await p.goto(`${BASE}/shore/documents?tab=make&make=permit`, { waitUntil: "networkidle" });
await p.getByLabel("提出先の運輸局").fill("中国運輸局 海上安全環境部");
await p.getByRole("button", { name: "申請書を作る" }).click();
await p.waitForTimeout(1500);
text = await p.locator("main").innerText();
check("一括届出許可申請書を作成できる", /作成しました: 一括届出許可申請書/.test(text));

// 操練実施記録を作る（期間を広げる）
await p.goto(`${BASE}/shore/documents?tab=make&make=drill`, { waitUntil: "networkidle" });
await p.getByLabel("開始日").fill("2000-01-01");
await p.getByRole("button", { name: "実施記録を作る" }).click();
await p.waitForTimeout(1500);
text = await p.locator("main").innerText();
check("操練実施記録を作成できる", /作成しました: 操練（訓練）実施記録/.test(text));

// 「作った書類」に3件出る
await p.goto(`${BASE}/shore/documents`, { waitUntil: "networkidle" });
const listText = await p.locator("main").innerText();
check(
  "一覧に3つの法定様式が並ぶ",
  /海員名簿/.test(listText) && /一括届出許可申請書/.test(listText) && /操練（訓練）実施記録/.test(listText),
);

// キーワード・期間で探せる（レビュー FORM-02）
await p.getByRole("searchbox", { name: "キーワード" }).fill("一括届出");
await p.getByRole("button", { name: "探す" }).click();
await p.waitForURL(/q=/);
const found = await p.getByRole("region", { name: "作った書類" }).innerText();
check("キーワードで探すと、その書類だけが出る", /一括届出許可申請書/.test(found) && !/海員名簿/.test(found));
await p.goto(`${BASE}/shore/documents?q=${encodeURIComponent("一括届出")}&to=2000-01-01`, { waitUntil: "networkidle" });
check("作成日の期間で絞ると範囲外は出ない", /条件に合う書類はありません/.test(await p.locator("main").innerText()));

// 行の中から提出を記録できる（書類を選び直さない。レビュー FORM-06）
await p.goto(`${BASE}/shore/documents?q=${encodeURIComponent("一括届出")}&status=unsubmitted`, { waitUntil: "networkidle" });
const rowForm = p.getByRole("region", { name: "作った書類" });
await rowForm.getByRole("button", { name: "提出を記録" }).first().click();
await rowForm.getByLabel("提出先").first().fill("中国運輸局 海上安全環境部");
await rowForm.getByRole("button", { name: "記録", exact: true }).first().click();
await p.waitForTimeout(1500);
const before = await rowForm.getByRole("button", { name: "提出を記録" }).count();
await p.goto(`${BASE}/shore/documents?q=${encodeURIComponent("一括届出 海上安全環境部")}&status=submitted`, { waitUntil: "networkidle" });
check("一覧の行から提出を記録すると、提出済みに移る", /一括届出許可申請書/.test(await p.getByRole("region", { name: "作った書類" }).innerText()), `未提出の残り ${before}件`);

// 印刷ビュー: それぞれ中身が出ること（「中身が保存されていません」に落ちない）
await p.goto(`${BASE}/shore/documents`, { waitUntil: "networkidle" });
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
    check(`印刷ビューに中身が描かれる: ${kind}`, !/中身が保存されていません/.test(t));
    checked++;
  }
  await pp.close();
}
check("3つの印刷ビューを確認した", checked >= 3, `確認 ${checked} 件`);

// 待機・荷役の実績はタブで分かれている
await p.goto(`${BASE}/shore/documents?tab=standby`, { waitUntil: "networkidle" });
check("待機・荷役の実績が別のタブにある", /月別・港別/.test(await p.locator("main").innerText()));

await b.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n合計 ${results.length} 項目 / 失敗 ${bad.length} 件`);
process.exit(bad.length === 0 ? 0 : 1);
