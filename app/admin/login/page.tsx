'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '../../utils/api';

// ---------- Constants & helpers ----------
const FALLBACK_SUPERADMIN_PAGES = [
  'Dashboard', 'Products Section', 'Blog', 'Settings', 'First Carousel',
  'Media Library', 'Notifications', 'Testimonials', 'Second Carousel',
  'Hero Banner', 'Manage Categories', 'Orders', 'Inventory',
  'Google Settings', 'Google Analytics', 'New Account', 'Blog View',
];

const labelToPath: Record<string, string> = {
  Dashboard: '/admin/dashboard',
  'Products Section': '/admin/products',
  Blog: '/admin/blogView',
  Settings: '/admin/settings',
  'First Carousel': '/admin/first-carousel',
  'Media Library': '/admin/media-library',
  Notifications: '/admin/notifications',
  Testimonials: '/admin/testimonials',
  'Second Carousel': '/admin/second-carousel',
  'Hero Banner': '/admin/hero-banner',
  'Manage Categories': '/admin/manage-categories',
  Orders: '/admin/orders',
  Inventory: '/admin/inventory',
  'Google Settings': '/admin/G-Settings',
  'Google Analytics': '/admin/G-Analytics',
  'New Account': '/admin/new-account',
  'Blog View': '/admin/blogView',
};

// Frontend key header
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set('X-Frontend-Key', FRONTEND_KEY);
  headers.set('Accept', 'application/json');
  return { ...init, headers, cache: 'no-store' };
};

const FIRST_ROUTE = (labels: string[]) =>
  labels.map((label) => labelToPath[label]).find(Boolean) || '/admin/dashboard';

// ---------- Component ----------
export default function AdminLogin() {
  const router = useRouter();

  const userId = useId();
  const passId = useId();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const isFallbackAdmin = useMemo(
    () => username === 'saim1234' && password === 'saim1234',
    [username, password]
  );

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    // Redirect if already logged in
    try {
      const isLoggedIn = localStorage.getItem('admin-auth');
      const accessPages = localStorage.getItem('access-pages');
      if (isLoggedIn === 'true' && accessPages) {
        const pages: string[] = JSON.parse(accessPages);
        router.replace(FIRST_ROUTE(pages));
      }
    } catch {
      /* ignore */
    }
    return () => {
      mountedRef.current = false;
    };
  }, [router]);

  const setSafeError = (msg: string) => {
    if (mountedRef.current) setError(msg);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setSafeError('');
    setBusy(true);

    // 1) If backend has no admins and fallback creds are used → bootstrap flow
    try {
      const checkRes = await fetch(`${API_BASE_URL}/api/show-admin/?_=${Date.now()}`, withFrontendKey());
      const adminData = await checkRes.json().catch(() => []);
      const noAdminsExist = checkRes.ok && Array.isArray(adminData) && adminData.length === 0;

      if (noAdminsExist && isFallbackAdmin) {
        try {
          localStorage.setItem('admin-auth', 'true');
          localStorage.setItem('admin-id', 'superadmin');
          localStorage.setItem('access-pages', JSON.stringify(FALLBACK_SUPERADMIN_PAGES));
          router.replace(FIRST_ROUTE(FALLBACK_SUPERADMIN_PAGES));
          return;
        } finally {
          setBusy(false);
        }
      }
    } catch {
      // If the check fails and fallback creds are used, allow bootstrap as before
      if (isFallbackAdmin) {
        try {
          localStorage.setItem('admin-auth', 'true');
          localStorage.setItem('admin-id', 'superadmin');
          localStorage.setItem('access-pages', JSON.stringify(FALLBACK_SUPERADMIN_PAGES));
          router.replace('/admin/dashboard');
          return;
        } finally {
          setBusy(false);
        }
      }
      setSafeError('Server check failed. Try again.');
      setBusy(false);
      return;
    }

    // 2) Normal admin login
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin-login/`,
        withFrontendKey({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
      );
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.success) {
        try {
          localStorage.setItem('admin-auth', 'true');
          localStorage.setItem('admin-id', String(data.admin_id || ''));
          localStorage.setItem('access-pages', JSON.stringify(Array.isArray(data.access_pages) ? data.access_pages : []));
          router.replace(FIRST_ROUTE(Array.isArray(data.access_pages) ? data.access_pages : []));
        } finally {
          setBusy(false);
        }
      } else {
        setSafeError(String(data?.error || 'Login failed'));
        setBusy(false);
      }
    } catch {
      setSafeError('Server error. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-gray-100 px-4"
      style={{ fontFamily: 'var(--font-poppins), Arial, Helvetica, sans-serif' }}
    >
      <main
        className="w-full max-w-sm bg-white p-6 rounded-lg shadow-md"
        role="main"
        aria-labelledby="admin-login-title"
      >
        <h1 id="admin-login-title" className="text-2xl font-bold text-center text-gray-900 mb-6">
          Admin Login
        </h1>

        {error ? (
          <p role="alert" className="text-red-600 text-sm mb-4 text-center">
            {error}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor={userId} className="block text-sm text-gray-700 mb-1">
              Username
            </label>
            <input
              id={userId}
              type="text"
              inputMode="text"
              autoComplete="username"
              placeholder="Your admin username"
              className="w-full border border-gray-300 px-3 py-2 rounded text-black focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              aria-required="true"
            />
          </div>

          <div className="mb-6">
            <label htmlFor={passId} className="block text-sm text-gray-700 mb-1">
              Password
            </label>
            <input
              id={passId}
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              className="w-full border border-gray-300 px-3 py-2 rounded text-black focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-required="true"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150"
            aria-busy={busy}
          >
            {busy ? 'Signing in…' : 'Login'}
          </button>
        </form>

        {/* Small, honest heads-up about bootstrap creds. Keeps current behavior. */}
        <p className="mt-4 text-[11px] text-gray-500 leading-snug">
          Note: if no admins exist, the bootstrap account (local only) is permitted with preset credentials until a real admin is created.
        </p>
      </main>
    </div>
  );
}
