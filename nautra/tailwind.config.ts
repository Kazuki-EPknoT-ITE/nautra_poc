import { heroui } from "@heroui/react";
import type { Config } from "tailwindcss";

/**
 * HeroUI テーマ2系統（基本設計書 6.3）:
 * - vessel: 船内テーマ。大文字・高コントラスト（暗所・手袋操作前提）
 * - shore : 陸上テーマ。情報密度優先
 *
 * 基調色は白黒（モノクローム）。primary は「船内=白／陸上=黒」で、押せる面と
 * 情報面をコントラスト差だけで区別する。
 * ただし success/warning/danger は法令遵守の2段階アラート（要件定義書 3.2.5）で
 * 意味を担うため色を保持する（併記するアイコン・文言と合わせて色だけに依存しない）。
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
          extend: "dark",
          colors: {
            background: "#0a0a0b",
            foreground: "#f7f7f8",
            content1: "#17181a",
            content2: "#1f2124",
            content3: "#2a2c30",
            content4: "#35383d",
            primary: { DEFAULT: "#f2f3f5", foreground: "#0b0c0d" },
            secondary: { DEFAULT: "#a8adb3", foreground: "#0b0c0d" },
            success: { DEFAULT: "#22c55e", foreground: "#052e12" },
            warning: { DEFAULT: "#f5a524", foreground: "#221200" },
            danger: { DEFAULT: "#ef4444", foreground: "#ffffff" },
            focus: "#f2f3f5",
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
