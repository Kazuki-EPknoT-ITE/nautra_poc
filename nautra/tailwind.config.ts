import { heroui } from "@heroui/react";
import type { Config } from "tailwindcss";

/**
 * デザイントークン（`design/poc_design/Nautra デザイン.dc.html` が正本）。
 *
 * 意匠の要点:
 * - **暖かいグレーの紙面**（Canvas `#DFE1E0`）に白いカードを置く、密度の高い実務ツール。
 * - 唯一のアクセントは **ブロンズ `#917351`**。選択中の項目・主操作・見出しの符牒に使う。
 * - 警告は **`#9B2A1E`**（レンガ色）。注意はブロンズ系の `#6F5638`＋クリーム `#EFE9E1`。
 * - 角は**ほぼ立てる**（3px / 4px）。丸みで柔らかくしない。
 * - 文字は **Noto Sans JP**、**数値・符牒は IBM Plex Mono**。
 *   時刻・時間・件数・ID は等幅にして桁を揃える（船の記録は数字を読み比べるため）。
 * - 本文は 11〜13px と小さい。1画面に情報を詰めて、めくらずに突き合わせられるようにする。
 *
 * 画面側に色・角丸・影を直書きしない。ここと globals.css が唯一の情報源（基本設計書 6.3）。
 */

/* ── 面と文字（デザインの使用頻度順に採った実測値） ── */
const CANVAS = "#DFE1E0"; // ページ背景（暖かいグレー）
const PAPER = "#FFFFFF"; // カード面
const SURFACE_ALT = "#F6F6F6"; // カード内の小ブロック
const FILL = "#E8E8E8"; // 入力の下地・既定チップ・区切り
const HAIRLINE = "#CCCCCC"; // 枠線（ヘッダ・テーブル）
const INK = "#0A0A0A"; // 見出し
const BODY = "#1A1A1A"; // 本文
const BODY_SOFT = "#333333"; // 本文（やや弱い）
const MUTED = "#666666"; // 補助
const FAINT = "#999999"; // 最も弱い（表の見出し・単位）
const DARK = "#231F20"; // サイドバー・暗い帯
const DARK_LINE = "#333333"; // 暗い面の中の区切り

/* ── アクセントと状態 ── */
const ACCENT = "#917351"; // ブロンズ（選択・主操作・符牒）
const ACCENT_DEEP = "#6F5638"; // ブロンズの濃い側（注意の文字）
const ACCENT_SOFT = "#99877D"; // 暗い面の上の弱いブロンズ
const ACCENT_BG = "#EFE9E1"; // クリーム（注意の下地）
const ALERT = "#9B2A1E"; // レンガ（警告・破壊的操作）
const ALERT_BG = "#F2E2DF"; // 警告の下地

/**
 * 文字色の階調。デザインは 999999 より淡い文字を使わない。
 * `text-foreground-500` などの意味クラスがこの表を引く。
 */
const foreground = {
  DEFAULT: BODY,
  50: PAPER,
  100: SURFACE_ALT,
  200: FILL,
  300: HAIRLINE,
  400: FAINT,
  500: MUTED,
  600: MUTED,
  700: BODY_SOFT,
  800: BODY,
  900: INK,
};

/** 面の階調（`bg-default-100` などが参照する） */
const defaultScale = {
  DEFAULT: FILL,
  foreground: BODY_SOFT,
  50: SURFACE_ALT,
  100: FILL,
  200: HAIRLINE,
  300: HAIRLINE,
  400: FAINT,
  500: MUTED,
  600: BODY_SOFT,
  700: DARK_LINE,
  800: DARK,
  900: INK,
};

/**
 * 適合(ok)は無彩色のまま。デザインの `CHIP.ok` は `#E8E8E8` の下地に `#333333` の文字で、
 * 色ではなく記号（✓）と文言で意味を示す。
 */
const neutralOk = {
  DEFAULT: BODY_SOFT,
  foreground: PAPER,
  50: SURFACE_ALT,
  100: FILL,
  200: HAIRLINE,
  500: MUTED,
  600: BODY_SOFT,
  700: BODY_SOFT,
};

/** 注意（要件定義書 3.2.5 の「上限接近＝注意」）。デザインではブロンズ系で表す */
const caution = {
  DEFAULT: ACCENT_DEEP,
  foreground: PAPER,
  50: "#FBF9F7",
  100: ACCENT_BG,
  200: "#D9C9B5",
  500: ACCENT,
  600: ACCENT_DEEP,
  700: ACCENT_DEEP,
};

/** 警告・破壊的操作（要件定義書 3.2.5 の「超過＝警告」） */
const danger = {
  DEFAULT: ALERT,
  foreground: PAPER,
  50: "#FBF7F6",
  100: ALERT_BG,
  200: "#D98A80",
  500: ALERT,
  600: ALERT,
  700: "#8C2F2F",
};

const colors = {
  background: CANVAS,
  foreground,
  content1: PAPER, // カード
  content2: SURFACE_ALT, // カード内の小ブロック
  content3: FILL,
  content4: HAIRLINE,
  divider: FILL,
  overlay: INK,
  focus: ACCENT,
  default: defaultScale,
  /** 主操作はブロンズの塗り（デザインの primary ボタン） */
  primary: { DEFAULT: ACCENT, foreground: PAPER, 500: ACCENT, 600: ACCENT_DEEP },
  /** 副操作は白地にヘアライン。塗りではなく輪郭で示す */
  secondary: { DEFAULT: PAPER, foreground: BODY_SOFT, 500: FILL, 600: HAIRLINE },
  success: neutralOk,
  warning: caution,
  danger,
};

/**
 * 角丸はほぼ立てる。デザインの実測は 3px（260箇所）と 4px（121箇所）が大半で、
 * 6px はモーダル、12px は限られた箱、50% はアバターだけ。
 */
const layout = {
  radius: { small: "3px", medium: "3px", large: "4px" },
  borderWidth: { small: "1px", medium: "1px", large: "1px" },
  disabledOpacity: "0.45",
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
        sans: ["var(--font-sans)", "Noto Sans JP", "system-ui", "sans-serif"],
        /** 数値・時刻・ID・符牒に使う。桁を揃えて読み比べられるようにする */
        mono: ["var(--font-mono)", "IBM Plex Mono", "ui-monospace", "monospace"],
      },
      /**
       * デザインの実測サイズに合わせた刻み。11px と 13px が本文の主役で、
       * 現行より一段小さい（1画面に情報を詰める意匠）。
       */
      fontSize: {
        "2xs": ["10px", { lineHeight: "1.5", letterSpacing: "0.14em" }], // 符牒・群見出し（mono）
        xs: ["11px", { lineHeight: "1.6" }], // 補助・チップ
        sm: ["12px", { lineHeight: "1.7" }], // 副次本文
        base: ["13px", { lineHeight: "1.8" }], // 本文
        lg: ["14px", { lineHeight: "1.7" }], // 強めの本文・ボタン
        xl: ["16px", { lineHeight: "1.6" }], // 小見出し
        "2xl": ["17px", { lineHeight: "1.5" }], // 画面名
        "3xl": ["22px", { lineHeight: "1.45", letterSpacing: "-0.01em" }], // 人名・大見出し
        "4xl": ["30px", { lineHeight: "1.1" }], // 数値の主役
        "5xl": ["34px", { lineHeight: "1.05" }], // 統計の数値
      },
      maxWidth: { page: "1920px" },
      boxShadow: {
        menu: "0 12px 30px rgba(10,10,10,0.18)",
        modal: "0 24px 60px rgba(10,10,10,0.35)",
      },
      spacing: { sidebar: "252px", topbar: "64px" },
    },
  },
  plugins: [
    heroui({
      themes: {
        /** 船内: 同じトークンで、文字だけ1段大きくする（globals.css の `.vessel`） */
        vessel: { extend: "light", colors, layout },
        shore: { extend: "light", colors, layout },
      },
    }),
  ],
};

export default config;
