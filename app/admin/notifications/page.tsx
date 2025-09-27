'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '../components/AdminSideBar';
import AdminAuthGuard from '../components/AdminAuthGaurd';
import { FaEye, FaCheck, FaPause, FaTimes } from 'react-icons/fa';
import { API_BASE_URL } from '../../utils/api';

// Frontend-key helper (unchanged)
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set('X-Frontend-Key', FRONTEND_KEY);
  return { ...init, headers };
};

interface Notification {
  notification_id: string;
  message: string;
  created_at: string;
  type: string;
  status: 'read' | 'unread';
  source_table?: string;   // BE will send "product_comment" here for comment notifs
  source_id?: string;      // For product_comment this MUST be the comment_id (testimonial_id)
  order_id?: string;
  sku?: string;
  user?: string;
  // Optional: future-proofing if BE decides to pass current comment status inline
  meta_status?: 'pending' | 'approved' | 'rejected' | 'hidden';
}

type CommentStatus = 'pending' | 'approved' | 'rejected' | 'hidden';

const sourceTableToPageLabel: Record<string, string> = {
  category: 'Manage Categories',
  subcategory: 'Manage Categories',
  orders: 'Orders',
  product: 'Products Section',
  inventory: 'Inventory',
  admin: 'New Account',
  blog: 'Blog',
  // New virtual page key for access control (optional – if you add this to access-pages it will respect it)
  product_comment: 'Product Comments',
};

const sourceToPath: Record<string, string> = {
  category: '/admin/manage-categories',
  subcategory: '/admin/manage-categories',
  orders: '/admin/orders',
  product: '/admin/products',
  inventory: '/admin/inventory',
  admin: '/admin/new-account',
  blog: '/admin/blogView',
  // Comment notifications should NOT deep-link to Products; keep user in this tab
  product_comment: '/admin/notifications',
};

export default function AdminNotificationsClient() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [sortOrder, setSortOrder] = useState<'latest' | 'oldest'>('latest');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [accessibleSources, setAccessibleSources] = useState<string[]>([]);
  const [commentStatuses, setCommentStatuses] = useState<Record<string, CommentStatus>>({});
  const router = useRouter();

  useEffect(() => {
    const accessPages = localStorage.getItem('access-pages');
    if (accessPages) {
      const pages = JSON.parse(accessPages) as string[];

      const allowedSources = Object.entries(sourceTableToPageLabel)
        .filter(([_, label]) => pages.includes(label))
        .map(([source]) => source.toLowerCase());

      setAccessibleSources(allowedSources);
    }

    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/notifications/`, withFrontendKey());
      const data = await res.json();

      // Normalize comment notifications:
      // - Force them into source_table "product_comment"
      // - Ensure source_id carries the comment_id (BE change handles this)
      const normalized: Notification[] = data.map((n: Notification) => {
        const src = (n.source_table || '').toLowerCase();
        const isComment = n.type?.toLowerCase() === 'comment' || src === 'producttestimonial' || src === 'product_comment';
        if (isComment) {
          return {
            ...n,
            source_table: 'product_comment',
          };
        }
        return n;
      });

      const filtered = normalized.filter((n: Notification) => {
        const src = (n.source_table || '').toLowerCase();
        // keep only known sources + the new product_comment virtual source
        const known = Object.keys(sourceToPath).includes(src);
        return known;
      });

      setNotifications(filtered);

      // Seed any inline meta-status (if BE starts sending it)
      const seed: Record<string, CommentStatus> = {};
      filtered.forEach(n => {
        if ((n.source_table || '').toLowerCase() === 'product_comment' && n.source_id) {
          if (n.meta_status) seed[n.source_id] = n.meta_status;
        }
      });
      if (Object.keys(seed).length) setCommentStatuses(prev => ({ ...prev, ...seed }));
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  };

  const updateNotifStatusRead = async (id: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/notification-update`, withFrontendKey({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_id: id, status: 'read' }),
      }));
      setNotifications(prev =>
        prev.map(n => (n.notification_id === id ? { ...n, status: 'read' } : n))
      );
    } catch (error) {
      console.error('Error updating notification:', error);
    }
  };

  const markAllAsRead = async (ids: string[]) => {
    try {
      await Promise.all(
        ids.map(id =>
          fetch(`${API_BASE_URL}/api/notification-update`, withFrontendKey({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notification_id: id, status: 'read' }),
          }))
        )
      );
      setNotifications(prev =>
        prev.map(n => (ids.includes(n.notification_id) ? { ...n, status: 'read' } : n))
      );
    } catch (err) {
      console.error('Failed to mark all as read', err);
    }
  };

  // --- Product Comment actions ---
  const setCommentStatusLocal = (commentId: string, status: CommentStatus) => {
    setCommentStatuses(prev => ({ ...prev, [commentId]: status }));
  };

  const actOnComment = async (commentId: string, status: CommentStatus) => {
    try {
      await fetch(`${API_BASE_URL}/api/edit-product-comment/`, withFrontendKey({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_id: commentId, status }),
      }));
      setCommentStatusLocal(commentId, status);
    } catch (err) {
      console.error('Failed to update comment:', err);
    }
  };

  const toggleHidden = async (commentId: string) => {
    const current = commentStatuses[commentId];
    const next: CommentStatus = current === 'hidden' ? 'approved' : 'hidden';
    await actOnComment(commentId, next);
  };

  // --- Data shaping ---
  const getFilteredNotifications = () => {
    // separate access filter for non-comment items
    let filtered = notifications.filter(n => {
      const src = (n.source_table || '').toLowerCase();
      if (src === 'product_comment') return true; // always visible in this screen
      return accessibleSources.includes(src);
    });

    if (activeTab === 'unread') {
      filtered = filtered.filter(n => n.status === 'unread');
    } else if (activeTab === 'product_comment') {
      filtered = filtered.filter(n => (n.source_table || '').toLowerCase() === 'product_comment');
    } else if (activeTab !== 'all') {
      filtered = filtered.filter(
        n => (n.source_table || '').toLowerCase() === activeTab.toLowerCase()
      );
    }

    return filtered.sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return sortOrder === 'latest' ? bTime - aTime : aTime - bTime;
    });
  };

  const sorted = getFilteredNotifications();

  const uniqueSources = useMemo(() => {
    const base = new Set(
      notifications
        .map(n => (n.source_table || 'unknown').toLowerCase())
        .filter(src => accessibleSources.includes(src) || src === 'product_comment')
    );
    // always surface product_comment tab if any such notif exists
    const hasProductComment = notifications.some(
      n => (n.source_table || '').toLowerCase() === 'product_comment'
    );
    if (hasProductComment) base.add('product_comment');
    return Array.from(base);
  }, [notifications, accessibleSources]);

  const getRedirectPath = (source: string) => {
    const lower = source.toLowerCase();
    return sourceToPath[lower] || '/admin/notifications';
  };

  const onCardClick = async (n: Notification) => {
    await updateNotifStatusRead(n.notification_id);

    const src = (n.source_table || '').toLowerCase();
    if (src === 'product_comment') {
      // Stay in the Product Comments tab; no navigation.
      setActiveTab('product_comment');
      return;
    }
    const path = getRedirectPath(src);
    router.push(path);
  };

  return (
    <AdminAuthGuard>
      <div className="flex">
        <AdminSidebar />
        <div className="flex-1 px-6 py-8 bg-gray-50 min-h-screen">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6 bg-gradient-to-r from-white via-[#f8f9fa] to-gray-100 p-6 rounded-2xl shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-[#891F1A] mb-1">🔔 Notifications</h1>
                  <p className="text-gray-500 text-sm">Browse and manage your system alerts</p>
                </div>

                {/* Sort control (optional UX win) */}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-500">Sort</label>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'latest' | 'oldest')}
                    className="border rounded-md text-sm px-2 py-1"
                  >
                    <option value="latest">Latest</option>
                    <option value="oldest">Oldest</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 flex-wrap border-b mb-6">
              {['all', 'unread', 'product_comment', ...uniqueSources.filter(s => s !== 'product_comment')].map(tab => {
                const isProductComment = tab === 'product_comment';
                const unreadCount = notifications.filter(n => {
                  const src = (n.source_table || '').toLowerCase();
                  const inTab =
                    tab === 'all'
                      ? true
                      : tab === 'unread'
                      ? n.status === 'unread'
                      : isProductComment
                      ? src === 'product_comment'
                      : src === tab.toLowerCase();
                  return inTab && n.status === 'unread';
                }).length;

                const isActive = activeTab === tab;
                const showBadge = tab !== 'unread' && unreadCount > 0;

                const label =
                  tab === 'all'
                    ? 'All'
                    : tab === 'unread'
                    ? 'Unread'
                    : tab === 'product_comment'
                    ? 'Product Comments'
                    : tab;

                return (
                  <div key={tab} className="relative">
                    {showBadge && (
                      <span className="absolute -top-1 left-8 text-xs px-2 py-0.5 rounded-full bg-[#891F1A] text-white shadow">
                        {unreadCount}
                      </span>
                    )}
                    <button
                      onClick={() => setActiveTab(tab)}
                      className={`capitalize px-4 py-2 font-medium border-b-2 ${
                        isActive
                          ? 'border-[#891F1A] text-[#891F1A]'
                          : 'border-transparent text-gray-500 hover:text-[#891F1A]'
                      }`}
                    >
                      {label}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Mark all as read */}
            {sorted.length > 0 && (
              <div className="mb-4 flex justify-end">
                <button
                  onClick={() => markAllAsRead(sorted.map(n => n.notification_id))}
                  className="bg-[#891F1A] text-white px-4 py-2 rounded-md shadow hover:bg-[#6e1815] transition"
                >
                  Mark All as Read
                </button>
              </div>
            )}

            {/* Notification Cards */}
            {sorted.length > 0 ? (
              <div className="space-y-4">
                {sorted.map(n => {
                  const isComment = (n.source_table || '').toLowerCase() === 'product_comment';
                  const commentId = n.source_id || '';
                  const localStatus = (commentId && commentStatuses[commentId]) || n.meta_status || 'pending';

                  return (
                    <div
                      key={n.notification_id}
                      onClick={() => onCardClick(n)}
                      className={`cursor-pointer bg-white border rounded-xl p-4 shadow hover:ring-1 hover:ring-[#891F1A] transition duration-200 ${
                        n.status === 'unread' ? 'border-[#fcd34d]' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row justify-between gap-3">
                        <div className="flex-1">
                          <p className={`font-medium ${n.status === 'unread' ? 'text-[#891F1A]' : 'text-gray-900'}`}>
                            {n.message}
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            Source: <b>{isComment ? 'Product Comment' : (n.source_table || 'N/A')}</b>
                            {isComment && commentId ? (
                              <span className="ml-2 text-gray-400">• Comment ID: <b>{commentId}</b></span>
                            ) : null}
                          </p>
                        </div>

                        {/* Right-side controls */}
                        <div className="text-sm text-right">
                          {!isComment ? (
                            <>
                              <span
                                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full font-medium ${
                                  n.status === 'unread'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                <FaEye /> {n.status.toUpperCase()}
                              </span>
                              <p className="text-xs text-gray-400 mt-1">
                                {new Date(n.created_at).toLocaleString()}
                              </p>
                            </>
                          ) : (
                            <>
                              {/* Product Comment action buttons */}
                              <div
                                className="flex items-center justify-end gap-2"
                                onClick={(e) => e.stopPropagation()} // prevent card click navigation
                              >
                                <button
                                  title="Approve"
                                  disabled={!commentId}
                                  onClick={() => actOnComment(commentId, 'approved')}
                                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-md font-medium border ${
                                    localStatus === 'approved'
                                      ? 'bg-green-100 text-green-700 border-green-300'
                                      : 'bg-white text-green-700 border-green-300 hover:bg-green-50'
                                  }`}
                                >
                                  <FaCheck />
                                  <span className="hidden sm:inline">Approved</span>
                                </button>

                                <button
                                  title={localStatus === 'hidden' ? 'Unhide' : 'Hide'}
                                  disabled={!commentId}
                                  onClick={() => toggleHidden(commentId)}
                                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-md font-medium border ${
                                    localStatus === 'hidden'
                                      ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                                      : 'bg-white text-yellow-800 border-yellow-300 hover:bg-yellow-50'
                                  }`}
                                >
                                  <FaPause />
                                  <span className="hidden sm:inline">
                                    {localStatus === 'hidden' ? 'Hidden' : 'Hide'}
                                  </span>
                                </button>

                                <button
                                  title="Reject"
                                  disabled={!commentId}
                                  onClick={() => actOnComment(commentId, 'rejected')}
                                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-md font-medium border ${
                                    localStatus === 'rejected'
                                      ? 'bg-red-100 text-red-700 border-red-300'
                                      : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                                  }`}
                                >
                                  <FaTimes />
                                  <span className="hidden sm:inline">Rejected</span>
                                </button>
                              </div>

                              {/* Read-state + timestamp */}
                              <div className="mt-2">
                                <span
                                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-full font-medium ${
                                    n.status === 'unread'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-gray-100 text-gray-500'
                                  }`}
                                >
                                  <FaEye /> {n.status.toUpperCase()}
                                </span>
                                <p className="text-xs text-gray-400 mt-1">
                                  {new Date(n.created_at).toLocaleString()}
                                </p>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-gray-400 text-sm py-10">
                No notifications to show.
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminAuthGuard>
  );
}
