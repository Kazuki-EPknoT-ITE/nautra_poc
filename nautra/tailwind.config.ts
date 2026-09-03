import { heroui } from "@heroui/react";
import type { Config } from "tailwindcss";

/**
 * デザイントークン（`projects/docs/DESIGN.md` が正本）。
 *
 * DESIGN.md の要点:
 * - **モノクローム**。白の紙面・柔らかいグレーの面・ヘアラインの枠線だけで階層を作り、
 *   色相で意味を作らない。唯一の有彩色は `#e7000b`（Ember）で、破壊的操作・エラーに限る。
 * - 三段の面（Canvas #f5f5f5 → Surface Alt #fafafa → Paper #ffffff）で、
 *   枠線に頼らずに層を作る。
 * - 角丸は **操作要素 18px / 容器 24px の2値のみ**。角のある要素を作らない。
 * - 文字は Geist。表示サイズほど字間を詰める（48px で -0.05em）。
 *
 * ここで定義したトークンは、画面が使っている HeroUI の意味クラス
 * （`text-foreground-500` / `text-danger` / `bg-default-100` / `bg-primary` など）を
 * 通して全画面に効く。**画面側に色や角丸を直書きしない**（基本設計書 6.3）。
 *
 * ── 法令表示のための例外（意図的） ─────────────────────────────
 * 要件定義書 3.2.5 は「2段階アラート: 上限接近＝**注意（黄）** / 超過＝**警告（赤）**」を
 * 求めている。これは装飾ではなく法令遵守の状態表示なので、次のとおり最小限で通す:
 *   - 警告(violation) → DESIGN.md の Ember `#e7000b`（エラー状態そのもの。逸脱なし）
 *   - 注意(caution)   → 琥珀 `#a16207`（**DESIGN.md への唯一の追加色**）
 *   - 適合(ok)        → **無彩色**。従来の緑をやめ、色が付くのは「注意が要るとき」だけにした
 * 色だけに依存させないため、記号（✓ / ⚠ / ✕）と文言を必ず併記する。
 * ───────────────────────────────────────────────
 */

/** DESIGN.md「Colors」 */
const INK = "#0a0a0a"; // Ink — 本文・見出し・ボタン文字
const INK_SOFT = "#171717"; // Ink Soft — 塗りボタンの背景・濃いめの文字
const MID = "#737373"; // Mid Gray — 補助文字・プレースホルダ（**これより淡い文字を作らない**）
const HAIRLINE = "#e5e5e5"; // Hairline — 枠線・入力の輪郭
const CANVAS = "#f5f5f5"; // Canvas — ページ背景・二次ボタン・入力の下地
const SURFACE_ALT = "#fafafa"; // Surface Alt — サイドバー・控えめなカード
const PAPER = "#ffffff"; // Paper — カード面
const EMBER = "#e7000b"; // Ember — 破壊的操作・エラー（唯一の有彩色）
const AMBER = "#a16207"; // 注意（法令の2段階アラート用。上記の例外）

/**
 * 文字色の階調。**#737373 より淡い文字を作らない**（DESIGN.md の Don't）。
 * そのため 400 以下も Mid Gray で止める。
 */
const foreground = {
  DEFAULT: INK,
  50: SURFACE_ALT,
  100: CANVAS,
  200: HAIRLINE,
  300: "#d4d4d4",
  400: MID,
  500: MID,
  600: MID,
  700: "#404040",
  800: "#262626",
  900: INK_SOFT,
};

/** 面の階調（`bg-default-100` などが参照する） */
const defaultScale = {
  DEFAULT: CANVAS,
  foreground: INK,
  50: SURFACE_ALT,
  100: CANVAS,
  200: HAIRLINE,
  300: "#d4d4d4",
  400: MID,
  500: MID,
  600: "#525252",
  700: "#404040",
  800: "#262626",
  900: INK_SOFT,
};

/** 適合(ok)は無彩色にする。soft badge（#f5f5f5 の下地 + 濃い文字）として描かれる */
const neutralSuccess = {
  DEFAULT: INK_SOFT,
  foreground: SURFACE_ALT,
  50: SURFACE_ALT,
  100: CANVAS,
  200: HAIRLINE,
  500: MID,
  600: INK_SOFT,
  700: INK_SOFT,
};

const caution = {
  DEFAULT: AMBER,
  foreground: "#ffffff",
  50: "#fefce8",
  100: "#fef9c3",
  200: "#fde68a",
  500: "#ca8a04",
  600: AMBER,
  700: AMBER,
};

const danger = {
  DEFAULT: EMBER,
  foreground: "#ffffff",
  50: "#fef2f2",
  100: "#fee2e2",
  200: "#fecaca",
  500: EMBER,
  600: EMBER,
  700: "#b8000a",
};

const colors = {
  background: CANVAS,
  foreground,
  content1: PAPER, // カード
  content2: SURFACE_ALT, // 控えめなカード・サイドバー
  content3: CANVAS,
  content4: HAIRLINE,
  divider: HAIRLINE,
  overlay: INK,
  focus: INK,
  default: defaultScale,
  // 主操作は「白地に黒」の反転のみ（DESIGN.md: Primary Filled Button）
  primary: { DEFAULT: INK, foreground: SURFACE_ALT, 500: INK, 600: INK_SOFT },
  // 二次操作は同じ形で明度だけ違う（DESIGN.md: Secondary Ghost Button）
  secondary: { DEFAULT: CANVAS, foreground: INK, 500: CANVAS, 600: HAIRLINE },
  success: neutralSuccess,
  warning: caution,
  danger,
};

/**
 * 角丸は2値のみ（DESIGN.md の Don't「18px（操作要素）と 24px（容器）以外を使わない」）。
 * 画面側が `radius="sm"` を渡していても丸みが失われないよう、small も 18px に寄せる。
 * 入れ子ブロックの 10px は globals.css の `.ui-inset` で直接指定する。
 */
const layout = {
  radius: { small: "18px", medium: "18px", large: "24px" },
  borderWidth: { small: "1px", medium: "1px", large: "2px" },
  disabledOpacity: "0.5",
};

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        // Geist（`geist` パッケージのローカルフォント。取得に通信を伴わない）
        sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      /**
       * DESIGN.md「Type Scale」をそのまま Tailwind の刻みに割り当てる。
       * 大きいほど字間を詰める指定も含むので、画面側は `text-2xl` と書くだけで
       * 意図した行間・字間になる（tracking-* を個別に足さない）。
       */
      fontSize: {
        xs: ["12px", { lineHeight: "1.33", letterSpacing: "0.6px" }], // caption
        sm: ["14px", { lineHeight: "1.43" }], // body
        base: ["16px", { lineHeight: "1.5" }], // body-lg
        lg: ["18px", { lineHeight: "1.56" }], // subheading
        xl: ["24px", { lineHeight: "1.33", letterSpacing: "-0.6px" }], // heading-sm
        "2xl": ["30px", { lineHeight: "1.2", letterSpacing: "-0.75px" }], // heading
        "3xl": ["36px", { lineHeight: "1.11", letterSpacing: "-0.9px" }], // heading-lg
        "4xl": ["48px", { lineHeight: "1.1", letterSpacing: "-2.4px" }], // display
        "5xl": ["48px", { lineHeight: "1.1", letterSpacing: "-2.4px" }], // display
      },
      maxWidth: { page: "1280px" }, // DESIGN.md「Page max-width」
      boxShadow: {
        // DESIGN.md「Elevation — Card」: ヘアライン + ごく浅い浮き
        card: "0 0 0 1px rgba(23,23,23,0.05), 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)",
      },
    },
  },
  plugins: [
    heroui({
      themes: {
        /** 船内: 同じトークンで、文字だけ1段大きくする（globals.css の `.vessel` 参照） */
        vessel: { extend: "light", colors, layout },
        /** 陸上: DESIGN.md の既定（compact） */
        shore: { extend: "light", colors, layout },
      },
    }),
  ],
};

export default config;
