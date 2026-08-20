import { heroui } from "@heroui/react";
import type { Config } from "tailwindcss";

/**
 * HeroUI テーマ2系統（基本設計書 6.3）:
 * - vessel: 船内テーマ。大文字・高コントラスト（暗所・手袋操作前提）
 * - shore : 陸上テーマ。情報密度優先
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
            background: "#0c1524",
            foreground: "#f4f7fb",
            content1: "#152239",
            content2: "#1c2c49",
            content3: "#25375a",
            content4: "#2f436c",
            primary: { DEFAULT: "#3b82f6", foreground: "#ffffff" },
            success: { DEFAULT: "#22c55e", foreground: "#052e12" },
            warning: { DEFAULT: "#f5a524", foreground: "#221200" },
            danger: { DEFAULT: "#ef4444", foreground: "#ffffff" },
            focus: "#3b82f6",
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
            background: "#f6f7f9",
            foreground: "#101828",
            primary: { DEFAULT: "#1e5aa8", foreground: "#ffffff" },
            focus: "#1e5aa8",
          },
        },
      },
    }),
  ],
};

export default config;
