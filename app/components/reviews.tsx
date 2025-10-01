"use client";

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useId,
} from "react";
import SafeImage from "./SafeImage";
import { API_BASE_URL } from "../utils/api";

/* ---------- FRONTEND KEY (avoid setting when empty to reduce preflight) ---------- */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();

const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  // Enable browser caching of API responses; server should send cache headers.
  return { ...init, headers, cache: "force-cache", credentials: "omit", mode: "cors" };
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

/** Lightweight inline chevrons to avoid pulling react-icons */
function ChevronLeft(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
      <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
    </svg>
  );
}
function ChevronRight(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
      <path d="M8.59 16.59 10 18l6-6-6-6-1.41 1.41L13.17 12z" fill="currentColor" />
    </svg>
  );
}

export default function CustomerReviews() {
  const sectionId = useId();
  const listId = useId();

  const scrollRef = useRef<HTMLDivElement>(null);
  const rAF = useRef<number | null>(null);

  const [scrollIndex, setScrollIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);

  // 3 cards desktop, 2 tablet, 1 mobile
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
          `${API_BASE_URL}/api/show-testimonials/?all=1`,
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

        // Published first, newest first
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
  const pageWidthPx = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return 0;
    // compute using container width to avoid magic 300px numbers
    return container.clientWidth;
  }, []);

  const jumpTo = useCallback(
    (index: number) => {
      const container = scrollRef.current;
      if (!container) return;
      const pw = Math.max(1, pageWidthPx());
      const maxLeft = container.scrollWidth - container.clientWidth;
      const left = Math.min(maxLeft, Math.max(0, index * pw));

      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      container.scrollTo({
        left,
        behavior: prefersReduced ? "auto" : "smooth",
      });
      setScrollIndex(index);
    },
    [pageWidthPx]
  );

  const scroll = useCallback(
    (direction: "left" | "right") => {
      const newIndex =
        direction === "left" ? Math.max(0, scrollIndex - 1) : Math.min(totalPages - 1, scrollIndex + 1);
      jumpTo(newIndex);
    },
    [jumpTo, scrollIndex, totalPages]
  );

  // Keep scrollIndex in sync when user drags/scrolls manually.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const onScroll = () => {
      if (rAF.current != null) return;
      rAF.current = requestAnimationFrame(() => {
        rAF.current = null;
        const pw = Math.max(1, pageWidthPx());
        const idx = Math.round(container.scrollLeft / pw);
        if (idx !== scrollIndex) setScrollIndex(idx);
      });
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (rAF.current) cancelAnimationFrame(rAF.current);
    };
  }, [pageWidthPx, scrollIndex]);

  /* -------------------------- Early-out (no data) --------------------------- */
  if (!loading && testimonials.length === 0) return null;

  /* ------------------------------ Render helpers ---------------------------- */
  const stars = (n: number) => {
    const count = clampRating(n);
    return (
      <div
        className="inline-flex gap-1"
        aria-label={`${count} out of 5 stars`}
        role="img"
      >
        {Array(count)
          .fill(0)
          .map((_, i) => (
            <span key={i} aria-hidden="true" className="text-[#891F1A] text-xl font-medium">
              ★
            </span>
          ))}
      </div>
    );
  };

  const skeletonCards = Array.from({ length: Math.max(3, itemsPerPage) }).map((_, idx) => (
    <li
      key={`sk-${idx}`}
      className="relative min-w-[300px] max-w-[300px] flex-shrink-0 snap-start"
      style={{ contentVisibility: "auto", containIntrinsicSize: "420px 300px" as any }}
    >
      <article className="relative bg-white border-[2px] border-[#891F1A] rounded-2xl shadow-md px-5 pt-16 pb-6 text-left flex flex-col gap-4 overflow-visible">
        <figure
          className="absolute -top-10 w-16 h-16 rounded-full overflow-hidden shadow mt-5 border-[3px] border-[#891F1A] bg-white"
          aria-hidden="true"
        >
          <div className="w-full h-full animate-pulse bg-gray-200" />
        </figure>
        <div className="flex justify-end">
          {/* static 5 stars, aria-hidden in skeleton */}
          <div aria-hidden="true" className="inline-flex gap-1 text-[#891F1A] text-xl font-medium">★★★★★</div>
        </div>
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
          className="overflow-x-auto no-scrollbar"
          tabIndex={0}
          role="group"
          aria-roledescription="carousel"
          aria-label="Customer testimonials"
          aria-controls={listId}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") { e.preventDefault(); scroll("left"); }
            if (e.key === "ArrowRight") { e.preventDefault(); scroll("right"); }
          }}
        >
          {/* Use CSS scroll-snap so the browser handles alignment without JS work */}
          <ul
            id={listId}
            className="mt-6 flex gap-6 snap-x snap-mandatory"
            aria-live="polite"
            aria-atomic="false"
          >
            {loading
              ? skeletonCards
              : testimonials.map((t, idx) => (
                  <li
                    key={t.id ?? `row-${idx}`}
                    className="relative min-w-[300px] max-w-[300px] flex-shrink-0 snap-start"
                    style={{ contentVisibility: "auto", containIntrinsicSize: "420px 300px" as any }}
                  >
                    <article
                      className="relative bg-white border-[2px] border-[#891F1A] rounded-2xl shadow-md px-5 pt-16 pb-6 text-left flex flex-col gap-4 overflow-visible"
                      aria-label={`${t.name || "Customer"}, ${clampRating(t.rating)} star review`}
                    >
                      <figure
                        className="absolute -top-10 w-16 h-16 rounded-full overflow-hidden shadow mt-5 border-[3px] border-[#891F1A] bg-white"
                        style={{ aspectRatio: "1 / 1" }}
                      >
                        <SafeImage
                          src={t.image || "/default-avatar.jpg"}
                          alt={t.name || "Customer"}
                          width={64}
                          height={64}
                          className="object-cover w-full h-full"
                          // do not overlay to avoid paint work
                          overlay={false}
                          protect={false}
                          // @ts-ignore allow passing through if component supports it
                          loading="lazy"
                          decoding="async"
                        />
                      </figure>

                      {/* Stars */}
                      <div className="flex justify-end">{stars(t.rating || 5)}</div>

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
                className={`w-3 h-3 rounded-full transition-[transform,background-color] duration-300 ${
                  isActive ? "bg-[#891F1A] scale-110" : "bg-[#D9D9D9] border border-[#891F1A]"
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
            className="w-11 h-11 bg-white border-2 border-[#891F1A] text-[#891F1A] rounded-full flex items-center justify-center hover:bg-[#891F1A] hover:text-white transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            aria-label="Previous testimonials"
            type="button"
          >
            <ChevronLeft />
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={scrollIndex === totalPages - 1}
            className="w-11 h-11 bg-white border-2 border-[#891F1A] text-[#891F1A] rounded-full flex items-center justify-center hover:bg-[#891F1A] hover:text-white transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            aria-label="Next testimonials"
            type="button"
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        /* Reduce motion when the user asks for it */
        @media (prefers-reduced-motion: reduce) {
          .transition-colors, .transition-[transform,background-color] { transition: none !important; }
        }
      `}</style>
    </section>
  );
}
