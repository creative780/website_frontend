// app/layout.tsx
import "./globals.css";
import "aos/dist/aos.css";
import "react-toastify/dist/ReactToastify.css";

import { Poppins } from "next/font/google";
import type { Metadata, Viewport } from "next";
import Providers from "./providers";

import { API_BASE_URL as API_FROM_UTIL } from "./utils/api";
import FaviconClient from "./FaviconClient";
import ClientTitleLock from "./ClientTitleLock";

const API_BASE_URL =
  (API_FROM_UTIL as string) ||
  (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();

const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();

// ✅ add a canonical site url
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.com").trim();

const DEFAULT_TITLE = "Creative Prints";
const DEFAULT_DESCRIPTION =
  "Creative Prints — high-performance storefront with crisp UX, fast loads, and modern accessibility.";
const DEFAULT_FAVICON = "/favicon.ico";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

async function fetchJSON<T = any>(path: string): Promise<T | null> {
  if (!API_BASE_URL) return null;
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 5000);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store",
      headers: FRONTEND_KEY ? { "X-Frontend-Key": FRONTEND_KEY } : undefined,
      signal: ac.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}

function originOf(href?: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, "http://_/"); // base to allow relative inputs
    if (u.origin === "http://_" || u.origin === "https://_") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const titleData = await fetchJSON<{ site_title?: string }>(
    "/api/show-sitetitle-details/"
  );
  const siteTitle =
    (titleData?.site_title || DEFAULT_TITLE).trim() || DEFAULT_TITLE;

  const favData = await fetchJSON<{ favicon?: { url?: string } }>(
    "/api/show-favicon/"
  );
  const iconUrl = (favData?.favicon?.url || "").trim() || DEFAULT_FAVICON;

  return {
    // ✅ set metadataBase (fixes your build warnings about social images)
    metadataBase: new URL(SITE_URL),

    title: { absolute: siteTitle },
    description: DEFAULT_DESCRIPTION,
    icons: {
      icon: iconUrl,
      shortcut: iconUrl,
      apple: iconUrl,
    },
    manifest: "/site.webmanifest",
    openGraph: {
      title: siteTitle,
      description: DEFAULT_DESCRIPTION,
      type: "website",
      url: "/",           // resolved against metadataBase
      images: [{ url: iconUrl }], // absolute if iconUrl is absolute; else resolved via metadataBase
    },
    twitter: {
      card: "summary",
      title: siteTitle,
      description: DEFAULT_DESCRIPTION,
      images: [iconUrl],
    },
    // ❌ themeColor moved out to viewport below
    alternates: { canonical: "/" },
  };
}

// ✅ move themeColor into viewport (Next 15 requirement)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
};

function PerfHeadLinks() {
  const apiOrigin = originOf(API_BASE_URL || undefined);
  // 🛠️ fix: point at an actual asset origin instead of undefined
  // If your favicon or assets live on the same host, you can skip this entirely.
  const cdnOrigin = process.env.NEXT_PUBLIC_CDN_ORIGIN || undefined;

  return (
    <>
      {apiOrigin && (
        <>
          <link rel="preconnect" href={apiOrigin} crossOrigin="" />
          <link rel="dns-prefetch" href={apiOrigin} />
        </>
      )}
      {cdnOrigin && cdnOrigin !== apiOrigin && (
        <>
          <link rel="preconnect" href={cdnOrigin} crossOrigin="" />
          <link rel="dns-prefetch" href={cdnOrigin} />
        </>
      )}
    </>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${poppins.variable}`} suppressHydrationWarning>
      <head>
        <PerfHeadLinks />
      </head>
      <body className="antialiased font-sans min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <Providers>
          <FaviconClient />
          <ClientTitleLock />
          {children}
        </Providers>
      </body>
    </html>
  );
}
