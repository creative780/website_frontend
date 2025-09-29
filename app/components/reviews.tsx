"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo, useId } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import SafeImage from "./SafeImage";
import { API_BASE_URL } from "../utils/api";

/* ---------- FRONTEND KEY (avoid setting when empty to reduce preflight) ---------- */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers, cache: "no-store", credentials: "omit", mode: "cors" };
};

type Testimonial = {
  id?: string | number;
  name: string;
  role: string;
  image: string;
  rating: number;
  content: string;
  status?: string | "Published" | "Draft";
  created_at?: string;
  updated_at?: string;
};

function clampRating(n: number) {
  if (Number.isNaN(n)) return 5;
  return Math.max(1, Math.min(5, Math.round(n)));
}

export default function CustomerReviews() {
  const sectionId = useId();
  const listId = useId();

  const scrollRef = useRef<HTMLDivElement>(null);
  const rAF = useRef<number | null>(null);

  const [scrollIndex, setScrollIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);

  // Keep UI consistent: 3 cards per "page" on desktop, 2 on tablet, 1 on mobile
  const [itemsPerPage, setItemsPerPage] = useState(3);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(testimonials.length / itemsPerPage)),
    [testimonials.length, itemsPerPage]
  );

  /* --------------------- Fetch testimonials (with abort) --------------------- */
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/show-testimonials/?all=1&_=${Date.now()}`,
          { ...withFrontendKey({ method: "GET" }), signal: ac.signal }
        );
        if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
        const data = await res.json();

        const list: any[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
          ? data.results
          : data?.data || [];

        const mapped: Testimonial[] = list.map((t: any) => ({
          id: t.id ?? t._id ?? t.testimonial_id ?? undefined,
          name: t.name ?? "",
          role: t.role ?? "",
          image: t.image ?? "",
          rating: clampRating(Number(t.rating ?? 5)),
          content: t.content ?? "",
          status: t.status ?? (t.published ? "Published" : "Draft"),
          created_at: t.created_at,
          updated_at: t.updated_at,
        }));

        // Show published + newest first
        mapped.sort((a, b) => {
          const aPub = (a.status || "").toLowerCase() === "published" ? 1 : 0;
          const bPub = (b.status || "").toLowerCase() === "published" ? 1 : 0;
          if (aPub !== bPub) return bPub - aPub;
          const ad = Date.parse(a.updated_at || a.created_at || "") || 0;
          const bd = Date.parse(b.updated_at || b.created_at || "") || 0;
          return bd - ad;
        });

        if (!cancelled) setTestimonials(mapped);
      } catch {
        if (!cancelled) setTestimonials([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  /* ------------------------ Responsive items per page ------------------------ */
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setItemsPerPage(w < 640 ? 1 : w < 1024 ? 2 : 3);
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  /* ------------------------------ Scroll helpers ---------------------------- */
  const jumpTo = useCallback(
    (index: number) => {
      if (!scrollRef.current) return;
      const container = scrollRef.current;
      const cardWidth = 300 + 24; // min-w + gap (approx). Cards use min/max 300 and gap-6 (24px)
      const viewportCards = Math.max(1, itemsPerPage);
      const pageWidth = viewportCards * cardWidth;

      container.scrollTo({
        left: Math.min(container.scrollWidth - container.clientWidth, Math.max(0, index * pageWidth)),
        behavior: "smooth",
      });
      setScrollIndex(index);
    },
    [itemsPerPage]
  );

  const scroll = useCallback(
    (direction: "left" | "right") => {
      const newIndex =
        direction === "left" ? Math.max(0, scrollIndex - 1) : Math.min(totalPages - 1, scrollIndex + 1);
      jumpTo(newIndex);
    },
    [jumpTo, scrollIndex, totalPages]
  );

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const onScroll = () => {
      // rAF throttle for smoother updates
      if (rAF.current != null) return;
      rAF.current = requestAnimationFrame(() => {
        rAF.current = null;
        const x = container.scrollLeft;
        const cardWidth = 300 + 24;
        const viewportCards = Math.max(1, itemsPerPage);
        const pageWidth = viewportCards * cardWidth;
        const idx = Math.round(x / Math.max(1, pageWidth));
        if (idx !== scrollIndex) setScrollIndex(idx);
      });
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (rAF.current) cancelAnimationFrame(rAF.current);
    };
  }, [itemsPerPage, scrollIndex]);

  /* -------------------------- Early-out (no data) --------------------------- */
  if (!loading && testimonials.length === 0) return null;

  /* ------------------------------ Render helpers ---------------------------- */
  const stars = (n: number) =>
    Array(clampRating(n))
      .fill(0)
      .map((_, i) => (
        <span key={i} aria-hidden="true" className="text-[#891F1A] text-xl font-medium">
          ★
        </span>
      ));

  const skeletonCards = Array.from({ length: Math.max(3, itemsPerPage) }).map((_, idx) => (
    <li key={`sk-${idx}`} className="relative min-w-[300px] max-w-[300px] flex-shrink-0">
      <article className="relative bg-white border-[2px] border-[#891F1A] rounded-2xl shadow-md px-5 pt-16 pb-6 text-left flex flex-col gap-4 overflow-visible">
        <figure className="absolute -top-10 w-16 h-16 rounded-full overflow-hidden shadow mt-5 border-[3px] border-[#891F1A] bg-white">
          <div className="w-full h-full animate-pulse bg-gray-200" />
        </figure>
        <div className="flex justify-end -mt-13">{stars(5)}</div>
        <p className="text-gray-800 text-[15px] leading-relaxed font-normal">
          <span className="inline-block w-full h-4 bg-gray-200 animate-pulse rounded" />
        </p>
        <footer>
          <p className="font-bold text-[#891F1A] text-sm">
            <span className="inline-block w-32 h-3 bg-gray-200 animate-pulse rounded" />
          </p>
          <p className="text-gray-500 text-sm font-light">
            <span className="inline-block w-40 h-3 bg-gray-200 animate-pulse rounded" />
          </p>
        </footer>
      </article>
    </li>
  ));

  return (
    <section
      id={sectionId}
      aria-labelledby={`${sectionId}-title`}
      aria-describedby={`${sectionId}-desc`}
      style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}
      className="relative w-full py-20 bg-white overflow-hidden px-2 md:px-4"
      role="region"
    >
      <h2 id={`${sectionId}-title`} className="text-4xl font-semibold text-center text-[#891F1A] mb-3">
        What Our Customers Say
      </h2>

      <p id={`${sectionId}-desc`} className="text-center text-gray-500 text-lg font-normal mb-12">
        Hear from our incredible customers who are building at lightning speed.
      </p>

      <div className="relative max-w-screen-xl mx-auto">
        {/* Carousel viewport */}
        <div
          ref={scrollRef}
          className="overflow-x-auto scroll-smooth no-scrollbar"
          tabIndex={0}
          role="group"
          aria-roledescription="carousel"
          aria-label="Customer testimonials"
          aria-controls={listId}
        >
          <ul id={listId} className="mt-6 flex gap-6">
            {loading
              ? skeletonCards
              : testimonials.map((t, idx) => (
                  <li key={t.id ?? `row-${idx}`} className="relative min-w-[300px] max-w-[300px] flex-shrink-0">
                    <article
                      className="relative bg-white border-[2px] border-[#891F1A] rounded-2xl shadow-md px-5 pt-16 pb-6 text-left flex flex-col gap-4 overflow-visible"
                      aria-label={`${t.name}, ${clampRating(t.rating)} star review`}
                    >
                      <figure className="absolute -top-10 w-16 h-16 rounded-full overflow-hidden shadow mt-5 border-[3px] border-[#891F1A] bg-white">
                        <SafeImage
                          src={t.image || "/default-avatar.jpg"}
                          alt={t.name || "Customer"}
                          width={70}
                          height={70}
                          className="object-cover w-full h-full"
                          overlay={false}
                          protect={false}
                        />
                      </figure>

                      {/* Stars */}
                      <div className="flex justify-end -mt-13" aria-label={`${clampRating(t.rating)} out of 5 stars`}>
                        {stars(t.rating || 5)}
                      </div>

                      {/* Review text */}
                      <p className="text-gray-800 text-[15px] leading-relaxed font-normal">{t.content}</p>

                      <footer>
                        <p className="font-bold text-[#891F1A] text-sm">{t.name}</p>
                        <p className="text-gray-500 text-sm font-light">{t.role}</p>
                      </footer>
                    </article>
                  </li>
                ))}
          </ul>
        </div>

        {/* Pagination dots (clickable) */}
        <nav className="flex justify-center gap-2 mt-6" aria-label="Review pages">
          {Array.from({ length: totalPages }).map((_, i) => {
            const isActive = i === scrollIndex;
            return (
              <button
                key={i}
                type="button"
                aria-label={`Go to page ${i + 1}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => jumpTo(i)}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  isActive ? "bg-[#891F1A]" : "bg-[#D9D9D9] border border-[#891F1A]"
                }`}
              />
            );
          })}
        </nav>

        {/* Controls */}
        <div className="flex justify-center gap-6 mt-4">
          <button
            onClick={() => scroll("left")}
            disabled={scrollIndex === 0}
            className="w-10 h-10 bg-white border-2 border-[#891F1A] text-[#891F1A] rounded-full flex items-center justify-center hover:bg-[#891F1A] hover:text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            aria-label="Previous testimonials"
            type="button"
          >
            <FaChevronLeft aria-hidden="true" />
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={scrollIndex === totalPages - 1}
            className="w-10 h-10 bg-white border-2 border-[#891F1A] text-[#891F1A] rounded-full flex items-center justify-center hover:bg-[#891F1A] hover:text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            aria-label="Next testimonials"
            type="button"
          >
            <FaChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>

      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </section>
  );
}
