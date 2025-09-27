'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminSidebar from '../components/AdminSideBar';
import Modal from '../components/Modal';
import { formatDistanceToNow } from 'date-fns';
import { ToastContainer, toast } from 'react-toastify';
import Checkbox from '@mui/material/Checkbox';
import 'react-toastify/dist/ReactToastify.css';
import { API_BASE_URL } from '../../utils/api';
import AdminAuthGuard from '../components/AdminAuthGaurd';

type AdminUser = {
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
  headers.set('X-Frontend-Key', FRONTEND_KEY);
  return { ...init, headers };
};

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
  'Attributes',          // ✅ Added
  'User View',
];

const rolePermissionsMap: { [key: string]: string[] } = {
  'Super Admin': [...sidebarLinks],
  'Admin': [
    'Products Section',
    'Settings',
    'Blog',
    'Orders',
    'Inventory',
    'Manage Categories',
    'Attributes',        // ✅ Added
    'User View',
  ],
  'Product Manager': [
    'Products Section',
    'Inventory',
    'Orders',
    'Manage Categories',
    'Attributes',        // ✅ Added
    'User View',
  ],
  'Marketing Manager': ['Blog', 'Testimonials', 'First Carousel', 'Second Carousel', 'Hero Banner', 'Navbar', 'User View'],
  'Content Editor': ['Media Library', 'Blog', 'Hero Banner', 'First Carousel', 'Second Carousel', 'Navbar', 'User View'],
  'Customer Support': ['Orders', 'Notifications', 'Testimonials', 'User View'],
  'Developer': [...sidebarLinks],
  'Analyst': ['Dashboard', 'Google Analytics', 'Google Settings', 'User View'],
  'Custom Role': [],
  'Temp Access': ['Dashboard', 'Media Library', 'User View'],
};

const normalizePermissions = (perms: string[]) => {
  const next = new Set(perms);
  if (next.has('Blog')) next.add('Blog View');
  return Array.from(next);
};
const norm = (s: string) => s.trim().toLowerCase();

// Intersect a list of labels with what the current admin is allowed to grant
const intersectAllowed = (labels: string[], allowedSet: Set<string>) =>
  labels.filter(l => allowedSet.has(norm(l)));

export default function AdminNewAccountPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);

  // permissions gating
  const [grantableSet, setGrantableSet] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: '',
    permissions: [] as string[],
  });

  const [saving, setSaving] = useState(false);

  // Load current admin grantable pages from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('access-pages');
      const parsed: string[] = raw ? JSON.parse(raw) : [];
      // normalize and remove shadow 'Blog View' for storage
      const normalized = normalizePermissions(parsed).filter(p => p !== 'Blog View');
      setGrantableSet(new Set(normalized.map(l => norm(l))));
    } catch {
      setGrantableSet(new Set());
    }
  }, []);

  const fetchAdmins = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/show-admin/`, withFrontendKey());
      const data = await res.json();

      if (data.success && Array.isArray(data.admins)) {
        setUsers(data.admins);
      } else {
        toast.error('❌ Unexpected response format');
      }
    } catch {
      toast.error('❌ Failed to fetch admin users');
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  // Duplicate detection: in edit mode ignore the currently edited admin’s own username
  const usernameDuplicate = useMemo(() => {
    const u = formData.username.trim();
    if (!u) return false;
    const target = norm(u);
    return users.some((user) => {
      if (editMode && editingAdminId && user.admin_id === editingAdminId) return false;
      return norm(user.admin_name) === target;
    });
  }, [formData.username, users, editMode, editingAdminId]);

  const togglePermission = (label: string) => {
    // If not grantable, do nothing
    if (!grantableSet.has(norm(label))) return;

    setFormData((prev) => {
      const exists = prev.permissions.includes(label);
      const base = exists
        ? prev.permissions.filter((item) => item !== label)
        : [...prev.permissions, label];

      // Normalize and remove shadow before storing
      const normalized = normalizePermissions(base);
      return { ...prev, permissions: normalized.filter(p => p !== 'Blog View') };
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

    // Normalize server perms, then intersect with what current admin may grant (to avoid showing ungrantable)
    const normalizedPerms = normalizePermissions(admin.access_pages || [])
      .filter(p => p !== 'Blog View');
    const safePrefill = intersectAllowed(normalizedPerms, grantableSet);

    setFormData({
      username: admin.admin_name || '',
      password: '', // blank; only send if changed
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
    // Final safety: only send what the current admin can grant
    const intersected = intersectAllowed(labels, grantableSet);
    return normalizePermissions(intersected);
  };

  const handleSaveUser = async () => {
    const username = formData.username.trim();
    const password = formData.password.trim(); // optional in edit
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
        // --- CREATE ---
        try {
          const ref = await fetch(`${API_BASE_URL}/api/show-admin/`, withFrontendKey());
          const refData = await ref.json();
          if (refData?.success && Array.isArray(refData.admins)) {
            setUsers(refData.admins);
            const dupNow = refData.admins.some((u: AdminUser) => norm(u.admin_name) === norm(username));
            if (dupNow) {
              toast.error('🚫 Username already exists. Pick a different one.');
              return;
            }
          }
        } catch {}

        const access_pages = filteredPayloadPermissions(formData.permissions);

        const res = await fetch(`${API_BASE_URL}/api/save-admin/`, withFrontendKey({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            admin_name: username,
            password,
            role_name: role,
            access_pages,
          }),
        }));

        if (!res.ok) {
          if (res.status === 409) {
            toast.error('🚫 Username already exists (server).');
            return;
          }
        }

        const result = await res.json();

        if (!result.success) {
          const msg = (result.error || '').toString().toLowerCase();
          if (msg.includes('exist') || msg.includes('duplicate') || res.status === 409) {
            toast.error('🚫 Username already exists.');
            return;
          }
          toast.error('❌ Error saving admin');
          return;
        }

        toast.success(`✅ Admin created: ${result.admin_id}`);
        setIsModalOpen(false);
        resetModal();
        await fetchAdmins();
      } else {
        // --- EDIT ---
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

        const res = await fetch(`${API_BASE_URL}/api/edit-admin/`, withFrontendKey({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }));

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
    } catch {
      toast.error('❌ Server error while saving');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAdmin = async () => {
    if (!selectedAdminId) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/delete-admin/`, withFrontendKey({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: selectedAdminId }),
      }));

      const result = await res.json();

      if (result.success) {
        toast.success('✅ Admin deleted');
        setUsers((prev) => prev.filter(user => user.admin_id !== selectedAdminId));

        const currentId = typeof window !== 'undefined' ? localStorage.getItem('admin-id') : null;
        if (currentId && currentId === selectedAdminId) {
          forceLogout();
          return;
        }
      } else {
        toast.error(`❌ ${result.error || 'Failed to delete admin'}`);
      }
    } catch {
      toast.error('❌ Server error during deletion');
    } finally {
      setConfirmDeleteOpen(false);
      setSelectedAdminId(null);
    }
  };

  // Delete from inside the Edit modal
  const handleDeleteFromEditModal = async () => {
    if (!editMode || !editingAdminId) return;
    setSelectedAdminId(editingAdminId);
    setConfirmDeleteOpen(true);
  };

  // Derived helpers
  const isGrantable = (label: string) => grantableSet.has(norm(label));

  // When changing role, intersect role preset with grantable set
  const onRoleChange = (role: string) => {
    const basePerms = rolePermissionsMap[role] || [];
    const intersected = intersectAllowed(
      normalizePermissions(basePerms).filter(p => p !== 'Blog View'),
      grantableSet
    );
    setFormData(prev => ({ ...prev, role, permissions: intersected }));
  };

  return (
    <AdminAuthGuard>
      <div className="flex">
        <AdminSidebar />
        <div className="flex-1 px-6 py-8 bg-gray-50 min-h-screen">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6 bg-gradient-to-r from-white via-[#f8f9fa] to-gray-100 p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-800">➕ Add a New Account</h1>
                <p className="text-gray-500 mt-1 text-sm">Manage admin users and their access.</p>
              </div>
              <button
                onClick={openCreateModal}
                className="bg-[#891F1A] text-white px-4 py-2 rounded text-sm hover:bg-[#6d1915]"
              >
                + Add New User
              </button>
            </div>

            {/* Table */}
            <div className="overflow-hidden bg-white rounded-2xl shadow-xl border border-gray-200">
              <table className="w-full table-auto text-sm">
                <thead className="bg-[#891F1A] text-white text-xs uppercase tracking-wide">
                  <tr>
                    <th className="p-4 text-left w-20">#</th>
                    <th className="p-4 text-left w-250">Username</th>
                    <th className="p-4 text-left w-250">Password</th>
                    <th className="p-4 text-left w-200">Role</th>
                    <th className="p-4 text-left w-200">Last Active</th>
                    <th className="p-4 text-left w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700 divide-y divide-gray-100">
                  {users.map((user, idx) => (
                    <tr key={user.admin_id} className="hover:bg-gray-50 transition">
                      <td className="p-4 font-semibold text-[#891F1A]">{idx + 1}</td>
                      <td className="p-4">{user.admin_name}</td>
                      <td className="p-4 text-gray-600">
                        {user.password_hash.length > 19
                          ? `${user.password_hash.slice(0, 22)}...`
                          : user.password_hash}
                      </td>
                      <td className="p-4">{user.role_name}</td>
                      <td className="p-4 text-gray-500">
                        {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                      </td>
                      <td className="p-4 space-x-3">
                        <button
                          onClick={() => openEditModal(user)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setSelectedAdminId(user.admin_id);
                            setConfirmDeleteOpen(true);
                          }}
                          className="text-red-600 hover:text-red-800 text-xs font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add/Edit Admin Modal */}
            {isModalOpen && (
              <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); resetModal(); }}>
                <div className="p-4 sm:p-6">
                  <h2 className="text-xl font-semibold mb-4">
                    {editMode ? 'Edit Admin User' : 'Add New Admin User'}
                  </h2>

                  <div className="mb-4">
                    <label className="block mb-1 font-medium">Username</label>
                    <input
                      className="w-full border rounded p-2"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    />
                    {formData.username.trim() && usernameDuplicate && (
                      <p className="mt-1 text-xs text-red-600">This username is already taken.</p>
                    )}
                  </div>

                  <div className="mb-4">
                    <label className="block mb-1 font-medium">
                      {editMode ? 'New Password (optional)' : 'Password'}
                    </label>
                    <input
                      className="w-full border rounded p-2"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={editMode ? 'Leave blank to keep current password' : ''}
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block mb-1 font-medium">Select Role</label>
                    <select
                      className="w-full border rounded p-2"
                      value={formData.role}
                      onChange={(e) => onRoleChange(e.target.value)}
                    >
                      <option value="">-- Select Role --</option>
                      {Object.keys(rolePermissionsMap).map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-4">
                    <label className="block font-medium mb-2">Permissions</label>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-8">
                      {sidebarLinks.map((label) => {
                        const checked = formData.permissions.includes(label);
                        const disabled = !isGrantable(label);
                        return (
                          <div key={label} className={`flex items-center gap-2 ${disabled ? 'opacity-50' : ''}`}>
                            <Checkbox
                              checked={checked}
                              disabled={disabled}
                              onChange={() => togglePermission(label)}
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

                  {/* Actions: Cancel | Delete | Save */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 mt-4">
                    <button
                      onClick={() => { setIsModalOpen(false); resetModal(); }}
                      className="bg-gray-200 text-gray-700 px-4 py-2 rounded"
                    >
                      Cancel
                    </button>

                    {editMode && (
                      <button
                        onClick={handleDeleteFromEditModal}
                        className="border border-red-600 text-red-700 px-4 py-2 rounded hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    )}

                    <button
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
                      {saving ? (editMode ? 'Saving…' : 'Saving…') : (editMode ? 'Save Changes' : 'Save User')}
                    </button>
                  </div>
                </div>
              </Modal>
            )}

            {/* Confirm Delete Modal (used by table delete and edit-modal delete) */}
            {confirmDeleteOpen && (
              <Modal isOpen={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">Are you sure?</h2>
                <p className="text-gray-600 mb-6">
                    Do you really want to delete this admin? This action cannot be undone.
                  </p>
                  <div className="flex justify-end gap-4">
                    <button
                      onClick={() => setConfirmDeleteOpen(false)}
                      className="bg-gray-200 text-gray-700 px-4 py-2 rounded"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        await handleDeleteAdmin();
                        // Close edit modal if we deleted from there
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

            <ToastContainer />
          </div>
        </div>
      </div>
    </AdminAuthGuard>
  );
}
