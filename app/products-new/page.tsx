"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronDown, Truck, Calendar } from "lucide-react";
import Head from "next/head";
import Toastify from "toastify-js";
import "toastify-js/src/toastify.css";
import DOMPurify from "isomorphic-dompurify";
import { API_BASE_URL } from "../utils/api";
import LogoSection from "../components/LogoSection";
import HomePageTop from "../components/HomePageTop";
import Header from "../components/header";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Link from "next/link";
import MobileTopBar from "../components/HomePageTop";
import { SafeImg } from "../components/SafeImage";
import { ChatBot } from "../components/ChatBot";



// 🔐 Frontend key helper (adds X-Frontend-Key to requests)
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

function getOrCreateUserToken() {
  if (typeof window === "undefined") return "";
  let token = localStorage.getItem("cart_user_id");
  if (!token) {
    token = crypto?.randomUUID?.() || Math.random().toString(36).substring(2);
    localStorage.setItem("cart_user_id", token);
  }
  return token;
}

/* ---------- Types for Custom Attributes (from backend) ---------- */
type AttributeOption = {
  id: string;
  label: string;
  image_url?: string | null;
  price_delta?: number | null;
  is_default?: boolean;
};

type CustomAttribute = {
  id: string;
  name: string;
  options: AttributeOption[];
};
/* ---------------------------------------------------------------- */

// --- helpers for description rendering ---
const stripHtml = (html: string) => {
  if (!html) return "";
  if (typeof window === "undefined") {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  const div = document.createElement("div");
  div.innerHTML = html;
  const text = (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
  div.remove();
  return text;
};

// very small mask list; extend as you like.
// masks only at render; DB remains unchanged.
const censor = (html: string) => {
  if (!html) return html;
  const patterns: Array<[RegExp, string]> = [
    // add variants you care about; case-insensitive, word-boundary-ish
    [/\b(fuck)\b/gi, "f**k"],
    [/\b(teri)\b/gi, "t**i"],
    [/\b(maa)\b/gi, "m**"],
    [/\b(choot)\b/gi, "c***"],
    [/\b(la?ndi|lund)\b/gi, "l**d"],
  ];
  let out = html;
  for (const [re, rep] of patterns) out = out.replace(re, rep);
  return out;
};

// sanitize config: allow basic formatting + links; drop inline styles to avoid CSS abuse
const sanitizeHtml = (dirty: string) =>
  DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ["b", "strong", "i", "em", "u", "p", "br", "ul", "ol", "li", "span", "a"],
    ALLOWED_ATTR: ["href", "target", "rel"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
    RETURN_TRUSTED_TYPE: false,
  });

export default function ProductDetailPage() {
  const { productId } = useParams();
  const router = useRouter();

  const [product, setProduct] = useState<any>(null);
  const [images, setImages] = useState<string[]>([]);
  const [relatedProducts, setRelatedProducts] = useState<any[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState("");
  const [shippingInfo, setShippingInfo] = useState<any>({});
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [loading, setLoading] = useState(true);

  // Custom attributes
  const [customAttributes, setCustomAttributes] = useState<CustomAttribute[]>([]);
  const [selectedAttrOptions, setSelectedAttrOptions] = useState<Record<string, string>>({});

  // Normalize/ensure absolute URL (works for /relative and absolute)
  const toAbsUrl = (src?: string | null) => {
    if (!src) return "";
    if (/^https?:/i.test(src)) return src;
    const base = API_BASE_URL.replace(/\/$/, "");
    const path = String(src).replace(/^\/+/, "");
    return `${base}/${path}`;
  };

  useEffect(() => {
    if (!productId) return;

    const fetchAllProductData = async () => {
      try {
        setLoading(true);

        const [
          productRes,
          imagesRes,
          variantRes,
          shippingRes,
          seoRes,
          navRes,
          attrsRes,
        ] = await Promise.all([
          fetch(
            `${API_BASE_URL}/api/show_specific_product/`,
            withFrontendKey({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ product_id: productId }),
            })
          ),
          fetch(
            `${API_BASE_URL}/api/show_product_other_details/`,
            withFrontendKey({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ product_id: productId }),
            })
          ),
          fetch(
            `${API_BASE_URL}/api/show_product_variant/`,
            withFrontendKey({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ product_id: productId }),
            })
          ),
          fetch(
            `${API_BASE_URL}/api/show_product_shipping_info/`,
            withFrontendKey({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ product_id: productId }),
            })
          ),
          fetch(
            `${API_BASE_URL}/api/show_product_seo/`,
            withFrontendKey({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ product_id: productId }),
            })
          ),
          fetch(`${API_BASE_URL}/api/show_nav_items/`, withFrontendKey({ cache: "no-store" })),
          fetch(
            `${API_BASE_URL}/api/show_product_attributes/`,
            withFrontendKey({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ product_id: productId }),
            })
          ),
        ]);

        if (!productRes.ok) throw new Error("Failed to fetch product");

        const productData = await productRes.json();
        const imageData = imagesRes.ok ? await imagesRes.json() : {};
        const variantData = variantRes.ok ? await variantRes.json() : {};
        const shippingData = shippingRes.ok ? await shippingRes.json() : {};
        const navItems = navRes.ok ? await navRes.json() : [];

        // --- Attributes from backend ---
        const attrsRaw = attrsRes.ok ? await attrsRes.json() : [];
        const attrs: CustomAttribute[] = (Array.isArray(attrsRaw) ? attrsRaw : [])
          .map((a: any) => ({
            id: a.id,
            name: a.name,
            options: (a.options || []).map((o: any) => ({
              id: o.id,
              label: o.label,
              image_url: toAbsUrl(o.image_url),
              price_delta: o.price_delta == null ? null : Number(o.price_delta),
              is_default: !!o.is_default,
            })),
          }))
          .filter((a: CustomAttribute) => (a.options || []).length > 0);

        setCustomAttributes(attrs);

        // Default selections
        const defaults: Record<string, string> = {};
        attrs.forEach((a) => {
          const def = a.options.find((o) => o.is_default) || a.options[0];
          if (def) defaults[a.id] = def.id;
        });
        setSelectedAttrOptions(defaults);

        const fullProduct = {
          ...productData,
          sizes: variantData.sizes || [],
          printing_methods: variantData.printing_methods || [],
          fabric_finish: variantData.fabric_finish || [],
          color_variants: variantData.color_variants || [],
          material_types: variantData.material_types || [],
          add_on_options: variantData.add_on_options || [],
        };

        const productImages = (imageData.images || ["/images/img1.jpg"]).map((u: string) => toAbsUrl(u));
        setImages(productImages);
        setProduct(fullProduct);
        setShippingInfo(shippingData || { processing_time: "3–5" });

        if (fullProduct.sizes?.length) setSelectedSize(fullProduct.sizes[0]);

        // Related Products (same subcategory)
        let foundCategory: any = null;
        let foundSubCategory: any = null;

        for (const category of navItems) {
          for (const sub of category.subcategories || []) {
            for (const prod of sub.products || []) {
              if (`${prod.id}` === `${productId}`) {
                foundCategory = category;
                foundSubCategory = sub;
                break;
              }
            }
          }
        }

        const allProductsRes = await fetch(
          `${API_BASE_URL}/api/show-product/`,
          withFrontendKey({ cache: "no-store" })
        );
        const allProductsData = allProductsRes.ok ? await allProductsRes.json() : [];

        if (foundSubCategory?.products && allProductsData.length > 0) {
          const related = foundSubCategory.products
            .filter((p: any) => `${p.id}` !== `${productId}`)
            .map((p: any) => {
              const fullDetails = allProductsData.find((item: any) => `${item.id}` === `${p.id}`);

              const rating = Number(p?.rating ?? fullDetails?.rating ?? 0);
              const rating_count = Number(p?.rating_count ?? fullDetails?.rating_count ?? 0);

              return {
                ...p,
                image: fullDetails?.image || p.images?.[0]?.url || "/images/img1.jpg",
                price: fullDetails?.price || "N/A",
                printing_methods: fullDetails?.printing_methods || [],
                stock_status: fullDetails?.stock_status || "",
                stock_quantity: fullDetails?.stock_quantity || 0,
                category_slug: foundCategory?.url,
                subcategory_slug: foundSubCategory?.url,
                rating,
                rating_count,
              };
            });

          setRelatedProducts(related.slice(0, 4));
        }

        setLoading(false);
      } catch (err) {
        console.error("❌ Product fetch error:", err);
        setProduct(null);
        setLoading(false);
      }
    };

    fetchAllProductData();
  }, [productId]);

  const handleAddToCart = async () => {
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
        text: res.ok ? "✔️ Added to cart!" : `❌ ${data.error || "Try again!"}`,
        duration: 3000,
        gravity: "top",
        position: "right",
        backgroundColor: res.ok
          ? "linear-gradient(to right, #af4c4cff, #d30000ff)"
          : "linear-gradient(to right, #b00020, #ff5a5a)",
        style: { borderRadius: "0.75rem", padding: "12px 20px" },
      }).showToast();

      console.log("Added to cart:", data);
    } catch (error) {
      console.error("Cart error:", error);
    }
  };

  const nextImage = () => setCurrentImageIndex((i) => (i + 1) % images.length);
  const prevImage = () => setCurrentImageIndex((i) => (i - 1 + images.length) % images.length);

  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX);
  const handleTouchMove = (e: React.TouchEvent) => setTouchEnd(e.touches[0].clientX);
  const handleTouchEnd = () => {
    const delta = touchStart - touchEnd;
    if (delta > 50) nextImage();
    if (delta < -50) prevImage();
  };

  const selectAttrOption = (attrId: string, optionId: string) => {
    setSelectedAttrOptions((prev) => ({ ...prev, [attrId]: optionId }));
  };

  const StarRating = ({ rating, count = 0 }: { rating: number; count?: number }) => {
    const fullStarUrl = "https://img.icons8.com/?size=100&id=Jy3TrLVOr9Ac&format=png&color=891F1A";
    const halfStarUrl = "https://img.icons8.com/?size=100&id=m6oA37oGaOEP&format=png&color=891F1A";
    const emptyStarUrl = "https://img.icons8.com/?size=100&id=103&format=png&color=891F1A";

    const r = Math.max(0, Math.min(5, Math.round((Number(rating) || 0) * 2) / 2));

    return (
      <div className="flex items-center gap-0.5 mt-1" aria-label={`Rating: ${r} out of 5`}>
        {Array.from({ length: 5 }).map((_, i) => {
          const idx = i + 1;
          if (r >= idx) {
            return <img key={i} src={fullStarUrl} alt="Full star" className="w-4 h-4" loading="lazy" />;
          }
          if (r >= idx - 0.5) {
            return <img key={i} src={halfStarUrl} alt="Half star" className="w-4 h-4" loading="lazy" />;
          }
          return <img key={i} src={emptyStarUrl} alt="Empty star" className="w-4 h-4" loading="lazy" />;
        })}
        <span className="text-xs text-gray-600 ml-1">({count})</span>
      </div>
    );
  };

  const isSelected = (attrId: string, optionId: string) => selectedAttrOptions[attrId] === optionId;

  // --- build sanitized + censored HTML for description ---
  const descriptionHtml = useMemo(() => {
    const raw = String(product?.fit_description || "");
    // Fix obvious broken tags like trailing "<p" by letting DOMPurify normalize
    const sanitized = sanitizeHtml(raw);
    const masked = censor(sanitized);
    return masked;
  }, [product?.fit_description]);

  const metaDescription = useMemo(() => stripHtml(String(product?.fit_description || "")).slice(0, 160), [product?.fit_description]);

  if (loading) {
    return (
      <div className="bg-white overflow-x-hidden" style={{ fontFamily: "var(--font-poppins), Arial, sans-serif" }}>
        <Header />
        <LogoSection />
        <Navbar />
        <HomePageTop />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="bg-white overflow-x-hidden lg:overflow-y-hidden" style={{ fontFamily: "var(--font-poppins), Arial, sans-serif" }}>
        <Header />
        <LogoSection />
        <HomePageTop />
        <Navbar />

        <main className="grid min-h-[100svh] justify-center mt-10 px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-24" aria-labelledby="page-title">
          <section className="text-center max-w-2xl w-full">
            <p className="mb-4 sm:mb-6 tracking-[0.25em] text-[10px] sm:text-xs font-normal text-[#891F1A]">OOPS! PAGE NOT FOUND</p>
            <h1 id="page-title" aria-label="404" className="relative mx-auto mb-4 sm:mb-6 flex items-center justify-center font-bold leading-none text-[#891F1A] select-none">
              <span className="[-webkit-text-size-adjust:100%] [text-wrap:nowrap] font-bold -mr-2 sm:-mr-4 text-[clamp(6rem,22vw,12rem)]">4</span>
              <span className="[-webkit-text-size-adjust:100%] [text-wrap:nowrap] font-bold -mr-2 sm:-mr-4 text-[clamp(6rem,22vw,12rem)]">0</span>
              <span className="[-webkit-text-size-adjust:100%] [text-wrap:nowrap] font-bold text-[clamp(6rem,22vw,12rem)]">4</span>
            </h1>
            <p className="mx-auto max-w-xl text-sm sm:text-base text-[#891F1A] font-normal px-2">WE ARE SORRY, BUT THE PAGE YOU REQUESTED WAS NOT FOUND. </p>
            <p className="mx-auto max-w-xl text-sm sm:text-base text-[#891F1A] font-normal px-2">It looks like you've navigated to the wrong URL.</p>

            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 w-full">
              <Link href="/" className="inline-flex justify-center rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-normal text-[#891F1A] transition hover:bg-red-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
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

  return (
    <>
      <Head>
        <title>{product.name} | Your Store</title>
        <meta name="description" content={metaDescription} />
      </Head>

      <div className="bg-white min-h-screen" style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}>
        <Header />
        <LogoSection />  
        <Navbar />
        <MobileTopBar />

        {/* Product Details */}
        <div className="max-w-6xl mx-auto mt-10 px-4 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Image Section */}
          <div className="space-y-4">
            <div
              className="relative bg-gray-100 rounded-2xl overflow-hidden aspect-[5/5] group"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <SafeImg
                src={images[currentImageIndex] || "/images/img1.jpg"}
                alt={product.name}
                className="w-full h-auto object-cover"
                onError={(e) => (e.currentTarget.src = "/images/img1.jpg")}
                overlay={false}
              />

              <button
                onClick={prevImage}
                className="absolute left-4 top-1/2 -translate-y-1/2 hidden md:block group-hover:opacity-100 opacity-0 transition bg-white p-2 rounded-full text-black z-20 pointer-events-auto"
                aria-label="Previous image"
              >
                <ChevronLeft />
              </button>

              <button
                onClick={nextImage}
                className="absolute right-4 top-1/2 -translate-y-1/2 hidden md:block group-hover:opacity-100 opacity-0 transition bg-white p-2 rounded-full text-black z-20 pointer-events-auto"
                aria-label="Next image"
              >
                <ChevronRight />
              </button>

              <span className="absolute top-4 right-4 bg-red-700 text-white px-3 py-1 rounded-full text-sm">
                {currentImageIndex + 1} / {images.length}
              </span>
            </div>

            {/* Thumbnails */}
            <div className="grid grid-cols-8 gap-2 mt-3">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentImageIndex(i)}
                  className={`w-16 aspect-square overflow-hidden rounded-lg ${
                    i === currentImageIndex ? "border-2 border-red-700" : "border border-gray-300"
                  }`}
                  aria-label={`Show image ${i + 1}`}
                >
                  <SafeImg
                    src={img}
                    alt={`thumb-${i}`}
                    className="w-full h-full object-cover"
                    onError={(e) => (e.currentTarget.src = "/images/img1.jpg")}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Info Section */}
          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-gray-900">{product.name}</h1>

            <p className="text-2xl text-red-700">
              AED: <strong className="font-bold">{product.price}</strong>
            </p>

            <p className={`text-sm ${product.stock_status === "out of stock" ? "text-red-600" : "text-green-600"}`}>
              {product.stock_status === "out of stock" ? "Out of Stock" : `In Stock (${product.stock_quantity})`}
            </p>

            {/* Sizes */}
            {product.sizes?.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Select Size</h3>
                <div className="flex gap-2">
                  {product.sizes.map((s: string) => (
                    <button
                      key={s}
                      onClick={() => setSelectedSize(s)}
                      className={`px-5 py-2 rounded-full text-sm font-medium ${
                        selectedSize === s ? "bg-[#7f1d1d] text-white" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Printing Methods */}
            {product.printing_methods?.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Printing Methods</h3>
                <div className="flex gap-2 flex-wrap">
                  {product.printing_methods.map((pm: string, i: number) => {
                    let label = pm;
                    if (pm === "DP") label = "Digital Printing";
                    else if (pm === "SP") label = "Screen Printing";
                    else if (pm === "OP") label = "Off Set Printing";

                    return (
                      <span key={i} className="px-3 py-1 rounded-full text-xs text-gray-600 bg-white-800 border border-gray-300">
                        {label}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ---------- Custom Attributes (from backend) BEFORE Add to Cart ---------- */}
            {customAttributes?.length > 0 && (
              <section className="space-y-6">
                {customAttributes.map((attr) => (
                  <div key={attr.id} className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-800">{attr.name}</h4>
                    <div className="flex flex-wrap gap-4">
                      {attr.options.map((opt) => {
                        const selected = isSelected(attr.id, opt.id);
                        const delta = Number(opt.price_delta ?? 0);
                        const positive = delta > 0;
                        const negative = delta < 0;

                        return (
                          <div key={opt.id} className="relative">
                            {positive ? (
                              <span className="absolute -top-2 -right-1 z-10 text-xs font-medium rounded-full px-2 py-1 bg-green-100 text-green-700 border border-green-200 w-full">
                                +{Math.round(delta)} AED
                              </span>
                            ) : negative ? (
                              <span className="absolute -top-2 -right-1 z-10 text-xs font-medium rounded-full px-2 py-1 border bg-rose-100 text-[#7f1d1d] border-rose-200 w-full">
                                {Math.round(delta)} AED
                              </span>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => selectAttrOption(attr.id, opt.id)}
                              className={`group w-16 rounded-lg border-2 bg-white text-center transition-all relative ${
                                selected ? "border-red-600 shadow-md" : "border-gray-300 hover:border-gray-400"
                              }`}
                              aria-pressed={selected}
                            >
                              <div className="p-0.5">
                                <div className="w-10 h-10 mx-auto rounded border border-gray-200 overflow-hidden flex items-center justify-center bg-gray-50">
                                  {opt.image_url ? (
                                    <SafeImg
                                      src={opt.image_url}
                                      alt={opt.label}
                                      className="w-full h-full object-cover"
                                      onError={(e) => (e.currentTarget.src = "/images/img1.jpg")}
                                    />
                                  ) : (
                                    <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2z" />
                                    </svg>
                                  )}
                                </div>
                              </div>

                              <div className="px-0.5 pb-1.5 relative">
                                <p className={`text-xs font-normal ${selected ? "text-gray-900" : "text-gray-600"}`}>{opt.label}</p>
                                {selected && (
                                  <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2">
                                    <div className="w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                      <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* Add to Cart */}
            <div className="flex gap-4 items-center">
              <button
                onClick={handleAddToCart}
                disabled={product.stock_status?.trim().toLowerCase() !== "in stock"}
                className={`flex-1 py-4 rounded-full font-medium ${
                  product.stock_status?.toLowerCase() !== "in stock" ? "bg-gray-300 text-black" : "bg-[#7f1d1d] text-white hover:bg-red-700"
                }`}
              >
                {product.stock_status?.trim().toLowerCase() !== "in stock" ? "Out Of Stock" : "Add to Cart"}
              </button>
            </div>

            {/* Description */}
            <div className="border-t pt-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium text-lg text-black">Description &amp; Fit</h3>
                <ChevronDown />
              </div>

              {/* Render sanitized + censored HTML, not plain text */}
              <div
                className="text-sm text-gray-700 mt-2 leading-6 space-y-3 [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-6"
                dangerouslySetInnerHTML={{ __html: descriptionHtml || "<p>No description available.</p>" }}
              />
            </div>

            {/* Shipping */}
            <div className="border-t pt-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium text-lg text-black">Shipping</h3>
                <ChevronDown />
              </div>
              <div className="grid grid-cols-2 gap-4 mt-2 text-sm text-gray-700">
                <div className="flex gap-2 items-center">
                  <Truck className="w-4 h-4" />
                  <span>Within {shippingInfo.processing_time || "3–5"} days</span>
                </div>
                <div className="flex gap-2 items-center">
                  <Calendar className="w-4 h-4" />
                  <span>Est. arrival: in fortnight</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Related */}
        <div className="max-w-6xl mx-auto mt-20 px-4 mb-20">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">You might also like</h2>
          {relatedProducts.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedProducts.map((item, i) => (
                <div
                  key={i}
                  onClick={() => router.push(`/home/${item.category_slug}/${item.subcategory_slug}/products/${item.id}`)}
                  className="border rounded-xl cursor-pointer overflow-hidden hover:shadow-md transition"
                >
                  <SafeImg src={item.image} alt={item.name} className="w-full h-60 object-cover" />
                  <div className="p-4">
                    <p className="font-normal text-gray-800 truncate">{item.name}</p>
                    <StarRating rating={Number(item.rating || 0)} count={Number(item.rating_count || 0)} />
                    <p className="text-sm text-red-700">
                      AED: <strong className="font-bold">{item.price}</strong>
                    </p>

                    {item.printing_methods?.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">Print: {item.printing_methods.join(", ")}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No related products found.</p>
          )}
        </div>

        <Footer />
        <ChatBot />
      </div>
    </>
  );
}
