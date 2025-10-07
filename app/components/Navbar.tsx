"use client";

import Link from "next/link";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useId,
} from "react";
import { API_BASE_URL } from "../utils/api";
import { SafeImg } from "./SafeImage";

/* ──────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────── */
type Subcategory = {
  id?: string | number;
  name: string;
  url: string;
  images?: { url?: string; alt_text?: string }[];
  products?: Array<{
    id?: string | number;
    name?: string;
    product_id?: string | number;
    images?: { url?: string; alt_text?: string }[];
  }>;
};

type Category = {
  id?: string | number;
  name: string;
  url: string;
  subcategories?: Subcategory[];
};

type NavItem = {
  id?: string | number;
  label: string;
  url: string;
  dropdownContent: {
    title: string;
    columns: Array<{ label: string; url: string; color?: string }>;
  };
};

const getDropdownItemColorClass = (color: string) => {
  switch (color) {
    case "red":
      return "text-red-600";
    default:
      return "text-gray-800";
  }
};

/* ──────────────────────────────────────────────────────────
   Fetch helper (single harmless custom header) + session cache
   ────────────────────────────────────────────────────────── */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const fetchWithKey = (url: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  return fetch(url, {
    ...init,
    headers,
    credentials: "omit",
    mode: "cors",
  });
};

// simple in-memory + sessionStorage cache to avoid re-fetch on client navigations
let NAV_MEMO: Category[] | null = null;
const NAV_SKEY = "cc_nav_cache_v1";

const readNavCache = (): Category[] | null => {
  if (NAV_MEMO) return NAV_MEMO;
  try {
    const raw = sessionStorage.getItem(NAV_SKEY);
    if (!raw) return null;
    NAV_MEMO = JSON.parse(raw) as Category[];
    return NAV_MEMO;
  } catch {
    return null;
  }
};

const writeNavCache = (data: Category[]) => {
  NAV_MEMO = data;
  try {
    sessionStorage.setItem(NAV_SKEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
};

/* Fallback image (local/public) */
const NOT_FOUND_IMG = "/images/img1.jpg";

/* ──────────────────────────────────────────────────────────
   Component
   ────────────────────────────────────────────────────────── */
export default function Navbar() {
  const [navItemsData, setNavItemsData] = useState<NavItem[]>([]);
  const [productData, setProductData] = useState<Category[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [isDropdownHovered, setIsDropdownHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // remember last hovered subcategory until user hovers another
  const [hoveredSubForProducts, setHoveredSubForProducts] =
    useState<string | null>(null);

  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ===== Dropdown positioning (anchored to bottom of bar) =====
  const navRef = useRef<HTMLDivElement>(null);
  const [dropdownTop, setDropdownTop] = useState<number>(140);

  const recomputeDropdownTop = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropdownTop(Math.max(8, Math.round(rect.bottom + 8)));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Recompute on mount and on scroll/resize
    const onScroll = () => recomputeDropdownTop();
    const onResize = () => recomputeDropdownTop();

    recomputeDropdownTop();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [recomputeDropdownTop]);

  // ===== Horizontal rail: left-aligned, scrollable, no page scroll =====
  const barContainerRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = barContainerRef.current;
    if (!el) return;

    const canScroll = el.scrollWidth > el.clientWidth;
    if (!canScroll) return; // let page handle it naturally

    // If there's vertical wheel input, convert it to horizontal scroll
    const deltaX = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (deltaX !== 0) {
      e.preventDefault(); // stop the page from scrolling
      el.scrollLeft += deltaX;
    }
  }, []);

  // ===== Data fetch with session cache =====
  useEffect(() => {
    const cached = readNavCache();
    if (cached && cached.length) {
      setProductData(cached);
      const formatted: NavItem[] = cached.map((cat) => ({
        id: cat.id,
        label: cat.name,
        url: `/home/${cat.url}`,
        dropdownContent: {
          title: cat.name,
          columns:
            (cat.subcategories || []).map((sub) => ({
              label: sub.name,
              url: `/home/${cat.url}/${sub.url}`,
              color: "red",
            })) || [],
        },
      }));
      setNavItemsData(formatted);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    (async () => {
      try {
        setFetchError(null);
        const res = await fetchWithKey(`${API_BASE_URL}/api/show_nav_items/`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}${text ? ` - ${text}` : ""}`);
        }
        const nav: Category[] = await res.json();
        writeNavCache(nav);
        setProductData(nav);

        const formatted: NavItem[] = (nav || []).map((cat) => ({
          id: cat.id,
          label: cat.name,
          url: `/home/${cat.url}`,
          dropdownContent: {
            title: cat.name,
            columns:
              (cat.subcategories || []).map((sub) => ({
                label: sub.name,
                url: `/home/${cat.url}/${sub.url}`,
                color: "red",
              })) || [],
          },
        }));
        setNavItemsData(formatted);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("❌ Failed to fetch nav items:", err);
        setFetchError(err?.message || "Failed to load navigation");
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  // ===== Unified scroll lock =====
  const lockScroll = mobileOpen || (dropdownVisible && openIndex !== null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (lockScroll) {
      document.body.style.overflow = "hidden";
      (document.body.style as any).overscrollBehavior = "none";
    } else {
      document.body.style.overflow = "";
      (document.body.style as any).overscrollBehavior = "";
    }
    return () => {
      document.body.style.overflow = "";
      (document.body.style as any).overscrollBehavior = "";
    };
  }, [lockScroll]);

  // reset right pane when switching category
  useEffect(() => {
    if (openIndex !== null) {
      setHoveredSubForProducts(null);
      requestAnimationFrame(recomputeDropdownTop);
    }
  }, [openIndex, recomputeDropdownTop]);

  /* ─────────────── Interaction (hover + keyboard) ─────────────── */
  const handleNavEnter = useCallback(
    (idx: number) => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      recomputeDropdownTop();
      setOpenIndex(idx);
      setDropdownVisible(true);
      requestAnimationFrame(recomputeDropdownTop);
    },
    [recomputeDropdownTop]
  );

  const delayedClose = useCallback(() => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      setDropdownVisible(false);
      setHoveredSubForProducts(null);
      setTimeout(() => setOpenIndex(null), 160);
    }, 160);
  }, []);

  const handleNavLeave = useCallback(() => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      if (!isDropdownHovered) delayedClose();
    }, 160);
  }, [delayedClose, isDropdownHovered]);

  const handleDropdownEnter = useCallback(() => {
    setIsDropdownHovered(true);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
  }, []);

  const handleDropdownLeave = useCallback(() => {
    setIsDropdownHovered(false);
    delayedClose();
  }, [delayedClose]);

  const onTopItemKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLAnchorElement>, idx: number) => {
      const total = navItemsData.length;
      if (!total) return;
      switch (e.key) {
        case "Enter":
        case " ":
        case "ArrowDown":
          e.preventDefault();
          handleNavEnter(idx);
          break;
        case "Escape":
          e.preventDefault();
          delayedClose();
          break;
        case "ArrowRight":
          e.preventDefault();
          handleNavEnter((idx + 1) % total);
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleNavEnter((idx - 1 + total) % total);
          break;
        default:
          break;
      }
    },
    [navItemsData.length, handleNavEnter, delayedClose]
  );

  /* ─────────────── Helpers ─────────────── */
  const getCategoryByTitle = useCallback(
    (title: string) => productData.find((c) => c.name === title),
    [productData]
  );

  const buildProductHref = useCallback((category: any, sub: any, product: any) => {
    const catId = category?.id ?? category?.category_id ?? category?.ID ?? category?.url;
    const subId = sub?.id ?? sub?.subcategory_id ?? sub?.ID ?? sub?.url;
    const prodId = product?.id ?? product?.product_id ?? product?.ID;
    if (catId && subId && prodId) return `/home/${catId}/${subId}/products/${prodId}`;
    return `/home/${category?.url}/${sub?.url}/products/${prodId ?? ""}`;
  }, []);

  const dropdownId = useId();

  /* ─────────────── Render guards ─────────────── */
  if (loading) {
    return (
      <div className="hidden md:block" ref={navRef}>
        <nav
          className="w-full bg-white border-b border-gray-200 m-0 min-h-[80px] flex items-center"
          aria-label="Primary"
        >
          <div className="w-full px-2 mx-auto text-center text-sm text-gray-500"> </div>
        </nav>
      </div>
    );
  }

  if (!navItemsData.length) {
    return (
      <div className="hidden md:block" ref={navRef}>
        <nav className="w-full bg-white border-b border-gray-200 m-0 min-h-[80px] flex items-center font-medium" aria-label="Primary">
          <div className="w-full px-2 mx-auto text-center text-sm text-red-600">
            {fetchError ? `Navigation failed to load: ${fetchError}` : " "}
          </div>
        </nav>
      </div>
    );
  }

  /* ─────────────── View ─────────────── */
  return (
    <div
      className="hidden md:block"
      style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}
      ref={navRef}
    >
      <nav
        className="w-full bg-white border-b border-gray-200 m-0 min-h-[80px] flex items-center font-medium"
        aria-label="Primary"
      >
        <div className="w-full px-2 mx-auto">
          <div className="relative">
            {/* Single row links; left-aligned, horizontally scrollable on all breakpoints */}
            <div className={`${mobileOpen ? "flex flex-col py-2 space-y-1" : "hidden"} md:flex w-full`}>
              <div
                ref={barContainerRef}
                // Key bits:
                // - overflow-x-auto, overflow-y-hidden: only horizontal scroll
                // - touch-action pan-x: touch scrolls horizontally
                // - overscroll-behavior-x: contain so page doesn't yank
                // - custom onWheel to translate vertical wheel to horizontal and prevent page scroll
                className="w-full overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x snap-mandatory
                           [touch-action:pan-x] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                aria-label="Product categories"
                onWheel={handleWheel}
              >
                {/* no lg:justify-center — keep left-aligned */}
                <div className="flex w-full">
                  <div
                    className="flex flex-nowrap w-max select-none whitespace-nowrap"
                    style={{
                      // fixed, non-oscillating typography
                      gap: 12,
                      fontSize: 16,
                      lineHeight: 1.25,
                      letterSpacing: "0.2px",
                    }}
                    role="menubar"
                  >
                    {navItemsData.map((item, idx) => (
                      <div
                        key={item.id ?? `${item.label}-${idx}`}
                        className="relative snap-start shrink-0"
                        onMouseEnter={() => setTimeout(() => handleNavEnter(idx), 0)}
                        onMouseLeave={handleNavLeave}
                      >
                        <Link
                          href={item.url || "#"}
                          className={`block text-center whitespace-nowrap overflow-ellipsis transition-colors ${
                            openIndex === idx ? "text-red-600" : "text-gray-800 hover:text-red-600"
                          } font-medium px-3 py-2`}
                          aria-haspopup="menu"
                          aria-expanded={openIndex === idx && dropdownVisible ? true : false}
                          aria-controls={dropdownId}
                          role="menuitem"
                          onKeyDown={(e) => onTopItemKeyDown(e, idx)}
                          onFocus={() => handleNavEnter(idx)}
                          onClick={() => setMobileOpen(false)}
                        >
                          {item.label}
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Edge fades hint on small screens */}
              <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent lg:hidden" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent lg:hidden" />
            </div>
          </div>

          {/* Dropdown (desktop) */}
          {openIndex !== null && navItemsData[openIndex]?.dropdownContent && (
            <section
              id={dropdownId}
              onMouseEnter={() => {
                setIsDropdownHovered(true);
                if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
              }}
              onMouseLeave={() => {
                setIsDropdownHovered(false);
                delayedClose();
              }}
              className={`hidden md:block fixed z-50 mx-auto px-2 transition-all duration-150 ease-out ${
                dropdownVisible ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
              }`}
              style={{ top: `${dropdownTop}px`, left: "20px", right: "20px" }}
              aria-label={`${navItemsData[openIndex].dropdownContent.title} menu`}
            >
              <div className="bg-white/80 backdrop-blur-md border rounded-xl shadow-xl flex flex-col md:flex-row p-4 md:p-8 gap-4 min-h-[320px]">
                {/* Left: subcategories list */}
                <aside
                  className="w-full md:w-fit border-b md:border-b-0 md:border-r border-gray-200 pr-4 md:mr-4"
                  aria-label="Subcategories"
                >
                  <h2 className="text-base font-semibold mb-2 text-black whitespace-nowrap">
                    {navItemsData[openIndex].dropdownContent.title}
                  </h2>
                  <ul className="flex flex-col gap-1">
                    {navItemsData[openIndex].dropdownContent.columns?.map((col, colIdx) => (
                      <li key={`${col.label}-${colIdx}`}>
                        <Link
                          href={col.url || "#"}
                          className={`${getDropdownItemColorClass(
                            col.color || "black"
                          )} text-sm py-1 hover:underline font-weight-500 whitespace-nowrap`}
                          onMouseEnter={() => setHoveredSubForProducts(col.label)}
                          onFocus={() => setHoveredSubForProducts(col.label)}
                          onClick={() => setMobileOpen(false)}
                        >
                          {col.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </aside>

                {/* Right: products (or subcategory tiles before hover) */}
                <div className="w-full md:flex-1">
                  {(() => {
                    const catTitle = navItemsData[openIndex].dropdownContent.title;
                    const category = getCategoryByTitle(catTitle);
                    const subs = category?.subcategories || [];

                    if (hoveredSubForProducts) {
                      const sub = subs.find((s) => s.name === hoveredSubForProducts);
                      const products = (sub?.products || []).slice(0, 16);

                      return (
                        <div
                          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3"
                          role="list"
                        >
                          {products.map((prod, i) => {
                            const img = prod?.images?.[0];
                            const imgUrl = img?.url || NOT_FOUND_IMG;
                            const imgAlt = img?.alt_text || prod?.name || "Product";
                            const href = buildProductHref(category, sub, prod);

                            return (
                              <Link
                                key={`${prod?.id ?? prod?.product_id ?? i}`}
                                href={href}
                                className="w-[120px] mx-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded-md"
                                onClick={() => setMobileOpen(false)}
                              >
                                <figure
                                  className="rounded-md overflow-hidden flex items-center justify-center bg-none"
                                  style={{ width: 120, height: 120 }}
                                >
                                  <SafeImg
                                    src={imgUrl}
                                    alt={imgAlt}
                                    loading="lazy"
                                    width={120}
                                    height={120}
                                    className="object-cover w-full h-full rounded-md"
                                    onError={(e) => {
                                      const target = e.currentTarget as HTMLImageElement;
                                      (target as any).onerror = null;
                                      target.src = NOT_FOUND_IMG;
                                    }}
                                  />
                                </figure>
                                <div className="mt-1 text-center">
                                  <p className="text-xs font-normal text-gray-900 line-clamp-2">
                                    {prod?.name || "View product"}
                                  </p>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      );
                    }

                    // Default: show subcategory tiles before any sub hover
                    return (
                      <div
                        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2"
                        role="list"
                      >
                        {subs.map((sub, i) => {
                          const subImage = sub?.images?.[0];
                          const imgUrl = subImage?.url || NOT_FOUND_IMG;
                          const imgAlt = subImage?.alt_text || sub?.name || "Subcategory";
                          const subHref = `/home/${category?.url}/${sub?.url}`;

                          return (
                            <Link
                              key={`${sub?.id ?? i}`}
                              href={subHref || "#"}
                              className="w-[120px] mx-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded-md"
                              onClick={() => setMobileOpen(false)}
                            >
                              <figure
                                className="rounded-md overflow-hidden flex items-center justify-center bg-none"
                                style={{ width: 120, height: 120 }}
                              >
                                <SafeImg
                                  src={imgUrl}
                                  alt={imgAlt}
                                  loading="lazy"
                                  width={120}
                                  height={120}
                                  className="object-cover w-full h-full rounded-md"
                                  onError={(e) => {
                                    const target = e.currentTarget as HTMLImageElement;
                                    (target as any).onerror = null;
                                    target.src = NOT_FOUND_IMG;
                                  }}
                                />
                              </figure>
                              <div className="mt-1 text-center">
                                <span className="text-xs font-medium text-gray-900">{sub?.name}</span>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </section>
          )}
        </div>
      </nav>
    </div>
  );
}
