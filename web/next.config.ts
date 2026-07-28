import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// The production site is mounted below acronia-webapps.com/maid-cafe.
// Keep the public value available to client-side code that uses fetch() or
// window.location, since those APIs do not apply Next.js' basePath for us.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/maid-cafe";

// Derive the FastAPI origin from API_BASE_URL (strip /api/v1) or a dedicated
// UPLOAD_ORIGIN / API_ORIGIN variable, falling back to the local dev default.
const uploadOrigin =
  process.env.UPLOAD_ORIGIN ??
  process.env.API_ORIGIN ??
  (process.env.API_BASE_URL
    ? process.env.API_BASE_URL.replace(/\/api\/v1\/?$/, "")
    : "http://127.0.0.1:8000");

const nextConfig: NextConfig = {
  basePath,
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        destination: `${uploadOrigin}/uploads/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
