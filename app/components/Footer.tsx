"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { API_BASE_URL } from "../utils/api";
import { SafeImg } from "./SafeImage";

/* ──────────────────────────────────────────────────────────
   Static
   ────────────────────────────────────────────────────────── */
const SERVICES = [
  "Digital Printing",
  "Offset Printing",
  "Raised UV | Spot UV",
  "Embossing | Debossing",
  "Foiling | Raised Foiling",
  "Large Format Printing",
  "Direct to Film Printing",
  "Sublimation",
  "UV Printing",
  "Screen Printing",
] as const;

type NavCategory = { id?: string | number; name: string; url: string };

const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

const LOCAL_LOGO_FALLBACK = "/images/logowhite.png";
const normalizeLogoUrl = (u?: string) => {
  const v = (u || "").trim();
  if (!v) return LOCAL_LOGO_FALLBACK;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (v.startsWith("/")) return `${API_BASE_URL}${v}`;
  if (v.startsWith("media/") || v.startsWith("uploads/")) return `${API_BASE_URL}/${v}`;
  return LOCAL_LOGO_FALLBACK;
};

/* ──────────────────────────────────────────────────────────
   Map config (center locked to fixed coords)
   ────────────────────────────────────────────────────────── */
const LOCATION = { lat: 25.204849, lng: 55.270783 }; // TODO: replace with exact coords
const PLACE_LABEL = "Creative Connect Advertising LLC, Dubai";
const MIN_ZOOM = 8;
const MAX_ZOOM = 20;
const DEFAULT_ZOOM = 14;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z || DEFAULT_ZOOM));
const getEmbedSrc = (lat: number, lng: number, zoom: number) =>
  `https://www.google.com/maps?q=${lat},${lng}&z=${clampZoom(zoom)}&output=embed`;

// Proper full map URL with query coordinates + label (shareable & deep-linkable)
const getFullMapUrl = (lat: number, lng: number, zoom: number, label?: string) => {
  const q = encodeURIComponent(label || `${lat},${lng}`);
  const z = clampZoom(zoom);
  return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=&center=${lat}%2C${lng}&zoom=${z}`;
};

/* ──────────────────────────────────────────────────────────
   Lightweight inline icons (drop react-icons to cut JS)
   ────────────────────────────────────────────────────────── */
const Icon = {
  Facebook: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path fill="currentColor" d="M22 12.06C22 6.48 17.52 2 11.94 2S2 6.48 2 12.06c0 4.99 3.66 9.13 8.44 9.94v-7.03H7.9v-2.9h2.54V9.41c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.77l-.44 2.9H13.6V22c4.78-.81 8.4-4.95 8.4-9.94Z"/></svg>
  ),
  TwitterX: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path fill="currentColor" d="M18.244 2H21l-6.5 7.43L22 22h-6.828l-4.77-6.23L4.8 22H2l7.02-8.02L2 2h6.914l4.37 5.8L18.244 2Zm-1.196 18h1.984L7.03 4H5.01l12.038 16Z"/></svg>
  ),
  Instagram: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path fill="currentColor" d="M12 2.2c3.2 0 3.583.012 4.85.07 1.17.055 1.802.248 2.223.413.56.217.96.477 1.38.897.42.42.68.82.897 1.38.165.421.358 1.053.413 2.223.058 1.267.07 1.65.07 4.85s-.012 3.583-.07 4.85c-.055 1.17-.248 1.802-.413 2.223a3.92 3.92 0 0 1-.897 1.38 3.92 3.92 0 0 1-1.38.897c-.421.165-1.053.358-2.223.413-1.267.058-1.65.07-4.85.07s-3.583-.012-4.85-.07c-1.17-.055-1.802-.248-2.223-.413a3.92 3.92 0 0 1-1.38-.897 3.92 3.92 0 0 1-.897-1.38c-.165-.421-.358-1.053-.413-2.223C2.212 15.583 2.2 15.2 2.2 12s.012-3.583.07-4.85c.055-1.17.248-1.802.413-2.223.217-.56.477-.96.897-1.38.42-.42.82-.68 1.38-.897.421-.165 1.053-.358 2.223-.413C8.417 2.212 8.8 2.2 12 2.2Zm0 1.8c-3.157 0-3.53.012-4.772.069-.99.045-1.527.212-1.883.353-.474.184-.812.403-1.168.758-.355.356-.574.694-.758 1.168-.141.356-.308.893-.353 1.883-.057 1.242-.069 1.615-.069 4.772s.012 3.53.069 4.772c.045.99.212 1.527.353 1.883.184.474.403.812.758 1.168.356.355.694.574 1.168.758.356.141.893.308 1.883.353 1.242.057 1.615.069 4.772.069s3.53-.012 4.772-.069c.99-.045 1.527-.212 1.883-.353.474-.184.812-.403 1.168-.758.355-.356.574-.694.758-1.168.141-.356.308-.893.353-1.883.057-1.242.069-1.615.069-4.772s-.012-3.53-.069-4.772c-.045-.99-.212-1.527-.353-1.883a3.02 3.02 0 0 0-.758-1.168 3.02 3.02 0 0 0-1.168-.758c-.356-.141-.893-.308-1.883-.353-1.242-.057-1.615-.069-4.772-.069Zm0 2.8a6.2 6.2 0 1 1 0 12.4 6.2 6.2 0 0 1 0-12.4Zm0 1.8a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8Zm5.9-2.2a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Z"/></svg>
  ),
  Linkedin: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path fill="currentColor" d="M6.94 6.5a2.44 2.44 0 1 1 0-4.88 2.44 2.44 0 0 1 0 4.88ZM2.75 22h4.38V7.94H2.75V22Zm7.28 0h4.2v-7.29c0-1.93.73-3.24 2.3-3.24 1.2 0 1.88.82 1.88 2.35V22h4.2v-8.23c0-3.94-2.1-5.77-4.92-5.77-2.28 0-3.29 1.28-3.85 2.17h.04V7.94H10.03c.06 1.34 0 14.06 0 14.06Z"/></svg>
  ),
};

/* ──────────────────────────────────────────────────────────
   Component
   ────────────────────────────────────────────────────────── */
export default function Footer() {
  const [openCols, setOpenCols] = useState<{ [key: string]: boolean }>({
    services: false,
    map: true,
  });

  // Persist Map toggle (avoid TBT spikes: run after paint)
  useEffect(() => {
    let mounted = true;
    try {
      const saved = window.localStorage.getItem("footerMapOpen");
      if (saved === "false" && mounted) setOpenCols((p) => ({ ...p, map: false }));
      if (saved === "true" && mounted) setOpenCols((p) => ({ ...p, map: true }));
    } catch {}
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("footerMapOpen", String(openCols.map));
    } catch {}
  }, [openCols.map]);

  const toggleDropdown = useCallback(
    (key: string) => setOpenCols((prev) => ({ ...prev, [key]: !prev[key] })),
    []
  );

  // Categories (cached in sessionStorage to reduce network spam)
  const [categories, setCategories] = useState<NavCategory[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const baseUrl = `${API_BASE_URL}`.replace(/\/+$/, "");
    const CACHE_KEY = "footer_cats_v1";

    const hydrate = async () => {
      // 1) Lightweight read from session cache
      try {
        const cached = window.sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          setCategories(JSON.parse(cached));
        }
      } catch {}

      // 2) Fresh fetch (no blocking the main thread; small JSON)
      try {
        const res = await fetch(`${baseUrl}/api/show_nav_items/`, withFrontendKey({ signal: controller.signal, cache: "no-store" }));
        const data = res.ok ? await res.json() : null;
        const cats: NavCategory[] = Array.isArray(data)
          ? data
              .map((cat: any) => ({
                id: cat?.id,
                name: String(cat?.name ?? "").trim(),
                url: String(cat?.url ?? "").replace(/^\/+|\/+$/g, ""),
              }))
              .filter((c) => c.name && c.url)
              .slice(0, 8)
          : [];
        setCategories(cats);
        try {
          window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(cats));
        } catch {}
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          // eslint-disable-next-line no-console
          console.error("Error fetching categories:", err);
        }
      }
    };

    // Defer network until idle to avoid competing with LCP
    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(hydrate, { timeout: 2000 });
    } else {
      setTimeout(hydrate, 0);
    }

    return () => controller.abort();
  }, []);

  const midPoint = useMemo(() => Math.ceil(categories.length / 2), [categories.length]);
  const firstCol = useMemo(() => categories.slice(0, midPoint), [categories, midPoint]);
  const secondCol = useMemo(() => categories.slice(midPoint), [categories, midPoint]);

  // Logo
  const [logoUrl, setLogoUrl] = useState<string>(LOCAL_LOGO_FALLBACK);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        // Defer logo fetch; footer is below the fold in most cases
        const fetcher = async () => {
          const res = await fetch(`${API_BASE_URL}/api/show-logo/`, withFrontendKey({ cache: "no-store" }));
          const json = res.ok ? await res.json() : null;
          const url = normalizeLogoUrl(json?.logo?.url);
          if (!cancelled) setLogoUrl(url);
        };
        if ("requestIdleCallback" in window) {
          (window as any).requestIdleCallback(fetcher, { timeout: 1500 });
        } else {
          setTimeout(fetcher, 0);
        }
      } catch {
        if (!cancelled) setLogoUrl(LOCAL_LOGO_FALLBACK);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Services slugs (precomputed)
  const servicesWithSlugs = useMemo(
    () =>
      SERVICES.map((s) => ({
        label: s,
        href: `/services/${s.toLowerCase().replace(/[\s|]+/g, "-")}`,
      })),
    []
  );

  // Category href builder
  const catHref = useCallback((cat: NavCategory) => `/home/${String(cat.url).replace(/^\/+/, "")}`, []);

  // Map state
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const iframeSrc = useMemo(() => getEmbedSrc(LOCATION.lat, LOCATION.lng, zoom), [zoom]);
  const fullMapUrl = useMemo(() => getFullMapUrl(LOCATION.lat, LOCATION.lng, zoom, PLACE_LABEL), [zoom]);
  const incZoom = useCallback(() => setZoom((z) => clampZoom(z + 1)), []);
  const decZoom = useCallback(() => setZoom((z) => clampZoom(z - 1)), []);

  // IDs for a11y on collapsibles
  const servicesPanelId = "footer-services-panel";
  const mapPanelId = "footer-map-panel";

  return (
    <footer
      style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}
      className="bg-[#791A16] text-white font-normal text-sm" // slightly darker for stronger contrast
      role="contentinfo"
    >
      {/* ===================== Top Grid ===================== */}
      <div className="container mx-auto px-5 py-16 flex flex-wrap md:flex-nowrap gap-y-10">
        {/* Column 1: Logo + Company Info */}
        <div className="w-full md:w-1/5 flex flex-col pr-5">
          <SafeImg
            src={logoUrl}
            alt="Creative Connect logo"
            width={240}
            height={80}
            loading="lazy"
            decoding="async"
            className="object-contain mb-3"
            onError={(e) => (e.currentTarget.src = LOCAL_LOGO_FALLBACK)}
          />
          <p className="text-sm leading-relaxed font-normal text-white/90">
            Creative Connect Advertising LLC — fast, accessible, and print-perfect.
          </p>
        </div>

        {/* Column 2 & 3: Categories */}
        {categories.length > 0 && (
          <div className="w-full md:w-2/5 px-4 flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <h2 className="font-semibold tracking-widest text-sm mb-3 uppercase">Categories</h2>
              <ul className="space-y-2">
                {firstCol.map((cat, idx) => (
                  <li key={`f-cat-${cat.id ?? idx}`}>
                    <Link
                      href={catHref(cat)}
                      prefetch={false}
                      className="hover:underline font-normal focus:outline-none focus:ring-2 focus:ring-white/60 rounded"
                      aria-label={`Go to ${cat.name}`}
                    >
                      {cat.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {secondCol.length > 0 && (
              <div className="flex-1">
                <h2 className="sr-only">Categories Column 2</h2>
                <ul className="space-y-2">
                  {secondCol.map((cat, idx) => (
                    <li key={`s-cat-${cat.id ?? idx}`}>
                      <Link
                        href={catHref(cat)}
                        prefetch={false}
                        className="hover:underline font-normal focus:outline-none focus:ring-2 focus:ring-white/60 rounded"
                        aria-label={`Go to ${cat.name}`}
                      >
                        {cat.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Column 4: Services (Toggle) */}
        <div className="w-full md:w-1/5 px-4">
          <button
            onClick={() => toggleDropdown("services")}
            className="flex items-center gap-2 font-medium tracking-widest text-sm mb-3 uppercase focus:outline-none focus:ring-2 focus:ring-white/60 rounded"
            aria-expanded={openCols.services}
            aria-controls={servicesPanelId}
            type="button"
          >
            <span aria-hidden>{openCols.services ? "▾" : "▸"}</span>
            <span>Services</span>
          </button>
          <div
            id={servicesPanelId}
            className={`transition-[max-height,margin] duration-300 overflow-hidden ${
              openCols.services ? "max-h-[500px] mt-1" : "max-h-0"
            }`}
          >
            <ul className="space-y-2 ml-6">
              {servicesWithSlugs.map((srv) => (
                <li key={srv.href}>
                  <Link
                    href={srv.href}
                    prefetch={false}
                    className="hover:underline font-normal focus:outline-none focus:ring-2 focus:ring-white/60 rounded"
                    aria-label={`Service: ${srv.label}`}
                  >
                    {srv.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Column 5: Map (Toggle) */}
        <div className="w-full md:w-1/5 px-4">
          <button
            onClick={() => toggleDropdown("map")}
            className="flex items-center gap-2 font-medium tracking-widest text-sm mb-3 uppercase focus:outline-none focus:ring-2 focus:ring-white/60 rounded"
            aria-expanded={openCols.map}
            aria-controls={mapPanelId}
            type="button"
          >
            <span aria-hidden>{openCols.map ? "▾" : "▸"}</span>
            <span>Map</span>
          </button>

          {/* Map Content */}
          <div
            id={mapPanelId}
            className={`transition-[max-height,margin] duration-300 overflow-hidden ${
              openCols.map ? "max-h-[900px] mt-1" : "max-h-0"
            }`}
          >
            {/* Map card */}
            <div className="relative ml-0 rounded-xl overflow-hidden shadow-lg ring-1 ring-white/10 transition-transform duration-200 will-change-transform hover:scale-[1.02]">
              {/* Click-to-open overlay link (kept below controls) */}
              <a
                href={fullMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open full Google Maps"
                className="absolute inset-0 z-10"
                title="Open in Google Maps"
              />

              {/* Zoom controls */}
              <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    incZoom();
                  }}
                  aria-label="Zoom in"
                  className="w-10 h-10 rounded-lg bg-black/65 backdrop-blur text-white text-lg leading-none grid place-items-center hover:bg-black/75 active:scale-95 focus:outline-none focus:ring-2 focus:ring-white/70"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    decZoom();
                  }}
                  aria-label="Zoom out"
                  className="w-10 h-10 rounded-lg bg-black/65 backdrop-blur text-white text-lg leading-none grid place-items-center hover:bg-black/75 active:scale-95 focus:outline-none focus:ring-2 focus:ring-white/70"
                >
                  –
                </button>
              </div>

              {/* Map iframe (fixed height to avoid CLS; pointer-events disabled for overlay link) */}
              <iframe
                title="Creative Connect office location"
                src={iframeSrc}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="w-full h-44 md:h-56 lg:h-64 pointer-events-none"
              />

              {/* Footer strip */}
              <div className="absolute bottom-0 inset-x-0 z-20 bg-black/45 backdrop-blur px-3 py-2 text-xs flex items-center justify-between">
                <span className="truncate" aria-label="Place label">
                  {PLACE_LABEL}
                </span>
                <span className="ml-2 shrink-0" aria-label="Current zoom level">
                  Zoom: {zoom}
                </span>
              </div>
            </div>

            {/* Quick action links */}
            <div className="flex items-center gap-3 mt-3">
              <a
                href={fullMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-white hover:text-white"
              >
                Open in Google Maps
              </a>
              <button
                type="button"
                onClick={() => setZoom(DEFAULT_ZOOM)}
                className="text-white hover:text-white/95 focus:outline-none focus:ring-2 focus:ring-white/60 rounded px-1"
                aria-label="Reset zoom"
              >
                Reset zoom
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===================== Divider ===================== */}
      <div className="bg-white/15 h-px mx-5 my-2" />

      {/* ===================== Bottom Bar ===================== */}
      <div className="container mx-auto px-5 py-4 flex flex-col sm:flex-row justify-between items-center">
        <p className="text-[#F3EFEE] text-sm text-center sm:text-left font-light">
          © 2025 Creative Connect — All rights reserved.
        </p>

        <nav aria-label="Social links" role="navigation" className="flex gap-4 mt-2 sm:mt-0 text-white text-lg">
          <a
            href="https://www.facebook.com/creativeconnectuae/"
            className="hover:text-gray-200 font-normal focus:outline-none focus:ring-2 focus:ring-white/60 rounded"
            aria-label="Facebook"
            title="Facebook"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon.Facebook className="w-5 h-5" />
          </a>
          <a
            href="https://x.com/"
            className="hover:text-gray-200 font-normal focus:outline-none focus:ring-2 focus:ring-white/60 rounded"
            aria-label="Twitter / X"
            title="Twitter / X"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon.TwitterX className="w-5 h-5" />
          </a>
          <a
            href="https://www.instagram.com/creativeconnectuae/"
            className="hover:text-gray-200 font-normal focus:outline-none focus:ring-2 focus:ring-white/60 rounded"
            aria-label="Instagram"
            title="Instagram"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon.Instagram className="w-5 h-5" />
          </a>
          <a
            href="https://www.linkedin.com/company/creative-connect-advertising-llc/"
            className="hover:text-gray-200 font-normal focus:outline-none focus:ring-2 focus:ring-white/60 rounded"
            aria-label="LinkedIn"
            title="LinkedIn"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon.Linkedin className="w-5 h-5" />
          </a>
        </nav>
      </div>

      <div className="pb-4" />
    </footer>
  );
}
