import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { PRODUCT_NAME, t } from "@/i18n/ja";
import { UIProvider } from "@/ui";
import { ServiceWorkerRegistrar } from "./_components/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: t.appSubtitle,
  // PWA（要件定義書 10.1 オフラインファースト / 10.2 端末を選ばない）
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: PRODUCT_NAME, statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  // 船内は手袋・揺れる環境での操作があるため、拡大を禁止しない（10.2 ユーザビリティ）
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    /**
     * 文字は Geist（DESIGN.md「Typography」）。
     * `geist` パッケージはフォント実体を同梱しており、ビルド時に通信しないため
     * 船内の閉じた環境でも同じ見た目になる。日本語は端末のゴシックへ落ちる
     * （Geist は和文を持たないため。字面の差は tailwind.config.ts の型階層で吸収する）。
     */
    <html lang="ja" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <UIProvider>{children}</UIProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
