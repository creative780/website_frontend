"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
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
// Frontend key helper (kept local; not exported)
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
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

// Heavy sections → Next dynamic (keeps TTI lower)
const Carousel = dynamic(() => import("../components/Carousel"), {
  loading: () => <div aria-hidden="true" />,
});
const Reviews = dynamic(() => import("../components/reviews"), {
  loading: () => <div aria-hidden="true" />,
});
const SecondCarousel = dynamic(
  () => import("../components/second_carousel"),
  { loading: () => <div aria-hidden="true" /> }
);

type Category = {
  id: number | string;
  name: string;
  image: string;
  status?: string;
};

export default function PrintingServicePage() {
  const fallbackImage =
    "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/ZfQW3qI2ok/ymeg8jht_expires_30_days.png";

  const [desktopImages, setDesktopImages] = useState<string[]>([fallbackImage]);
  const [mobileImages, setMobileImages] = useState<string[]>([fallbackImage]);
  const [desktopIndex, setDesktopIndex] = useState(0);
  const [mobileIndex, setMobileIndex] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);

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
  const catAbortRef = useRef<AbortController | null>(null);

  // Fetch hero banners
  useEffect(() => {
    heroAbortRef.current?.abort();
    const ctrl = new AbortController();
    heroAbortRef.current = ctrl;

    fetch(`${API_BASE_URL}/api/hero-banner/`, {
      ...withFrontendKey(),
      signal: ctrl.signal,
      cache: "no-store", // keep behavior
    })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status)))
      )
      .then((data) => {
        const all: any[] = data?.images || [];
        const desktop = all
          .filter((img) => img.device_type === "desktop")
          .map((img) => img.url);
        const mobile = all
          .filter((img) => img.device_type === "mobile")
          .map((img) => img.url);
        const mid = Math.ceil(all.length / 2);

        setDesktopImages(
          desktop.length
            ? desktop
            : all.slice(0, mid).map((img) => img.url) || [fallbackImage]
        );
        setMobileImages(
          mobile.length
            ? mobile
            : all.slice(mid).map((img) => img.url) || [fallbackImage]
        );
        setDesktopIndex(0);
        setMobileIndex(0);
      })
      .catch(() => {
        // Silent fallback
        setDesktopImages([fallbackImage]);
        setMobileImages([fallbackImage]);
        setDesktopIndex(0);
        setMobileIndex(0);
      });

    return () => ctrl.abort();
  }, []);

  // Fetch categories (visible only)
  useEffect(() => {
    catAbortRef.current?.abort();
    const ctrl = new AbortController();
    catAbortRef.current = ctrl;

    fetch(`${API_BASE_URL}/api/show-categories/`, {
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
      .catch(() => {
        // no-op; empty grid is fine
      });

    return () => ctrl.abort();
  }, []);

  // rotate banners unless user prefers reduced motion
  useEffect(() => {
    if (prefersReducedMotion) return;
    if (!desktopImages.length) return;
    const id = setInterval(() => {
      setDesktopIndex((prev) => (prev + 1) % desktopImages.length);
    }, 4000);
    return () => clearInterval(id);
  }, [desktopImages.length, prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) return;
    if (!mobileImages.length) return;
    const id = setInterval(() => {
      setMobileIndex((prev) => (prev + 1) % mobileImages.length);
    }, 4000);
    return () => clearInterval(id);
  }, [mobileImages.length, prefersReducedMotion]);

  // Contact items memoized to avoid churn
  const contactItems = useMemo(
    () => [
      {
        icon: (
          <FaWhatsapp className="text-[#014C3D] text-[44px]" aria-hidden="true" />
        ),
        title: "WhatsApp",
        value: "+971 50 279 3948",
        href: "https://wa.me/971502793948",
        color: "#014C3D",
        label: "Chat on WhatsApp at +971 50 279 3948",
      },
      {
        icon: (
          <FaPhoneAlt className="text-[#00B7FF] text-[44px]" aria-hidden="true" />
        ),
        title: "Call",
        value: "+971 54 539 6249",
        href: "tel:+971545396249",
        color: "#00B7FF",
        label: "Call +971 54 539 6249",
      },
      {
        icon: (
          <FaMapMarkerAlt
            className="text-[#891F1A] text-[44px]"
            aria-hidden="true"
          />
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

  // ids for inputs (stable, a11y)
  const nameId = useId();
  const phoneId = useId();
  const messageId = useId();
  const phoneHintId = useId();

  // Form submit (stable reference)
  const handleSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitted(true);

    Toastify({
      text: "We'll call you back soon.",
      duration: 3000,
      gravity: "top",
      position: "right",
      backgroundColor: "linear-gradient(to right, #00b09b, #96c93d)",
    }).showToast();

    e.currentTarget.reset();
    window.setTimeout(() => setIsSubmitted(false), 4000);
  }, []);

  // helper: safe index read
  const getAt = (arr: string[], idx: number, fallback: string) =>
    arr.length ? arr[Math.max(0, Math.min(idx, arr.length - 1))] : fallback;

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
        {/* Preconnects (minor perf wins) */}
        <link rel="preconnect" href={API_BASE_URL} />
        <link rel="dns-prefetch" href={API_BASE_URL} />
        {/* JSON-LD: Organization + Website */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Creative Connect",
              url: "https://www.creativeconnect.ae/",
              logo: "https://www.creativeconnect.ae/images/logo.png",
              sameAs: [
                "https://www.facebook.com/",
                "https://www.instagram.com/",
                "https://www.linkedin.com/",
              ],
              address: {
                "@type": "PostalAddress",
                addressLocality: "Dubai",
                streetAddress: "Naif – Deira",
                addressCountry: "AE",
              },
              contactPoint: [
                {
                  "@type": "ContactPoint",
                  telephone: "+971502793948",
                  contactType: "customer service",
                  areaServed: "AE",
                  availableLanguage: ["English", "Arabic"],
                },
              ],
            }),
          }}
        />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              url: "https://www.creativeconnect.ae/",
              potentialAction: {
                "@type": "SearchAction",
                target:
                  "https://www.creativeconnect.ae/search?q={search_term_string}",
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
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

        {/* HERO */}
        <section aria-label="Hero banners">
          <SafeImg
            loading="eager"
            fetchPriority="high"
            width="1440"
            height="400"
            src={getAt(desktopImages, desktopIndex, fallbackImage)}
            alt="Featured promotions and services for desktop visitors"
            className="hidden sm:block w-full h-auto mx-auto"
          />
          <SafeImg
            loading="lazy"
            width="768"
            height="300"
            src={getAt(mobileImages, mobileIndex, fallbackImage)}
            alt="Featured promotions and services for mobile visitors"
            className="block sm:hidden w-full h-auto object-cover mx-auto"
          />
        </section>

        {/* CAROUSELS */}
        <section aria-label="Featured products carousel">
          <Carousel />
        </section>

        <SafeImg
          height="250"
          src="/images/Banner3.jpg"
          alt="Seasonal offer banner"
          className="block bg-[#D9D9D9] w-full h-auto mx-auto"
          decoding="async"
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
              if (remainder === 1 && i === lastRowStart) {
                offsetClass = "sm:col-start-2 sm:col-span-1";
              } else if (remainder === 2 && i === lastRowStart) {
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
                      {/* 4:3 ratio container via wrapperClassName */}
                      <SafeImg
                        src={`${API_BASE_URL}${category.image}`}
                        alt={category.name}
                        className="absolute inset-0 w-full h-full object-contain"
                        wrapperClassName="relative w-full h-0 pb-[75%] overflow-hidden rounded-lg bg-white"
                        decoding="async"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            "/images/img1.jpg";
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
          src="/images/Banner2.jpg"
          alt="Quality printing banner"
          className="block bg-[#D9D9D9] w-full h-auto"
          decoding="async"
        />

        <section aria-label="Secondary carousel">
          <SecondCarousel />
        </section>
        <section aria-label="Customer reviews">
          <Reviews />
        </section>

        {/* CTA */}
        <section
          className="flex flex-col lg:flex-row items-center sm:px-6 lg:px-12 xl:px-10 py-12"
          aria-labelledby="cta-heading"
        >
          <div className="flex-1">
            <p className="text-[#837E8C] text-sm font-normal mb-2">Call To Action</p>
            <h2
              id="cta-heading"
              className="text-[#0E0E0E] text-3xl sm:text-4xl font-semibold leading-tight mb-4"
            >
              Let&apos;s Bring Your Ideas to Life
            </h2>
            <p className="text-[#868686] max-w-xl font-normal">
              Scelerisque in dolor donec neque velit. Risus aenean integer elementum
              odio sed adipiscing. Sem id scelerisque nunc quis. Imperdiet nascetur
              consequat.
            </p>

            {/* Callback Form */}
            <form
              onSubmit={handleSubmit}
              className="mt-10 space-y-6 max-w-xl"
              aria-label="Request a callback"
              noValidate
            >
              <div>
                <label htmlFor={nameId} className="block text-sm font-normal text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  id={nameId}
                  name="name"
                  required
                  placeholder="Enter your full name"
                  autoComplete="name"
                  aria-required="true"
                  className="w-full border border-gray-300 rounded-md p-3 text-gray-700 bg-white font-normal"
                />
              </div>

              <div className="mt-6">
                <label htmlFor={phoneId} className="block text-sm font-normal text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id={phoneId}
                  name="phone"
                  required
                  placeholder="e.g. +971-50-123-4567"
                  autoComplete="tel"
                  inputMode="tel"
                  pattern="^\+?[0-9\-\s()]{7,}$"
                  aria-required="true"
                  aria-describedby={phoneHintId}
                  className="w-full border border-gray-300 rounded-md p-3 text-gray-700 bg-white font-normal"
                />
                <p id={phoneHintId} className="sr-only">
                  Enter a valid phone number with country code.
                </p>
              </div>

              <div>
                <label htmlFor={messageId} className="block text-sm font-normal text-gray-700 mb-1">
                  Message
                </label>
                <textarea
                  id={messageId}
                  name="message"
                  rows={4}
                  required
                  placeholder="Briefly tell us what this is about"
                  autoComplete="off"
                  aria-required="true"
                  className="w-full border border-gray-300 rounded-md p-3 text-gray-700 bg-white font-normal"
                />
              </div>

              <div className="flex justify-start">
                <button
                  type="submit"
                  className="bg-[#891F1A] text-white px-8 py-3 rounded-md hover:bg-[#6f1814] transition font-medium"
                  aria-busy={isSubmitted}
                >
                  Send Request
                </button>
              </div>

              {/* Live region for submission feedback */}
              <p role="status" aria-live="polite" className="sr-only">
                {isSubmitted ? "Request submitted. We will call you back soon." : ""}
              </p>
            </form>
          </div>

          <aside
            className="w-full mr-[10px] sm:w-[500px] h-[600px] bg-[#8B8491] rounded-xl"
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
