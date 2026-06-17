import GlobalLanguageToggle from "@/components/i18n/GlobalLanguageToggle";
import "./globals.css";
import type { ReactNode } from "react";

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body><GlobalLanguageToggle />
{children}</body>
    </html>
  );
}