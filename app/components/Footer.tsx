"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { FaFacebookF, FaInstagram, FaLinkedin, FaTwitter } from "react-icons/fa";
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
];

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
   Component
   ────────────────────────────────────────────────────────── */
export default function Footer() {
  const [openCols, setOpenCols] = useState<{ [key: string]: boolean }>({
    services: false,
    map: true,
  });

  // Persist Map toggle
  useEffect(() => {
    try {
      const saved = localStorage.getItem("footerMapOpen");
      if (saved === "false") setOpenCols((p) => ({ ...p, map: false }));
      if (saved === "true") setOpenCols((p) => ({ ...p, map: true }));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("footerMapOpen", String(openCols.map));
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
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          setCategories(JSON.parse(cached));
          // Warm update in background
        }
      } catch {}

      try {
        const res = await fetch(
          `${baseUrl}/api/show_nav_items/?_=${Date.now()}`,
          withFrontendKey({ signal: controller.signal, cache: "no-store" })
        );
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
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(cats));
        } catch {}
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          // eslint-disable-next-line no-console
          console.error("Error fetching categories:", err);
        }
      }
    };

    hydrate();
    return () => controller.abort();
  }, []);

  const midPoint = useMemo(() => Math.ceil(categories.length / 2), [categories.length]);
  const firstCol = useMemo(() => categories.slice(0, midPoint), [categories, midPoint]);
  const secondCol = useMemo(() => categories.slice(midPoint), [categories, midPoint]);

  // Logo
  const [logoUrl, setLogoUrl] = useState<string>(LOCAL_LOGO_FALLBACK);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/show-logo/?_=${Date.now()}`,
          withFrontendKey({ cache: "no-store" })
        );
        const json = res.ok ? await res.json() : null;
        const url = normalizeLogoUrl(json?.logo?.url);
        if (!cancelled) setLogoUrl(url);
      } catch {
        if (!cancelled) setLogoUrl(LOCAL_LOGO_FALLBACK);
      }
    })();
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
  const catHref = useCallback(
    (cat: NavCategory) => `/home/${String(cat.url).replace(/^\/+/, "")}`,
    []
  );

  // Map state
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const iframeSrc = useMemo(() => getEmbedSrc(LOCATION.lat, LOCATION.lng, zoom), [zoom]);
  const fullMapUrl = useMemo(
    () => getFullMapUrl(LOCATION.lat, LOCATION.lng, zoom, PLACE_LABEL),
    [zoom]
  );
  const incZoom = useCallback(() => setZoom((z) => clampZoom(z + 1)), []);
  const decZoom = useCallback(() => setZoom((z) => clampZoom(z - 1)), []);

  // IDs for a11y on collapsibles
  const servicesPanelId = "footer-services-panel";
  const mapPanelId = "footer-map-panel";

  return (
    <footer
      style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}
      className="bg-[#891F1A] text-white font-normal text-sm"
      role="contentinfo"
    >
      {/* ===================== Top Grid ===================== */}
      <div className="container mx-auto px-5 py-16 flex flex-wrap md:flex-nowrap gap-y-10">
        {/* Column 1: Logo + Company Info */}
        <div className="w-full md:w-1/5 flex flex-col pr-5">
          <SafeImg
            src={logoUrl}
            alt="CreativePrints Logo"
            width={240}
            height={80}
            loading="lazy"
            decoding="async"
            className="object-contain mb-3"
            onError={(e) => (e.currentTarget.src = LOCAL_LOGO_FALLBACK)}
          />
          <p className="text-sm leading-relaxed font-normal">
            Air plant banjo lyft occupy retro adaptogen indego.
          </p>
        </div>

        {/* Column 2 & 3: Categories */}
        {categories.length > 0 && (
          <div className="w-full md:w-2/5 px-4 flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <h2 className="font-semibold tracking-widest text-sm mb-3 uppercase">
                Categories
              </h2>
              <ul className="space-y-2">
                {firstCol.map((cat, idx) => (
                  <li key={`f-cat-${cat.id ?? idx}`}>
                    <Link
                      href={catHref(cat)}
                      className="hover:underline font-normal"
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
                        className="hover:underline font-normal"
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
            className="flex items-center gap-2 font-medium tracking-widest text-sm mb-3 uppercase"
            aria-expanded={openCols.services}
            aria-controls={servicesPanelId}
          >
            <span aria-hidden>{openCols.services ? "▾" : "▸"}</span>
            <span>Services</span>
          </button>
          <div
            id={servicesPanelId}
            className={`transition-all duration-300 overflow-hidden ${
              openCols.services ? "max-h-[500px] mt-1" : "max-h-0"
            }`}
          >
            <ul className="space-y-2 ml-6">
              {servicesWithSlugs.map((srv) => (
                <li key={srv.href}>
                  <Link
                    href={srv.href}
                    className="hover:underline font-normal"
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
            className="flex items-center gap-2 font-medium tracking-widest text-sm mb-3 uppercase"
            aria-expanded={openCols.map}
            aria-controls={mapPanelId}
          >
            <span aria-hidden>{openCols.map ? "▾" : "▸"}</span>
            <span>Map</span>
          </button>

          {/* Map Content */}
          <div
            id={mapPanelId}
            className={`transition-all duration-300 overflow-hidden ${
              openCols.map ? "max-h-[900px] mt-1" : "max-h-0"
            }`}
          >
            {/* Map card */}
            <div className="relative ml-0 rounded-xl overflow-hidden shadow-lg ring-1 ring-white/10 transition-transform duration-200 hover:scale-[1.02]">
              {/* Click-to-open overlay link */}
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
                  className="w-9 h-9 rounded-lg bg-black/60 backdrop-blur text-white text-lg leading-none grid place-items-center hover:bg-black/70 active:scale-95"
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
                  className="w-9 h-9 rounded-lg bg-black/60 backdrop-blur text-white text-lg leading-none grid place-items-center hover:bg-black/70 active:scale-95"
                >
                  –
                </button>
              </div>

              {/* Map iframe (fixed height classes to avoid CLS; pointer-events disabled for overlay link) */}
              <iframe
                title="Creative Connect Map"
                src={iframeSrc}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="w-full h-40 md:h-56 lg:h-64 pointer-events-none"
              />

              {/* Footer strip */}
              <div className="absolute bottom-0 inset-x-0 z-20 bg-black/40 backdrop-blur px-3 py-2 text-xs flex items-center justify-between">
                <span className="truncate">{PLACE_LABEL}</span>
                <span className="ml-2 shrink-0">Zoom: {zoom}</span>
              </div>
            </div>

            {/* Quick action links */}
            <div className="flex items-center gap-3 mt-3">
              <a
                href={fullMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-white/90 hover:text-white"
              >
                Open in Google Maps
              </a>
              <button
                type="button"
                onClick={() => setZoom(DEFAULT_ZOOM)}
                className="text-white/90 hover:text-white"
                aria-label="Reset zoom"
              >
                Reset zoom
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===================== Divider ===================== */}
      <div className="bg-white/10 h-px mx-5 my-2" />

      {/* ===================== Bottom Bar ===================== */}
      <div className="container mx-auto px-5 py-4 flex flex-col sm:flex-row justify-between items-center">
        <p className="text-[#F3EFEE] text-sm text-center sm:text-left font-light">
          © 2025 CreativePrints — All rights reserved.
        </p>
        <nav aria-label="Social links" className="flex gap-4 mt-2 sm:mt-0 text-white text-lg">
          <a
            href="https://www.facebook.com/creativeconnectuae/"
            className="hover:text-gray-300 font-normal"
            aria-label="Facebook"
            title="Facebook"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FaFacebookF />
          </a>
          <a
            href="https://x.com/"
            className="hover:text-gray-300 font-normal"
            aria-label="Twitter"
            title="Twitter / X"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FaTwitter />
          </a>
          <a
            href="https://www.instagram.com/creativeconnectuae/"
            className="hover:text-gray-300 font-normal"
            aria-label="Instagram"
            title="Instagram"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FaInstagram />
          </a>
          <a
            href="https://www.linkedin.com/company/creative-connect-advertising-llc/"
            className="hover:text-gray-300 font-normal"
            aria-label="LinkedIn"
            title="LinkedIn"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FaLinkedin />
          </a>
        </nav>
      </div>

      <div className="pb-4" />
    </footer>
  );
}
