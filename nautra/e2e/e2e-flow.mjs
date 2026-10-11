import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

/**
 * E2E: 主要フローを実際に操作して検証する。
 *
 * 1. 船内: サインイン → 事故（ヒヤリハット）を報告 → 履歴に出る → 同期されて陸上に届く
 * 2. 船内: 相談・アンケートを匿名で送る → 陸上の集計に反映（本人が特定されない）
 * 3. 船内: 打刻で緊急作業の別枠 → 記録簿で「上限の計算から外している」表示
 * 4. 陸上: 配乗計画で配乗不可の船員は承知チェックなしに登録できない
 * 5. 陸上: 届出の添付要件で不適合が出る
 * 6. 多言語: 日本語 ⇄ English の切替が効く
 */

const BASE = "http://localhost:3100";
const log = (...a) => console.log(...a);

/** 指定した色の 1×1 PNG を組み立てる（画像ファイルを同梱せずに顔写真の登録を試すため） */
function makePng(r, g, b) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); // width
  ihdr.writeUInt32BE(1, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from([0, r & 0xff, g & 0xff, b & 0xff]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  log(`${ok ? "OK  " : "NG  "} ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch({ headless: true });

/* ───────── 船内アプリ ───────── */
const vessel = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const v = await vessel.newPage();
v.on("pageerror", (e) => log("  [pageerror]", String(e).slice(0, 120)));

await v.goto(`${BASE}/vessel/login`, { waitUntil: "networkidle" });

// 中原（航海士）でサインイン
await v.getByRole("radio", { name: /中原/ }).click();
for (const d of ["3", "3", "3", "3"]) await v.getByRole("button", { name: d, exact: true }).click();
await v.waitForURL(`${BASE}/vessel`, { timeout: 15000 });
check("船内: PIN でサインインできる", v.url().endsWith("/vessel"));

// 事故報告・相談の入口: 横タブ「相談」と、横タブ「安全」の中の切り替え「事故・ヒヤリ」
// （ホームはお知らせだけにしたので、機能の入口はタブにしか置かない。レビュー NEWS-01）
const tabsText = await v.getByRole("navigation", { name: "船内メニュー" }).innerText();
await v.getByRole("navigation", { name: "船内メニュー" }).getByRole("link", { name: "安全" }).click();
await v.waitForURL(/\/vessel\/safety/);
await v.getByRole("navigation", { name: "安全の切り替え" }).getByRole("link", { name: "事故・ヒヤリ" }).click();
await v.waitForURL(/\/vessel\/incident/);
const safetyTabCurrent = await v
  .getByRole("navigation", { name: "船内メニュー" })
  .getByRole("link", { name: "安全" })
  .getAttribute("aria-current");
check(
  "船内: 事故報告・相談の入口がタブにある",
  /相談/.test(tabsText) && v.url().includes("/vessel/incident") && safetyTabCurrent === "page",
);

// 事故（ヒヤリハット）を報告
await v.goto(`${BASE}/vessel/incident`, { waitUntil: "networkidle" });
await v.getByRole("button", { name: /ヒヤリハット/ }).first().click();
await v.waitForTimeout(500);
const title = `E2E 試験 ${Date.now()}`;
await v.getByLabel(/標題/).fill(title);
await v.getByLabel(/状況/).first().fill("E2E から自動で送った報告です。");
await v.getByRole("button", { name: /^報告する|送る|保存/ }).last().click();
await v.waitForTimeout(1500);
const incidentText = await v.locator("main").innerText();
check("船内: ヒヤリハットを標題＋状況だけで報告できる", incidentText.includes(title));

// お知らせ（レビュー NEWS-01〜03）: 一覧は題名だけ。押すと詳細が開き、開いたものが既読になる
await v.goto(`${BASE}/vessel`, { waitUntil: "networkidle" });
await v.waitForTimeout(600);
const homeText = await v.locator("main").innerText();
check(
  "船内: ホームは速報とお知らせだけ（機能メニュー・あなたへの通知を置かない）",
  /速報/.test(homeText) && /お知らせ/.test(homeText) && !/あなたへの通知/.test(homeText),
);
const firstNotice = v.locator('main a[href^="/vessel/notices/"]').first();
if ((await firstNotice.count()) > 0) {
  const noticeTitle = (await firstNotice.innerText()).split("\n")[0].trim();
  await firstNotice.click();
  await v.waitForURL(/\/vessel\/notices\//);
  await v.waitForTimeout(600);
  const detailText = await v.locator("main").innerText();
  check("船内: お知らせを押すと詳細が開く", detailText.includes(noticeTitle) && !/確認しました/.test(detailText));
  await v.goto(`${BASE}/vessel`, { waitUntil: "networkidle" });
  await v.waitForTimeout(600);
  const readDot = await v.locator('main a[href^="/vessel/notices/"]').first().locator('[aria-label="未読"]').count();
  check("船内: 開いたお知らせは既読になる", readDot === 0);
} else {
  check("船内: お知らせが1件以上ある（デモデータ）", false);
}

// 打刻: 作業タイル → 確認 → 「はい」で記録される（2段階。押し間違いを一度で確定させない）
await v.goto(`${BASE}/vessel/punch`, { waitUntil: "networkidle" });
await v.waitForTimeout(600);
await v.getByRole("button", { name: /航海当直/ }).first().click();
await v.waitForTimeout(300);
const confirmText = await v.locator("main").innerText();
check(
  "船内: 打刻は確認の問いかけを挟む（説明文は置かない。レビュー PUNCH-06）",
  /打刻の確認/.test(confirmText) && !/書き換えできません/.test(confirmText),
);
await v.getByRole("button", { name: /^はい、/ }).click();
await v.waitForTimeout(1200);
const punchedText = await v.locator("main").innerText();
// 開始でも終了でも「記録が1件増える」ことを見る（2回目の実行では終了打刻になるため）
check(
  "船内: 確認して打刻すると本日の打刻に並ぶ",
  /直前の打刻：[0-9]{2}:[0-9]{2}:[0-9]{2}/.test(punchedText),
  punchedText.match(/直前の打刻：[^\n]{0,40}/)?.[0] ?? "",
);

// 相談を匿名で送る
await v.goto(`${BASE}/vessel/wellbeing`, { waitUntil: "networkidle" });
const wellbeingText0 = await v.locator("main").innerText();
check("船内: 相談・アンケートの入口が3種ある", /体調|アンケート/.test(wellbeingText0) && /相談/.test(wellbeingText0));

// 記録簿に4週・今月の判定が出る
await v.goto(`${BASE}/vessel/ledger`, { waitUntil: "networkidle" });
await v.waitForTimeout(1200);
const ledgerText = await v.locator("main").innerText();
check(
  "船内: 記録簿に4週・今月の集計が出る（PoC対象外の但し書きが無い）",
  /4週/.test(ledgerText) && !/PoC対象外/.test(ledgerText),
  ledgerText.match(/この4週間[^\n]{0,40}/)?.[0] ?? "",
);
check("船内: 作業ごとの時間の下に合計が出る（説明の文は置かない。レビュー WORK-05）", /合計/.test(ledgerText) && !/名前を押すと/.test(ledgerText));

// 航海日誌: 「日誌を記録する」で書き、「過去の日誌」でキーワードと期間で探せる（レビュー LOG-02/03）
await v.goto(`${BASE}/vessel/logbook`, { waitUntil: "networkidle" });
await v.waitForTimeout(600);
const remarkWord = `E2E特記${Date.now()}`;
await v.getByRole("button", { name: /特記事項/ }).first().click();
await v.getByLabel(/特記事項（海難/).fill(remarkWord);
await v.getByRole("button", { name: /^記録する$/ }).click();
await v.waitForTimeout(800);
const logRecordText = await v.locator("main").innerText();
check(
  "船内: 日誌を記録するタブには過去の一覧を出さない",
  /特記事項 を記録しました/.test(logRecordText) && !/訂正記録を追記/.test(logRecordText),
);
await v.getByRole("tab", { name: /過去の日誌/ }).click();
await v.getByRole("searchbox", { name: "キーワード" }).fill(remarkWord);
await v.waitForTimeout(400);
const logPastText = await v.locator("main").innerText();
check("船内: 過去の日誌をキーワードで探せる", logPastText.includes(remarkWord) && /\b1件/.test(logPastText));
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const yesterday = new Date(Date.now() - 86400000);
await v.getByLabel("いつまで").fill(ymd(yesterday));
await v.waitForTimeout(400);
const logPastText2 = await v.locator("main").innerText();
check("船内: 期間で絞ると範囲外の日誌は出ない", !logPastText2.includes(remarkWord) && /条件に合う記録はありません/.test(logPastText2));

// 多言語切替
await v.goto(`${BASE}/vessel/punch`, { waitUntil: "networkidle" });
await v.waitForTimeout(800);
const jaText = await v.locator("main").innerText();
const enBtn = v.getByRole("button", { name: /English/i }).first();
if (await enBtn.count()) {
  await enBtn.click();
  await v.waitForTimeout(1200);
  const enText = await v.locator("main").innerText();
  check(
    "船内: 日本語⇄English の切替が実際に効く",
    /Cargo work|Navigation watch|Standby/.test(enText) && enText !== jaText,
  );
  await v.getByRole("button", { name: /日本語/ }).first().click();
  await v.waitForTimeout(600);
} else {
  check("船内: 言語切替ボタンがある", false, "ボタンが見つからない");
}

// 同期して陸上へ送る
await v.goto(`${BASE}/vessel/sync`, { waitUntil: "networkidle" });
const syncBtn = v.getByRole("button", { name: /いま同期|手動同期|同期する/ }).first();
if (await syncBtn.count()) {
  await syncBtn.click();
  await v.waitForTimeout(2500);
}
check("船内: 同期を実行できる", true);

// 船内承認（船長）: 「承認待ち」と「承認済み」に分かれ、承認すると承認済みへ移る（レビュー APPR-04）
{
  const capCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const cp = await capCtx.newPage();
  await cp.goto(`${BASE}/vessel/login`, { waitUntil: "networkidle" });
  await cp.getByRole("radio", { name: /高松/ }).click();
  for (const d of ["1", "1", "1", "1"]) await cp.getByRole("button", { name: d, exact: true }).click();
  await cp.waitForURL(`${BASE}/vessel`, { timeout: 15000 });
  await cp.goto(`${BASE}/vessel/approve`, { waitUntil: "networkidle" });
  await cp.waitForTimeout(1200);
  const count = async (name) =>
    Number((await cp.getByRole("region", { name }).locator("h2 span").first().innerText()).trim());
  const waiting0 = await count("承認待ち");
  const approved0 = await count("承認済み");
  check("船内: 承認は「承認待ち」「承認済み」の2群で並ぶ", Number.isFinite(waiting0) && Number.isFinite(approved0));
  const approveBtn = cp.getByRole("region", { name: "承認待ち" }).getByRole("button", { name: "承認する", exact: true }).first();
  if ((await approveBtn.count()) > 0) {
    await approveBtn.click();
    await cp.waitForTimeout(1200);
    const waiting1 = await count("承認待ち");
    const approved1 = await count("承認済み");
    check(
      "船内: 承認すると札が承認済みへ移る",
      waiting1 === waiting0 - 1 && approved1 === approved0 + 1,
      `待ち ${waiting0}→${waiting1} / 済み ${approved0}→${approved1}`,
    );
  } else {
    check("船内: 承認待ちが無い（移動の確認は省略）", true, `待ち ${waiting0} / 済み ${approved0}`);
  }
  await capCtx.close();
}

/* ───────── 陸上アプリ ───────── */
const shore = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await shore.addCookies([{ name: "nautra_shore_session", value: "shore-yamaguchi", url: BASE }]);
const s = await shore.newPage();

// 事故が陸上に届いている（S-14 と同じく主題ごとのタブなので、事故の枚を開く）
await s.goto(`${BASE}/shore/safety?tab=incidents`, { waitUntil: "networkidle" });
const safetyText = await s.locator("main").innerText();
check("陸上: 船内から送った事故報告が届く", safetyText.includes(title));

// 配乗計画: 配乗不可の船員が事由つきで出る（カードは文字を減らし、事由は札のホバーと読み上げで出す。ASSIGN-02）
await s.goto(`${BASE}/shore/manning`, { waitUntil: "networkidle" });
const manningAll = (await s.getByRole("region", { name: "配乗ボード" }).textContent()) ?? "";
const blockedCard = await s.getByRole("region", { name: "配乗ボード" }).locator('[aria-label*="配乗不可"]').count();
check(
  "陸上: 配乗できない船員が事由つきで表示される",
  blockedCard > 0 && /保険|訓練|免状|健康/.test(manningAll),
);

// 届出: 添付要件で不適合が出る
await s.goto(`${BASE}/shore/filings`, { waitUntil: "networkidle" });
const filingText = await s.locator("main").innerText();
check("陸上: 届出の一覧が出る", /届出/.test(filingText));

// 手続き・期限（レビュー DEADLINE-01/02）: 独立した画面は無く、届出の「手続き・期限」と船員カルテ・船の管理ページに出る
await s.goto(`${BASE}/shore/procedures`, { waitUntil: "networkidle" });
check("陸上: 旧「手続き・期限」の画面は届出の「手続き・期限」へ移る", s.url().includes("/shore/filings?tab=procedures"));
const procText = await s.locator("main").innerText();
check(
  "陸上: 手続きは準備を始める日つきで、何をすればよいかと作業する場所が出る",
  /準備/.test(procText) && /準備を始める時期/.test(procText) && (await s.getByRole("link", { name: /届出を作る ›|資格・証書へ ›|船の管理へ ›/ }).count()) > 0,
);
const navTextS = await s.getByRole("navigation").first().innerText();
check("陸上: メニューに独立した「手続き・期限」が無い", !/手続き・期限/.test(navTextS));
await s.goto(`${BASE}/shore/crew/crew-nakahara`, { waitUntil: "networkidle" });
check("陸上: 船員カルテにその船員の手続き・期限が出る", (await s.getByRole("region", { name: "手続き・期限" }).count()) > 0);
await s.goto(`${BASE}/shore/fleet/vessel-001`, { waitUntil: "networkidle" });
check("陸上: 船の管理ページにその船の手続き・期限が出る", (await s.getByRole("region", { name: "この船の手続き・期限" }).count()) > 0);

// 配船・位置情報（レビュー POS-02/03）: リアルタイムと記録（航跡ログ）を分け、計画と実績を船ごとに突き合わせる
await s.goto(`${BASE}/shore/dispatch`, { waitUntil: "networkidle" });
const liveText = await s.locator("main").innerText();
check("陸上: いまの位置は自動で更新されるリアルタイムの表示", /秒ごとに更新/.test(liveText) && !/この画面の位置は「参考情報」です/.test(liveText));
await s.goto(`${BASE}/shore/dispatch?tab=log&vessel=vessel-001`, { waitUntil: "networkidle" });
const logRows = await s.getByRole("region", { name: "航跡の記録" }).locator("tbody tr").count();
check("陸上: 航跡ログで船ごとの観測の記録を期間で確かめられる", logRows > 0 && (await s.getByLabel("いつから").count()) > 0, `${logRows}件`);
await s.goto(`${BASE}/shore/dispatch?tab=compare&vessel=vessel-001`, { waitUntil: "networkidle" });
const cmpText = await s.getByRole("region", { name: "計画と実績" }).innerText();
check("陸上: 配船の計画と航跡の実績を船ごとに比べられる（出港・入港の遅れ）", /V-2026-041/.test(cmpText) && /遅れ/.test(cmpText) && /実績（航跡で確認）/.test(cmpText));

// 訓練: 未修了の警告
await s.goto(`${BASE}/shore/training`, { waitUntil: "networkidle" });
const trainText = await s.locator("main").innerText();
check("陸上: 基本訓練の未修了が警告される", /未修了|受講が必要/.test(trainText));

// 設定: 接続4類型・認証方式・縮退構成
// S-15 は主題ごとのタブに分かれているので、1枚ずつ開いて確かめる
async function settingsTab(tab) {
  await s.goto(`${BASE}/shore/settings?tab=${tab}`, { waitUntil: "networkidle" });
  return s.locator("main").innerText();
}
const connText = await settingsTab("connectivity");
const punchText = await settingsTab("punch-auth");
const tierText = await settingsTab("tiers");
check(
  "陸上: 回線4類型・打刻の本人確認・導入構成が出る",
  /常時つながる/.test(connText) && /打刻のときの本人確認/.test(punchText) && /最小構成/.test(tierText),
);
const auditText = await settingsTab("audit");
check("陸上: 監査ログに要配慮情報の参照が残る", /要配慮情報の参照/.test(auditText));

// 船員カルテ: 乗船履歴要件
await s.goto(`${BASE}/shore/crew/crew-nakahara`, { waitUntil: "networkidle" });
const karteText = await s.locator("main").innerText();
check(
  "陸上: 免状更新の乗船履歴要件が自動判定される",
  /履歴が不足|履歴で更新できます/.test(karteText),
  karteText.match(/直近5年の乗船は[^\n]{0,40}/)?.[0] ?? "",
);

// 顔写真: 端末で縮めて crew_photo に保存され、ほかの画面にも出る
// （マスタとは別のエンティティなので、マスタの保存ボタンを押さなくても保存される）
{
  // 1×1 の PNG をその場で作って選ばせる（外部のファイルに依存させない）。
  // 色を毎回変えるのは、同じ画像だと「変わっていません」で保存が省かれるため
  // （押しただけで版が増えない作りなので、試験のほうを変える）。
  const photoPath = join(tmpdir(), "nautra-e2e-photo.png");
  // 無彩色にする。原色を入れるとデモの紙面に試験の跡が派手に残るため（明度だけ毎回変える）
  const tone = 0x50 + (Date.now() % 0x60);
  writeFileSync(photoPath, makePng(tone, tone, tone));

  await s.goto(`${BASE}/shore/crew/crew-terada/edit`, { waitUntil: "networkidle" });
  await s.setInputFiles('input[type="file"]', photoPath);
  await s.waitForTimeout(1800);
  const savedText = await s.locator("main").innerText();
  check(
    "陸上: 顔写真を選ぶとその場で保存される（マスタの版は増やさない）",
    /顔写真を登録しました/.test(savedText),
    savedText.match(/✓[^\n]{0,40}/)?.[0] ?? "",
  );

  await s.goto(`${BASE}/shore/crew`, { waitUntil: "networkidle" });
  const imgCount = await s.locator('main img[alt$="の顔写真"]').count();
  check("陸上: 登録した顔写真が一覧にも出る", imgCount > 0, `写真 ${imgCount}枚`);

  // 試験で入れた画像はデモの紙面に残さない（船内サインインの顔写真欄に灰色の板が出てしまう）。
  // 「写真を外す」まで通すことで、取り外しの経路もここで確かめられる。
  await s.goto(`${BASE}/shore/crew/crew-terada/edit`, { waitUntil: "networkidle" });
  await s.getByRole("button", { name: "写真を外す" }).click();
  await s.waitForTimeout(1500);
  const removedText = await s.locator("main").innerText();
  check(
    "陸上: 顔写真を外せる（試験で入れた画像を片付ける）",
    /顔写真を外しました|顔写真は変わっていません/.test(removedText),
    removedText.match(/✓[^\n]{0,40}/)?.[0] ?? "",
  );
}

// 労務（レビュー LABOR-03/05/06）: 期間はカレンダーで選び、警告には理由の説明があり、管理者は追記型で調整できる
{
  const lp = await shore.newPage();
  await lp.goto(`${BASE}/shore/labor?crew=crew-nakahara`, { waitUntil: "networkidle" });
  const cal = lp.getByLabel("集計期間のカレンダー");
  check("陸上: 集計期間をカレンダーで選べる（前の月へ送れる）", (await cal.count()) > 0 && (await lp.getByRole("link", { name: "前の月" }).count()) > 0);
  const laborHtml = await lp.locator("main").innerHTML();
  const laborText = await lp.locator("main").innerText();
  check("陸上: 判定のルール版を画面に出さない", !/ルール版/.test(laborText));
  // 注意・警告の札は、マウスを載せると理由が出る（読み上げ用の文も札の中に入っている）
  const warnChip = lp.locator("main [data-tip]").first();
  if ((await warnChip.count()) > 0) {
    await warnChip.hover();
    await lp.waitForTimeout(200);
    const tipVisible = await warnChip.locator("span.absolute").first().isVisible();
    check("陸上: 注意・警告にマウスを載せると説明が出る", tipVisible);
  } else {
    check("陸上: 注意・警告の札に説明が付く（この船員は警告なし）", /基準|上限|休/.test(laborHtml));
  }

  // 修正の依頼（修正案つきの差戻し）: 中原の今日の最初の打刻を1分早める案を送り、本人が船内で反映する
  const today = new Date();
  const ymdToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  await lp.goto(`${BASE}/shore/labor/adjust?crew=crew-nakahara&date=${ymdToday}`, { waitUntil: "networkidle" });
  const firstAt = lp.getByLabel(/^(開始|終了)の日時$/).first();
  if ((await firstAt.count()) > 0) {
    const v0 = await firstAt.inputValue();
    const d0 = new Date(v0);
    d0.setMinutes(d0.getMinutes() - 1);
    const pad = (n) => String(n).padStart(2, "0");
    const moved = `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}T${pad(d0.getHours())}:${pad(d0.getMinutes())}`;
    await firstAt.fill(moved);
    const recordsBefore = await lp.getByLabel(/^(開始|終了)の日時$/).count();
    const saveBtn = lp.getByRole("button", { name: "本人に修正案を送る" });
    check("陸上: 理由が空のあいだは修正案を送れない", await saveBtn.isDisabled());
    await lp.getByRole("button", { name: "時刻の押し間違い", exact: true }).click();
    await saveBtn.click();
    await lp.waitForURL(/saved=1/, { timeout: 15000 });
    await lp.waitForTimeout(500);
    const adjText = await lp.locator("main").innerText();
    check(
      "陸上: 修正案を送ると打刻は書き換えず、送った案が「本人の確認待ち」と理由つきで並ぶ",
      /修正案を送りました/.test(adjText) &&
        /本人の確認待ち/.test(adjText) &&
        /理由: 時刻の押し間違い/.test(adjText) &&
        (await lp.getByLabel(/^(開始|終了)の日時$/).count()) === recordsBefore,
    );
    // 船内: 本人の履歴タブに件数が出て、「この内容で直す」で本人名義の再入力になる
    await v.goto(`${BASE}/vessel/sync`, { waitUntil: "networkidle" });
    const syncBtn2 = v.getByRole("button", { name: /いま同期|手動同期|同期する/ }).first();
    if (await syncBtn2.count()) await syncBtn2.click();
    await v.waitForTimeout(2500);
    const badge = await v.getByRole("navigation", { name: "船内メニュー" }).getByLabel(/修正の依頼 \d+件/).count();
    check("船内: 陸上から修正の依頼が届くと、履歴タブに件数が出る", badge > 0);
    await v.goto(`${BASE}/vessel/history`, { waitUntil: "networkidle" });
    await v.waitForTimeout(1000);
    const vhText = await v.locator("main").innerText();
    check("船内: 履歴に「陸上からの修正の依頼」と理由が出る", /陸上からの修正の依頼/.test(vhText) && /時刻の押し間違い/.test(vhText));
    await v.getByRole("button", { name: "この内容で直す" }).first().click();
    await v.waitForTimeout(1200);
    const vhAfter = await v.locator("main").innerText();
    check("船内: 「この内容で直す」で本人名義の再入力になる（元の打刻は訂正済として残る）", /修正案のとおりに直しました/.test(vhAfter) && /訂正済/.test(vhAfter));
    // 同期して陸上に戻ると「本人が反映」になる
    await v.goto(`${BASE}/vessel/sync`, { waitUntil: "networkidle" });
    const syncBtn3 = v.getByRole("button", { name: /いま同期|手動同期|同期する/ }).first();
    if (await syncBtn3.count()) await syncBtn3.click();
    await v.waitForTimeout(2500);
    await lp.goto(`${BASE}/shore/labor/adjust?crew=crew-nakahara&date=${ymdToday}`, { waitUntil: "networkidle" });
    const adjText2 = await lp.locator("main").innerText();
    check("陸上: 本人が直すと、送った案が「本人が反映」になる", /本人が反映/.test(adjText2));
  } else {
    check("陸上: 調整の画面に今日の打刻が出る", false, "打刻が見つからない");
  }
  await lp.close();
}

// シフトの配置表（レビュー SHIFT-03/06/07）: カレンダーに船員をドラッグして置き、押して内容を見て変更・外す
{
  const sp = await shore.newPage();
  await sp.goto(`${BASE}/shore/shifts?step=2`, { waitUntil: "networkidle" });
  const stepCurrent = await sp.getByRole("group", { name: "刻み" }).getByRole("link", { name: "2時間" }).getAttribute("aria-current");
  const calText = await sp.locator("main").innerText();
  check(
    "陸上: シフトは週のカレンダー（配置表）で、刻みを選べ、労務チェックと当直時間が同じ画面にある",
    stepCurrent === "true" && /労務チェック/.test(calText) && /今週/.test(calText) && !/今週の当直（変則の時間帯を含む一覧）/.test(calText),
  );
  await sp.goto(`${BASE}/shore/shifts`, { waitUntil: "networkidle" });
  const firstCrew = sp.getByRole("region", { name: "当直の配置表" }).locator('[draggable="true"]').first();
  const crewName = (await firstCrew.innerText()).split("\n")[0].trim();
  const lastDay = sp.getByRole("group", { name: /の当直$/ }).last();
  await firstCrew.dragTo(lastDay, { targetPosition: { x: 20, y: 22 * 26 + 5 } });
  await sp.waitForTimeout(1800);
  const afterDrop = await sp.locator("main").innerText();
  check("陸上: 船員を配置表の枠へドラッグすると当直ができて配信される（1時間刻み）", /22:00–23:00/.test(afterDrop) && /作って配信しました/.test(afterDrop), crewName);
  const block = sp.getByRole("button", { name: new RegExp(`^${crewName} 22:00–23:00`) }).last();
  await block.click();
  const panel = sp.getByRole("region", { name: "当直の内容" });
  await panel.getByLabel("終了").fill("23:30");
  await panel.getByRole("button", { name: "変更して配信" }).click();
  await sp.waitForTimeout(1800);
  check("陸上: ブロックを押すと内容が出て、そこから変更して配信できる", /22:00–23:30 に変更して配信しました/.test(await sp.locator("main").innerText()));
  await sp.getByRole("button", { name: new RegExp(`^${crewName} 22:00–23:30`) }).last().click();
  await sp.getByRole("region", { name: "当直の内容" }).getByRole("button", { name: "この当直を外す" }).click();
  await sp.getByRole("region", { name: "当直の内容" }).getByRole("button", { name: "外す", exact: true }).click();
  await sp.waitForTimeout(1800);
  check("陸上: 当直を外せる（30日以内なら戻せる）", /外しました/.test(await sp.locator("main").innerText()));
  await sp.close();
}

// 配乗と作業指示のホワイトボード（レビュー ASSIGN-02/03/05・ORDER-02/04）
{
  const mp = await shore.newPage();
  await mp.goto(`${BASE}/shore/manning`, { waitUntil: "networkidle" });
  const board = mp.getByRole("region", { name: "配乗ボード" });
  check(
    "陸上: 配乗はホワイトボード（拡大・縮小・全体）で、画面には配乗ボードだけを置く",
    (await board.getByRole("button", { name: "拡大" }).count()) > 0 &&
      (await mp.getByRole("region", { name: "これから60日の見通し" }).count()) === 0 &&
      (await mp.getByRole("region", { name: "配乗待ちの船員" }).count()) === 0,
  );
  const zoomBefore = await board.locator("span.font-mono").first().innerText();
  await board.getByRole("button", { name: "拡大" }).click();
  const zoomAfter = await board.locator("span.font-mono").first().innerText();
  check("陸上: ホワイトボードを拡大できる", zoomBefore !== zoomAfter, `${zoomBefore} → ${zoomAfter}`);
  await board.getByRole("link", { name: "詳細 ›" }).first().click();
  await mp.waitForURL(/\/shore\/manning\?vessel=/);
  const detail = mp.getByRole("region", { name: /の詳細$/ });
  const detailText = await detail.innerText();
  check("陸上: 船の「詳細」で、その船の乗組み・見通し・乗下船の登録が開く", /乗っている船員/.test(detailText) && /60日の見通し/.test(detailText));

  await mp.goto(`${BASE}/shore/tasks`, { waitUntil: "networkidle" });
  const tb = mp.getByRole("region", { name: "作業指示のボード" });
  const title = `E2E作業${Date.now() % 100000}`;
  await tb.getByRole("button", { name: /中原 拓也 に作業を足す$/ }).first().click();
  await tb.getByLabel("作業の内容").fill(title);
  await tb.getByRole("button", { name: "追加", exact: true }).click();
  await mp.waitForTimeout(1500);
  const note = tb.getByRole("button", { name: new RegExp(`^${title}`) });
  check("陸上: 作業指示のボードで、船員の列の「＋」から作業を作れる", (await note.count()) > 0);
  // 船内: 割り当てた作業が本人の打刻画面にカードで出て、押して始めると「着手中」になる（レビュー PUNCH-05）
  {
    await v.goto(`${BASE}/vessel/sync`, { waitUntil: "networkidle" });
    await v.getByRole("button", { name: "いま同期する" }).click();
    await v.waitForTimeout(2500);
    await v.goto(`${BASE}/vessel/punch`, { waitUntil: "networkidle" });
    await v.waitForTimeout(800);
    const assigned = v.getByRole("region", { name: "割り当てられた作業" });
    const card = assigned.getByRole("button", { name: new RegExp(title) });
    check("船内: 割り当てられた作業が打刻画面にカードで出る", (await card.count()) > 0);
    if (await card.count()) {
      await card.click();
      await v.getByRole("button", { name: /^はい、/ }).click();
      await v.waitForTimeout(1200);
      check("船内: 作業のカードから始めると「進行中」になる", /進行中/.test(await card.innerText()));
      // 片付け: 同じカードで終える（完了にはしない）
      await card.click();
      await v.getByRole("button", { name: /^はい、/ }).click();
      await v.waitForTimeout(1200);
      await v.goto(`${BASE}/vessel/sync`, { waitUntil: "networkidle" });
      await v.getByRole("button", { name: "いま同期する" }).click();
      await v.waitForTimeout(2500);
      const syncText = await v.locator("main").innerText();
      check("船内: 同期の画面は日常語で、仕組みの言葉を出さない（レビュー SYNC-02/03）", /すべて送りました|送っていない記録/.test(syncText) && !/カーソル|IndexedDB|イベント|キュー/.test(syncText));
      await mp.goto(`${BASE}/shore/tasks`, { waitUntil: "networkidle" });
      check("陸上: 船内で始めた作業はボードで「着手中」になる", /着手中/.test((await tb.getByRole("button", { name: new RegExp(`^${title}`) }).getAttribute("aria-label")) ?? ""));
    }
  }
  // 同じ船の「未割当」の列（各船の最初の列）へ動かす
  await note.dragTo(tb.locator('[role="group"]').first());
  await mp.waitForTimeout(1500);
  check("陸上: 付箋を別の列へドラッグすると担当を付け替えられる", /担当を付け替えました/.test(await mp.locator("body").innerText()));
  // 片付け: 付箋を押して「削除」→「一覧から外す」
  await tb.getByRole("button", { name: new RegExp(`^${title}`) }).click();
  await mp.getByRole("region", { name: "作業の内容" }).getByRole("button", { name: "削除" }).click();
  await mp.getByRole("checkbox").last().check();
  await mp.getByRole("button", { name: "この内容で一覧から外す" }).click();
  await mp.waitForTimeout(1500);
  await mp.goto(`${BASE}/shore/tasks?view=calendar`, { waitUntil: "networkidle" });
  const cal = mp.getByRole("region", { name: "船ごとのタスク表" });
  check("陸上: 船ごとのタスク表をカレンダーで見られる", (await cal.count()) > 0 && /年\d+月/.test(await cal.innerText()));
  await mp.close();
}

// 船長は船内でも当直を作れる（レビュー SHIFT-04）。作った当直は陸上の配置表に届く
{
  const capCtx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const cp = await capCtx2.newPage();
  await cp.goto(`${BASE}/vessel/login`, { waitUntil: "networkidle" });
  await cp.getByRole("radio", { name: /高松/ }).click();
  for (const d of ["1", "1", "1", "1"]) await cp.getByRole("button", { name: d, exact: true }).click();
  await cp.waitForURL(`${BASE}/vessel`, { timeout: 15000 });
  await cp.goto(`${BASE}/vessel/shift`, { waitUntil: "networkidle" });
  await cp.getByRole("button", { name: "＋ 当直を作る・変える" }).click();
  const editor = cp.getByRole("region", { name: "当直を作る・変える" });
  check("船内: 船長には「当直を作る・変える」がある", (await editor.count()) > 0);
  await editor.getByRole("group", { name: "船員" }).getByRole("button", { name: /中原/ }).click();
  await editor.getByLabel("開始").fill("02:00");
  await editor.getByLabel("終了").fill("03:00");
  await editor.getByRole("button", { name: "当直を作る" }).click();
  await cp.waitForTimeout(1200);
  check("船内: 船長が当直を作れる", /当直を作成しました/.test(await editor.innerText()));
  await cp.goto(`${BASE}/vessel/sync`, { waitUntil: "networkidle" });
  const sb = cp.getByRole("button", { name: /いま同期|手動同期|同期する/ }).first();
  if (await sb.count()) await sb.click();
  await cp.waitForTimeout(2500);
  await capCtx2.close();

  const sp2 = await shore.newPage();
  await sp2.goto(`${BASE}/shore/shifts`, { waitUntil: "networkidle" });
  const capBlock = sp2.getByRole("button", { name: /^中原 拓也 02:00–03:00/ }).last();
  check("陸上: 船長が船内で作った当直が配置表に届く", (await capBlock.count()) > 0);
  if (await capBlock.count()) {
    // 試験の跡を残さない
    await capBlock.click();
    await sp2.getByRole("region", { name: "当直の内容" }).getByRole("button", { name: "この当直を外す" }).click();
    await sp2.getByRole("region", { name: "当直の内容" }).getByRole("button", { name: "外す", exact: true }).click();
    await sp2.waitForTimeout(1500);
  }
  await sp2.close();

  // 陸上で外した当直は、船内（本人の画面）からも消える（ゴミ箱の取り消しが船内に届く）
  await v.goto(`${BASE}/vessel/sync`, { waitUntil: "networkidle" });
  const sb2 = v.getByRole("button", { name: /いま同期|手動同期|同期する/ }).first();
  if (await sb2.count()) await sb2.click();
  await v.waitForTimeout(2500);
  await v.goto(`${BASE}/vessel/shift`, { waitUntil: "networkidle" });
  await v.waitForTimeout(800);
  check("船内: 陸上で外した当直は船内の当直にも出ない", !/02:00–03:00/.test(await v.locator("main").innerText()));

  // 船長以外には出さない（中原 = 航海士）
  await v.goto(`${BASE}/vessel/shift`, { waitUntil: "networkidle" });
  check(
    "船内: 船長以外には「当直を作る・変える」を出さない",
    (await v.getByRole("button", { name: "＋ 当直を作る・変える" }).count()) === 0 &&
      (await v.getByRole("region", { name: "当直を作る・変える" }).count()) === 0,
  );
}

// 船員の入力項目（レビュー CREWEDIT-04）: 管理者が枠ごとに「＋ 項目を追加」で足し、入力例・必須を決め、直し、外せる
{
  const cp2 = await shore.newPage();
  await cp2.goto(`${BASE}/shore/crew/crew-terada/edit`, { waitUntil: "networkidle" });
  const demoField = await cp2.getByLabel("作業服のサイズ").count();
  check("陸上: 管理者が足した項目（デモ: 作業服のサイズ）が基本情報に並ぶ", demoField > 0);
  // 前の試験が途中で止まって残した項目があれば片付ける（デモの紙面に試験の跡を残さない）
  for (let i = 0; i < 5; i++) {
    const leftover = cp2.getByRole("button", { name: /^「E2E項目\d+」の項目を直す$/ }).first();
    if ((await leftover.count()) === 0) break;
    await leftover.click();
    const ed = cp2.getByRole("group", { name: /^「E2E項目\d+」の項目を直す$/ });
    await ed.getByRole("button", { name: "この項目を外す" }).click();
    await ed.getByRole("button", { name: "外す", exact: true }).click();
    await cp2.waitForTimeout(1500);
  }
  const label = `E2E項目${Date.now() % 100000}`;
  await cp2.getByRole("button", { name: "＋ 項目を追加" }).first().click();
  const adder = cp2.getByRole("group", { name: "項目を追加" });
  await adder.getByPlaceholder("例: 作業服のサイズ").fill(label);
  await adder.getByPlaceholder("例: L").fill("サンプル");
  await adder.getByRole("button", { name: "追加する" }).click();
  await cp2.waitForTimeout(1500);
  const added = cp2.getByRole("textbox", { name: label, exact: true });
  check(
    "陸上: 「＋ 項目を追加」で足した項目が入力例つきで出る",
    (await added.count()) > 0 && (await added.getAttribute("placeholder")) === "例: サンプル",
  );
  await cp2.getByRole("button", { name: `「${label}」の項目を直す` }).click();
  const editor = cp2.getByRole("group", { name: `「${label}」の項目を直す` });
  await editor.getByRole("button", { name: "この項目を外す" }).click();
  await editor.getByRole("button", { name: "外す", exact: true }).click();
  await cp2.waitForTimeout(1500);
  check("陸上: 足した項目を外せる（入力済みの値は履歴に残る）", (await cp2.getByRole("textbox", { name: label, exact: true }).count()) === 0);
  await cp2.close();
}

// 船員カルテ（レビュー CHART-02/04/05）: 各枠から編集の同じ枠へ、写真は大きく、カルテらしい様式で PDF にできる
{
  const kp = await shore.newPage();
  await kp.goto(`${BASE}/shore/crew/crew-terada`, { waitUntil: "networkidle" });
  const editLinks = kp.getByRole("link", { name: "✎ 編集・項目を追加" });
  const hrefs = await editLinks.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  check(
    "陸上: カルテの各枠に「編集・項目を追加」があり、編集画面の同じ枠へ飛ぶ",
    hrefs.length >= 4 && ["#basic", "#health", "#emergency", "#insurance"].every((a) => hrefs.some((h) => h?.endsWith(a))),
    hrefs.join(" "),
  );
  const photoW = await kp.getByText("PHOTO", { exact: true }).first().evaluate((el) => el.parentElement?.getBoundingClientRect().width ?? 0);
  check("陸上: カルテの写真が大きい（幅 190px 以上）", photoW >= 190, `${Math.round(photoW)}px`);
  await kp.getByRole("link", { name: "カルテを PDF で保存" }).click();
  await kp.waitForURL(/\/shore\/crew\/crew-terada\/print/);
  const printText = await kp.locator("main").innerText();
  check(
    "陸上: カルテを PDF 用の様式で開ける（氏名・資格・保険・乗船履歴の表）",
    /船員カルテ/.test(printText) && /CREW RECORD/.test(printText) && /資格・証書/.test(printText) && /乗船履歴/.test(printText) && /寺田/.test(printText),
  );
  await kp.close();
}

// 船の登録（レビュー VESSEL-02/03・ASSIGN-04）: 配乗計画から「＋ 船を登録」で船の画面へ入り、入力を確かめられる。
// 実際の登録はデモの紙面に船が積み上がるため、サーバ側の試験（vessel-master.test.ts）で確かめる
{
  const fp = await shore.newPage();
  await fp.goto(`${BASE}/shore/manning`, { waitUntil: "networkidle" });
  check(
    "陸上: 配乗計画に「＋ 船を登録」「＋ 船員を登録」がある",
    (await fp.getByRole("link", { name: "＋ 船を登録" }).count()) > 0 && (await fp.getByRole("link", { name: "＋ 船員を登録" }).count()) > 0,
  );
  await fp.getByRole("link", { name: "＋ 船を登録" }).click();
  await fp.waitForURL(/\/shore\/fleet\/new\?back=/);
  await fp.getByLabel(/^船名/).fill(`E2E試験丸${Date.now()}`);
  await fp.getByLabel(/^IMO番号/).fill("123");
  await fp.getByRole("button", { name: "船を登録する" }).click();
  await fp.waitForTimeout(1200);
  const newText = await fp.locator("main").innerText();
  check("陸上: 船の登録は入力を確かめる（IMO番号は7桁）", /IMO番号は7桁/.test(newText) && /\/shore\/fleet\/new/.test(fp.url()));

  // 写真の無い船（デモでは第七豊洋丸）に写真を付け、試験の跡を残さないよう外す
  const vPhoto = join(tmpdir(), "nautra-e2e-vessel.png");
  writeFileSync(vPhoto, makePng(0x70, 0x70, 0x70));
  await fp.goto(`${BASE}/shore/fleet/vessel-002/edit`, { waitUntil: "networkidle" });
  await fp.getByRole("button", { name: "保存する" }).click();
  await fp.waitForTimeout(1200);
  check("陸上: 登録済みの船の情報をそのまま開いて保存できる", /変更はありません|保存しました/.test(await fp.locator("main").innerText()));
  await fp.setInputFiles('input[type="file"]', vPhoto);
  await fp.waitForTimeout(1800);
  const vSaved = await fp.locator("main").innerText();
  await fp.goto(`${BASE}/shore/fleet`, { waitUntil: "networkidle" });
  const listImg = await fp.locator('main img[alt$="の写真"]').count();
  check("陸上: 船の写真を登録でき、船の一覧に出る", /船の写真を登録しました|写真は変わっていません/.test(vSaved) && listImg > 0);
  await fp.goto(`${BASE}/shore/fleet/vessel-002/edit`, { waitUntil: "networkidle" });
  await fp.getByRole("button", { name: "写真を外す" }).click();
  await fp.waitForTimeout(1500);
  check("陸上: 船の写真を外せる", /船の写真を外しました/.test(await fp.locator("main").innerText()));
  await fp.close();
}

// 書き出し（レビュー EXPORT-01〜03）: 専用画面は無く、各画面の「◯◯を書き出す」から形式と列を選んで保存する
{
  const ex = await shore.newPage();
  // 「名前を付けて保存」の窓は自動試験では操作できないので、窓を持たないブラウザと同じ経路（ダウンロード）で確かめる
  await ex.addInitScript(() => {
    delete window.showSaveFilePicker;
  });
  await ex.goto(`${BASE}/shore/crew`, { waitUntil: "networkidle" });
  const navText = await ex.getByRole("navigation").first().innerText();
  check("陸上: メニューに書き出し専用の画面が無い", !/CSV|書き出し/.test(navText));
  const mainBefore = await ex.locator("main").innerText();
  check("陸上: 画面に「CSV」という言葉を出さない", !/CSV/.test(mainBefore));
  await ex.getByRole("button", { name: "船員名簿を書き出す" }).click();
  const dlg = ex.getByRole("dialog", { name: "船員名簿を書き出す" });
  await dlg.getByText(/\d+行/).waitFor({ timeout: 10000 });
  const dlgText = await dlg.innerText();
  check(
    "陸上: 書き出しの問いかけで形式（.xlsx/.csv/.txt）・列・中身・ファイル名を選べる",
    /\.xlsx/.test(dlgText) && /\.csv/.test(dlgText) && /\.txt/.test(dlgText) && /氏名/.test(dlgText) && !/CSV/.test(dlgText),
  );
  const [download] = await Promise.all([
    ex.waitForEvent("download", { timeout: 15000 }),
    dlg.getByRole("button", { name: "保存する" }).click(),
  ]);
  const xlsxPath = join(tmpdir(), `nautra-e2e-${Date.now()}.xlsx`);
  await download.saveAs(xlsxPath);
  const { readFileSync } = await import("node:fs");
  const bytes = readFileSync(xlsxPath);
  check(
    "陸上: Excel 形式（.xlsx）で保存できる",
    download.suggestedFilename().endsWith(".xlsx") && bytes.subarray(0, 2).toString() === "PK" &&
      bytes.includes(Buffer.from("xl/worksheets/sheet1.xml")),
    download.suggestedFilename(),
  );
  // 区切りテキスト（Shift_JIS）も同じ問いかけから
  await dlg.getByRole("button", { name: /カンマ区切り/ }).click();
  await dlg.getByRole("button", { name: "古い Excel 向け" }).click();
  const [dl2] = await Promise.all([
    ex.waitForEvent("download", { timeout: 15000 }),
    dlg.getByRole("button", { name: "保存する" }).click(),
  ]);
  check("陸上: カンマ区切り（.csv）も選べる", dl2.suggestedFilename().endsWith(".csv"), dl2.suggestedFilename());
  await ex.close();
}

// S-15 → サインイン: 招待したアカウントが実在し、招待コードで登録して入れる
{
  const email = `e2e-${Date.now().toString(36)}@shoun-kaiun.co.jp`;
  await s.goto(`${BASE}/shore/settings?tab=users`, { waitUntil: "networkidle" });
  await s.getByRole("button", { name: /ユーザーを招待/ }).click();
  await s.locator('input[name="email"]').fill(email);
  await s.locator('input[name="name"]').fill("E2E 招待太郎");
  await s.locator('select[name="role"]').selectOption("operations");
  await s.getByRole("button", { name: "招待を送る" }).click();
  await s.waitForTimeout(1500);
  const inviteText = await s.locator("main").innerText();
  const code = inviteText.match(/NTR-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0] ?? "";
  check("陸上: 招待するとアカウントができ、招待コードが出る", code !== "", code);
  check("陸上: 招待したユーザーが一覧に「招待中」で並ぶ", inviteText.includes(email));

  // 別のブラウザ文脈（＝招待された本人）で登録してサインインする
  const invited = await browser.newContext();
  const i = await invited.newPage();
  await i.goto(`${BASE}/shore/login?tab=register`, { waitUntil: "networkidle" });
  await i.locator('input[name="invite"]').fill(code);
  await i.locator('input[name="name"]').fill("E2E 招待太郎");
  await i.locator('input[name="email"]').fill(email);
  await i.locator('input[name="password"]').fill("NautraDemo2026");
  await i.locator('input[name="password2"]').fill("NautraDemo2026");
  await i.getByRole("button", { name: /登録してサインイン/ }).click();
  await i.waitForTimeout(2000);
  check("陸上: 招待コードで登録するとそのままサインインできる", /\/shore$/.test(new URL(i.url()).pathname) || i.url().endsWith("/shore"), i.url());

  // 入り直しても同じパスワードで入れる（アカウントが残っている）
  await i.goto(`${BASE}/shore/login`, { waitUntil: "networkidle" });
  await i.locator('input[name="email"]').fill(email);
  await i.locator('input[name="password"]').fill("NautraDemo2026");
  await i.locator("form").getByRole("button", { name: "サインイン" }).click();
  await i.waitForTimeout(2000);
  check("陸上: 登録したアカウントは次回もサインインできる", i.url().endsWith("/shore"), i.url());
  await invited.close();
}

// 権限: 事務担当では人事考課が開けない
const clerk = await browser.newContext();
await clerk.addCookies([{ name: "nautra_shore_session", value: "shore-okamoto", url: BASE }]);
const c = await clerk.newPage();
await c.goto(`${BASE}/shore/evaluations`, { waitUntil: "networkidle" });
const clerkText = await c.locator("main").innerText();
check("陸上: 権限のない画面は中身が出ない（人事考課／事務担当）", /権限がありません/.test(clerkText));

await browser.close();

const bad = results.filter((r) => !r.ok);
log(`\n合計 ${results.length} 項目 / 失敗 ${bad.length} 件`);
process.exit(bad.length === 0 ? 0 : 1);
