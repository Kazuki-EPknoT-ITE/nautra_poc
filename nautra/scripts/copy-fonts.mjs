import fs from "node:fs";
import path from "node:path";

/**
 * 和文フォントを `public/fonts/` へ用意する（`predev` / `prebuild` で走る）。
 *
 * **分割版ではなく「まとめて1本」の版を使う。**
 * `@fontsource` の既定（`400.css` など）は和文を `unicode-range` で 124 個に割っていて、
 * 1画面ぶんの漢字を出すだけで 40 前後のファイルを取りにいく。1本あたりは小さいが、
 * HTTP/1.1 の同時接続（6本）を font が埋めてしまい、**次の画面の取得が待たされる**
 * ——実測で最初の遷移が 2.7〜3.2秒かかっていた原因がこれ。
 * 割っていない `japanese-400` / `japanese-700` なら、**1太さにつき1リクエスト**で
 * 全字形が揃い、以後どの画面へ行っても追加の取得が起きない。
 *
 * 太さは **400（本文）と 700（見出し・強調）の2つだけ**にする。和文は1太さ約 1MB あり、
 * デザインが使う 500/600 まで実体で持つと 4MB になる。500/600 はブラウザが近い実体
 * （400/700）を選ぶので、階層は保たれる。
 *
 * バンドルに載せず public へ置くのは、`src/ui/font-loader.tsx` が
 * **画面が動き出してから**読み込むため。それまでは端末の和文書体で表示される
 * （`font-display: swap`）ので、読めない時間は生まれない。
 * **外部へは通信しない**（実体を同梱する）点は従来どおりで、船内の閉じた回線でも
 * 同じ字面になる（要件定義書 10.1 オフラインファースト）。
 */

const PKG = "@fontsource/noto-sans-jp";
/** 使う面（書体 × 太さ）。和文は1本にまとまった `japanese-*` を選ぶ */
const FACES = ["japanese-400", "japanese-700", "latin-400", "latin-700", "latin-ext-400", "latin-ext-700"];

const UNICODE = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "node_modules", PKG, "unicode.json"), "utf8"),
);

const base = path.join(process.cwd(), "node_modules", PKG);
const outDir = path.join(process.cwd(), "public", "fonts", "noto-sans-jp");
const filesDir = path.join(outDir, "files");

if (!fs.existsSync(base)) {
  console.error(`[copy-fonts] ${PKG} が見つかりません。npm install を実行してください`);
  process.exit(1);
}

fs.mkdirSync(filesDir, { recursive: true });

/** 使わない実体が残っていると public が膨らむので、毎回そろえ直す */
for (const name of fs.readdirSync(filesDir)) {
  if (!FACES.some((f) => name === `noto-sans-jp-${f}-normal.woff2`)) {
    fs.rmSync(path.join(filesDir, name));
  }
}

const blocks = [];
let bytes = 0;
for (const face of FACES) {
  const [script, weight] = [face.replace(/-\d+$/, ""), face.match(/(\d+)$/)[1]];
  const cssPath = path.join(base, `${script}-${weight}.css`);
  const woff2 = `noto-sans-jp-${face}-normal.woff2`;
  const src = path.join(base, "files", woff2);
  if (!fs.existsSync(cssPath) || !fs.existsSync(src)) {
    console.error(`[copy-fonts] ${face} が見つかりません`);
    process.exit(1);
  }
  const dest = path.join(filesDir, woff2);
  if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(src).size) {
    fs.copyFileSync(src, dest);
  }
  bytes += fs.statSync(dest).size;

  // woff（旧形式）の指定は落とす。同梱しないので参照だけ残すと 404 になる
  let css = fs
    .readFileSync(cssPath, "utf8")
    .replace(/\s*url\([^)]*\.woff\)\s*format\('woff'\),?/g, "")
    .replace(/,\s*;/g, ";");

  /**
   * まとめ版の CSS は `unicode-range` を持たない（＝すべての文字に効いてしまう）。
   * そのまま並べると**最後に書いた面が全部を持っていく**ので、欧文の面には
   * 担当する範囲を書き足す。和文は範囲なしのまま先に置き、欧文をあとに置く
   * （同じ文字を両方が覆うときは、あとに書いたほうが勝つという CSS の規則を使う）。
   */
  const range = UNICODE[script];
  if (range) {
    css = css.replace(/\}\s*$/, `  unicode-range: ${range};\n}`);
  }
  blocks.push(css.trim());
}

const header = `/* 生成物。編集しない（scripts/copy-fonts.mjs が作る） */\n`;
fs.writeFileSync(path.join(outDir, "index.css"), `${header}${blocks.join("\n\n")}\n`);

console.log(
  `[copy-fonts] public/fonts/noto-sans-jp に ${FACES.length} 面（${Math.round(bytes / 1024)}KB）を用意しました`,
);
