// Front_End/app/admin/notifications/page.tsx
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "../components/AdminSideBar";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import { API_BASE_URL } from "../../utils/api";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { FaEye, FaCheck, FaPause, FaTimes } from "react-icons/fa";

/** ─────────────────────────────────────────────────────────────────────────────
 * Frontend-key helper
 * ────────────────────────────────────────────────────────────────────────────*/
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

// Dev guard (helps avoid head-scratching 403s locally)
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production" && !FRONTEND_KEY) {
  // eslint-disable-next-line no-console
  console.warn("NEXT_PUBLIC_FRONTEND_KEY is empty — API calls may fail");
}

/** Small JSON fetch helper with better errors + optional abort */
const jsonFetch = async (url: string, init: RequestInit = {}, signal?: AbortSignal) => {
  const res = await fetch(
    url,
    withFrontendKey({
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      signal,
    })
  );

  const text = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON ok */
  }
  if (!res.ok) {
    const msg =
      (data && (data.error || data.detail || data.message)) ||
      text ||
      `HTTP ${res.status} ${res.statusText}`;
    const err = new Error(msg) as any;
    // propagate known shapes for downstream filters
    if ((res as any).status === 499) err.name = "AbortError";
    throw err;
  }
  return data;
};

/** Cancelation classifier */
const isAbortError = (err: unknown) => {
  const e = err as any;
  return (
    e?.name === "AbortError" ||
    e?.code === "ABORT_ERR" ||
    e?.reason === "component unmounted" ||
    e?.message?.toLowerCase?.().includes("aborted") ||
    e?.message?.toLowerCase?.().includes("signal is aborted")
  );
};

/** ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────────────*/
interface Notification {
  notification_id: string;
  message: string;
  created_at: string;
  type: string;
  status: "read" | "unread";
  source_table?: string; // BE will send "product_comment" here for comment notifications
  source_id?: string; // For product_comment this MUST be the comment_id (testimonial_id)
  order_id?: string;
  sku?: string;
  user?: string;
  meta_status?: "pending" | "approved" | "rejected" | "hidden"; // optional inline comment status
}
type CommentStatus = "pending" | "approved" | "rejected" | "hidden";

/** Human labels and routes */
const sourceTableToPageLabel: Record<string, string> = {
  category: "Manage Categories",
  subcategory: "Manage Categories",
  orders: "Orders",
  product: "Products Section",
  inventory: "Inventory",
  admin: "New Account",
  blog: "Blog",
  product_comment: "Product Comments", // virtual page for comments
};

const sourceToPath: Record<string, string> = {
  category: "/admin/manage-categories",
  subcategory: "/admin/manage-categories",
  orders: "/admin/orders",
  product: "/admin/products",
  inventory: "/admin/inventory",
  admin: "/admin/new-account",
  blog: "/admin/blogView",
  product_comment: "/admin/notifications", // stay here for comment moderation
};

const prettySource = (src: string) =>
  src.toLowerCase() === "product_comment"
    ? "Product Comments"
    : sourceTableToPageLabel[src.toLowerCase()] || src;

/** ─────────────────────────────────────────────────────────────────────────────
 * Page
 * ────────────────────────────────────────────────────────────────────────────*/
export default function AdminNotificationsClient() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [sortOrder, setSortOrder] = useState<"latest" | "oldest">("latest");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [accessibleSources, setAccessibleSources] = useState<string[]>([]);
  const [commentStatuses, setCommentStatuses] = useState<Record<string, CommentStatus>>({});
  const router = useRouter();

  /** Fetch + normalize notifications */
  const fetchNotifications = useCallback(
    async (signal?: AbortSignal) => {
      if (signal?.aborted) return; // cheap early exit
      const data = await jsonFetch(`${API_BASE_URL}/api/notifications/`, { method: "GET" }, signal);

      const normalized: Notification[] = (data as Notification[]).map((n) => {
        const src = (n.source_table || "").toLowerCase();
        const isComment =
          n.type?.toLowerCase() === "comment" || src === "producttestimonial" || src === "product_comment";
        if (isComment) {
          return {
            ...n,
            source_table: "product_comment", // force virtual source name
          };
        }
        return n;
      });

      // keep only known sources (and product_comment)
      const filtered = normalized.filter((n) => {
        const src = (n.source_table || "").toLowerCase();
        return Object.keys(sourceToPath).includes(src);
      });

      setNotifications(filtered);

      // seed inline meta-status for comments if backend sent it
      const seed: Record<string, CommentStatus> = {};
      filtered.forEach((n) => {
        if ((n.source_table || "").toLowerCase() === "product_comment" && n.source_id) {
          if (n.meta_status) seed[n.source_id] = n.meta_status;
        }
      });
      if (Object.keys(seed).length) setCommentStatuses((prev) => ({ ...prev, ...seed }));
    },
    []
  );

  /** Load access control + notifications on mount */
  useEffect(() => {
    const ac = new AbortController();

    const bootstrap = async () => {
      try {
        // Access control (pages user can access)
        const accessPages = localStorage.getItem("access-pages");
        if (accessPages) {
          const pages = JSON.parse(accessPages) as string[];
          const allowedSources = Object.entries(sourceTableToPageLabel)
            .filter(([_, label]) => pages.includes(label))
            .map(([source]) => source.toLowerCase());
          setAccessibleSources(allowedSources);
        }
      } catch {
        /* ignore access parse errors */
      }

      try {
        await fetchNotifications(ac.signal);
      } catch (err) {
        if (isAbortError(err)) return;
        // eslint-disable-next-line no-console
        console.error(err);
        toast.error("Failed to load notifications.");
      }
    };

    bootstrap();
    return () => ac.abort("component unmounted");
  }, [fetchNotifications]);

  /** Light polling (30s) when tab is visible */
  useEffect(() => {
    let timer: any;
    let stopped = false;

    const tick = async () => {
      if (document.hidden) return;
      const ac = new AbortController();
      try {
        await fetchNotifications(ac.signal);
      } catch (err) {
        if (!isAbortError(err)) {
          // non-fatal; keep polling quiet
        }
      }
    };

    const start = () => {
      if (stopped) return;
      timer = setInterval(tick, 30000);
    };
    const stop = () => {
      stopped = true;
      clearInterval(timer);
    };

    const onVis = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchNotifications]);

  /** Update single notif to read (optimistic) */
  const updateNotifStatusRead = async (id: string) => {
    try {
      setNotifications((prev) => prev.map((n) => (n.notification_id === id ? { ...n, status: "read" } : n)));
      await jsonFetch(`${API_BASE_URL}/api/notification-update`, {
        method: "POST",
        body: JSON.stringify({ notification_id: id, status: "read" }),
      });
    } catch (error) {
      // revert if failed
      setNotifications((prev) => prev.map((n) => (n.notification_id === id ? { ...n, status: "unread" } : n)));
      // eslint-disable-next-line no-console
      if (!isAbortError(error)) {
        console.error("Error updating notification:", error);
        toast.error("Failed to update notification.");
      }
    }
  };

  /** Batch mark as read: try batch endpoint; fallback to per-ID */
  const markAllAsRead = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      await jsonFetch(`${API_BASE_URL}/api/notifications/mark-read-batch`, {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
    } catch (err) {
      if (!isAbortError(err)) {
        // fallback: parallel individual updates
        await Promise.all(
          ids.map((id) =>
            jsonFetch(`${API_BASE_URL}/api/notification-update`, {
              method: "POST",
              body: JSON.stringify({ notification_id: id, status: "read" }),
            }).catch(() => {})
          )
        );
      }
    }
    setNotifications((prev) => prev.map((n) => (ids.includes(n.notification_id) ? { ...n, status: "read" } : n)));
  };

  /** Product comment moderation actions */
  const setCommentStatusLocal = (commentId: string, status: CommentStatus) => {
    setCommentStatuses((prev) => ({ ...prev, [commentId]: status }));
  };

  const actOnComment = async (commentId: string, status: CommentStatus) => {
    try {
      await jsonFetch(`${API_BASE_URL}/api/edit-product-comment/`, {
        method: "POST",
        body: JSON.stringify({ comment_id: commentId, status }),
      });

      setCommentStatusLocal(commentId, status);

      // Mark any notification pointing to this comment as read
      setNotifications((prev) =>
        prev.map((n) =>
          (n.source_table || "").toLowerCase() === "product_comment" && n.source_id === commentId
            ? { ...n, status: "read" }
            : n
        )
      );
    } catch (err) {
      if (!isAbortError(err)) {
        // eslint-disable-next-line no-console
        console.error("Failed to update comment:", err);
        toast.error("Failed to update comment.");
      }
    }
  };

  const toggleHidden = async (commentId: string) => {
    const current = commentStatuses[commentId];
    const next: CommentStatus = current === "hidden" ? "approved" : "hidden";
    await actOnComment(commentId, next);
  };

  /** Shape/filters */
  const getFilteredNotifications = () => {
    // Only filter access for non-comment items; comment items always visible here
    let filtered = notifications.filter((n) => {
      const src = (n.source_table || "").toLowerCase();
      if (src === "product_comment") return true;
      return accessibleSources.includes(src);
    });

    if (activeTab === "unread") {
      filtered = filtered.filter((n) => n.status === "unread");
    } else if (activeTab === "product_comment") {
      filtered = filtered.filter((n) => (n.source_table || "").toLowerCase() === "product_comment");
    } else if (activeTab !== "all") {
      filtered = filtered.filter((n) => (n.source_table || "").toLowerCase() === activeTab.toLowerCase());
    }

    return filtered.sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return sortOrder === "latest" ? bTime - aTime : aTime - bTime;
    });
  };

  const sorted = getFilteredNotifications();

  const uniqueSources = useMemo(() => {
    const base = new Set(
      notifications
        .map((n) => (n.source_table || "unknown").toLowerCase())
        .filter((src) => accessibleSources.includes(src) || src === "product_comment")
    );
    const hasProductComment = notifications.some((n) => (n.source_table || "").toLowerCase() === "product_comment");
    if (hasProductComment) base.add("product_comment");
    return Array.from(base);
  }, [notifications, accessibleSources]);

  const getRedirectPath = (source: string) => {
    const lower = source.toLowerCase();
    return sourceToPath[lower] || "/admin/notifications";
  };

  const onCardClick = async (n: Notification) => {
    await updateNotifStatusRead(n.notification_id);

    const src = (n.source_table || "").toLowerCase();
    if (src === "product_comment") {
      setActiveTab("product_comment"); // stay here for moderation
      return;
    }
    router.push(getRedirectPath(src));
  };

  const unreadIdsInCurrentView = useMemo(
    () => sorted.filter((n) => n.status === "unread").map((n) => n.notification_id),
    [sorted]
  );

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

                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-500">Sort</label>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as "latest" | "oldest")}
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
              {["all", "unread", "product_comment", ...uniqueSources.filter((s) => s !== "product_comment")].map(
                (tab) => {
                  const isProductComment = tab === "product_comment";
                  const unreadCount = notifications.filter((n) => {
                    const src = (n.source_table || "").toLowerCase();
                    const inTab =
                      tab === "all"
                        ? true
                        : tab === "unread"
                        ? n.status === "unread"
                        : isProductComment
                        ? src === "product_comment"
                        : src === tab.toLowerCase();
                    return inTab && n.status === "unread";
                  }).length;

                  const isActive = activeTab === tab;
                  const showBadge = tab !== "unread" && unreadCount > 0;

                  const label =
                    tab === "all"
                      ? "All"
                      : tab === "unread"
                      ? "Unread"
                      : prettySource(tab);

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
                            ? "border-[#891F1A] text-[#891F1A]"
                            : "border-transparent text-gray-500 hover:text-[#891F1A]"
                        }`}
                      >
                        {label}
                      </button>
                    </div>
                  );
                }
              )}
            </div>

            {/* Mark all as read */}
            {sorted.length > 0 && (
              <div className="mb-4 flex justify-end">
                <button
                  onClick={() => markAllAsRead(unreadIdsInCurrentView)}
                  disabled={!unreadIdsInCurrentView.length}
                  className={`px-4 py-2 rounded-md shadow transition ${
                    unreadIdsInCurrentView.length
                      ? "bg-[#891F1A] text-white hover:bg-[#6e1815]"
                      : "bg-gray-300 text-gray-600 cursor-not-allowed"
                  }`}
                >
                  Mark All as Read
                </button>
              </div>
            )}

            {/* Notification Cards */}
            {sorted.length > 0 ? (
              <div className="space-y-4">
                {sorted.map((n) => {
                  const isComment = (n.source_table || "").toLowerCase() === "product_comment";
                  const commentId = n.source_id || "";
                  const localStatus: CommentStatus =
                    (commentId && commentStatuses[commentId]) || n.meta_status || "pending";

                  return (
                    <div
                      key={n.notification_id}
                      onClick={() => onCardClick(n)}
                      className={`cursor-pointer bg-white border rounded-xl p-4 shadow hover:ring-1 hover:ring-[#891F1A] transition duration-200 ${
                        n.status === "unread" ? "border-[#fcd34d]" : "border-gray-200"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row justify-between gap-3">
                        <div className="flex-1">
                          <p
                            className={`font-medium ${
                              n.status === "unread" ? "text-[#891F1A]" : "text-gray-900"
                            }`}
                          >
                            {n.message}
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            Source: <b>{isComment ? "Product Comments" : prettySource(n.source_table || "N/A")}</b>
                            {isComment && commentId ? (
                              <span className="ml-2 text-gray-400">
                                • Comment ID: <b>{commentId}</b>
                              </span>
                            ) : null}
                          </p>
                        </div>

                        {/* Right-side controls */}
                        <div className="text-sm text-right">
                          {!isComment ? (
                            <>
                              <span
                                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full font-medium ${
                                  n.status === "unread"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-gray-100 text-gray-500"
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
                                  onClick={() => actOnComment(commentId, "approved")}
                                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-md font-medium border ${
                                    localStatus === "approved"
                                      ? "bg-green-100 text-green-700 border-green-300"
                                      : "bg-white text-green-700 border-green-300 hover:bg-green-50"
                                  }`}
                                >
                                  <FaCheck />
                                  <span className="hidden sm:inline">Approved</span>
                                </button>

                                <button
                                  title={localStatus === "hidden" ? "Unhide" : "Hide"}
                                  disabled={!commentId}
                                  onClick={() => toggleHidden(commentId)}
                                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-md font-medium border ${
                                    localStatus === "hidden"
                                      ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                                      : "bg-white text-yellow-800 border-yellow-300 hover:bg-yellow-50"
                                  }`}
                                >
                                  <FaPause />
                                  <span className="hidden sm:inline">
                                    {localStatus === "hidden" ? "Hidden" : "Hide"}
                                  </span>
                                </button>

                                <button
                                  title="Reject"
                                  disabled={!commentId}
                                  onClick={() => actOnComment(commentId, "rejected")}
                                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-md font-medium border ${
                                    localStatus === "rejected"
                                      ? "bg-red-100 text-red-700 border-red-300"
                                      : "bg-white text-red-700 border-red-300 hover:bg-red-50"
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
                                    n.status === "unread"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-gray-100 text-gray-500"
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
              <div className="text-center text-gray-400 text-sm py-10">No notifications to show.</div>
            )}
          </div>
        </div>
      </div>

      {/* Toasts */}
      <ToastContainer position="top-center" />
    </AdminAuthGuard>
  );
}
