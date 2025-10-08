// Front_End/app/admin/components/AdminAuthGaurd.tsx
'use client';

import { useEffect, useState, ReactNode, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { API_BASE_URL } from '../../utils/api';

type AdminRow = {
  admin_id: string;
  admin_name: string;
  password_hash: string;
  role_id: string;
  role_name: string;
  access_pages: string[];
  created_at: string;
};

const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set('X-Frontend-Key', FRONTEND_KEY);
  return { ...init, headers };
};

/** Canonical label → path map (human labels from access-pages). */
const LABEL_TO_PATH: Record<string, string> = {
  'Dashboard': '/admin/dashboard',
  'Products Section': '/admin/products',
  'Blog View': '/admin/blogView',
  'Blog': '/admin/blogView',
  'Settings': '/admin/settings',
  'First Carousel': '/admin/first-carousel',
  'Media Library': '/admin/media-library',
  'Notifications': '/admin/notifications',
  'Testimonials': '/admin/testimonials',
  'Second Carousel': '/admin/second-carousel',
  'Hero Banner': '/admin/hero-banner',
  'Manage Categories': '/admin/manage-categories',
  'Orders': '/admin/orders',
  'Inventory': '/admin/inventory',
  'Google Settings': '/admin/G-Settings',
  'Google Analytics': '/admin/G-Analytics',
  'New Account': '/admin/new-account',
  'Navbar': '/admin/navbar',
  'Attributes': '/admin/attributes',
  "Event Call Back": "/admin/event-callback",
  "Recently Deleted": "/admin/recently-deleted",
  "User View": "/home",
};

const LABEL_TO_PATH_LOWER: Record<string, string> = Object.fromEntries(
  Object.entries(LABEL_TO_PATH).map(([k, v]) => [k.toLowerCase(), v])
);

function normalize(p: string) {
  if (!p) return '/';
  return p.replace(/\/+$/, '') || '/';
}

function isAllowedPath(pathname: string, allowedPrefixes: Set<string>) {
  const current = normalize(pathname);
  for (const prefix of allowedPrefixes) {
    const base = normalize(prefix);
    if (current === base) return true;
    if (current.startsWith(base + '/')) return true;
  }
  return false;
}

function safeParseAccessPages(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Same normalization used in Sidebar
function normalizePermissions(perms: string[]) {
  const s = new Set((perms || []).map((p) => p?.trim()));
  if (s.has('Blog')) s.add('Blog View');
  return Array.from(s).filter((p) => p !== 'Blog View');
}

function sameSetCI(a: string[], b: string[]) {
  const A = new Set(a.map((x) => x.trim().toLowerCase()));
  const B = new Set(b.map((x) => x.trim().toLowerCase()));
  if (A.size !== B.size) return false;
  for (const v of A) if (!B.has(v)) return false;
  return true;
}

export default function AdminAuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const validatingRef = useRef(false);

  const forceLogout = () => {
    try {
      localStorage.removeItem('admin-auth');
      localStorage.removeItem('admin-id');
      localStorage.removeItem('access-pages');
    } catch {}
    router.replace('/admin/login');
  };

  // ONLY logout on confirmed delete/perm-change; be tolerant to network errors
  const revalidateAgainstServer = async () => {
    if (validatingRef.current) return true; // don't block
    validatingRef.current = true;
    try {
      const adminId = typeof window !== 'undefined' ? localStorage.getItem('admin-id') || '' : '';
      if (!adminId) {
        validatingRef.current = false;
        forceLogout();
        return false;
      }

      const res = await fetch(`${API_BASE_URL}/api/show-admin/`, withFrontendKey());
      if (!res.ok) {
        validatingRef.current = false;
        return true; // treat as valid on transient error
      }
      const data = await res.json();
      const list: AdminRow[] = data?.admins || [];
      const me = list.find((r) => String(r.admin_id) === String(adminId));
      if (!me) {
        validatingRef.current = false;
        forceLogout(); // deleted
        return false;
      }

      const localPermsRaw = safeParseAccessPages(localStorage.getItem('access-pages'));
      const localPerms = normalizePermissions(localPermsRaw);
      const serverPerms = normalizePermissions(me.access_pages || []);
      if (!sameSetCI(localPerms, serverPerms)) {
        validatingRef.current = false;
        forceLogout(); // permissions changed
        return false;
      }

      validatingRef.current = false;
      return true;
    } catch {
      validatingRef.current = false;
      return true; // keep session on exceptions
    }
  };

  useEffect(() => {
    if (pathname === '/admin/login') {
      setAuthorized(true);
      setReady(true);
      return;
    }

    const runCheck = async () => {
      const isLoggedIn =
        typeof window !== 'undefined' ? localStorage.getItem('admin-auth') === 'true' : false;

      if (!isLoggedIn) {
        setAuthorized(false);
        setReady(true);
        router.replace('/admin/login');
        return;
      }

      const ok = await revalidateAgainstServer();
      if (!ok) {
        setAuthorized(false);
        setReady(true);
        return;
      }

      let allowedLabelsRaw: unknown = null;
      try {
        allowedLabelsRaw =
          typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('access-pages') || '[]') : [];
      } catch {
        allowedLabelsRaw = [];
      }

      const labels: string[] = Array.isArray(allowedLabelsRaw) ? allowedLabelsRaw : [];
      const allowedPaths = new Set<string>();

      for (const raw of labels) {
        const key = String(raw || '').trim().toLowerCase();
        if (!key) continue;

        const path = LABEL_TO_PATH_LOWER[key];
        if (path) allowedPaths.add(path);

        if (key === 'blog' || key === 'blog view') {
          allowedPaths.add('/admin/blog');
          allowedPaths.add('/admin/blogView');
        }
      }

      if (allowedPaths.size === 0) {
        setAuthorized(false);
        setReady(true);
        router.replace('/admin/login');
        return;
      }

      if (isAllowedPath(pathname, allowedPaths)) {
        setAuthorized(true);
      } else {
        setAuthorized(false);
        router.replace('/admin/login');
      }
      setReady(true);
    };

    runCheck();

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'admin-auth' || e.key === 'access-pages') {
        runCheck();
      }
    };
    window.addEventListener('storage', onStorage);

    const t = setInterval(() => {
      revalidateAgainstServer();
    }, 60000);

    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router]);

  if (!ready) return <div className="min-h-screen bg-white" />;

  if (!authorized) return null;

  return <>{children}</>;
}
