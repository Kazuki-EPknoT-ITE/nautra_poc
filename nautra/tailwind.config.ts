import { heroui } from "@heroui/react";
import type { Config } from "tailwindcss";

/**
 * HeroUI テーマ2系統（基本設計書 6.3）:
 * - vessel: 船内テーマ。白ベース・大文字（手袋操作前提の大きなタップ領域）
 * - shore : 陸上テーマ。白ベース・情報密度優先
 *
 * 基調色は白黒（モノクローム）。白い下地に黒の primary を置き、押せる面と情報面を
 * 塗り・枠線・コントラスト差で区別する。
 * success/warning/danger は法令遵守の2段階アラート（要件定義書 3.2.5）で意味を担うため
 * HeroUI ライトテーマの色を保持する（アイコン・文言を併記し色だけに依存しない）。
 */
const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  plugins: [
    heroui({
      themes: {
        vessel: {
          extend: "light",
          colors: {
            background: "#ffffff",
            foreground: "#0b0c0d",
            content1: "#ffffff",
            content2: "#f4f5f6",
            content3: "#e9eaec",
            content4: "#dcdee1",
            primary: { DEFAULT: "#17181a", foreground: "#ffffff" },
            secondary: { DEFAULT: "#5f646a", foreground: "#ffffff" },
            focus: "#17181a",
          },
          layout: {
            fontSize: {
              tiny: "0.9375rem",
              small: "1.0625rem",
              medium: "1.1875rem",
              large: "1.375rem",
            },
            radius: { small: "10px", medium: "14px", large: "18px" },
          },
        },
        shore: {
          extend: "light",
          colors: {
            background: "#fbfbfc",
            foreground: "#0b0c0d",
            content1: "#ffffff",
            content2: "#f4f5f6",
            content3: "#e9eaec",
            content4: "#dcdee1",
            primary: { DEFAULT: "#17181a", foreground: "#ffffff" },
            secondary: { DEFAULT: "#5f646a", foreground: "#ffffff" },
            focus: "#17181a",
          },
        },
      },
    }),
  ],
};

export default config;
