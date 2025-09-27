"use client";
import Link from "next/link";
import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { API_BASE_URL } from "../utils/api";
import { SafeImg } from "./SafeImage";

const getDropdownItemColorClass = (color: string) => {
  switch (color) {
    case "red":
      return "text-red-600";
    default:
      return "text-gray-800";
  }
};

/** 🔐 Only the key header; avoid adding extra custom headers that trigger CORS failures */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const fetchWithKey = (url: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  headers.set("X-Frontend-Key", FRONTEND_KEY);
  return fetch(url, {
    ...init,
    headers,
    cache: "no-store",     // don't read/write HTTP cache
    credentials: "omit",   // no cookies needed for this endpoint
    mode: "cors",
  });
};

export default function Navbar() {
  const [navItemsData, setNavItemsData] = useState<any[]>([]);
  const [productData, setProductData] = useState<any[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [isDropdownHovered, setIsDropdownHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Which subcategory is currently selected for showing products (persists until next sub hover)
  const [hoveredSubForProducts, setHoveredSubForProducts] = useState<string | null>(null);

  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /** ====== Dropdown top anchored just below the bar ====== */
  const navRef = useRef<HTMLDivElement>(null);
  const [dropdownTop, setDropdownTop] = useState<number>(140);

  const recomputeDropdownTop = () => {
    const el = navRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropdownTop(Math.max(8, Math.round(rect.bottom + 8))); // bar bottom + 8px
  };

  useEffect(() => {
    recomputeDropdownTop();
    const ro = new ResizeObserver(recomputeDropdownTop);
    if (navRef.current) ro.observe(navRef.current);
    const onScroll = () => recomputeDropdownTop();
    const onLoad = () => recomputeDropdownTop();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", recomputeDropdownTop);
    window.addEventListener("load", onLoad);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", recomputeDropdownTop);
      window.removeEventListener("load", onLoad);
    };
  }, []);

  /** ====== Category bar single line, CENTERED, no scroll, auto-fit ====== */
  const barContainerRef = useRef<HTMLDivElement>(null);
  const barInnerRef = useRef<HTMLDivElement>(null);
  const [fs, setFs] = useState<number>(16); // px
  const [gap, setGap] = useState<number>(10); // px (reduced default gap)
  const [scale, setScale] = useState<number>(1);

  const MIN_FONT = 12;
  const MAX_FONT = 16;
  const MIN_GAP = 2;
  const MAX_GAP = 10;

  const fitBar = () => {
    const container = barContainerRef.current;
    const inner = barInnerRef.current;
    if (!container || !inner) return;

    inner.style.transform = "scale(1)";
    inner.style.transformOrigin = "center center";

    const W = container.clientWidth || 0;
    const content = inner.scrollWidth || 0;

    if (W <= 0 || content <= 0) {
      setFs(MAX_FONT);
      setGap(MAX_GAP);
      setScale(1);
      return;
    }

    const ratio = Math.min(1, W / content);
    const newFs = Math.max(MIN_FONT, Math.floor(MAX_FONT * (ratio * 0.98)));
    const newGap = Math.max(MIN_GAP, Math.floor(MAX_GAP * ratio));
    setFs(newFs);
    setGap(newGap);

    requestAnimationFrame(() => {
      if (!barInnerRef.current || !barContainerRef.current) return;
      const W2 = barContainerRef.current.clientWidth || 0;
      const content2 = barInnerRef.current.scrollWidth || 0;
      const finalScale = content2 > 0 ? Math.max(0.75, Math.min(1, W2 / content2)) : 1;
      setScale(finalScale);
    });
  };

  useLayoutEffect(() => {
    fitBar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navItemsData.length]);

  useEffect(() => {
    const r = new ResizeObserver(fitBar);
    if (barContainerRef.current) r.observe(barContainerRef.current);
    return () => r.disconnect();
  }, []);

  /** =============================================================== */

  useEffect(() => {
    const fetchData = async () => {
      try {
        setFetchError(null);
        // single live fetch on mount; query-buster avoids intermediaries
        const res = await fetchWithKey(`${API_BASE_URL}/api/show_nav_items/?_=${Date.now()}`);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${res.statusText} ${text ? `- ${text}` : ""}`);
        }
        const nav = await res.json();
        setProductData(nav);

        const navFormatted = nav.map((cat: any) => ({
          id: cat.id,
          label: cat.name,
          url: `/home/${cat.url}`,
          dropdownContent: {
            title: cat.name,
            columns:
              cat.subcategories?.map((sub: any) => ({
                label: sub.name,
                url: `/home/${cat.url}/${sub.url}`,
                color: "red",
              })) || [],
          },
        }));

        setNavItemsData(navFormatted);
      } catch (err: any) {
        console.error("❌ Failed to fetch nav items:", err);
        setFetchError(err?.message || "Failed to load navigation");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 🔒 Disable background scroll while dropdown is visible
  useEffect(() => {
    if (dropdownVisible) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [dropdownVisible]);

  // ✅ Ensure right-pane resets when switching categories (fix #2) + ensure first-open position (fix #3)
  useEffect(() => {
    if (openIndex !== null) {
      setHoveredSubForProducts(null);
      recomputeDropdownTop();
      requestAnimationFrame(recomputeDropdownTop);
    }
  }, [openIndex]);

  const handleNavEnter = (idx: number) => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    recomputeDropdownTop(); // just-in-time for first open
    setOpenIndex(idx);
    setDropdownVisible(true);
    requestAnimationFrame(recomputeDropdownTop);
  };

  const handleNavLeave = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      if (!isDropdownHovered) {
        setDropdownVisible(false);
        setHoveredSubForProducts(null);
        setTimeout(() => setOpenIndex(null), 300);
      }
    }, 300);
  };

  const handleDropdownEnter = () => {
    setIsDropdownHovered(true);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
  };

  const handleDropdownLeave = () => {
    setIsDropdownHovered(false);
    closeTimeoutRef.current = setTimeout(() => {
      setDropdownVisible(false);
      setHoveredSubForProducts(null);
      setTimeout(() => setOpenIndex(null), 300);
    }, 300);
  };

  // Helpers
  const getCategoryByTitle = (title: string) => productData.find((c: any) => c.name === title);

  /** ⛳️ Force product links to ID-based route: /home/{cat.id}/{subcat.id}/products/{prod.id} */
  const buildProductHref = (category: any, sub: any, product: any) => {
    const catId = category?.id ?? category?.category_id ?? category?.ID;
    const subId = sub?.id ?? sub?.subcategory_id ?? sub?.ID;
    const prodId = product?.id ?? product?.product_id ?? product?.ID;
    return `/home/${catId}/${subId}/products/${prodId}`;
  };

  // Fail-safe: if fetch errored, render the bar container so you can see the error in dev
  if (loading) return null;
  if (!navItemsData.length) {
    return (
      <div className="hidden lg:block" ref={navRef}>
        <nav className="w-full bg-white border-b border-gray-200 m-0 min-h-[68px] md:min-h-[80px] flex items-center font-medium">
          <div className="w-full px-[5px] mx-auto text-center text-sm text-red-600">
            {fetchError ? `Navigation failed to load: ${fetchError}` : "No categories available."}
          </div>
        </nav>
      </div>
    );
  }

  return (
    // 🔇 Hide whole navbar on small & medium screens (show from lg and up)
    <div
      className="hidden lg:block"
      style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}
      ref={navRef}
    >
      <nav
        className="w-full bg-white border-b border-gray-200 m-0 min-h-[68px] md:min-h-[80px] flex items-center font-medium"
        aria-label="Primary"
        role="navigation"
      >
        <div className="w-full px-[5px] mx-auto">
          {/* Navigation Links (single line, CENTERED, no scroll, auto-fit) */}
          <div className={`${mobileOpen ? "flex flex-col py-2 space-y-1" : "hidden"} md:flex w-full`}>
            <div ref={barContainerRef} className="w-full overflow-hidden">
              <div className="flex justify-center w-full">
                <div
                  ref={barInnerRef}
                  className="flex flex-nowrap w-fit select-none whitespace-nowrap origin-center transition-transform"
                  style={{
                    gap,
                    fontSize: `${fs}px`,
                    lineHeight: 1.25,
                    transform: `scale(${scale})`,
                    transformOrigin: "center center",
                    letterSpacing: "0.2px",
                  }}
                >
                  {navItemsData.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="relative"
                      onMouseEnter={() => handleNavEnter(idx)}
                      onMouseLeave={handleNavLeave}
                    >
                      {/* a/nav items → Medium (500) */}
                      <Link
                        href={item.url || "#"}
                        className={`block text-center whitespace-nowrap overflow-ellipsis transition-colors ${
                          openIndex === idx ? "text-red-600" : "text-gray-800 hover:text-red-600"
                        } font-medium px-2.5 py-2`}
                        style={{ fontSize: "inherit" }}
                        onClick={() => setMobileOpen(false)}
                      >
                        {item.label}
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Dropdown Content (desktop-only) */}
          {openIndex !== null && navItemsData[openIndex]?.dropdownContent && (
            <section
              onMouseEnter={handleDropdownEnter}
              onMouseLeave={handleDropdownLeave}
              className={`hidden lg:block fixed z-50 mx-auto px-2 transition-all duration-300 ease-out ${
                dropdownVisible ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
              }`}
              style={{ top: `${dropdownTop}px`, left: "20px", right: "20px" }}
              aria-label="Category mega menu"
            >
              <div className="bg-white/70 backdrop-blur-md border-2 rounded-xl shadow-xl flex flex-col md:flex-row p-4 md:p-8 space-y-4 md:space-y-0 md:space-x-0 min-h-[340px]">
                {/* Left Column */}
                <aside
                  className="w-full md:w-fit border-b md:border-b-0 md:border-r-2 border-gray-500 border-opacity-10 pr-4 mr-3"
                  aria-label="Subcategories"
                >
                  <h2 className="text-base font-semibold mb-2 text-black whitespace-nowrap">
                    {navItemsData[openIndex].dropdownContent.title}
                  </h2>
                  <ul className="flex flex-col gap-1">
                    {navItemsData[openIndex].dropdownContent.columns?.map((col: any, colIdx: number) => (
                      <li key={colIdx}>
                        <Link
                          href={col.url || "#"}
                          className={`${getDropdownItemColorClass(
                            col.color || "black"
                          )} text-sm py-1 hover:underline font-medium whitespace-nowrap`}
                          onMouseEnter={() => setHoveredSubForProducts(col.label)} // set & persist until next sub hover
                          onClick={() => setMobileOpen(false)}
                        >
                          {col.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </aside>

                {/* Right Column */}
                <div className="w-full md:w-[86%] pl-3">
                  {(() => {
                    const catTitle = navItemsData[openIndex].dropdownContent.title;
                    const category = getCategoryByTitle(catTitle);
                    const subs = category?.subcategories || [];

                    if (hoveredSubForProducts) {
                      const sub = subs.find((s: any) => s.name === hoveredSubForProducts);
                      const products: any[] = sub?.products || [];
                      const first16 = products.slice(0, 16);

                      return (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3" role="list">
                          {first16.map((prod: any, i: number) => {
                            const img = prod?.images?.[0];
                            const imgUrl = img?.url || "https://i.ibb.co/ynT1dLc/image-not-found.png";
                            const imgAlt = img?.alt_text || prod?.name || "Product";
                            const href = buildProductHref(category, sub, prod);

                            return (
                              <Link
                                key={i}
                                href={href}
                                className="w-[120px] mx-auto"
                                onClick={() => setMobileOpen(false)}
                              >
                                {/* ✅ Image is inside Link, fully clickable */}
                                <figure className="w-[120px] h-[120px] rounded-md overflow-hidden flex items-center justify-center">
                                  <SafeImg
                                    src={imgUrl}
                                    alt={imgAlt}
                                    loading="lazy"
                                    className="object-cover w-full h-full rounded-md"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      (target as any).onerror = null;
                                      target.src = "https://i.ibb.co/ynT1dLc/image-not-found.png";
                                    }}
                                  />
                                </figure>
                                <div className="mt-1 text-center">
                                  <p className="text-xs font-normal text-gray-900 line-clamp-2">{prod?.name}</p>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      );
                    }

                    // Default view (before any subcategory hover): show subcategory tiles
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2" role="list">
                        {subs.map((sub: any, i: number) => {
                          const subImage = sub?.images?.[0];
                          const imgUrl = subImage?.url || "https://i.ibb.co/ynT1dLc/image-not-found.png";
                          const imgAlt = subImage?.alt_text || sub?.name || "Image";
                          const subHref = `/home/${category?.url}/${sub?.url}`;

                          return (
                            <Link
                              key={i}
                              href={subHref || "#"}
                              className="w-[120px] mx-auto"
                              onClick={() => setMobileOpen(false)}
                            >
                              <figure className="w-[120px] h-[120px] rounded-md overflow-hidden flex items-center justify-center">
                                <SafeImg
                                  src={imgUrl}
                                  alt={imgAlt}
                                  loading="lazy"
                                  className="object-cover w-full h-full rounded-md"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    (target as any).onerror = null;
                                    target.src = "https://i.ibb.co/ynT1dLc/image-not-found.png";
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
