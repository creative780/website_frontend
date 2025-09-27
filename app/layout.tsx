import "./globals.css";
import "aos/dist/aos.css";
import "react-toastify/dist/ReactToastify.css";

import { Poppins } from "next/font/google";
import type { Metadata } from "next";
import Providers from "./providers";

import { API_BASE_URL as API_FROM_UTIL } from "./utils/api";
import FaviconClient from "./FaviconClient";
import ClientTitleLock from "./ClientTitleLock"; // ✅ mount the lock

const API_BASE_URL =
  (API_FROM_UTIL as string) ||
  (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();

const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();

const DEFAULT_TITLE = "Creative Prints";
const DEFAULT_FAVICON = "/favicon.ico";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

// Small server helper
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

export async function generateMetadata(): Promise<Metadata> {
  // Title from API (fallback to default)
  const titleData = await fetchJSON<{ site_title?: string }>(
    "/api/show-sitetitle-details/"
  );
  const siteTitle =
    (titleData?.site_title || DEFAULT_TITLE).trim() || DEFAULT_TITLE;

  // Favicon from API (fallback to default)
  const favData = await fetchJSON<{ favicon?: { url?: string } }>(
    "/api/show-favicon/"
  );
  const iconUrl = (favData?.favicon?.url || "").trim() || DEFAULT_FAVICON;

  return {
    // Force absolute title so nested routes can't override with templates
    title: { absolute: siteTitle },
    icons: {
      icon: iconUrl,
      shortcut: iconUrl,
      apple: iconUrl,
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="font-sans">
        {children}
        <Providers />
        <FaviconClient />
        {/* ✅ Lock (re-assert) title on client route changes */}
        <ClientTitleLock />
      </body>
    </html>
  );
}
