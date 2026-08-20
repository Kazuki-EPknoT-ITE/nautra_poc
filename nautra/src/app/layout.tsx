import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PRODUCT_NAME, t } from "@/i18n/ja";
import { UIProvider } from "@/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: t.appSubtitle,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh antialiased">
        <UIProvider>{children}</UIProvider>
      </body>
    </html>
  );
}
