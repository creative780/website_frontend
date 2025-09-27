'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '../../utils/api';

const FALLBACK_SUPERADMIN_PAGES = [
  "Dashboard", "Products Section", "Blog", "Settings", "First Carousel",
  "Media Library", "Notifications", "Testimonials", "Second Carousel",
  "Hero Banner", "Manage Categories", "Orders", "Inventory",
  "Google Settings", "Google Analytics", "New Account", "Blog View"
];

const labelToPath: Record<string, string> = {
  "Dashboard": "/admin/dashboard",
  "Products Section": "/admin/products",
  "Blog": "/admin/blogView",
  "Settings": "/admin/settings",
  "First Carousel": "/admin/first-carousel",
  "Media Library": "/admin/media-library",
  "Notifications": "/admin/notifications",
  "Testimonials": "/admin/testimonials",
  "Second Carousel": "/admin/second-carousel",
  "Hero Banner": "/admin/hero-banner",
  "Manage Categories": "/admin/manage-categories",
  "Orders": "/admin/orders",
  "Inventory": "/admin/inventory",
  "Google Settings": "/admin/G-Settings",
  "Google Analytics": "/admin/G-Analytics",
  "New Account": "/admin/new-account",
  "Blog View": "/admin/blogView",
};

// ⬇️ Add frontend key helper (minimal)
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set('X-Frontend-Key', FRONTEND_KEY);
  return { ...init, headers };
};

export default function AdminLogin() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Redirect if already logged in
  useEffect(() => {
    const isLoggedIn = localStorage.getItem('admin-auth');
    const accessPages = localStorage.getItem('access-pages');

    if (isLoggedIn === 'true' && accessPages) {
      const pages: string[] = JSON.parse(accessPages);
      const firstPage = pages.map(label => labelToPath[label]).find(Boolean) || '/admin/dashboard';
      router.push(firstPage);
    }
  }, []);

  const handleLogin = async () => {
    setError('');
    const isFallbackAdmin = username === 'saim1234' && password === 'saim1234';

    try {
      // Check if any admins exist
      const checkRes = await fetch(`${API_BASE_URL}/api/show-admin/`, withFrontendKey());
      const adminData = await checkRes.json();
      const noAdminsExist = checkRes.ok && Array.isArray(adminData) && adminData.length === 0;

      if (noAdminsExist && isFallbackAdmin) {
        localStorage.setItem('admin-auth', 'true');
        localStorage.setItem('admin-id', 'superadmin');
        localStorage.setItem('access-pages', JSON.stringify(FALLBACK_SUPERADMIN_PAGES));
        const firstPage = FALLBACK_SUPERADMIN_PAGES.map(label => labelToPath[label]).find(Boolean) || '/admin/dashboard';
        router.push(firstPage);
        return;
      }
    } catch (err) {
      // If backend check fails, allow fallback login
      if (isFallbackAdmin) {
        localStorage.setItem('admin-auth', 'true');
        localStorage.setItem('admin-id', 'superadmin');
        localStorage.setItem('access-pages', JSON.stringify(FALLBACK_SUPERADMIN_PAGES));
        router.push(labelToPath["Dashboard"]);
        return;
      }
      setError('Server error. Please try again.');
      return;
    }

    // Try real admin login
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin-login/`, withFrontendKey({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }));

      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem('admin-auth', 'true');
        localStorage.setItem('admin-id', data.admin_id);
        localStorage.setItem('access-pages', JSON.stringify(data.access_pages));

        const firstPage = data.access_pages.map(label => labelToPath[label]).find(Boolean) || '/admin/dashboard';
        router.push(firstPage);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Server error. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Admin Login</h2>

        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}

        <div className="mb-4">
          <input
            type="text"
            placeholder="Username"
            className="w-full border border-gray-300 px-3 py-2 rounded text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="mb-6">
          <input
            type="password"
            placeholder="Password"
            className="w-full border border-gray-300 px-3 py-2 rounded text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition duration-200"
        >
          Login
        </button>
      </div>
    </div>
  );
}
