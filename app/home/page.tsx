"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useId,
} from "react";
import "toastify-js/src/toastify.css";
import Head from "next/head";
import Navbar from "../components/Navbar";
import Header from "../components/header";
import LogoSection from "../components/LogoSection";
import Footer from "../components/Footer";
import MobileTopBar from "../components/HomePageTop";
import Link from "next/link";
import {
  FaEnvelopeOpenText,
  FaMapMarkerAlt,
  FaPhoneAlt,
  FaWhatsapp,
} from "react-icons/fa";
import Toastify from "toastify-js";
import { API_BASE_URL } from "../utils/api";
import { ChatBot } from "../components/ChatBot";
import { SafeImg } from "../components/SafeImage";
import dynamic from "next/dynamic";

// ───────────────────────────────────────────────────────────────────────────────
// URL joiner → kills accidental double slashes and lets you control trailing slash
const joinUrl = (...parts: string[]) =>
  parts
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p.replace(/\/+$/,"") : p.replace(/^\/+|\/+$/g,"")))
    .join("/");

// Add trailing slash when you actually want one (DRF convention)
const withTrailingSlash = (u: string) => (u.endsWith("/") ? u : u + "/");

// Frontend key helper
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

// Normalize <input type="datetime-local"> value to include seconds (HH:MM → HH:MM:00)
const normalizeDateTimeLocal = (s: string) => {
  if (!s) return s;
  const trimmed = s.trim();
  // "YYYY-MM-DDTHH:MM" → length 16, index 10 is "T"
  if (trimmed.length === 16 && trimmed[10] === "T") return trimmed + ":00";
  return trimmed;
};

// Local utility: slugify (stable)
function slugify(value: string, allowUnicode = false): string {
  let v = value.toString();
  v = allowUnicode
    ? v.normalize("NFKC")
    : v.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  v = v.toLowerCase().replace(/[^\w\s-]/g, "");
  return v.replace(/[-\s]+/g, "-").replace(/^[-_]+|[-_]+$/g, "");
}

// Device UUID (persist per browser)
function getDeviceUUID(): string {
  if (typeof window === "undefined") return "server";
  const KEY = "__cc_device_uuid__";
  let v = window.localStorage.getItem(KEY);
  if (!v) {
    v =
      (globalThis.crypto as any)?.randomUUID?.() ||
      `${Date.now()}-${Math.random()}`.replace(".", "");
    window.localStorage.setItem(KEY, v);
  }
  return v;
}

// Heavy sections → Next dynamic (keeps TTI lower)
const Carousel = dynamic(() => import("../components/Carousel"), {
  loading: () => <div aria-hidden="true" />,
});
const Reviews = dynamic(() => import("../components/reviews"), {
  loading: () => <div aria-hidden="true" />,
});
const SecondCarousel = dynamic(() => import("../components/second_carousel"), {
  loading: () => <div aria-hidden="true" />,
});

// Types
type Category = {
  id: number | string;
  name: string;
  image: string;
  status?: string;
};

type CallbackDraft = {
  full_name: string;
  email?: string;
  phone: string;
  event_type: string;           // text input now
  preferred_callback: string;   // ISO (datetime-local string)
  // expanded fields:
  event_venue?: string;
  event_datetime?: string;
  estimated_guests?: string;
  budget?: string;
  theme?: string;
  notes?: string;
};

export default function PrintingServicePage() {
  const FALLBACK_HERO_DESKTOP = "/images/Banner3.jpg";
  const FALLBACK_HERO_MOBILE  = "/images/Banner3.jpg";

  const fallbackImage =
    "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/ZfQW3qI2ok/ymeg8jht_expires_30_days.png";

  // Robust absolute-URL resolver that does not rely on next/image
  const toHttpsAbsUrl = (u: string): string => {
    try {
      if (!u) return fallbackImage;

      // Absolute URL
      if (/^https?:\/\//i.test(u)) {
        const url = new URL(u);
        if (url.protocol === "http:") url.protocol = "https:";
        return url.toString();
      }

      // Base from API_BASE_URL (can be empty in some misconfigs)
      const base = (API_BASE_URL || "").replace(/\/+$/, "");
      // Root-relative path
      if (u.startsWith("/")) {
        if (!base) return u; // same-origin relative
        const url = new URL(u, base);
        if (url.protocol === "http:") url.protocol = "https:";
        return url.toString();
      }

      // Path-like (e.g., "media/hero.jpg")
      if (base) {
        const url = new URL(`/${u.replace(/^\/+/, "")}`, base);
        if (url.protocol === "http:") url.protocol = "https:";
        return url.toString();
      }

      // Last resort: make it root-relative
      return `/${u.replace(/^\/+/, "")}`;
    } catch {
      return fallbackImage;
    }
  };

  const [desktopImages, setDesktopImages] = useState<string[]>([fallbackImage]);
  const [mobileImages, setMobileImages]   = useState<string[]>([fallbackImage]);
  const [desktopIndex, setDesktopIndex]   = useState(0);
  const [mobileIndex, setMobileIndex]     = useState(0);
  const [categories, setCategories]       = useState<Category[]>([]);
  const [isSubmitted, setIsSubmitted]     = useState(false);

  // a11y: reactively respect user motion preference changes
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setPrefersReducedMotion(!!mq.matches);
    set(); // initial
    mq.addEventListener?.("change", set);
    return () => mq.removeEventListener?.("change", set);
  }, []);

  // Abort controllers to avoid setting state on unmounted
  const heroAbortRef = useRef<AbortController | null>(null);
  const catAbortRef  = useRef<AbortController | null>(null);

  // Prebuilt API endpoints (no // and with slashes where needed)
  const HERO_URL  = withTrailingSlash(joinUrl(API_BASE_URL || "", "api", "hero-banner"));
  const CATS_URL  = withTrailingSlash(joinUrl(API_BASE_URL || "", "api", "show-categories"));
  const SAVE_URL  = withTrailingSlash(joinUrl(API_BASE_URL || "", "api", "save-callback"));

  // Fetch hero banners
  useEffect(() => {
    heroAbortRef.current?.abort();
    const ctrl = new AbortController();
    heroAbortRef.current = ctrl;

    fetch(HERO_URL, {
      ...withFrontendKey(),
      signal: ctrl.signal,
      cache: "no-store",
    })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status)))
      )
      .then((data) => {
        const all: any[] = data?.images || [];

        const desktop = all
          .filter((img) => img.device_type === "desktop")
          .map((img) => toHttpsAbsUrl(img.url));
        const mobile = all
          .filter((img) => img.device_type === "mobile")
          .map((img) => toHttpsAbsUrl(img.url));

        const mid = Math.ceil(all.length / 2);

        const desktopResolved =
          desktop.length
            ? desktop
            : all.slice(0, mid).map((img) => toHttpsAbsUrl(img.url)) || [fallbackImage];

        const mobileResolved =
          mobile.length
            ? mobile
            : all.slice(mid).map((img) => toHttpsAbsUrl(img.url)) || [fallbackImage];

        setDesktopImages(desktopResolved);
        setMobileImages(mobileResolved);
        setDesktopIndex(0);
        setMobileIndex(0);
      })
      .catch(() => {
        setDesktopImages([fallbackImage]);
        setMobileImages([fallbackImage]);
        setDesktopIndex(0);
        setMobileIndex(0);
      });

    return () => ctrl.abort();
  }, [HERO_URL]);

  // Fetch categories (visible only)
  useEffect(() => {
    catAbortRef.current?.abort();
    const ctrl = new AbortController();
    catAbortRef.current = ctrl;

    fetch(CATS_URL, {
      ...withFrontendKey(),
      signal: ctrl.signal,
      cache: "no-store",
    })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status)))
      )
      .then((data: Category[]) => {
        setCategories(
          (data || []).filter((c) => (c.status ?? "visible") === "visible")
        );
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [CATS_URL]);

  // rotate banners unless user prefers reduced motion; pause when tab hidden
  useEffect(() => {
    if (prefersReducedMotion) return;
    if (!desktopImages.length) return;

    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id) return;
      id = setInterval(() => {
        setDesktopIndex((prev) => (prev + 1) % desktopImages.length);
      }, 4000);
    };
    const stop = () => {
      if (!id) return;
      clearInterval(id);
      id = null;
    };
    const onVis = () =>
      document.visibilityState === "visible" ? start() : stop();

    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [desktopImages.length, prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) return;
    if (!mobileImages.length) return;

    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id) return;
      id = setInterval(() => {
        setMobileIndex((prev) => (prev + 1) % mobileImages.length);
      }, 4000);
    };
    const stop = () => {
      if (!id) return;
      clearInterval(id);
      id = null;
    };
    const onVis = () =>
      document.visibilityState === "visible" ? start() : stop();

    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [mobileImages.length, prefersReducedMotion]);

  // Contact items memoized to avoid churn
  const contactItems = useMemo(
    () => [
      {
        icon: <FaWhatsapp className="text-[#014C3D] text-[44px]" aria-hidden="true" />,
        title: "WhatsApp",
        value: "+971 50 279 3948",
        href: "https://wa.me/971502793948",
        color: "#014C3D",
        label: "Chat on WhatsApp at +971 50 279 3948",
      },
      {
        icon: <FaPhoneAlt className="text-[#00B7FF] text-[44px]" aria-hidden="true" />,
        title: "Call",
        value: "+971 54 539 6249",
        href: "tel:+971545396249",
        color: "#00B7FF",
        label: "Call +971 54 539 6249",
      },
      {
        icon: (
          <FaMapMarkerAlt className="text-[#891F1A] text-[44px]" aria-hidden="true" />
        ),
        title: "Find Us",
        value: "Naif – Deira – Dubai",
        href: "https://maps.google.com/?q=Naif+Deira+Dubai",
        color: "#891F1A",
        label: "Open location: Naif – Deira – Dubai",
      },
      {
        icon: (
          <FaEnvelopeOpenText
            className="text-[#E6492D] text-[44px]"
            aria-hidden="true"
          />
        ),
        title: "Email",
        value: "ccaddxb@gmail.com",
        href: "mailto:ccaddxb@gmail.com",
        color: "#E6492D",
        label: "Send email to ccaddxb@gmail.com",
      },
    ],
    []
  );

  // Grid math for last row centering in 4-col layout
  const { remainder, lastRowStart } = useMemo(() => {
    const COLS = 4;
    const rem = categories.length % COLS;
    return {
      remainder: rem,
      lastRowStart: rem === 0 ? -1 : categories.length - rem,
    };
  }, [categories.length]);

  // ids for a11y
  const nameId  = useId();
  const phoneId = useId();
  const emailId = useId();

  // ───────────────────────────
  // Event Callback Form with inline expansion
  const [draft, setDraft] = useState<CallbackDraft>({
    full_name: "",
    email: "",
    phone: "",
    event_type: "",
    preferred_callback: "",
    event_venue: "",
    event_datetime: "",
    estimated_guests: "",
    budget: "",
    theme: "",
    notes: "",
  });

  const [showMore, setShowMore] = useState(false);

  // Phone validation: UAE-first, fall back to generic international
  const isValidPhone = (v: string) => {
    const clean = v.trim();
    const uae = /^(?:\+971|0)(?:50|52|54|55|56|58|2|3|4|6|7|9)\d{7}$/; // 9 digits after prefix
    const intl = /^\+?[0-9 ()\-]{7,20}$/;
    return uae.test(clean) || intl.test(clean);
  };

  // Preferred callback must be at least 7 days before event date (if event date exists)
  const validateSevenDaysRule = (preferredISO: string, eventISO?: string) => {
    if (!eventISO) return true;
    const pref = new Date(preferredISO);
    const evt  = new Date(eventISO);
    if (isNaN(pref.getTime()) || isNaN(evt.getTime())) return true; // don't block on unparsable
    const ms7d = 7 * 24 * 60 * 60 * 1000;
    return evt.getTime() - pref.getTime() >= ms7d;
  };

  const onChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target as HTMLInputElement;
    setDraft((d) => ({ ...d, [name]: value }));
  };

  const toast = (text: string, isError = false) =>
    Toastify({
      text,
      duration: 3500,
      gravity: "top",
      position: "right",
      style: {
        background: isError
          ? "linear-gradient(to right, #e53935, #e35d5b)"
          : "linear-gradient(to right, #00b09b, #96c93d)",
      },
    }).showToast();

  const saveCallback = async () => {
    // client validation
    if (!draft.full_name.trim()) return toast("Full Name is required.", true);
    if (!isValidPhone(draft.phone)) return toast("Enter a valid phone number.", true);
    if (!draft.event_type.trim()) return toast("Enter an event type.", true);
    if (!draft.preferred_callback) return toast("Select preferred call-back date & time.", true);
    if (!validateSevenDaysRule(draft.preferred_callback, draft.event_datetime))
      return toast("Preferred call-back must be at least 7 days before the event.", true);

    const payload = {
      device_uuid: getDeviceUUID(),
      username: draft.full_name,
      email: draft.email || "",
      phone_number: draft.phone,
      event_type: draft.event_type,
      event_venue: draft.event_venue || "",
      approx_guest: draft.estimated_guests || "",
      status: "pending",
      event_datetime: normalizeDateTimeLocal(draft.event_datetime || ""),
      budget: draft.budget || "",
      preferred_callback: normalizeDateTimeLocal(draft.preferred_callback),
      theme: draft.theme || "",
      notes: draft.notes || "",
    };

    try {
      const res = await fetch(SAVE_URL, {
        method: "POST",
        ...withFrontendKey({
          headers: {
            "Content-Type": "application/json",
            ...(FRONTEND_KEY ? { "X-Frontend-Key": FRONTEND_KEY } : {}),
          },
        }),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        return toast(msg, true);
      }

      toast("Request submitted. We’ll call you back.");
      setIsSubmitted(true);
      setDraft({
        full_name: "",
        email: "",
        phone: "",
        event_type: "",
        preferred_callback: "",
        event_venue: "",
        event_datetime: "",
        estimated_guests: "",
        budget: "",
        theme: "",
        notes: "",
      });
      setShowMore(false);
      setTimeout(() => setIsSubmitted(false), 3500);
    } catch (e) {
      toast("Could not submit. Try again.", true);
    }
  };

  // helper: safe index read
  const getAt = (arr: string[], idx: number, fallback: string) =>
    arr.length ? arr[Math.max(0, Math.min(idx, arr.length - 1))] : fallback;

  // Compute first-load hero candidates
  const desktopHeroSrc = getAt(desktopImages, desktopIndex, FALLBACK_HERO_DESKTOP);
  const mobileHeroSrc  = getAt(mobileImages,  mobileIndex,  FALLBACK_HERO_MOBILE);

  // Simple native <img> banner (bypasses next/image/SafeImage quirks)
  const ImgHero = ({
    src,
    alt,
    width,
    height,
    className,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    className?: string;
  }) => (
    <img
      alt={alt}
      src={src}
      width={width}
      height={height}
      className={className}
      loading="eager"
      decoding="async"
      style={{ maxWidth: "100%", height: "auto" }}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).src = FALLBACK_HERO_DESKTOP;
      }}
    />
  );

  return (
    <>
      {/* SEO + Social + Discoverability */}
      <Head>
        <title>
          Creative Connect — Printing &amp; Design Services in Dubai | Fast Turnaround
        </title>
        <meta
          name="description"
          content="Premium printing and design services in Dubai: business cards, banners, signage, and custom branding. Fast turnaround and quality you can trust."
        />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href="https://www.creativeconnect.ae/" />
        {/* Open Graph */}
        <meta property="og:title" content="Creative Connect — Printing & Design" />
        <meta
          property="og:description"
          content="Premium printing and design services in Dubai with fast turnaround."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.creativeconnect.ae/" />
        <meta property="og:image" content="/images/Banner3.jpg" />
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Creative Connect — Printing & Design" />
        <meta
          name="twitter:description"
          content="Premium printing and design services in Dubai with fast turnaround."
        />
        <meta name="twitter:image" content="/images/Banner3.jpg" />
        {/* Preconnects */}
        {API_BASE_URL ? (
          <>
            <link rel="preconnect" href={API_BASE_URL} />
            <link rel="dns-prefetch" href={API_BASE_URL} />
          </>
        ) : null}
      </Head>

      <main
        className="flex flex-col bg-white font-normal"
        style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}
      >
        {/* HEADER / NAV */}
        <header role="banner">
          <Header />
          <LogoSection />
          <nav aria-label="Primary">
            <Navbar />
          </nav>
          <MobileTopBar />
        </header>

        {/* Page title for SEO/A11y (visually hidden) */}
        <h1 className="sr-only">
          Creative Connect — Printing &amp; Design Services in Dubai
        </h1>

        {/* HERO — TEMP: native <img> to guarantee render in prod */}
        <section aria-label="Hero banners" className="w-full">
          {/* Desktop */}
          <div className="hidden sm:block">
            <ImgHero
              alt="Featured promotions and services for desktop visitors"
              src={desktopHeroSrc}
              width={1440}
              height={400}
              className="w-full h-auto mx-auto"
            />
          </div>

          {/* Mobile */}
          <div className="block sm:hidden">
            <ImgHero
              alt="Featured promotions and services for mobile visitors"
              src={mobileHeroSrc}
              width={768}
              height={300}
              className="w-full h-auto object-cover mx-auto"
            />
          </div>
        </section>

        {/* CAROUSELS */}
        <section aria-label="Featured products carousel">
          <Carousel />
        </section>

        {/* Banners below can keep SafeImg */}
        <SafeImg
          height="250"
          sizes="100vw"
          src="/images/Banner3.jpg"
          alt="Seasonal offer banner"
          className="block bg-[#D9D9D9] w-full h-auto mx-auto"
          decoding="async"
          loading="lazy"
        />

        {/* CATEGORIES */}
        <section
          className="sm:px-6 lg:px-10 py-8"
          aria-labelledby="categories-heading"
        >
          <h2
            id="categories-heading"
            className="text-[#891F1A] text-lg sm:text-3xl font-semibold text-center mb-6"
          >
            Discover our categories
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-7 mb-6 w-full px-4 sm:px-0">
            {categories.map((category, i) => {
              const formattedUrl = `/home/${slugify(category.name)}`;

              let offsetClass = "";
              const COLS = 4;
              const rem = categories.length % COLS;
              const lastRowStart = rem === 0 ? -1 : categories.length - rem;
              if (rem === 1 && i === lastRowStart) {
                offsetClass = "sm:col-start-2 sm:col-span-1";
              } else if (rem === 2 && i === lastRowStart) {
                offsetClass = "sm:col-start-2";
              }

              return (
                <div key={category.id} className={offsetClass}>
                  <article>
                    <Link
                      href={formattedUrl}
                      className="flex flex-col items-center hover:scale-105 transition-transform duration-300"
                      aria-label={`Open category: ${category.name}`}
                    >
                      {/* 4:3 ratio container via wrapperClassName (prevents CLS) */}
                      <SafeImg
                        src={joinUrl(API_BASE_URL || "", category.image)}
                        alt={category.name}
                        className="absolute inset-0 w-full h-full object-contain"
                        wrapperClassName="relative w-full h-0 pb-[75%] overflow-hidden rounded-lg bg-white"
                        decoding="async"
                        loading="lazy"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 240px"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/images/img1.jpg";
                        }}
                      />
                      <h3 className="mt-2 text-xs sm:text-lg font-normal sm:font-bold text-[#333] text-center">
                        {category.name}
                      </h3>
                    </Link>
                  </article>
                </div>
              );
            })}
          </div>
        </section>

        <SafeImg
          height="250"
          sizes="100vw"
          src="/images/Banner2.jpg"
          alt="Quality printing banner"
          className="block bg-[#D9D9D9] w-full h-auto"
          decoding="async"
          loading="lazy"
        />

        <section aria-label="Secondary carousel">
          <SecondCarousel />
        </section>
        <section aria-label="Customer reviews">
          <Reviews />
        </section>

        {/* CTA */}
        <section
          className="flex flex-col lg:flex-row lg:items-start items-center px-4 sm:px-6 lg:px-10 xl:px-12 py-12 lg:gap-10 xl:gap-12 mx:auto"
          aria-labelledby="cta-heading"
        >
          {/* Left: text + form */}
          <div className="flex-1 w-full lg:max-w-2xl xl:max-w-3xl">
            <p className="text-[#837E8C] text-sm font-normal mb-2">Call To Action</p>

            <h2
              id="cta-heading"
              className="text-[#0E0E0E] text-3xl sm:text-4xl font-semibold leading-tight mb-4"
            >
              Let&apos;s Bring Your Ideas to Life
            </h2>

            <p className="text-[#868686] font-normal lg:max-w-2xl xl:max-w-3xl">
              Scelerisque in dolor donec neque velit. Risus aenean integer elementum
              odio sed adipiscing. Sem id scelerisque nunc quis. Imperdiet nascetur
              consequat.
            </p>

            {/* Event-based Callback form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveCallback();
              }}
              className="mt-10 space-y-6 w-full lg:max-w-2xl xl:max-w-3xl"
              aria-label="Request a callback"
              noValidate
            >
              {/* Required set */}
              <div>
                <label htmlFor={nameId} className="block text-sm font-normal text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  id={nameId}
                  name="full_name"
                  required
                  placeholder="Enter your full name"
                  autoComplete="name"
                  aria-required="true"
                  className="w-full border border-gray-300 rounded-md p-3 text-gray-700 bg-white font-normal"
                  value={draft.full_name}
                  onChange={onChange}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor={emailId} className="block text-sm font-normal text-gray-700 mb-1">
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    id={emailId}
                    name="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    className="w-full border border-gray-300 rounded-md p-3 text-gray-700 bg-white font-normal"
                    value={draft.email || ""}
                    onChange={onChange}
                  />
                </div>

                <div>
                  <label htmlFor={phoneId} className="block text-sm font-normal text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    id={phoneId}
                    name="phone"
                    required
                    placeholder="e.g. +971 50 123 4567"
                    autoComplete="tel"
                    inputMode="tel"
                    className="w-full border border-gray-300 rounded-md p-3 text-gray-700 bg-white font-normal"
                    value={draft.phone}
                    onChange={onChange}
                    onBlur={(e) => {
                      if (!isValidPhone(e.currentTarget.value)) {
                        e.currentTarget.setCustomValidity("Enter a valid phone number");
                      } else {
                        e.currentTarget.setCustomValidity("");
                      }
                    }}
                  />
                </div>
              </div>

              {/* Event type — TEXT INPUT */}
              <div>
                <label className="block text-sm font-normal text-gray-700 mb-1">
                  Event Type
                </label>
                <input
                  type="text"
                  name="event_type"
                  required
                  placeholder="e.g. Marriage, Birthday, Corporate gala"
                  className="w-full border border-gray-300 rounded-md p-3 bg-white text-gray-700"
                  value={draft.event_type}
                  onChange={onChange}
                  aria-required="true"
                />
              </div>

              <div>
                <label className="block text-sm font-normal text-gray-700 mb-1">
                  Preferred Call-Back Date &amp; Time
                </label>
                <input
                  type="datetime-local"
                  name="preferred_callback"
                  required
                  className="w-full border border-gray-300 rounded-md p-3 bg-white text-gray-700"
                  value={draft.preferred_callback}
                  onChange={onChange}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Must be at least a week before the event date (if provided).
                </p>
              </div>

              {/* Inline expansion */}
              {showMore && (
                <div id="more-details" className="mt-4 space-y-4 border-t pt-4">
                  <div>
                    <label className="block text-sm font-normal text-gray-700 mb-1">
                      Event Venue (optional)
                    </label>
                    <input
                      type="text"
                      name="event_venue"
                      placeholder="Venue / Location"
                      className="w-full border border-gray-300 rounded-md p-3 text-black"
                      value={draft.event_venue || ""}
                      onChange={onChange}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-normal text-gray-700 mb-1">
                        Event Date &amp; Time (optional)
                      </label>
                      <input
                        type="datetime-local"
                        name="event_datetime"
                        className="w-full border border-gray-300 rounded-md p-3 text-black"
                        value={draft.event_datetime || ""}
                        onChange={onChange}
                        onBlur={(e) => {
                          if (
                            draft.preferred_callback &&
                            !validateSevenDaysRule(draft.preferred_callback, e.currentTarget.value)
                          ) {
                            e.currentTarget.setCustomValidity("Callback must be ≥ 7 days before event");
                          } else {
                            e.currentTarget.setCustomValidity("");
                          }
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-normal text-gray-700 mb-1">
                        Estimated Guests (optional)
                      </label>
                      <input
                        type="number"
                        min={1}
                        name="estimated_guests"
                        placeholder="e.g. 120"
                        className="w-full border border-gray-300 rounded-md p-3 text-black"
                        value={draft.estimated_guests || ""}
                        onChange={onChange}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-normal text-gray-700 mb-1">
                        Budget Range (optional)
                      </label>
                      <input
                        type="text"
                        name="budget"
                        placeholder="e.g. AED 5,000 – 8,000"
                        className="w-full border border-gray-300 rounded-md p-3 text-black"
                        value={draft.budget || ""}
                        onChange={onChange}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-normal text-gray-700 mb-1">
                        Theme / style (optional)
                      </label>
                      <input
                        type="text"
                        name="theme"
                        placeholder="e.g. Minimal, Golden, Neon"
                        className="w-full border border-gray-300 rounded-md p-3 text-black"
                        value={draft.theme || ""}
                        onChange={onChange}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-normal text-gray-700 mb-1">
                      Notes (optional)
                    </label>
                    <textarea
                      name="notes"
                      rows={4}
                      placeholder="Tell us anything else that helps"
                      className="w-full border border-gray-300 rounded-md p-3 text-black"
                      value={draft.notes || ""}
                      onChange={onChange}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
<div className="flex flex-col sm:flex-row items-stretch gap-3 sm:gap-3 w-full max-w-full">
  <button
    type="submit"
    className="w-full sm:w-auto whitespace-nowrap bg-[#891F1A] text-white px-4 sm:px-6 py-3 rounded-md hover:bg-[#6f1814] transition font-medium text-sm sm:text-base"
    aria-busy={isSubmitted}
  >
    Request a Call Back
  </button>

  <button
    type="button"
    onClick={() => setShowMore((v) => !v)}
    className="w-full sm:w-auto whitespace-nowrap bg-white border border-[#891F1A] text-[#891F1A] px-4 sm:px-6 py-3 rounded-md hover:bg-[#f7eceb] transition font-medium text-sm sm:text-base"
    aria-expanded={showMore}
    aria-controls="more-details"
  >
    {showMore ? "Hide details" : "Add more detail"}
  </button>
</div>


              {/* Live region for submission feedback */}
              <p role="status" aria-live="polite" className="sr-only">
                {isSubmitted ? "Request submitted. We will call you back soon." : ""}
              </p>
            </form>
          </div>

          {/* Right: image */}
          <aside
            className="max-w-[520px] w-full h-[600px] bg-[#8B8491] rounded-xl self-end lg:self-auto lg:ml-auto"
            aria-hidden="true"
          />
        </section>

        <div className="w-full bg-white h-[100px]" aria-hidden="true" />

        {/* CONTACT INFO */}
        <section
          className="bg-[#FAFAFA] px-4 sm:px-6 lg:px-24 py-8"
          aria-labelledby="contact-heading"
        >
          <h2 id="contact-heading" className="sr-only">
            Contact information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {contactItems.map((item, index) => (
              <a
                key={index}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col items-center sm:items-start transition-all duration-300 font-medium"
                aria-label={item.label}
              >
                <div className="flex items-center gap-4">
                  {item.icon}
                  <div>
                    <h3 className="text-[28px] font-medium" style={{ color: item.color }}>
                      {item.title}
                    </h3>
                    <p className="text-[16px] font-normal" style={{ color: item.color }}>
                      {item.value}
                    </p>
                  </div>
                </div>
                <div
                  className="mt-2 w-0 group-hover:w-24 h-[2px] transition-all duration-300"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
              </a>
            ))}
          </div>
        </section>

        <footer role="contentinfo">
          <Footer />
        </footer>

        <ChatBot />
      </main>
    </>
  );
}
