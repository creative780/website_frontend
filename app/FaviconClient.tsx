'use client';

import { useEffect } from 'react';
import { API_BASE_URL as API_FROM_UTIL } from './utils/api';

const API_BASE_URL =
  (API_FROM_UTIL as string) ||
  (process.env.NEXT_PUBLIC_API_BASE_URL || '').trim();

const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();

const DEFAULT_FAVICON = '/favicon.ico';

function normalizeIconUrl(u?: string | null): string {
  const v = (u || '').trim();
  if (!v) return DEFAULT_FAVICON;
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  if (!API_BASE_URL) return DEFAULT_FAVICON;
  if (v.startsWith('/')) return `${API_BASE_URL}${v}`;
  if (v.startsWith('media/') || v.startsWith('uploads/')) return `${API_BASE_URL}/${v}`;
  return DEFAULT_FAVICON;
}

function setFavicon(url: string) {
  // Remove existing icon links we manage
  document
    .querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
    )
    .forEach((el) => el.parentNode?.removeChild(el));

  const make = (rel: string) => {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = url;
    // Give browser a hint (most favicons are pngs in your backend)
    if (!/\.ico(\?|$)/i.test(url)) link.type = 'image/png';
    document.head.appendChild(link);
  };

  make('icon');
  make('shortcut icon');
  make('apple-touch-icon');
}

export default function FaviconClient() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/show-favicon/?_=${Date.now()}`, {
          headers: FRONTEND_KEY ? { 'X-Frontend-Key': FRONTEND_KEY } : undefined,
          cache: 'no-store',
          credentials: 'omit',
          mode: 'cors',
        });
        const json = res.ok ? await res.json() : null;
        const raw = json?.favicon?.url as string | undefined;

        // normalize + cache-bust so the browser actually reloads
        const base = normalizeIconUrl(raw);
        const cacheBust = `${base}${base.includes('?') ? '&' : '?'}v=${Date.now()}`;

        if (!cancelled) setFavicon(cacheBust);
      } catch {
        if (!cancelled) setFavicon(DEFAULT_FAVICON);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
