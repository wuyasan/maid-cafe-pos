import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import localFont from "next/font/local";
import "./globals.css";

// ── Self-hosted fonts (woff2 files in /public/fonts/) ─────────────────────────
// Google Fonts were downloaded at build-prep time; no network access needed at
// build or runtime. Noto Sans SC is loaded via @font-face in globals.css → fonts.css
// (with unicode-range subsetting) so it is excluded from next/font/local to avoid
// bundling 101 files as a single declaration.

// Display / heading font — warm rounded Japanese gothic
const zenMaru = localFont({
  src: [
    { path: "../public/fonts/zen-maru-500-latin-ext.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/zen-maru-500-latin.woff2",     weight: "500", style: "normal" },
    { path: "../public/fonts/zen-maru-700-latin-ext.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/zen-maru-700-latin.woff2",     weight: "700", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
  fallback: ["Zen Maru Gothic", "Noto Sans SC", "system-ui", "sans-serif"],
});

// Body text — clean Japanese gothic
const zenKaku = localFont({
  src: [
    { path: "../public/fonts/zen-kaku-400-latin-ext.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/zen-kaku-400-latin.woff2",     weight: "400", style: "normal" },
    { path: "../public/fonts/zen-kaku-500-latin-ext.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/zen-kaku-500-latin.woff2",     weight: "500", style: "normal" },
    { path: "../public/fonts/zen-kaku-700-latin-ext.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/zen-kaku-700-latin.woff2",     weight: "700", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
  fallback: ["Zen Kaku Gothic New", "Noto Sans SC", "system-ui", "sans-serif"],
});

// Monospaced-width numerics — prices, counts, table codes
const spaceGrotesk = localFont({
  src: [
    { path: "../public/fonts/space-grotesk-latin-ext.woff2", weight: "500 700", style: "normal" },
    { path: "../public/fonts/space-grotesk-latin.woff2",     weight: "500 700", style: "normal" },
  ],
  variable: "--font-num",
  display: "swap",
  fallback: ["Space Grotesk", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Maid Cafe",
  description: "Maid cafe ordering & POS",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`h-full antialiased ${zenMaru.variable} ${zenKaku.variable} ${spaceGrotesk.variable}`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
