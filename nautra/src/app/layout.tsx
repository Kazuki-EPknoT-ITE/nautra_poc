import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PRODUCT_NAME, t } from "@/i18n/ja";
import { UIProvider } from "@/ui";
import { ServiceWorkerRegistrar } from "./_components/service-worker";

/**
 * 材質と書体（実体は globals.css の先頭で `@import` している）。
 *
 * **CSS の入口はこの1本だけにする**。レイアウトから CSS を何本も import すると、
 * Next のビルドが分割したチャンク名と出力ファイル名がずれ、いちばん大きい
 * （Tailwind の）束だけが読み込まれない、という壊れかたをする。
 */
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
  // ページ背景と同じ暖かいグレー（デザインの Canvas）
  themeColor: "#DFE1E0",
  width: "device-width",
  initialScale: 1,
  // 船内は手袋・揺れる環境での操作があるため、拡大を禁止しない（10.2 ユーザビリティ）
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh font-sans antialiased">
        <UIProvider>{children}</UIProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
