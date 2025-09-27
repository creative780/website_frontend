'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { API_BASE_URL as API_FROM_UTIL } from './utils/api';

const API_BASE_URL =
  (API_FROM_UTIL as string) ||
  (process.env.NEXT_PUBLIC_API_BASE_URL || '').trim();

const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
const DEFAULT_TITLE = 'Creative Prints';

async function getTitle(): Promise<string> {
  if (!API_BASE_URL) return DEFAULT_TITLE;
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/show-sitetitle-details/?_=${Date.now()}`,
      {
        headers: FRONTEND_KEY ? { 'X-Frontend-Key': FRONTEND_KEY } : undefined,
        cache: 'no-store',
        credentials: 'omit',
      }
    );
    if (!res.ok) return DEFAULT_TITLE;
    const json = await res.json();
    const t = (json?.site_title || '').toString().trim();
    return t || DEFAULT_TITLE;
  } catch {
    return DEFAULT_TITLE;
  }
}

export default function ClientTitleLock() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const siteTitle = await getTitle();
      if (cancelled) return;

      // If a page really wants to manage its own title, it can set:
      // window.__ALLOW_DYNAMIC_PAGE_TITLE__ = true
      const allowDynamic =
        typeof window !== 'undefined' &&
        (window as any).__ALLOW_DYNAMIC_PAGE_TITLE__ === true;

      if (!allowDynamic) {
        document.title = siteTitle;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
