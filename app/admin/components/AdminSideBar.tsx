"use client";

import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useId,
  useTransition,
} from "react";
import { API_BASE_URL } from "../../utils/api";

/* ================= Types ================= */
export type LinkItem = {
  label: string;
  href?: string;
  children?: { label: string; href: string }[];
};

type Notification = {
  notification_id: string;
  message: string;
  created_at: string;
  type: string;
  status: "read" | "unread";
  source_table?: string;
  source_id?: string;
  order_id?: string;
  sku?: string;
  user?: string;
};

type AdminRow = {
  admin_id: string;
  admin_name: string;
  password_hash: string;
  role_id: string;
  role_name: string;
  access_pages: string[];
  created_at: string;
};

/* ================= Constants ================= */
const GROUP_LABEL = "Home Settings";

// Map backend → allowed page label
const sourceTableToPageLabel: Record<string, string> = {
  category: "Manage Categories",
  subcategory: "Manage Categories",
  orders: "Orders",
  product: "Products Section",
  inventory: "Inventory",
  admin: "New Account",
  blog: "Blog",
  attributes: "Attributes",
};

const sourceToPath: Record<string, string> = {
  category: "/admin/manage-categories",
  subcategory: "/admin/manage-categories",
  orders: "/admin/orders",
  product: "/admin/products",
  inventory: "/admin/inventory",
  admin: "/admin/new-account",
  blog: "/admin/blogView",
  attributes: "/admin/attributes",
};

// Frontend key passthrough
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

const ALL_LINKS: LinkItem[] = [
  { label: "Dashboard", href: "/admin/dashboard" },
  { label: "Orders", href: "/admin/orders" },
  { label: "Manage Categories", href: "/admin/manage-categories" },
  { label: "Attributes", href: "/admin/attributes" },
  { label: "Products Section", href: "/admin/products" },
  { label: "Inventory", href: "/admin/inventory" },
  {
    label: GROUP_LABEL,
    children: [
      { label: "NavBar", href: "/admin/navbar" },
      { label: "Hero Banner", href: "/admin/hero-banner" },
      { label: "First Carousel", href: "/admin/first-carousel" },
      { label: "Second Carousel", href: "/admin/second-carousel" },
      { label: "Testimonials", href: "/admin/testimonials" },
    ],
  },
  { label: "Media Library", href: "/admin/media-library" },
  { label: "Settings", href: "/admin/settings" },
  { label: "Google Analytics", href: "/admin/G-Analytics" },
  { label: "Google Settings", href: "/admin/G-Settings" },
  { label: "Blog", href: "/admin/blogView" },
  { label: "New Account", href: "/admin/new-account" },
  { label: "User View", href: "/home" },
];

/* ===== Logo helpers (top-level, not hooks) ===== */
const LOCAL_LOGO_FALLBACK = "/images/logo.png";
const normalizeLogoUrl = (u?: string) => {
  const v = (u || "").trim();
  if (!v) return LOCAL_LOGO_FALLBACK;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (v.startsWith("/")) return `${API_BASE_URL}${v}`;
  if (v.startsWith("media/") || v.startsWith("uploads/"))
    return `${API_BASE_URL}/${v}`;
  return LOCAL_LOGO_FALLBACK;
};

/* ================= Utils ================= */
function safeParseAccessPages(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizePermissions(perms: string[]) {
  const s = new Set((perms || []).map((p) => p?.trim()));
  if (s.has("Blog")) s.add("Blog View");
  return Array.from(s).filter((p) => p !== "Blog View");
}

function sameSetCI(a: string[], b: string[]) {
  const A = new Set(a.map((x) => x.trim().toLowerCase()));
  const B = new Set(b.map((x) => x.trim().toLowerCase()));
  if (A.size !== B.size) return false;
  for (const v of A) if (!B.has(v)) return false;
  return true;
}

const usePageVisibility = () => {
  const [visible, setVisible] = useState(
    typeof document !== "undefined"
      ? document.visibilityState === "visible"
      : true
  );
  useEffect(() => {
    const onVisible = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return visible;
};

/* ================= Component ================= */
export default function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const idPrefix = useId();

  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState<boolean>(false);
  const [accessPages, setAccessPages] = useState<string[]>([]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [logoUrl, setLogoUrl] = useState<string>(LOCAL_LOGO_FALLBACK);

  const validatingRef = useRef(false);
  const notifyAbortRef = useRef<AbortController | null>(null);
  const visible = usePageVisibility();

  const forceLogout = useCallback(() => {
    try {
      localStorage.removeItem("admin-auth");
      localStorage.removeItem("admin-id");
      localStorage.removeItem("access-pages");
    } catch {}
    router.replace("/admin/login");
  }, [router]);

  const validateSession = useCallback(async () => {
    if (validatingRef.current) return;
    validatingRef.current = true;
    try {
      const isLoggedIn =
        typeof window !== "undefined" &&
        localStorage.getItem("admin-auth") === "true";
      const adminId =
        typeof window !== "undefined"
          ? localStorage.getItem("admin-id") || ""
          : "";

      if (!isLoggedIn || !adminId) {
        validatingRef.current = false;
        return forceLogout();
      }

      const res = await fetch(
        `${API_BASE_URL}/api/show-admin/`,
        withFrontendKey()
      );
      if (!res.ok) {
        validatingRef.current = false;
        return;
      }
      const data = await res.json();
      const list: AdminRow[] = data?.admins || [];

      const me = list.find((r) => String(r.admin_id) === String(adminId));
      if (!me) {
        validatingRef.current = false;
        return forceLogout();
      }

      const localPerms = safeParseAccessPages(
        localStorage.getItem("access-pages")
      );
      const serverPerms = normalizePermissions(me.access_pages || []);
      if (!sameSetCI(normalizePermissions(localPerms), serverPerms)) {
        validatingRef.current = false;
        return forceLogout();
      }
    } catch {
      // swallow transient errors
    } finally {
      validatingRef.current = false;
    }
  }, [forceLogout]);

  // Load auth + first validation
  useEffect(() => {
    const isLoggedIn =
      typeof window !== "undefined" &&
      localStorage.getItem("admin-auth") === "true";

    setIsAuthed(!!isLoggedIn);

    if (!isLoggedIn) {
      router.replace("/admin/login");
      setLoading(false);
      return;
    }

    const pages = safeParseAccessPages(localStorage.getItem("access-pages"));
    setAccessPages(pages);
    setLoading(false);

    validateSession();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "admin-auth") {
        const nowAuthed = localStorage.getItem("admin-auth") === "true";
        setIsAuthed(nowAuthed);
        if (!nowAuthed) router.replace("/admin/login");
      }
      if (e.key === "access-pages") {
        const updated = safeParseAccessPages(localStorage.getItem("access-pages"));
        setAccessPages(updated);
        validateSession();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [router, validateSession]);

  // Periodic revalidation (reduced churn: only when tab visible)
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(validateSession, 60_000);
    return () => clearInterval(t);
  }, [visible, validateSession]);

  // Access set
  const accessSet = useMemo(
    () => new Set(accessPages.map((s) => s.toLowerCase().trim())),
    [accessPages]
  );

  const canSeeNotifications = accessSet.has("notifications");

  // Visible links (respect access)
  const visibleLinks = useMemo(() => {
    if (!accessPages.length) return [] as LinkItem[];

    return ALL_LINKS.reduce<LinkItem[]>((acc, item) => {
      if (item.children && item.children.length) {
        const allowedChildren = item.children.filter((c) =>
          accessSet.has(c.label.toLowerCase())
        );

        if (accessSet.has(item.label.toLowerCase()) || allowedChildren.length) {
          acc.push({ ...item, children: allowedChildren });
        }
      } else if (item.href) {
        if (item.label === "Attributes") {
          const hasAttrsAccess =
            accessSet.has("attributes") ||
            accessSet.has("manage categories") ||
            accessSet.has("products section");
          if (hasAttrsAccess) acc.push(item);
        } else {
          if (accessSet.has(item.label.toLowerCase())) acc.push(item);
        }
      }
      return acc;
    }, []);
  }, [accessPages, accessSet]);

  // Notifications fetch (debounced + visibility-aware)
  const fetchNotifications = useCallback(async () => {
    if (!canSeeNotifications) {
      setUnreadCount(0);
      return;
    }
    if (notifyAbortRef.current) notifyAbortRef.current.abort();
    const ac = new AbortController();
    notifyAbortRef.current = ac;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/notifications/`,
        withFrontendKey({ signal: ac.signal, cache: "no-store" })
      );
      if (!res.ok) return;
      const data: Notification[] = await res.json();

      const filtered = data.filter((n) => {
        const src = (n.source_table || "").toLowerCase();
        if (src === "adminrole" || src === "adminrolemap") return false;
        const label = sourceTableToPageLabel[src];
        if (!label) return false;
        return accessSet.has(label.toLowerCase());
      });

      const unread = filtered.reduce(
        (acc, n) => acc + (n.status === "unread" ? 1 : 0),
        0
      );
      setUnreadCount(unread);
    } catch {
      // ignore
    }
  }, [canSeeNotifications, accessSet]);

  // Notifications polling: only when visible; backoff when hidden
  useEffect(() => {
    if (!visible) return;
    fetchNotifications();
    const poll = setInterval(fetchNotifications, 30_000);
    return () => {
      clearInterval(poll);
      if (notifyAbortRef.current) notifyAbortRef.current.abort();
    };
  }, [visible, fetchNotifications]);

  // ===== Fetch logo with sessionStorage cache (cuts a network hop per mount) =====
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cacheKey = "admin-logo-url:v1";
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const { url } = JSON.parse(cached);
          if (!cancelled) setLogoUrl(normalizeLogoUrl(url));
          return;
        }
        const res = await fetch(
          `${API_BASE_URL}/api/show-logo/?_=${Date.now()}`,
          withFrontendKey({ cache: "no-store" })
        );
        const json = res.ok ? await res.json() : null;
        const url = normalizeLogoUrl(json?.logo?.url);
        if (!cancelled) setLogoUrl(url);
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ url: json?.logo?.url || "" }));
        } catch {}
      } catch {
        if (!cancelled) setLogoUrl(LOCAL_LOGO_FALLBACK);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isChildActive = useCallback(
    (href: string) =>
      pathname === href ||
      (pathname?.startsWith(href + "/") && href !== "/admin/dashboard"),
    [pathname]
  );

  const toggleGroup = useCallback(
    (label: string) =>
      setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] })),
    []
  );

  const onNav = useCallback(
    (href: string) => {
      startTransition(() => {
        router.push(href);
      });
    },
    [router, startTransition]
  );

  if (loading || !isAuthed) {
    return (
      <aside
        className="w-full lg:w-64 h-screen sticky top-0 bg-white border-r shadow-sm animate-pulse"
        aria-label="Admin sidebar loading"
      />
    );
    }

  return (
    <aside
      className="w-full lg:w-64 bg-white border-r shadow-sm h-screen sticky top-0 overflow-y-auto z-40"
      role="navigation"
      aria-label="Admin sidebar"
    >
      {/* Logo */}
      <div className="flex justify-center items-center py-6 border-b mb-4 px-4">
        <Image
          src={logoUrl}
          alt="Printshop logo"
          width={221}
          height={60}
          className="w-28 sm:w-40 lg:w-[221px] h-auto"
          priority
          unoptimized
          onError={() => setLogoUrl(LOCAL_LOGO_FALLBACK)}
        />
      </div>

      {/* Heading + Notifications pill */}
      <div className="bg-white text-red-800 py-3 px-6 mb-3 border-2 border-red-800 -mt-4 flex items-center justify-between">
        <h2 className="text-base sm:text-lg font-bold">Admin Panel</h2>

        {canSeeNotifications && (
          <button
            type="button"
            onClick={() => onNav("/admin/notifications")}
            title="Notifications"
            className="ml-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-100 hover:bg-red-200 transition-colors"
            aria-label={`Notifications, ${unreadCount} unread`}
          >
            <span className="text-sm font-semibold text-red-900" aria-hidden="true">
              <img
                src="https://img.icons8.com/?size=100&id=83193&format=png&color=891F1A"
                className="w-5 h-5"
                alt=""
              />
            </span>
            <span
              className={[
                "min-w-5 h-5 px-2 rounded-full text-white text-xs font-bold flex items-center justify-center",
                unreadCount > 0 ? "bg-[#891F1A]" : "bg-gray-400",
              ].join(" ")}
            >
              {unreadCount}
            </span>
          </button>
        )}
      </div>

      {/* Sidebar Links */}
      <ul className="text-black text-sm sm:text-base space-y-3 px-4">
        {visibleLinks.map((item) => {
          const isGroup = !!item.children?.length;

          if (!isGroup) {
            const isActive = isChildActive(item.href!);
            return (
              <li key={item.href}>
                {/* Prefer Link for prefetch + native semantics */}
                <Link
                  href={item.href!}
                  prefetch
                  className={[
                    "block py-3 px-4 border-b rounded transition-colors duration-200",
                    isActive
                      ? "bg-[#891F1A] text-white hover:bg-[#a14d4d]"
                      : "hover:bg-gray-100 text-black",
                  ].join(" ")}
                  aria-current={isActive ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            );
          }

          const isOpen = !!openGroups[item.label];
          const groupId = `${idPrefix}-group-${item.label.replace(/\s+/g, "-")}`;
          const anyChildActive = item.children!.some((c) =>
            isChildActive(c.href)
          );

          return (
            <li key={item.label} className="border-b rounded">
              <button
                type="button"
                onClick={() => toggleGroup(item.label)}
                className={[
                  "w-full text-left py-3 px-4 flex items-center justify-between transition-colors duration-200",
                  anyChildActive
                    ? "bg-[#891F1A] text-white hover:bg-[#a14d4d]"
                    : "hover:bg-gray-100 text-black",
                ].join(" ")}
                aria-expanded={isOpen}
                aria-controls={groupId}
              >
                <span>{item.label}</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className={`w-5 h-5 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 14.5l-6-6 1.5-1.5L12 11.5l4.5-4.5L18 8.5l-6 6z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              <ul
                id={groupId}
                className={`mt-1 mb-3 ml-2 pl-2 border-l ${
                  isOpen ? "block" : "hidden"
                }`}
              >
                {item.children!.map((child) => {
                  const active = isChildActive(child.href);
                  return (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        prefetch
                        className={[
                          "block py-2.5 px-3 rounded-md mb-1 transition-colors duration-200 text-sm",
                          active
                            ? "bg-[#891F1A] text-white hover:bg-[#a14d4d]"
                            : "hover:bg-gray-100 text-black",
                        ].join(" ")}
                        aria-current={active ? "page" : undefined}
                      >
                        {child.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}

        {!visibleLinks.length && (
          <li className="py-3 px-4 text-gray-500 text-sm">
            No pages assigned to your role. Contact an admin.
          </li>
        )}
      </ul>

      {/* Logout */}
      <div className="px-4 mt-12 mb-4">
        <button
          className="w-full bg-[#891F1A] text-white px-4 py-2 rounded hover:bg-red-700 text-sm sm:text-base"
          onClick={forceLogout}
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
