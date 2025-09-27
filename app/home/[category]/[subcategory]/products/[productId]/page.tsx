"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants, TargetAndTransition } from "framer-motion";
import Toastify from "toastify-js";
import "toastify-js/src/toastify.css";
import DOMPurify from "isomorphic-dompurify";

import Header from "../../../../../components/header";
import LogoSection from "../../../../../components/LogoSection";
import Navbar from "../../../../../components/Navbar";
import MobileTopBar from "../../../../../components/HomePageTop";
import Footer from "../../../../../components/Footer";
import { ChatBot } from "../../../../../components/ChatBot";
import { API_BASE_URL } from "../../../../../utils/api";
import Link from "next/link";
import { Checkbox } from "@mui/material";

// ---------- Anim utils ----------
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (d: number = 0): TargetAndTransition => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: d },
  }),
};

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      custom={delay}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: false, amount: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

// ---------- Frontend key helper ----------
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

function getOrCreateUserToken() {
  if (typeof window === "undefined") return "";
  let token = localStorage.getItem("cart_user_id");
  if (!token) {
    token =
      (globalThis.crypto as any)?.randomUUID?.() ||
      Math.random().toString(36).substring(2);
    localStorage.setItem("cart_user_id", token);
  }
  return token;
}

// ---------- Attribute Types ----------
type AttributeOption = {
  id: string;
  label: string;
  image_url?: string | null;
  price_delta?: number | null;
  is_default?: boolean;
  short_description?: string | null;
  short_description_html?: string | null;
};
type CustomAttribute = {
  id: string;
  name: string;
  options: AttributeOption[];
};
type OptionShortDescEntry = {
  description: string;
  attrId?: string;
  optionId?: string;
  optionName?: string;
  updatedAt?: string;
};

const OPTION_SHORT_DESC_KEY = "attribute_option_short_descriptions_v1";

const buildOptionKey = (attrId: string, optionId: string) =>
  `${attrId}::${optionId}`;
const buildOptionNameKey = (attrId: string, optionName: string) =>
  `${attrId}::name::${optionName.toLowerCase().trim()}`;

const readOptionShortDescMap = (): Record<string, OptionShortDescEntry> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OPTION_SHORT_DESC_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, OptionShortDescEntry>)
      : {};
  } catch (err) {
    console.warn("Unable to read attribute descriptions", err);
    return {};
  }
};

const resolveShortDescription = (
  map: Record<string, OptionShortDescEntry>,
  attrId: string,
  optionId: string,
  optionName: string
) => {
  const key = buildOptionKey(attrId, optionId);
  const nameKey = optionName ? buildOptionNameKey(attrId, optionName) : "";
  return (
    map[key]?.description || (nameKey ? map[nameKey]?.description : "") || ""
  );
};

// ---------- Comment Types ----------
type CommentStatus = "approved" | "pending" | "rejected" | "hidden";
type ProductComment = {
  id: string | number;
  name: string;
  rating: number;
  rating_count?: number; // kept because you asked for it
  status: CommentStatus;
  content?: string; // optional body; if absent we’ll hide the paragraph
  created_at?: string; // ISO date
  product_id?: string | number | null;
  subcategory_id?: string | number | null;
};

// ---------- Sanitizers / helpers ----------
const stripHtml = (html: string) => {
  if (!html) return "";
  if (typeof window === "undefined") {
    return html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const div = document.createElement("div");
  div.innerHTML = html;
  const text = (div.textContent || div.innerText || "")
    .replace(/\s+/g, " ")
    .trim();
  div.remove();
  return text;
};

const censor = (html: string) => {
  if (!html) return html;
  const patterns: Array<[RegExp, string]> = [
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

const sanitizeHtml = (dirty: string) =>
  DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "b",
      "strong",
      "i",
      "em",
      "u",
      "p",
      "br",
      "ul",
      "ol",
      "li",
      "span",
      "a",
      "div",
      "img",
      "h1",
      "h2",
      "h3",
      "h4",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "style"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
    RETURN_TRUSTED_TYPE: false,
  });

// Normalize absolute URL
const toAbsUrl = (src?: string | null) => {
  if (!src) return "";
  if (/^https?:/i.test(src)) return src;
  const base = API_BASE_URL.replace(/\/$/, "");
  const path = String(src).replace(/^\/+/, "");
  return `${base}/${path}`;
};

// ---------- Star Rating ----------
const StarRating = ({
  rating,
  count = 0,
}: {
  rating: number;
  count?: number;
}) => {
  const fullStarUrl =
    "https://img.icons8.com/?size=100&id=Jy3TrLVOr9Ac&format=png&color=891F1A";
  const halfStarUrl =
    "https://img.icons8.com/?size=100&id=m6oA37oGaOEP&format=png&color=891F1A";
  const emptyStarUrl =
    "https://img.icons8.com/?size=100&id=103&format=png&color=891F1A";
  const r = Math.max(0, Math.min(5, Math.round((Number(rating) || 0) * 2) / 2));

  return (
    <div
      className="flex items-center gap-0.5 mt-1"
      aria-label={`Rating: ${r} out of 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const idx = i + 1;
        if (r >= idx)
          return (
            <img
              key={i}
              src={fullStarUrl}
              alt="★"
              className="w-4 h-4"
              loading="lazy"
            />
          );
        if (r >= idx - 0.5)
          return (
            <img
              key={i}
              src={halfStarUrl}
              alt="☆½"
              className="w-4 h-4"
              loading="lazy"
            />
          );
        return (
          <img
            key={i}
            src={emptyStarUrl}
            alt="☆"
            className="w-4 h-4"
            loading="lazy"
          />
        );
      })}
      <span className="text-xs text-gray-600 ml-1">({count})</span>
    </div>
  );
};

// ---------- Page ----------
export default function ProductClonePage() {
  const router = useRouter();
  const params = useParams<{ productId: string }>();
  const searchParams = useSearchParams();
  const productId = params?.productId;

  const adminQuery = searchParams?.get("admin");
  const [adminMode, setAdminMode] = useState(false);

  // core state
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [product, setProduct] = useState<any>(null);
  const [images, setImages] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [qty, setQty] = useState(1);

  const [customAttributes, setCustomAttributes] = useState<CustomAttribute[]>(
    []
  );
  const [selectedAttrOptions, setSelectedAttrOptions] = useState<
    Record<string, string>
  >({});
  const [printingMethods, setPrintingMethods] = useState<string[]>([]);

  const [shippingInfo, setShippingInfo] = useState<any>({});
  const [relatedProducts, setRelatedProducts] = useState<any[]>([]);

  // comments state
  const [comments, setComments] = useState<ProductComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // tabs
  const TABS = ["Description", "Details", "Reviews"] as const;
  type Tab = (typeof TABS)[number];
  const [selectedTab, setSelectedTab] = useState<Tab>("Description");

  // toast
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 1800);
    return () => clearTimeout(t);
  }, [msg]);

  // admin mode
  useEffect(() => {
    if (adminQuery === "1") {
      localStorage.setItem("admin_mode", "true");
    }
    setAdminMode(localStorage.getItem("admin_mode") === "true");
  }, [adminQuery]);

  // fetch everything
  useEffect(() => {
    if (!productId) return;

    const fetchAll = async () => {
      try {
        setLoading(true);
        setNotFound(false);

        const [
          productRes,
          imagesRes,
          variantRes,
          shippingRes,
          _seoRes,
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
          fetch(
            `${API_BASE_URL}/api/show_nav_items/`,
            withFrontendKey({ cache: "no-store" })
          ),
          fetch(
            `${API_BASE_URL}/api/show_product_attributes/`,
            withFrontendKey({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ product_id: productId }),
            })
          ),
        ]);

        if (!productRes.ok) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const productData = await productRes.json();
        if (!productData || !productData.id) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const imageData = imagesRes.ok ? await imagesRes.json() : {};
        const variantData = variantRes.ok ? await variantRes.json() : {};
        const shippingData = shippingRes.ok ? await shippingRes.json() : {};
        const navItems = navRes.ok ? await navRes.json() : [];

        // attributes
        const attrsRaw = attrsRes.ok ? await attrsRes.json() : [];
        const optionDescMap = readOptionShortDescMap();
        const attrs: CustomAttribute[] = (
          Array.isArray(attrsRaw) ? attrsRaw : []
        )
          .map((a: any) => {
            const attrId = String(a.id ?? a.attribute_id ?? "");
            return {
              id: attrId,
              name: a.name,
              options: (a.options || []).map((o: any) => {
                const optId = String(
  o.id ?? o.option_id ?? o.value ?? o.label ?? o.name ?? ""
);
const optLabel = String(o.label ?? o.name ?? "Option");

// 1) Pull backend description first
const backendDescRaw = String(o.description || "").trim();

// 2) Fallback to your localStorage resolver
const localDescRaw = resolveShortDescription(
  optionDescMap,
  attrId,
  optId,
  optLabel
);

// 3) Choose one
const rawDesc = backendDescRaw || localDescRaw || "";

// 4) Sanitize + censor for safe HTML render
const sanitizedDesc = rawDesc ? censor(sanitizeHtml(rawDesc)) : "";

                return {
                  id: optId,
                  label: optLabel,
                  image_url: toAbsUrl(o.image_url),
                  price_delta:
                    o.price_delta == null ? null : Number(o.price_delta),
                  is_default: !!o.is_default,
                  short_description: rawDesc || null,
                  short_description_html: sanitizedDesc ? sanitizedDesc : null,
                };
              }),
            };
          })
          .filter((a: CustomAttribute) => (a.options || []).length > 0);

        // default selections
        const defaults: Record<string, string> = {};
        attrs.forEach((a) => {
          const def = a.options.find((o) => o.is_default) || a.options[0];
          if (def) defaults[a.id] = def.id;
        });

        setCustomAttributes(attrs);
        setSelectedAttrOptions(defaults);

        // variants
        const pMethods: string[] = variantData.printing_methods || [];
        setPrintingMethods(pMethods || []);

        const fullProduct = {
          ...productData,
          sizes: variantData.sizes || [],
          printing_methods: pMethods || [],
          fabric_finish: variantData.fabric_finish || [],
          color_variants: variantData.color_variants || [],
          material_types: variantData.material_types || [],
          add_on_options: variantData.add_on_options || [],
        };

        const productImages = (imageData.images || ["/images/img1.jpg"]).map(
          (u: string) => toAbsUrl(u)
        );
        setImages(productImages);
        setProduct(fullProduct);
        setShippingInfo(shippingData || { processing_time: "3–5" });

        // find category + subcategory for related logic
        let foundCategory: any = null;
        let foundSubCategory: any = null;

        for (const category of navItems || []) {
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

        // load all products to enrich cards
        const allProductsRes = await fetch(
          `${API_BASE_URL}/api/show-product/`,
          withFrontendKey({ cache: "no-store" })
        );
        const allProductsData = allProductsRes.ok
          ? await allProductsRes.json()
          : [];

        if (foundSubCategory?.products && allProductsData.length > 0) {
          const related = foundSubCategory.products
            .filter((p: any) => `${p.id}` !== `${productId}`)
            .map((p: any) => {
              const fullDetails = allProductsData.find(
                (item: any) => `${item.id}` === `${p.id}`
              );
              const rating = Number(p?.rating ?? fullDetails?.rating ?? 0);
              const rating_count = Number(
                p?.rating_count ?? fullDetails?.rating_count ?? 0
              );
              return {
                ...p,
                image:
                  fullDetails?.image ||
                  p.images?.[0]?.url ||
                  "/images/img1.jpg",
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

        // fetch comments AFTER we know product + maybe its subcategory id
        await fetchComments(`${foundSubCategory?.id ?? ""}`);

        setLoading(false);
      } catch (e) {
        console.error("❌ Product fetch error:", e);
        setNotFound(true);
        setLoading(false);
      }
    };

    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // --- Comments: fetch/list/compute ---
  const fetchComments = async (subcategoryId?: string) => {
    try {
      setCommentsLoading(true);
      const body: any = productId
        ? { product_id: productId }
        : subcategoryId
        ? { subcategory_id: subcategoryId }
        : {};

      const res = await fetch(
        `${API_BASE_URL}/api/show-product-comment/`,
        withFrontendKey({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      );

      if (!res.ok) {
        setComments([]);
        setCommentsLoading(false);
        return;
      }
      const data = await res.json();
      const arr: ProductComment[] = Array.isArray(data)
        ? data
        : data?.results ?? [];
      // Only show approved/active
      const approved = arr.filter((c) =>
        ["approved", "active"].includes(String(c.status || "").toLowerCase())
      );
      setComments(approved);
      setCommentsLoading(false);
    } catch (err) {
      console.error("comments error:", err);
      setComments([]);
      setCommentsLoading(false);
    }
  };
  // --- Comment form limits ---
  const MAX_NAME = 60;
  const MAX_EMAIL = 120;
  const MAX_COMMENT = 1200;

  // --- Comment form state ---
  const [form, setForm] = useState({
    name: "",
    email: "",
    comment: "",
    remember: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  // Prefill from localStorage if present
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedName = localStorage.getItem("comment_name") || "";
    const storedEmail = localStorage.getItem("comment_email") || "";
    if (storedName || storedEmail) {
      setForm((s) => ({
        ...s,
        name: storedName,
        email: storedEmail,
        remember: true,
      }));
    }
  }, []);

  // util: basic email check
  const isValidEmail = (v: string) => /\S+@\S+\.\S+/.test(v.trim());

  // submit handler: create a new comment (status pending by default; backend will moderate)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const name = form.name.trim();
    const email = form.email.trim();
    const comment = form.comment.trim();

    if (!name || !email || !comment) {
      setSubmitMsg("Name, email, and comment are required.");
      return;
    }
    if (
      name.length > MAX_NAME ||
      email.length > MAX_EMAIL ||
      comment.length > MAX_COMMENT
    ) {
      setSubmitMsg("Input exceeds allowed lengths.");
      return;
    }
    if (!isValidEmail(email)) {
      setSubmitMsg("Please provide a valid email.");
      return;
    }

    try {
      setSubmitting(true);
      setSubmitMsg(null);

      // Remember me
      if (form.remember) {
        localStorage.setItem("comment_name", name);
        localStorage.setItem("comment_email", email);
      } else {
        localStorage.removeItem("comment_name");
        localStorage.removeItem("comment_email");
      }

      // Create comment via edit endpoint (no comment_id => create)
      const payload: any = {
        name,
        email,
        content: comment,
        rating: 0, // optional now; can extend UI later
        rating_count: 1, // default 1
        status: "Approved", // default status
        product_id: productId,
      };

      const res = await fetch(
        `${API_BASE_URL}/api/edit-product-comment/`,
        withFrontendKey({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSubmitMsg(err?.error || "Failed to post comment.");
        return;
      }

      setSubmitMsg("Thanks! Your comment is submitted for review.");
      setForm((s) => ({ ...s, comment: "" }));

      // refresh list (only approved/active are shown to shoppers)
      await fetchComments();
    } catch (err) {
      console.error(err);
      setSubmitMsg("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Comment Cards horizontal scroll helpers ----
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const updateCanScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScroll({
      left: el.scrollLeft > 0,
      right: el.scrollLeft < max - 1,
    });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateCanScroll();
    const onScroll = () => updateCanScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [comments.length]);

  const scrollByCards = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-comment-card]");
    const step = (card?.offsetWidth || 360) + 24; // width + gap
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const formatDate = (iso?: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const avgRating = useMemo(() => {
    if (!comments.length) return Number(product?.rating || 0);
    const sum = comments.reduce((s, c) => s + (Number(c.rating) || 0), 0);
    return sum / comments.length;
  }, [comments, product?.rating]);

  const totalRatings = useMemo(() => {
    if (!comments.length) return Number(product?.rating_count || 0);
    // If each comment has rating_count, you asked for that, but most UIs show number of reviews.
    // We’ll prefer comments.length; if rating_count is present, add them up for richness.
    const hasCounts = comments.some((c) => typeof c.rating_count === "number");
    if (hasCounts) {
      return (
        comments.reduce((s, c) => s + Number(c.rating_count || 0), 0) ||
        comments.length
      );
    }
    return comments.length;
  }, [comments, product?.rating_count]);

  // --- Admin actions (optional) ---
  const handleDeleteComment = async (commentId: string | number) => {
    if (!adminMode) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/delete-product-comment/`,
        withFrontendKey({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment_id: commentId }),
        })
      );
      const ok = res.ok;
      Toastify({
        text: ok ? "Comment deleted" : "Failed to delete",
        duration: 2500,
        gravity: "top",
        position: "right",
        backgroundColor: ok
          ? "linear-gradient(to right, #af4c4c, #d30000)"
          : "linear-gradient(to right, #b00020, #ff5a5a)",
        style: { borderRadius: "0.75rem", padding: "12px 20px" },
      }).showToast();
      if (ok)
        setComments((prev) => prev.filter((c) => `${c.id}` !== `${commentId}`));
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditStatus = async (
    commentId: string | number,
    status: CommentStatus
  ) => {
    if (!adminMode) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/edit-product-comment/`,
        withFrontendKey({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment_id: commentId, status }),
        })
      );
      const ok = res.ok;
      Toastify({
        text: ok ? "Comment updated" : "Failed to update",
        duration: 2500,
        gravity: "top",
        position: "right",
        backgroundColor: ok
          ? "linear-gradient(to right, #af4c4c, #d30000)"
          : "linear-gradient(to right, #b00020, #ff5a5a)",
        style: { borderRadius: "0.75rem", padding: "12px 20px" },
      }).showToast();
      if (ok)
        setComments((prev) =>
          prev.map((c) =>
            String(c.id) === String(commentId) ? { ...c, status } : c
          )
        );
    } catch (e) {
      console.error(e);
    }
  };

  // --- Attr selection ---
  const selectAttrOption = (attrId: string, optionId: string) => {
    setSelectedAttrOptions((prev) => ({ ...prev, [attrId]: optionId }));
  };
  const isSelected = (attrId: string, optionId: string) =>
    selectedAttrOptions[attrId] === optionId;

  // --- Description HTML ---
  const descriptionHtml = useMemo(() => {
    const raw = String(product?.long_description || "");
    const sanitized = sanitizeHtml(raw);
    const masked = censor(sanitized);
    return masked || "<p>No description available.</p>";
  }, [product?.long_description]);


  // --- WhatsApp link ---
  const handleWhatsApp = () => {
    const num = "971545396249"; // +971 54 539 6249 without plus
    const text = encodeURIComponent(
      `Hi, I'm interested in "${product?.name}" (${
        typeof window !== "undefined" ? window.location.href : ""
      }). Can I get a more detail about this product?`
    );
    const url = `https://wa.me/${num}?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // --- Add to Cart ---
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
            quantity: qty > 0 ? qty : 1,
            selected_size: "",
            selected_attributes: selectedAttrOptions,
          }),
        })
      );
      const data = await res.json();
      Toastify({
        text: res.ok
          ? "✔️ Successfully added to cart"
          : `❌ ${data?.error || "Try again!"}`,
        duration: 3000,
        gravity: "top",
        position: "right",
        backgroundColor: res.ok
          ? "linear-gradient(to right, #af4c4cff, #d30000ff)"
          : "linear-gradient(to right, #b00020, #ff5a5a)",
        style: { borderRadius: "0.75rem", padding: "12px 20px" },
      }).showToast();
    } catch (err) {
      console.error("Cart error:", err);
    }
  };

  // gallery nav
  const prevImg = () =>
    setCurrent((i) => (i - 1 + images.length) % images.length);
  const nextImg = () => setCurrent((i) => (i + 1) % images.length);

  // keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prevImg();
      if (e.key === "ArrowRight") nextImg();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length]);

  // guards
  const canIncrement = qty < (Number(product?.stock_quantity) || 0);

  // 404 + skeleton
  if (loading) {
    return (
      <div
        className="flex flex-col bg-white"
        style={{
          fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif",
        }}
      >
        <Header />
        <LogoSection />
        <Navbar />
        <MobileTopBar />
        <main className="min-h-[60vh]" />
        <Footer />
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div
        className="bg-white overflow-x-hidden lg:overflow-y-hidden"
        style={{ fontFamily: "var(--font-poppins), Arial, sans-serif" }}
      >
        <Header />
        <LogoSection />
        <Navbar />
        <MobileTopBar />
        <main
          className="grid min-h-[100svh] justify-center mt-10 px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-24"
          aria-labelledby="page-title"
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
              <span className="-mr-2 sm:-mr-4 text-[clamp(6rem,22vw,12rem)]">
                4
              </span>
              <span className="-mr-2 sm:-mr-4 text-[clamp(6rem,22vw,12rem)]">
                0
              </span>
              <span className="text-[clamp(6rem,22vw,12rem)]">4</span>
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
                className="inline-flex justify-center rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-normal text-[#891F1A] transition hover:bg-red-500 hover:text-white"
              >
                Go to Home
              </Link>
              <button
                onClick={() => history.back()}
                className="inline-flex justify-center rounded-xl bg-[#891F1A] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-500"
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

  // DETAILS TABLE rows from backend
  const detailsRows: Array<{ label: string; value: string }> = [];
  if (Array.isArray(product.material_types) && product.material_types.length)
    detailsRows.push({
      label: "Material",
      value: product.material_types.join(", "),
    });
  if (Array.isArray(product.fabric_finish) && product.fabric_finish.length)
    detailsRows.push({
      label: "Finish",
      value: product.fabric_finish.join(", "),
    });
  if (Array.isArray(printingMethods) && printingMethods.length) {
    const labels = printingMethods.map((pm: string) =>
      pm === "DP"
        ? "Digital Printing"
        : pm === "SP"
        ? "Screen Printing"
        : pm === "OP"
        ? "Off Set Printing"
        : pm
    );
    detailsRows.push({ label: "Printing", value: labels.join(", ") });
  }
  if (Array.isArray(product.add_on_options) && product.add_on_options.length)
    detailsRows.push({
      label: "Add-ons",
      value: product.add_on_options.join(", "),
    });
  detailsRows.push({ label: "Warranty", value: "7-day manufacturing defects" });
  detailsRows.push({ label: "Country of Origin", value: "UAE" });

  // date pretty
  const prettyDate = (iso?: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div
      className="flex flex-col bg-white"
      style={{
        fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif",
      }}
    >
      <Header />
      <LogoSection />
      <Navbar />
      <MobileTopBar />

      {/* Toast */}
      <AnimatePresence>
        {msg && (
          <motion.div
            role="status"
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black text-white px-4 py-2 text-xs shadow-md"
          >
            {msg}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="min-h-screen bg-white text-zinc-800 px-4 md:px-8 lg:px-12">
        <section className="mx-auto max-w-6xl py-8 md:py-12">
          <div className="grid gap-10 md:grid-cols-[520px_1fr]">
            {/* LEFT: Image viewer */}
            <div className="md:sticky md:top-8">
              <Reveal className="relative mx-auto w-full max-w-[560px]">
                <div
                  className="group relative w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
                  style={{ height: "clamp(360px, 54vh, 660px)" }}
                >
                  <div className="absolute inset-5 sm:inset-6 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                      <motion.img
                        key={images[current] || "/images/img1.jpg"}
                        src={images[current] || "/images/img1.jpg"}
                        alt={product.name}
                        className="max-h-full max-w-full object-contain drop-shadow-sm"
                        loading="eager"
                        decoding="async"
                        sizes="(min-width: 768px) 560px, 100vw"
                        initial={{ opacity: 0, scale: 0.985 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0.2, scale: 1.01 }}
                        transition={{
                          duration: 0.28,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        onError={(e) =>
                          ((e.currentTarget as HTMLImageElement).src =
                            "/images/img1.jpg")
                        }
                      />
                    </AnimatePresence>

                    {images.length > 1 && (
                      <motion.button
                        type="button"
                        onClick={prevImg}
                        whileTap={{ scale: 0.95 }}
                        className="absolute left-1 sm:left-2 inset-y-0 my-auto grid place-items-center h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-[#8B1C1C] text-white"
                        aria-label="Previous image"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5 fill-current"
                        >
                          <path d="M15.41 16.59 10.83 12l4.58-4.59L14 6l-6 6 6 6z" />
                        </svg>
                      </motion.button>
                    )}

                    {images.length > 1 && (
                      <motion.button
                        type="button"
                        onClick={nextImg}
                        whileTap={{ scale: 0.95 }}
                        className="absolute right-1 sm:right-2 inset-y-0 my-auto grid place-items-center h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-[#8B1C1C] text-white"
                        aria-label="Next image"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5 fill-current"
                        >
                          <path d="m8.59 16.59 4.58-4.59-4.58-4.59L10 6l6 6-6 6z" />
                        </svg>
                      </motion.button>
                    )}
                  </div>
                </div>
              </Reveal>

              {/* Thumbnails */}
              <div className="mt-4 grid grid-cols-4 sm:grid-cols-5 gap-3">
                {images.map((src, i) => (
                  <Reveal key={`${src}-${i}`} delay={i * 0.04}>
                    <motion.button
                      onClick={() => setCurrent(i)}
                      className={`relative overflow-hidden rounded-xl border bg-white transition p-2 ${
                        current === i
                          ? "border-zinc-900 ring-2 ring-zinc-900/10"
                          : "border-zinc-200 hover:border-zinc-300"
                      }`}
                      aria-label={`View image ${i + 1}`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      style={{ height: "88px" }}
                    >
                      <img
                        src={src}
                        alt={`Thumbnail ${i + 1}`}
                        className="h-full w-full object-contain"
                        loading="lazy"
                        decoding="async"
                        onError={(e) =>
                          ((e.currentTarget as HTMLImageElement).src =
                            "/images/img1.jpg")
                        }
                      />
                    </motion.button>
                  </Reveal>
                ))}
              </div>
            </div>

            {/* RIGHT: Details */}
            <div>
              <Reveal>
                <h1 className="text-[22px] font-semibold leading-tight">
                  {product.name}
                </h1>
              </Reveal>
              <Reveal delay={0.05}>
                <div className="mt-2 flex items-center gap-2">
                  <StarRating
                    rating={Number(avgRating || 0)}
                    count={Number(totalRatings || 0)}
                  />
                </div>
              </Reveal>

              <Reveal delay={0.08}>
                <p className="mt-3 text-[15px] font-medium">
                  AED {String(product.price ?? "").toString()}
                </p>
              </Reveal>

              {/* Attribute UI + Printing Methods */}
              <Reveal delay={0.1}>
                <section className="mt-6 space-y-6">
                  {/* CUSTOM ATTRIBUTES */}
                  {customAttributes?.length > 0 && (
                    <section className="space-y-8 w-full max-w-3xl">
                      {customAttributes?.length > 0 &&
                        customAttributes.map((attr) => (
                          <div key={attr.id} className="space-y-4">
                            <h4 className="text-base font-semibold text-gray-900">
                              {attr.name}
                            </h4>

                            {/* FLEX ROW: 3 in a row baseline, tight gaps */}
                            <div className="flex flex-wrap justify-start gap-1 max-w-full">
                              {attr.options.map((opt) => {
                                const selected = isSelected(attr.id, opt.id);
                                const delta = Number(opt.price_delta ?? 0);
                                const positive = delta > 0;
                                const negative = delta < 0;

                                // Only use the option's own sanitized HTML; no product-level fallback
const optionDescHtml = opt.short_description_html || "";
const hasShortDesc = stripHtml(optionDescHtml).length > 0;


                                return (
                                  /* ITEM WRAPPER: 3-up default, expands on hover to push siblings */
                                  <div
                                    key={opt.id}
                                    className="group relative w-32 hover:w-40 transition-all duration-400 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
                                    style={{
                                      willChange: "width, transform",
                                      backfaceVisibility: "hidden",
                                    }}
                                  >
                                    {(positive || negative) && (
                                      <span
                                        className={`absolute -top-1 right-0 z-20 text-[9px] font-medium rounded-full px-2 py-0.5 border w-fit ${
                                          positive
                                            ? "bg-green-100 text-green-700 border-green-200"
                                            : "bg-rose-100 text-[#7f1d1d] border-rose-200"
                                        }`}
                                      >
                                        {positive ? "+" : ""}
                                        {Math.round(delta)} AED
                                      </span>
                                    )}

                                    {/* CARD: fills wrapper width, pushes others on hover */}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        selectAttrOption(attr.id, opt.id)
                                      }
                                      aria-pressed={selected}
                                      className={`
                                      relative inline-flex items-center w-full h-20 rounded-lg border bg-white text-left
                                      ${
                                        selected
                                          ? "border-[#891F1A] shadow-sm"
                                          : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                                      }
                                      overflow-hidden
                                      transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-md
                                    `}
                                      style={{
                                        willChange:
                                          "border-color, box-shadow, transform",
                                        backfaceVisibility: "hidden",
                                      }}
                                    >
                                      {/* LEFT: Image block (fixed) */}
                                      <div className="flex w-16 h-16 shrink-0 items-center justify-center p-2">
                                        <div className="w-12 h-12 rounded-md border border-gray-200 overflow-hidden flex items-center justify-center bg-gray-50">
                                          {opt.image_url ? (
                                            <img
                                              src={opt.image_url}
                                              alt={opt.label}
                                              className="w-full h-full object-cover"
                                              onError={(e) =>
                                                ((
                                                  e.currentTarget as HTMLImageElement
                                                ).src = "/images/img1.jpg")
                                              }
                                            />
                                          ) : (
                                            <svg
                                              className="w-5 h-5 text-gray-300"
                                              fill="none"
                                              stroke="currentColor"
                                              viewBox="0 0 24 24"
                                              aria-hidden="true"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={1.5}
                                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2z"
                                              />
                                            </svg>
                                          )}
                                        </div>
                                      </div>

                                      {/* RIGHT: Description (reveals when item hovered/expanded) */}
                                      {hasShortDesc && (
                                        <div className="flex items-center pr-2 w-full max-w-48 max-h-16 overflow-y-auto opacity-0 group-hover:opacity-100 transition-all duration-400 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] delay-75">
                                          <div
                                            className="text-[10px] leading-tight text-gray-700 transform translate-x-3 scale-95 group-hover:translate-x-0 group-hover:scale-100 transition-all duration-400 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] delay-100"
                                            style={{
                                              willChange: "transform, opacity",
                                              backfaceVisibility: "hidden",
                                            }}
                                            // Ensure this HTML is sanitized upstream
                                            dangerouslySetInnerHTML={{
                                              __html: optionDescHtml,
                                            }}
                                          />
                                        </div>
                                      )}
                                    </button>

                                    {/* Label BELOW the card */}
                                    <p
                                      className={`mt-1 text-center text-xs font-medium ${
                                        selected
                                          ? "text-gray-900"
                                          : "text-gray-600"
                                      }`}
                                    >
                                      {opt.label}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                    </section>
                  )}

                  {/* Stock + Qty */}
                  <div className="grid grid-cols-[110px_1fr] items-center gap-y-3 text-[13px]">
                    <div className="text-zinc-500">In Stock:</div>
                    <div>
                      <span className="inline-block rounded border border-zinc-300 px-2 py-1 text-[12px]">
                        {product?.stock_status?.toLowerCase() === "in stock"
                          ? `${product?.stock_quantity ?? 0} in stock!`
                          : "Out of stock"}
                      </span>
                    </div>

                    <div className="text-zinc-500">Quantity</div>
                    <div className="flex items-center gap-2">
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setQty((q) => Math.max(1, q - 1))}
                        disabled={qty <= 1}
                        aria-label="Decrease quantity"
                        className={`h-7 w-7 rounded-full text-white transition 
                            ${
                              qty <= 1
                                ? "bg-zinc-400 text-zinc-200 cursor-not-allowed"
                                : "bg-[#8B1C1C]"
                            }`}
                      >
                        −
                      </motion.button>

                      <span className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-full border border-zinc-300 px-2 text-[12px]">
                        {qty}
                      </span>

                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() =>
                          setQty((q) => (canIncrement ? q + 1 : q))
                        }
                        disabled={!canIncrement}
                        aria-label="Increase quantity"
                        className={`h-7 w-7 rounded-full text-white transition 
                            ${
                              !canIncrement
                                ? "bg-zinc-400 text-zinc-200 cursor-not-allowed"
                                : "bg-[#8B1C1C]"
                            }`}
                      >
                        +
                      </motion.button>
                    </div>
                  </div>

                  {/* ACTIONS */}
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:gap-3">
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handleAddToCart}
                      disabled={
                        product?.stock_status?.trim().toLowerCase() !==
                        "in stock"
                      }
                      className={`group flex items-center justify-between rounded-full px-4 py-2.5 text-white shadow-sm hover:shadow-md transition
                        ${
                          product?.stock_status?.trim().toLowerCase() ===
                          "in stock"
                            ? "bg-[#6f1414]"
                            : "bg-zinc-400 cursor-not-allowed"
                        }
                        disabled:opacity-60`}
                    >
                      <span className="text-sm font-medium">
                        {product?.stock_status?.trim().toLowerCase() !==
                        "in stock"
                          ? "Out Of Stock"
                          : "Add to Cart"}
                      </span>
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-black/10 group-hover:bg-black/20 transition">
                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white">
                          <path d="M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 .001-3.999A2 2 0 0 0 17 20zM7.3 16h9.2c.7 0 1.33-.4 1.65-1.03l3-6A1 1 0 0 0 20.3 7H6.28l-.94-2H2v2h2l3.6 7.2-.9 1.8c-.33.66.18 1.4.9 1.4z" />
                        </svg>
                      </span>
                    </motion.button>

                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handleWhatsApp}
                      className="group flex items-center justify-between rounded-full bg-[#6f1414] px-4 py-2.5 text-white shadow-sm hover:shadow-md"
                    >
                      <span className="text-sm font-medium">
                        Contact On WhatsApp
                      </span>
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-black/10 group-hover:bg-black/20 transition">
                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white">
                          <path d="M13 2L4 14h7l-1 8 10-12h-7l1-8z" />
                        </svg>
                      </span>
                    </motion.button>
                  </div>
                </section>
              </Reveal>
            </div>
          </div>

          {/* --- TABS SECTION --- */}
          <motion.div
            className="mt-10 rounded-xl border border-zinc-200"
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.2 }}
            transition={{ duration: 0.4 }}
          >
            {/* Tab Buttons */}
            <div
              className="flex gap-2 border-b border-zinc-200 p-3 text-[13px]"
              role="tablist"
              aria-label="Product information tabs"
            >
              {TABS.map((tab) => {
                const isSel = selectedTab === tab;
                return (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={isSel}
                    aria-controls={`panel-${tab}`}
                    id={`tab-${tab}`}
                    onClick={() => setSelectedTab(tab)}
                    className={
                      isSel
                        ? "rounded-md bg-[#8B1C1C] px-3 py-1 text-white transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-[#8B1C1C]/40"
                        : "rounded-md px-3 py-1 text-zinc-600 transition hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                    }
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            {/* Panels */}
            {selectedTab === "Description" && (
              <div
                id="panel-Description"
                role="tabpanel"
                aria-labelledby="tab-Description"
                className="grid gap-4 p-4 md:grid-cols-3"
              >
                <Reveal delay={0.05} className="rounded-md bg-zinc-100 p-5">
                  <h3 className="mb-3 text-[13px] font-semibold text-zinc-700">
                    Product Highlights
                  </h3>
                  <ul className="space-y-2 text-[12px] text-zinc-600">
                    <li>• Advanced printing technology</li>
                    <li>• Premium materials</li>
                    <li>• Unique & affordable</li>
                    <li>• Long-lasting colors</li>
                    <li>• 7-day refund window</li>
                  </ul>
                </Reveal>

                <Reveal delay={0.1} className="rounded-md bg-zinc-100 p-5">
                  <h3 className="mb-3 text-[13px] font-semibold text-zinc-700">
                    Product Description
                  </h3>
                  <div
                    className="text-[12px] text-zinc-600 leading-6 space-y-2 [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-6"
                    dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                  />
                </Reveal>

                <Reveal delay={0.15} className="rounded-md bg-zinc-100 p-5">
                  <h3 className="mb-3 text-[13px] font-semibold text-zinc-700">
                    Delivery & Return Policy
                  </h3>
                  <p className="text-[12px] leading-6 text-zinc-600">
                    Free shipping on all orders. COD incurs a flat AED
                    250/product. No returns on customized items. All deliveries
                    are contactless. Check FAQ for full policy.
                  </p>
                  <div className="mt-3 text-[12px] text-zinc-600">
                    Processing time: within{" "}
                    {shippingInfo?.processing_time || "3–5"} days.
                  </div>
                </Reveal>
              </div>
            )}

            {selectedTab === "Details" && (
              <div
                id="panel-Details"
                role="tabpanel"
                aria-labelledby="tab-Details"
                className="p-4"
              >
                <Reveal className="overflow-hidden rounded-md border border-zinc-200">
                  <table className="w-full text-left text-[12px] text-zinc-700">
                    <thead className="bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-4 py-2">Spec</th>
                        <th className="px-4 py-2">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                      {detailsRows.map((row, idx) => (
                        <tr key={`${row.label}-${idx}`} className="bg-white">
                          <td className="px-4 py-3 font-medium">{row.label}</td>
                          <td className="px-4 py-3 text-zinc-600">
                            {row.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Reveal>
              </div>
            )}

            {selectedTab === "Reviews" && (
              <div
                id="panel-Reviews"
                role="tabpanel"
                aria-labelledby="tab-Reviews"
                className="p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[12px] text-zinc-600">
                    {commentsLoading
                      ? "Loading reviews…"
                      : `${comments.length} review${
                          comments.length === 1 ? "" : "s"
                        }`}
                  </p>

                  {adminMode && (
                    <div className="text-[11px] text-zinc-500 flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-[#8B1C1C]" />{" "}
                      Admin mode
                    </div>
                  )}
                </div>

                {!commentsLoading && comments.length === 0 && (
                  <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-[12px] text-zinc-600">
                    No reviews yet.
                  </div>
                )}

                <div className="space-y-3">
                  {comments.map((r, i) => (
                    <Reveal key={r.id} delay={i * 0.05}>
                      <div className="rounded-md border border-zinc-200 bg-white p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-[12px] font-semibold text-zinc-800">
                            {r.name}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {prettyDate(r.created_at)}
                          </p>
                        </div>
                        <div className="mt-1">
                          <StarRating rating={Number(r.rating)} />
                        </div>
                        {!!r.content && (
                          <p className="mt-2 text-[12px] text-zinc-600">
                            {stripHtml(censor(sanitizeHtml(r.content)))}
                          </p>
                        )}

                        {adminMode && (
                          <div className="mt-3 flex items-center gap-2">
                            <select
                              defaultValue={r.status}
                              onChange={(e) =>
                                handleEditStatus(
                                  r.id,
                                  e.target.value as CommentStatus
                                )
                              }
                              className="text-[12px] border border-zinc-300 rounded-md px-2 py-1"
                            >
                              <option value="approved">approved</option>
                              <option value="pending">pending</option>
                              <option value="rejected">rejected</option>
                              <option value="hidden">hidden</option>
                            </select>
                            <button
                              onClick={() => handleDeleteComment(r.id)}
                              className="text-[12px] px-2 py-1 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* --- RECOMMENDED PRODUCTS --- */}
          <section className="mt-16">
            <Reveal>
              <h3 className="mb-6 text-center text-sm font-semibold uppercase tracking-wider text-zinc-600">
                Recommended Products
              </h3>
            </Reveal>

            {relatedProducts?.length ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {relatedProducts.map((p: any, i: number) => (
                  <Reveal key={`${p.id}-${i}`} delay={i * 0.05}>
                    <motion.article
                      className="group rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3 transition hover:shadow-sm"
                      whileHover={{ y: -2 }}
                    >
                      <button
                        onClick={() =>
                          router.push(
                            `/home/${p.category_slug}/${p.subcategory_slug}/products/${p.id}`
                          )
                        }
                        className="block w-full text-left"
                      >
                        <div className="aspect-square w-full overflow-hidden rounded-xl bg-white">
                          <img
                            src={toAbsUrl(p.image)}
                            alt={p.name}
                            className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
                            onError={(e) =>
                              ((e.currentTarget as HTMLImageElement).src =
                                "/images/img1.jpg")
                            }
                          />
                        </div>
                        <div className="mt-3 text-center">
                          <h4 className="line-clamp-1 text-[12px] font-medium text-zinc-800">
                            {p.name}
                          </h4>
                          <div className="mt-1 flex justify-center">
                            {/* Keep card stars from upstream data; they’re not from comments */}
                            <StarRating
                              rating={Number(p.rating || 0)}
                              count={Number(p.rating_count || 0)}
                            />
                          </div>
                          <div className="mt-1 text-[12px] font-semibold">
                            AED {String(p.price ?? "").toString()}
                          </div>
                          {!!p.printing_methods?.length && (
                            <div className="mt-1 text-[11px] text-zinc-500">
                              Print: {p.printing_methods.join(", ")}
                            </div>
                          )}
                        </div>
                      </button>
                    </motion.article>
                  </Reveal>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-zinc-500">
                No related products found.
              </p>
            )}
          </section>
        </section>
      </main>
      {/* ---- Comment Box ---- */}
      <section className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-8 mb-5">
        <div className="w-full rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
            Leave a Reply
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Your email address will not be published. Required fields are marked{" "}
            <span className="text-red-500">*</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="mb-3">
                <label className="block text-sm font-medium text-black mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={MAX_NAME}
                  value={form.name}
                  aria-invalid={form.name.trim().length > MAX_NAME}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, name: e.target.value }))
                  }
                  placeholder="Name"
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-[#891F1A] text-black"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {form.name.trim().length}/{MAX_NAME}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  maxLength={MAX_EMAIL}
                  value={form.email}
                  aria-invalid={form.email.trim().length > MAX_EMAIL}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, email: e.target.value }))
                  }
                  placeholder="Email"
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-[#891F1A] text-black"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {form.email.trim().length}/{MAX_EMAIL}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-800 mb-1">
                Add Comment <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={6}
                maxLength={MAX_COMMENT}
                value={form.comment}
                aria-invalid={form.comment.trim().length > MAX_COMMENT}
                onChange={(e) =>
                  setForm((s) => ({ ...s, comment: e.target.value }))
                }
                placeholder="Add Comment"
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-[#891F1A] text-black resize-none"
              />
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>
                  {form.comment.trim().length}/{MAX_COMMENT}
                </span>
                <span>Keep it concise.</span>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4">
              {/* Plain checkbox to avoid extra deps */}
              <Checkbox
                checked={form.remember}
                onChange={(e) =>
                  setForm((s) => ({ ...s, remember: e.target.checked }))
                }
                sx={{
                  color: "#891F1A",
                  "&.Mui-checked": { color: "#891F1A" },
                }}
              />
              <label htmlFor="remember" className="text-sm text-gray-700">
                Save my name and email in this browser for the next time I
                comment.
              </label>
            </div>

            {submitMsg && (
              <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded px-3 py-2 mb-2">
                {submitMsg}
              </p>
            )}

            <div>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-md px-5 py-2.5 text-white bg-[#891F1A] font-medium hover:opacity-90 active:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#891F1A] disabled:opacity-60"
              >
                {submitting ? "Posting…" : "Post Comment"}
              </button>
            </div>
          </form>
        </div>
      </section>
      {/* ---- /Comment Box ---- */}

      {/* ---- Comment Cards ---- */}
      <section className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-12 mb-30">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900">
            {commentsLoading
              ? "Loading comments…"
              : `${comments.length} Comment${comments.length !== 1 ? "s" : ""}`}
          </h3>

          {/* Arrows shown only when > 3 comments */}
          {comments.length > 3 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => scrollByCards(-1)}
                disabled={!canScroll.left}
                aria-label="Scroll comments left"
                className={`inline-flex h-9 w-9 items-center justify-center rounded border text-sm transition
            ${
              canScroll.left
                ? "bg-white border-gray-300 hover:bg-gray-50 text-gray-800"
                : "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
            }`}
                title="Scroll left"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => scrollByCards(1)}
                disabled={!canScroll.right}
                aria-label="Scroll comments right"
                className={`inline-flex h-9 w-9 items-center justify-center rounded border text-sm transition
            ${
              canScroll.right
                ? "bg-white border-gray-300 hover:bg-gray-50 text-gray-800"
                : "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
            }`}
                title="Scroll right"
              >
                ›
              </button>
            </div>
          )}
        </div>

        {/* If >3, horizontal scroller; else grid */}
        {comments.length > 3 ? (
          <div
            ref={scrollRef}
            className="overflow-x-auto overscroll-x-contain pb-2 -mx-2 px-2"
          >
            <div
              className="flex gap-6 snap-x snap-mandatory"
              style={{ scrollBehavior: "smooth" }}
            >
              {comments.map((c) => (
                <article
                  key={c.id}
                  data-comment-card
                  className="snap-start shrink-0 w-[320px] sm:w-[360px] rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
                  aria-label={`Comment by ${c.name}`}
                >
                  <div className="flex items-center gap-4 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {c.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate((c as any).created_at)}
                      </p>
                    </div>
                  </div>
                  <p className="text-gray-800 text-sm leading-6 max-h-[150px] overflow-y-auto">
                    {(c.content &&
                      stripHtml(censor(sanitizeHtml(c.content)))) ||
                      ""}
                  </p>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {comments.map((c) => (
              <article
                key={c.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
                aria-label={`Comment by ${c.name}`}
              >
                <div className="flex items-center gap-4 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {c.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate((c as any).created_at)}
                    </p>
                  </div>
                </div>
                <p className="text-gray-800 text-sm leading-6">
                  {(c.content && stripHtml(censor(sanitizeHtml(c.content)))) ||
                    ""}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
      <Footer />
      <ChatBot />
    </div>
  );
}
