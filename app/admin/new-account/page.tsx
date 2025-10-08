'use client';

import { useEffect, useMemo, useState, useCallback, useId } from 'react';
import AdminSidebar from '../components/AdminSideBar';
import Modal from '../components/Modal';
import { formatDistanceToNow } from 'date-fns';
import { ToastContainer, toast } from 'react-toastify';
import Checkbox from '@mui/material/Checkbox';
import 'react-toastify/dist/ReactToastify.css';
import { API_BASE_URL } from '../../utils/api';
import AdminAuthGuard from '../components/AdminAuthGaurd';

/* ========================= Types ========================= */
type AdminUser = {
  admin_id: string;
  admin_name: string;
  password_hash: string;
  role_id: string;
  role_name: string;
  access_pages: string[];
  created_at: string;
};

/* =================== FRONTEND KEY helper =================== */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set('X-Frontend-Key', FRONTEND_KEY);
  // keep request lean to avoid preflights
  return { ...init, headers, cache: 'no-store', credentials: 'omit', mode: 'cors' };
};

/* ================= Allowed nav labels (source of truth) ================= */
const sidebarLinks = [
  'Dashboard',
  'Products Section',
  'Blog',
  'Settings',
  'First Carousel',
  'Media Library',
  'Notifications',
  'Testimonials',
  'Second Carousel',
  'Hero Banner',
  'Manage Categories',
  'Orders',
  'Inventory',
  'Google Analytics',
  'New Account',
  'Google Settings',
  'Navbar',
  'Attributes',
  'User View',
  "Event Call Back",
  'Recently Deleted',
] as const;

const rolePermissionsMap: { [role: string]: string[] } = {
  'Super Admin': [...sidebarLinks],
  Admin: [
    'Products Section',
    'Settings',
    'Blog',
    'Orders',
    'Inventory',
    'Manage Categories',
    'Attributes',
    'User View',
    'Recently Deleted',
  ],
  'Product Manager': [
    'Products Section',
    'Inventory',
    'Orders',
    'Manage Categories',
    'Attributes',
    'User View',
    "Event Call Back",
    'Recently Deleted',
  ],
  'Marketing Manager': [
    'Blog',
    'Testimonials',
    'First Carousel',
    'Second Carousel',
    'Hero Banner',
    'Navbar',
    'User View',
    "Event Call Back",
    'Recently Deleted',
  ],
  'Content Editor': [
    'Media Library',
    'Blog',
    'Hero Banner',
    'First Carousel',
    'Second Carousel',
    'Navbar',
    'User View',
    'Recently Deleted',
  ],
  'Customer Support': ['Orders', 'Notifications', 'Testimonials', 'User View', "Event Call Back",],
  Developer: [...sidebarLinks],
  Analyst: ['Dashboard', 'Google Analytics', 'Google Settings', 'User View'],
  'Custom Role': [],
  'Temp Access': ['Dashboard', 'Media Library', 'User View'],
};

/* ====================== Small helpers ====================== */
const normalizePermissions = (perms: string[]) => {
  const next = new Set(perms);
  // Compatibility shim
  if (next.has('Blog')) next.add('Blog View');
  return Array.from(next);
};
const norm = (s: string) => s.trim().toLowerCase();
const intersectAllowed = (labels: string[], allowedSet: Set<string>) =>
  labels.filter((l) => allowedSet.has(norm(l)));
const maskHash = (hash: string) =>
  !hash ? '—' : hash.length > 10 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : '********';

/* ======================= Component ======================= */
export default function AdminNewAccountPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);

  // permissions gating for current admin
  const [grantableSet, setGrantableSet] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: '',
    permissions: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  const tableCaptionId = useId();

  /* ============ Load current admin's grantable pages ============ */
  useEffect(() => {
    try {
      const raw = localStorage.getItem('access-pages');
      const parsed: string[] = raw ? JSON.parse(raw) : [];
      const normalized = normalizePermissions(parsed).filter((p) => p !== 'Blog View');
      setGrantableSet(new Set(normalized.map((l) => norm(l))));
    } catch {
      setGrantableSet(new Set());
    }
  }, []);

  /* ====================== Data fetching ====================== */
  const fetchAdmins = useCallback(async () => {
    const ac = new AbortController();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/show-admin/?_=${Date.now()}`, {
        ...withFrontendKey(),
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.success && Array.isArray(data.admins)) {
        setUsers(data.admins);
      } else if (Array.isArray(data)) {
        setUsers(data as AdminUser[]);
      } else {
        toast.error('❌ Unexpected response format');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error('❌ Failed to fetch admin users');
    } finally {
      setLoading(false);
    }
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const cleanup = fetchAdmins();
    return () => {
      try {
        (cleanup as any)?.();
      } catch {}
    };
  }, [fetchAdmins]);

  /* ================== Derived validations ================== */
  const usernameDuplicate = useMemo(() => {
    const u = formData.username.trim();
    if (!u) return false;
    const target = norm(u);
    return users.some((user) => {
      if (editMode && editingAdminId && user.admin_id === editingAdminId) return false;
      return norm(user.admin_name) === target;
    });
  }, [formData.username, users, editMode, editingAdminId]);

  /* ======================= UI handlers ======================= */
  const togglePermission = (label: string) => {
    if (!grantableSet.has(norm(label))) return; // cannot grant beyond your scope

    setFormData((prev) => {
      const exists = prev.permissions.includes(label);
      const base = exists
        ? prev.permissions.filter((item) => item !== label)
        : [...prev.permissions, label];

      const normalized = normalizePermissions(base);
      return { ...prev, permissions: normalized.filter((p) => p !== 'Blog View') };
    });
  };

  const resetModal = () => {
    setEditMode(false);
    setEditingAdminId(null);
    setFormData({ username: '', password: '', role: '', permissions: [] });
  };

  const openCreateModal = () => {
    resetModal();
    setIsModalOpen(true);
  };

  const openEditModal = (admin: AdminUser) => {
    setEditMode(true);
    setEditingAdminId(admin.admin_id);

    // Prefill perms, intersect with grantable
    const normalizedPerms = normalizePermissions(admin.access_pages || []).filter(
      (p) => p !== 'Blog View'
    );
    const safePrefill = intersectAllowed(normalizedPerms, grantableSet);

    setFormData({
      username: admin.admin_name || '',
      password: '',
      role: admin.role_name || '',
      permissions: safePrefill,
    });
    setIsModalOpen(true);
  };

  const forceLogout = () => {
    try {
      localStorage.removeItem('admin-auth');
      localStorage.removeItem('admin-id');
      localStorage.removeItem('access-pages');
    } catch {}
    toast.info('You have been logged out.');
    window.location.href = '/admin/login';
  };

  const filteredPayloadPermissions = (labels: string[]) => {
    const intersected = intersectAllowed(labels, grantableSet);
    return normalizePermissions(intersected);
  };

  const handleSaveUser = async () => {
    const username = formData.username.trim();
    const password = formData.password.trim(); // optional if editing
    const role = formData.role.trim();

    if (!username || (!editMode && !password) || !role) {
      toast.error('❌ Username, role, and password (for new user) are required');
      return;
    }
    if (usernameDuplicate) {
      toast.error('🚫 Username already exists. Pick a different one.');
      return;
    }

    setSaving(true);
    try {
      if (!editMode) {
        // Re-check duplicates right before create
        try {
          const ref = await fetch(`${API_BASE_URL}/api/show-admin/?_=${Date.now()}`, withFrontendKey());
          const refData = await ref.json();
          const list: AdminUser[] = refData?.admins || refData || [];
          if (Array.isArray(list)) {
            const dupNow = list.some((u) => norm(u.admin_name) === norm(username));
            if (dupNow) {
              toast.error('🚫 Username already exists. Pick a different one.');
              return;
            }
          }
        } catch {}

        const access_pages = filteredPayloadPermissions(formData.permissions);

        const res = await fetch(`${API_BASE_URL}/api/save-admin/`, {
          ...withFrontendKey({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              admin_name: username,
              password,
              role_name: role,
              access_pages,
            }),
          }),
        });

        if (!res.ok && res.status === 409) {
          toast.error('🚫 Username already exists (server).');
          return;
        }
        const result = await res.json().catch(() => ({}));
        if (!result?.success) {
          const msg = String(result?.error || '').toLowerCase();
          if (msg.includes('exist') || msg.includes('duplicate') || res.status === 409) {
            toast.error('🚫 Username already exists.');
            return;
          }
          toast.error('❌ Error saving admin');
          return;
        }

        toast.success(`✅ Admin created: ${result.admin_id || username}`);
        setIsModalOpen(false);
        resetModal();
        await fetchAdmins();
      } else {
        // Edit
        if (!editingAdminId) {
          toast.error('❌ Missing admin ID for edit');
          return;
        }
        const payload: Record<string, any> = {
          admin_id: editingAdminId,
          admin_name: username,
          role_name: role,
          access_pages: filteredPayloadPermissions(formData.permissions),
        };
        if (password) payload.password = password;

        const res = await fetch(`${API_BASE_URL}/api/edit-admin/`, {
          ...withFrontendKey({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }),
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          toast.error(`❌ Failed to edit admin ${txt ? `(${txt})` : ''}`);
          return;
        }
        const result = await res.json().catch(() => ({}));
        if (result?.success === false) {
          toast.error(`❌ ${result?.error || 'Failed to edit admin'}`);
          return;
        }

        toast.success('✅ Admin updated');
        setIsModalOpen(false);
        resetModal();
        await fetchAdmins();
      }
    } catch (err: any) {
      toast.error(`❌ Server error while saving${err?.message ? `: ${err.message}` : ''}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAdmin = async () => {
    if (!selectedAdminId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/delete-admin/`, {
        ...withFrontendKey({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_id: selectedAdminId }),
        }),
      });
      const result = await res.json().catch(() => ({}));

      if (result?.success) {
        toast.success('✅ Admin deleted');
        setUsers((prev) => prev.filter((user) => user.admin_id !== selectedAdminId));

        const currentId =
          typeof window !== 'undefined' ? localStorage.getItem('admin-id') : null;
        if (currentId && currentId === selectedAdminId) {
          forceLogout();
          return;
        }
      } else {
        toast.error(`❌ ${result?.error || 'Failed to delete admin'}`);
      }
    } catch {
      toast.error('❌ Server error during deletion');
    } finally {
      setConfirmDeleteOpen(false);
      setSelectedAdminId(null);
    }
  };

  const handleDeleteFromEditModal = () => {
    if (!editMode || !editingAdminId) return;
    setSelectedAdminId(editingAdminId);
    setConfirmDeleteOpen(true);
  };

  const isGrantable = (label: string) => grantableSet.has(norm(label));

  const onRoleChange = (role: string) => {
    const basePerms = rolePermissionsMap[role] || [];
    const intersected = intersectAllowed(
      normalizePermissions(basePerms).filter((p) => p !== 'Blog View'),
      grantableSet
    );
    setFormData((prev) => ({ ...prev, role, permissions: intersected }));
  };

  /* ============================ Render ============================ */
  return (
    <AdminAuthGuard>
      <div
        className="flex text-black bg-gray-50"
        style={{ fontFamily: 'var(--font-poppins), Arial, Helvetica, sans-serif' }}
      >
        <aside className="w-64 hidden lg:block border-r border-gray-200 bg-white">
          <AdminSidebar />
        </aside>

        <main className="flex-1 px-6 py-8 min-h-screen">
          <ToastContainer position="top-right" newestOnTop closeOnClick pauseOnFocusLoss={false} />

          {/* Header */}
          <header className="max-w-7xl mx-auto mb-6 bg-gradient-to-r from-white via-[#f8f9fa] to-gray-100 p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">➕ Add a New Account</h1>
              <p className="text-gray-500 mt-1 text-sm">Manage admin users and their access.</p>
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="bg-[#891F1A] text-white px-4 py-2 rounded text-sm hover:bg-[#6d1915] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#891F1A]"
            >
              + Add New User
            </button>
          </header>

          {/* Table */}
          <section className="max-w-7xl mx-auto overflow-hidden bg-white rounded-2xl shadow-xl border border-gray-200">
            <table className="w-full table-auto text-sm" aria-describedby={tableCaptionId}>
              <caption id={tableCaptionId} className="sr-only">
                Admin users table
              </caption>
              <thead className="bg-[#891F1A] text-white text-xs uppercase tracking-wide">
                <tr>
                  <th className="p-4 text-left w-20">#</th>
                  <th className="p-4 text-left w-250">Username</th>
                  <th className="p-4 text-left w-250">Password Hash</th>
                  <th className="p-4 text-left w-200">Role</th>
                  <th className="p-4 text-left w-200">Created</th>
                  <th className="p-4 text-left w-40">Actions</th>
                </tr>
              </thead>

              <tbody className="text-gray-700 divide-y divide-gray-100">
                {loading && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-gray-500">
                      Loading users…
                    </td>
                  </tr>
                )}

                {!loading && users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-gray-500">
                      No admin users found.
                    </td>
                  </tr>
                )}

                {!loading &&
                  users.map((user, idx) => (
                    <tr key={user.admin_id} className="hover:bg-gray-50 transition">
                      <th scope="row" className="p-4 font-semibold text-[#891F1A]">
                        {idx + 1}
                      </th>
                      <td className="p-4">{user.admin_name}</td>
                      <td className="p-4 text-gray-600">{maskHash(user.password_hash)}</td>
                      <td className="p-4">{user.role_name || '—'}</td>
                      <td className="p-4 text-gray-500">
                        {user.created_at
                          ? formatDistanceToNow(new Date(user.created_at), { addSuffix: true })
                          : '—'}
                      </td>
                      <td className="p-4 space-x-3">
                        <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 rounded"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAdminId(user.admin_id);
                            setConfirmDeleteOpen(true);
                          }}
                          className="text-red-600 hover:text-red-800 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-600 rounded"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>

          {/* Add/Edit Admin Modal */}
          {isModalOpen && (
            <Modal
              isOpen={isModalOpen}
              onClose={() => {
                setIsModalOpen(false);
                resetModal();
              }}
            >
              <div className="p-4 sm:p-6">
                <h2 className="text-xl font-semibold mb-4">
                  {editMode ? 'Edit Admin User' : 'Add New Admin User'}
                </h2>

                <div className="mb-4">
                  <label htmlFor="admin-username" className="block mb-1 font-medium">
                    Username
                  </label>
                  <input
                    id="admin-username"
                    autoComplete="username"
                    inputMode="text"
                    className="w-full border rounded p-2 text-black placeholder:text-gray-400 focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A]"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                  {formData.username.trim() && usernameDuplicate && (
                    <p className="mt-1 text-xs text-red-600">This username is already taken.</p>
                  )}
                </div>

                <div className="mb-4">
                  <label htmlFor="admin-password" className="block mb-1 font-medium">
                    {editMode ? 'New Password (optional)' : 'Password'}
                  </label>
                  <input
                    id="admin-password"
                    type="password"
                    autoComplete={editMode ? 'new-password' : 'current-password'}
                    className="w-full border rounded p-2 text-black placeholder:text-gray-400 focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A]"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={editMode ? 'Leave blank to keep current password' : ''}
                  />
                </div>

                <div className="mb-4">
                  <label htmlFor="admin-role" className="block mb-1 font-medium">
                    Select Role
                  </label>
                  <select
                    id="admin-role"
                    className="w-full border rounded p-2 text-black focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A]"
                    value={formData.role}
                    onChange={(e) => onRoleChange(e.target.value)}
                  >
                    <option value="">-- Select Role --</option>
                    {Object.keys(rolePermissionsMap).map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <span className="block font-medium mb-2">Permissions</span>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-8">
                    {sidebarLinks.map((label) => {
                      const checked = formData.permissions.includes(label);
                      const disabled = !isGrantable(label);
                      return (
                        <div
                          key={label}
                          className={`flex items-center gap-2 ${disabled ? 'opacity-50' : ''}`}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            onChange={() => togglePermission(label)}
                            inputProps={{ 'aria-label': `Toggle permission ${label}` }}
                            sx={{
                              color: disabled ? '#9CA3AF' : '#891F1A',
                              '&.Mui-checked': { color: disabled ? '#9CA3AF' : '#891F1A' },
                              padding: 0,
                            }}
                          />
                          <label className="text-gray-700 cursor-pointer">{label}</label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      resetModal();
                    }}
                    className="bg-gray-200 text-gray-700 px-4 py-2 rounded"
                  >
                    Cancel
                  </button>

                  {editMode && (
                    <button
                      type="button"
                      onClick={handleDeleteFromEditModal}
                      className="border border-red-600 text-red-700 px-4 py-2 rounded hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveUser}
                    className="bg-[#891F1A] text-white px-4 py-2 rounded hover:bg-[#6d1915] disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={
                      saving ||
                      usernameDuplicate ||
                      !formData.username.trim() ||
                      !formData.role.trim() ||
                      (!editMode && !formData.password.trim())
                    }
                    title={usernameDuplicate ? 'Username already exists' : ''}
                  >
                    {saving ? 'Saving…' : editMode ? 'Save Changes' : 'Save User'}
                  </button>
                </div>
              </div>
            </Modal>
          )}

          {/* Confirm Delete */}
          {confirmDeleteOpen && (
            <Modal isOpen={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Are you sure?</h2>
                <p className="text-gray-600 mb-6">
                  Do you really want to delete this admin? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-4">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(false)}
                    className="bg-gray-200 text-gray-700 px-4 py-2 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await handleDeleteAdmin();
                      if (isModalOpen && editMode && selectedAdminId === editingAdminId) {
                        setIsModalOpen(false);
                        resetModal();
                      }
                    }}
                    className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                  >
                    Yes, Delete
                  </button>
                </div>
              </div>
            </Modal>
          )}
        </main>
      </div>
    </AdminAuthGuard>
  );
}
