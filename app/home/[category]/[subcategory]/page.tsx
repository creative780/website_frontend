"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useParams } from "next/navigation";
import Toastify from "toastify-js";
import "toastify-js/src/toastify.css";
import { API_BASE_URL } from "../../../utils/api";
import Header from "../../../components/header";
import Navbar from "../../../components/Navbar";
import LogoSection from "../../../components/LogoSection";
import HomePageTop from "../../../components/HomePageTop";
import CardActionButtons from "../../../components/CardActionButtons";
import { ChatBot } from "../../../components/ChatBot";
import Footer from "../../../components/Footer";
import Link from "next/link";
import Script from "next/script";
import { SafeImg } from "../../../components/SafeImage";

/* ──────────────────────────────────────────────────────────────────────────
   🔐 Frontend key helper (adds X-Frontend-Key to requests)
   ────────────────────────────────────────────────────────────────────────── */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

/* ──────────────────────────────────────────────────────────────────────────
   🆔 Stable device token
   ────────────────────────────────────────────────────────────────────────── */
function getOrCreateUserToken() {
  if (typeof window === "undefined") return "";
  let token = localStorage.getItem("cart_user_id");
  if (!token) {
    token = crypto?.randomUUID?.() || Math.random().toString(36).substring(2);
    localStorage.setItem("cart_user_id", token);
  }
  return token;
}

/* ──────────────────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────────────────── */
type ProductCard = {
  id: string;
  name: string;
  image: string;
  badge: string;
  rating: number;
  rating_count: number;
};

/* ──────────────────────────────────────────────────────────────────────────
   ⭐ Accessible, memoized rating component (reduces re-renders)
   ────────────────────────────────────────────────────────────────────────── */
const StarRating = memo(function StarRating({
  rating,
  count = 0,
}: {
  rating: number;
  count?: number;
}) {
  const fullStarUrl =
    "https://img.icons8.com/?size=100&id=Jy3TrLVOr9Ac&format=png&color=891F1A";
  const halfStarUrl =
    "https://img.icons8.com/?size=100&id=m6oA37oGaOEP&format=png&color=891F1A";
  const emptyStarUrl =
    "https://img.icons8.com/?size=100&id=103&format=png&color=891F1A";

  // clamp to [0,5] and round to nearest 0.5
  const r = Math.max(0, Math.min(5, Math.round((Number(rating) || 0) * 2) / 2));

  return (
    <div
      className="flex items-center gap mt-1"
      aria-label={`Rated ${r} out of 5 based on ${count} reviews`}
      role="img"
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const idx = i + 1;
        if (r >= idx)
          return (
            <SafeImg
              key={i}
              src={fullStarUrl}
              alt=""
              className="w-4 h-4"
              loading="lazy"
              aria-hidden="true"
            />
          );
        if (r >= idx - 0.5)
          return (
            <SafeImg
              key={i}
              src={halfStarUrl}
              alt=""
              className="w-4 h-4"
              loading="lazy"
              aria-hidden="true"
            />
          );
        return (
          <SafeImg
            key={i}
            src={emptyStarUrl}
            alt=""
            className="w-4 h-4"
            loading="lazy"
            aria-hidden="true"
          />
        );
      })}
      <span className="text-xs text-gray-600 ml-1">({count})</span>
    </div>
  );
});

export default function SubCategoryPage() {
  const BATCH_SIZE = 100; // keep behavior stable

  const { category, subcategory } = useParams() as {
    category?: string;
    subcategory?: string;
  };

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [allProducts, setAllProducts] = useState<ProductCard[]>([]);
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(BATCH_SIZE);

  // ❤️/🛒 UI state with local persistence
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [cartIds, setCartIds] = useState<Set<string>>(new Set());

  const LS_FAVORITES = "cc_favorites";
  const LS_CART = "cc_cart";

  /* ──────────────────────────────────────────────────────────────────────
     Load persisted favourites/cart
     ────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    try {
      const favRaw = localStorage.getItem(LS_FAVORITES);
      const cartRaw = localStorage.getItem(LS_CART);
      if (favRaw) setFavoriteIds(new Set(JSON.parse(favRaw)));
      if (cartRaw) setCartIds(new Set(JSON.parse(cartRaw)));
    } catch {
      // ignore
    }
  }, []);

  const persistFavorites = useCallback((s: Set<string>) => {
    localStorage.setItem(LS_FAVORITES, JSON.stringify(Array.from(s)));
  }, []);

  const persistCart = useCallback((s: Set<string>) => {
    localStorage.setItem(LS_CART, JSON.stringify(Array.from(s)));
  }, []);

  /* ──────────────────────────────────────────────────────────────────────
     Data fetch (parallel) with safe unmount handling
     ────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      if (!category || !subcategory) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const [navRes, stockRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/show_nav_items/`, withFrontendKey({ cache: "no-store", signal: controller.signal })),
          fetch(`${API_BASE_URL}/api/show-product/`, withFrontendKey({ cache: "no-store", signal: controller.signal })),
        ]);

        if (!navRes.ok || !stockRes.ok) throw new Error("Failed to fetch data");

        const [navData, stockData] = await Promise.all([navRes.json(), stockRes.json()]);

        // Find the current category/subcategory entries
        const matchedCategory = Array.isArray(navData)
          ? navData.find((cat: any) => cat?.url === category)
          : null;

        const matchedSubcat = matchedCategory?.subcategories?.find(
          (sub: any) => sub?.url === subcategory
        );

        if (!matchedSubcat || !matchedSubcat.products?.length) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        // Build product cards, enriching with stock/status from show-product payload
        const formatted: ProductCard[] = matchedSubcat.products.map((prod: any) => {
          const stockMatch = Array.isArray(stockData)
            ? stockData.find((p: any) => `${p.id}` === `${prod.id}`)
            : undefined;

          const image =
            prod.images?.[0]?.url ||
            prod.image?.url ||
            stockMatch?.image ||
            "/images/img1.jpg";

          const badge = `${stockMatch?.stock_status || ""}`.trim() || "Unknown";

          return {
            id: String(prod.id),
            name: prod.name ?? "Unnamed Product",
            image,
            badge,
            rating: Number((prod.rating ?? stockMatch?.rating) ?? 0),
            rating_count: Number((prod.rating_count ?? stockMatch?.rating_count) ?? 0),
          };
        });

        setAllProducts(formatted);
        setProducts(formatted.slice(0, BATCH_SIZE));
        setVisibleCount(BATCH_SIZE);
        setNotFound(false);
      } catch (err) {
        if ((err as any)?.name !== "AbortError") {
          console.error("❌ Failed to fetch subcategory products:", err);
          setNotFound(true);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    return () => controller.abort();
  }, [category, subcategory]);

  /* ──────────────────────────────────────────────────────────────────────
     Cart API
     ────────────────────────────────────────────────────────────────────── */
  const addToCart = useCallback(
    async (
      productId: string,
      selectedSize: string | null = null,
      selectedAttrOptions: Record<string, string> | null = null
    ) => {
      const deviceUUID = getOrCreateUserToken();
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/save-cart/`,
          withFrontendKey({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              device_uuid: deviceUUID,
              product_id: productId,
              quantity: 1,
              selected_size: selectedSize,
              selected_attributes: selectedAttrOptions,
            }),
          })
        );

        const data = await res.json();

        Toastify({
          text: res.ok ? "Added to cart!" : `❌ ${data?.error || "Try again!"}`,
          duration: 3000,
          gravity: "top",
          position: "right",
          backgroundColor: res.ok
            ? "linear-gradient(to right, #af4c4cff, #d30000ff)"
            : "linear-gradient(to right, #b00020, #ff5a5a)",
          style: {
            borderRadius: "0.75rem",
            padding: "12px 20px",
          },
          ariaLive: "polite",
        }).showToast();

        if (res.ok) {
          setCartIds((prev) => {
            const next = new Set(prev);
            next.add(productId);
            persistCart(next);
            return next;
          });
        }
      } catch (error) {
        console.error("Cart error:", error);
        Toastify({
          text: "❌ Network error",
          duration: 3000,
          gravity: "top",
          position: "right",
          backgroundColor: "linear-gradient(to right, #b00020, #ff5a5a)",
          style: { borderRadius: "0.75rem", padding: "12px 20px" },
          ariaLive: "assertive",
        }).showToast();
      }
    },
    [persistCart]
  );

  const removeFromCart = useCallback(
    async (productId: string) => {
      const userId = getOrCreateUserToken(); // backend expects `user_id`
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/delete-cart-item/`,
          withFrontendKey({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, product_id: productId }),
          })
        );

        const data = await res.json();

        if (res.ok) {
          setCartIds((prev) => {
            const next = new Set(prev);
            next.delete(productId);
            persistCart(next);
            return next;
          });

          Toastify({
            text: "Removed from cart",
            duration: 3000,
            gravity: "top",
            position: "right",
            backgroundColor: "linear-gradient(to right, #af4c4cff, #d30000ff)",
            style: { borderRadius: "0.75rem", padding: "12px 20px" },
            ariaLive: "polite",
          }).showToast();
        } else {
          Toastify({
            text: `❌ ${data?.error || "Try again!"}`,
            duration: 3000,
            gravity: "top",
            position: "right",
            backgroundColor: "linear-gradient(to right, #b00020, #ff5a5a)",
            ariaLive: "assertive",
          }).showToast();
        }
      } catch (error) {
        console.error("Cart error:", error);
        Toastify({
          text: "❌ Network error",
          duration: 3000,
          gravity: "top",
          position: "right",
          backgroundColor: "linear-gradient(to right, #b00020, #ff5a5a)",
          style: { borderRadius: "0.75rem", padding: "12px 20px" },
          ariaLive: "assertive",
        }).showToast();
      }
    },
    [persistCart]
  );

  const handleCartToggle = useCallback(
    (product: ProductCard) => async (e?: React.MouseEvent) => {
      e?.stopPropagation?.();
      // @ts-ignore
      e?.nativeEvent?.stopImmediatePropagation?.();

      const isOut =
        product.badge?.toString().trim().toLowerCase().includes("out") ||
        product.badge?.toString().trim().toLowerCase() === "out of stock";

      if (!cartIds.has(product.id) && isOut) {
        Toastify({
          text: "❌ Out of Stock",
          duration: 2500,
          gravity: "top",
          position: "right",
          backgroundColor: "linear-gradient(to right, #b00020, #ff5a5a)",
          style: { borderRadius: "0.75rem", padding: "12px 20px" },
          ariaLive: "polite",
        }).showToast();
        return;
      }

      if (cartIds.has(product.id)) {
        await removeFromCart(product.id);
      } else {
        await addToCart(product.id, null, null);
      }
    },
    [cartIds, addToCart, removeFromCart]
  );

  const favInvokeAt = useRef<Record<string, number>>({});
  const toastStamp = useRef<Record<string, number>>({});

  const toastOnce = useCallback((key: string, text: string, ok: boolean) => {
    const now = Date.now();
    if (toastStamp.current[key] && now - toastStamp.current[key] < 400) return;
    toastStamp.current[key] = now;

    Toastify({
      text,
      duration: 2500,
      gravity: "top",
      position: "right",
      backgroundColor: ok
        ? "linear-gradient(to right, #af4c4cff, #d30000ff)"
        : "linear-gradient(to right, #b00020, #ff5a5a)",
      style: { borderRadius: "0.75rem", padding: "12px 20px" },
      ariaLive: "polite",
    }).showToast();
  }, []);

  const handleToggleFavorite = useCallback(
    (id: string) => (e?: React.MouseEvent) => {
      e?.stopPropagation?.();
      // @ts-ignore
      e?.nativeEvent?.stopImmediatePropagation?.();

      const now = Date.now();
      if (favInvokeAt.current[id] && now - favInvokeAt.current[id] < 400) {
        return;
      }
      favInvokeAt.current[id] = now;

      setFavoriteIds((prev) => {
        const next = new Set(prev);
        const isAdding = !prev.has(id);

        if (isAdding) next.add(id);
        else next.delete(id);

        toastOnce(
          `fav:${id}`,
          isAdding ? "Added to favourites" : "Removed from favourites",
          isAdding
        );

        persistFavorites(next);
        return next;
      });
    },
    [persistFavorites, toastOnce]
  );

  /* ──────────────────────────────────────────────────────────────────────
     UI helpers
     ────────────────────────────────────────────────────────────────────── */
  const loadMoreProducts = () => {
    const nextCount = visibleCount + BATCH_SIZE;
    setProducts(allProducts.slice(0, nextCount));
    setVisibleCount(nextCount);
  };

  const pageTitle =
    subcategory?.toString().replace(/-/g, " ").trim() || "Products";

  if (loading) {
    return (
      <div
        className="bg-white overflow-x-hidden"
        style={{ fontFamily: "var(--font-poppins), Arial, sans-serif" }}
        aria-busy="true"
        aria-live="polite"
      >
        <Header />
        <LogoSection />
        <HomePageTop />
        <Navbar />
      </div>
    );
  }

  if (notFound) {
    return (
      <div
        className="bg-white overflow-x-hidden lg:overflow-y-hidden"
        style={{ fontFamily: "var(--font-poppins), Arial, sans-serif" }}
      >
        <Header />
        <LogoSection />
        <HomePageTop />

        <main
          className="grid min-h-[100svh] justify-center mt-10 px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-24"
          aria-labelledby="page-title"
          role="main"
        >
          <section className="text-center max-w-2xl w-full">
            <p className="mb-4 sm:mb-6 tracking-[0.25em] text-[10px] sm:text-xs font-normal text-[#891F1A]">
              OOPS! PAGE NOT FOUND
            </p>

            <h1
              id="page-title"
              aria-label="404"
              className="relative mx-auto mb-4 sm:mb-6 flex items-center justify-center font-bold leading-none text-[#891F1A] select-none"
            >
              <span className="[-webkit-text-size-adjust:100%] [text-wrap:nowrap] font-bold -mr-2 sm:-mr-4 text-[clamp(6rem,22vw,12rem)]">
                4
              </span>
              <span className="[-webkit-text-size-adjust:100%] [text-wrap:nowrap] font-bold -mr-2 sm:-mr-4 text-[clamp(6rem,22vw,12rem)]">
                0
              </span>
              <span className="[-webkit-text-size-adjust:100%] [text-wrap:nowrap] font-bold text-[clamp(6rem,22vw,12rem)]">
                4
              </span>
            </h1>

            <p className="mx-auto max-w-xl text-sm sm:text-base text-[#891F1A] font-normal px-2">
              WE ARE SORRY, BUT THE PAGE YOU REQUESTED WAS NOT FOUND.
            </p>
            <p className="mx-auto max-w-xl text-sm sm:text-base text-[#891F1A] font-normal px-2">
              It looks like you've navigated to the wrong URL.
            </p>

            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 w-full">
              <Link
                href="/"
                className="inline-flex justify-center rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-normal text-[#891F1A] transition hover:bg-red-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                Go to Home
              </Link>

              <button
                type="button"
                onClick={() => history.back()}
                className="inline-flex justify-center rounded-xl bg-[#891F1A] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                Go Back
              </button>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  /* ──────────────────────────────────────────────────────────────────────
     JSON-LD (SEO): Breadcrumb + ItemList of products
     ────────────────────────────────────────────────────────────────────── */
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: category,
        item: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/home/${encodeURIComponent(
          category || ""
        )}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: pageTitle,
        item: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/home/${encodeURIComponent(
          category || ""
        )}/${encodeURIComponent(subcategory || "")}`,
      },
    ],
  };

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: pageTitle,
    itemListElement: products.map((p, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/home/${encodeURIComponent(
        category || ""
      )}/${encodeURIComponent(subcategory || "")}/products/${p.id}`,
      name: p.name,
    })),
  };

  return (
    <div
      className="flex flex-col bg-white"
      style={{ fontFamily: "var(--font-poppins), Arial, sans-serif" }}
    >
      <Header />
      <LogoSection />
      <Navbar />
      <HomePageTop />

      {/* SEO: structured data */}
      <Script
        id="breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <Script
        id="itemlist-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />

      <div className="bg-gradient-to-b from-white via-gray-50 to-gray-100 min-h-screen py-10 px-4 sm:px-10">
        <div className="bg-gradient-to-r from-red-100 via-white to-red-50 rounded-xl shadow-md p-6 sm:p-10 mb-10 text-center relative overflow-hidden">
          <h1 className="text-4xl font-extrabold text-red-600 tracking-tight mb-2 capitalize">
            {pageTitle}
          </h1>
          <p className="text-gray-600 text-lg">
            Browse popular products in this subcategory.
          </p>
          <div className="absolute bottom-0 left-1/2 w-1/2 h-1 bg-red-500 translate-x-[-50%] animate-pulse" />
        </div>

        {/* Grid */}
        <section aria-labelledby="products-heading">
          <h2 id="products-heading" className="sr-only">
            Products list
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-8">
            {products.map((product) => {
              const detailHref = `/home/${encodeURIComponent(
                category!
              )}/${encodeURIComponent(subcategory!)}/products/${product.id}`;

              return (
                <article
                  key={product.id}
                  className="group relative overflow-hidden transition-transform"
                  tabIndex={0}
                  aria-label={product.name}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      (e.target as HTMLElement).querySelector("a")?.click();
                      e.preventDefault();
                    }
                  }}
                >
                  {/* Stock badge */}
                  <span
                    className={`absolute top-2 left-2 text-xs px-3 py-1 rounded-full z-20 ${
                      product.badge?.toLowerCase().includes("out")
                        ? "bg-white/20 backdrop-blur text-[#891F1A] font-semibold"
                        : "bg-[#891F1A]/70 backdrop-blur text-white"
                    }`}
                    aria-label={`Stock status: ${product.badge}`}
                  >
                    {product.badge}
                  </span>

                  {/* Action buttons (top-right) */}
                  <CardActionButtons
                    isFavorite={favoriteIds.has(product.id)}
                    isInCart={cartIds.has(product.id)}
                    onToggleFavorite={handleToggleFavorite(product.id)}
                    onAddToCart={handleCartToggle(product)}
                  />

                  {/* Image + link (improves SEO & prefetch) */}
                  <Link href={detailHref} className="relative block w-full">
                    <div className="relative w-full aspect-square overflow-hidden rounded-xl">
                      <SafeImg
                        src={product.image}
                        alt={product.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 ease-out will-change-transform group-hover:scale-105"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = "/images/img1.png";
                        }}
                        overlay={false}
                      />
                    </div>
                  </Link>

                  <h3 className="text-xl font-semibold text-gray-800 mt-5">
                    <Link href={detailHref} className="hover:underline">
                      {product.name}
                    </Link>
                  </h3>

                  <StarRating rating={product.rating} count={product.rating_count} />
                </article>
              );
            })}
          </div>
        </section>

        {/* Load more */}
        <div className="flex justify-center mt-10">
          {visibleCount < allProducts.length && (
            <button
              onClick={loadMoreProducts}
              className="bg-[#7f1d1d] text-white px-6 py-3 rounded-full font-semibold hover:bg-red-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              aria-controls="products-heading"
              aria-label="Load more products"
            >
              Load More Products
            </button>
          )}
        </div>
      </div>

      <Footer />
      <ChatBot />
    </div>
  );
}
