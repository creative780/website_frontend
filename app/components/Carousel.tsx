'use client';

import React, { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { API_BASE_URL } from '../utils/api';
import { SafeImg } from './SafeImage';

interface CarouselImageRaw {
  src: string;
  title: string;
  caption: string;
  subcategory?: {
    id?: string;
    name?: string;
    slug?: string;
  };
}

interface CarouselDataRaw {
  title: string;
  description: string;
  images: CarouselImageRaw[];
}

interface NavSub {
  id?: string | number;
  name: string;
  url: string;
}

interface NavCat {
  id?: string | number;
  name: string;
  url: string;
  subcategories?: NavSub[];
}

const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set('X-Frontend-Key', FRONTEND_KEY);
  headers.set('Accept', 'application/json');
  return { ...init, headers, cache: 'no-store' };
};

const norm = (s?: string | number) => (s ?? '').toString().trim().toLowerCase();

export default function FirstCarousel() {
  const [carouselRaw, setCarouselRaw] = useState<CarouselDataRaw>({
    title: '',
    description: '',
    images: [],
  });
  const [navCats, setNavCats] = useState<NavCat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Slider state
  const [currentIndex, setCurrentIndex] = useState(0);
  const ITEMS_PER_VIEW = 4;
  const GAP_PX = 10;

  const [cardWidth, setCardWidth] = useState<number>(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const total = carouselRaw.images.length;
  const maxIndex = Math.max(total - ITEMS_PER_VIEW, 0);
  const hasImages = total > 0;
  const totalPages = hasImages ? Math.ceil(total / ITEMS_PER_VIEW) : 0;
  const currentPage = hasImages ? Math.floor(currentIndex / ITEMS_PER_VIEW) : 0;

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fetch nav + carousel (nav first, because URLs depend on it)
  useEffect(() => {
    const baseUrl = `${API_BASE_URL}`.replace(/\/+$/, '');
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [navRes, carRes] = await Promise.all([
          fetch(`${baseUrl}/api/show_nav_items/?_=${Date.now()}`, withFrontendKey({ signal })),
          fetch(`${baseUrl}/api/first-carousel/?_=${Date.now()}`, withFrontendKey({ signal })),
        ]);

        if (signal.aborted) return;

        // NAV
        if (navRes.ok) {
          const navJson = await navRes.json();
          setNavCats(Array.isArray(navJson) ? navJson : []);
        } else {
          setNavCats([]);
        }

        // CAROUSEL
        if (carRes.ok) {
          const carJson = await carRes.json();
          const images = Array.isArray(carJson?.images)
            ? carJson.images.map((img: any, i: number) => {
                const raw = typeof img?.src === 'string' ? img.src : '';
                const src = raw.startsWith('http')
                  ? raw
                  : `${baseUrl}${raw.startsWith('/') ? '' : '/'}${raw}`;

                const sub = img?.subcategory ?? img?.category ?? {};
                const subObj = {
                  id: sub?.id != null ? String(sub.id) : undefined,
                  name: sub?.name != null ? String(sub.name) : undefined,
                  slug: sub?.slug != null ? String(sub.slug) : undefined,
                };

                return {
                  src,
                  title: img?.title || `Product ${i + 1}`,
                  caption: img?.caption || '',
                  subcategory: subObj,
                } as CarouselImageRaw;
              })
            : [];

          setCarouselRaw({
            title: carJson?.title || '',
            description: carJson?.description || '',
            images,
          });
        } else {
          setCarouselRaw((prev) => ({ ...prev, images: [] }));
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.error('❌ Carousel fetch error:', err);
        setError('Failed to load carousel.');
        setCarouselRaw((prev) => ({ ...prev, images: [] }));
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  // Build fast lookup for subcategory → {catUrl, subUrl}
  const subToRoute = useMemo(() => {
    const map = new Map<string, { catUrl: string; subUrl: string }>();
    for (const cat of navCats || []) {
      const catUrl = (cat?.url ?? '').toString().replace(/^\/+|\/+$/g, '');
      const subs = Array.isArray(cat?.subcategories) ? cat.subcategories : [];
      for (const sub of subs) {
        const subUrl = (sub?.url ?? '').toString().replace(/^\/+|\/+$/g, '');
        if (!catUrl || !subUrl) continue;

        if (sub?.id != null) map.set(`id:${norm(sub.id)}`, { catUrl, subUrl });
        if (sub?.name) map.set(`name:${norm(sub.name)}`, { catUrl, subUrl });
        map.set(`url:${norm(subUrl)}`, { catUrl, subUrl });
      }
    }
    return map;
  }, [navCats]);

  // Resolve each image's click URL via nav mapping
  const displayImages = useMemo(() => {
    return carouselRaw.images.map((img) => {
      const sid = norm(img.subcategory?.id);
      const sname = norm(img.subcategory?.name);
      const sslug = norm(img.subcategory?.slug);

      const route =
        subToRoute.get(`id:${sid}`) ||
        subToRoute.get(`url:${sslug}`) ||
        subToRoute.get(`name:${sname}`);

      const href = route ? `/home/${route.catUrl}/${route.subUrl}` : '/home';
      return {
        src: img.src,
        title: img.title,
        caption: img.caption,
        href,
      };
    });
  }, [carouselRaw.images, subToRoute]);

  // Clamp index if data changes
  useEffect(() => {
    setCurrentIndex((prev) => Math.min(prev, maxIndex));
  }, [maxIndex]);

  // Measure viewport and compute card width
  useLayoutEffect(() => {
    const measure = () => {
      if (!viewportRef.current) return;
      const viewportWidth = viewportRef.current.clientWidth;
      const totalGap = GAP_PX * (ITEMS_PER_VIEW - 1);
      const w = Math.max(Math.floor((viewportWidth - totalGap) / ITEMS_PER_VIEW), 0);
      setCardWidth(w);
    };

    measure();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && viewportRef.current) {
      ro = new ResizeObserver(measure);
      ro.observe(viewportRef.current);
    } else {
      window.addEventListener('resize', measure);
    }

    return () => {
      if (ro && viewportRef.current) ro.unobserve(viewportRef.current);
      else window.removeEventListener('resize', measure);
    };
  }, []);

  // Translate track when index or cardWidth changes
  useEffect(() => {
    if (!trackRef.current) return;
    const offset = currentIndex * (cardWidth + GAP_PX);
    trackRef.current.style.transform = `translateX(-${offset}px)`;
  }, [currentIndex, cardWidth]);

  const scrollLeft = useCallback(() => setCurrentIndex((prev) => Math.max(0, prev - 1)), []);
  const scrollRight = useCallback(
    () => setCurrentIndex((prev) => Math.min(maxIndex, prev + 1)),
    [maxIndex]
  );
  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(0, Math.min(totalPages - 1, page));
      setCurrentIndex(clamped * ITEMS_PER_VIEW);
    },
    [totalPages]
  );

  // Keyboard controls on the viewport
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!hasImages) return;
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          scrollLeft();
          break;
        case 'ArrowRight':
          e.preventDefault();
          scrollRight();
          break;
        case 'Home':
          e.preventDefault();
          setCurrentIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setCurrentIndex(maxIndex);
          break;
        default:
          break;
      }
    },
    [hasImages, scrollLeft, scrollRight, maxIndex]
  );

  const carouselId = 'first-carousel';

  return (
    <section
      style={{ fontFamily: 'var(--font-poppins), Arial, Helvetica, sans-serif' }}
      className="w-full py-3 px-1 md:px-0 flex flex-col items-center font-normal"
      aria-labelledby={`${carouselId}-title`}
    >
      <header className="text-center w-3/4 m-0">
        <h2
          id={`${carouselId}-title`}
          className="text-[#891F1A] text-2xl sm:text-3xl font-semibold text-center mb-2"
        >
          {carouselRaw.title}
        </h2>
        <p className="text-[#757575] text-sm font-normal ">{carouselRaw.description}</p>
      </header>

      <div className="relative w-[calc(100%-30px)] sm:-mt-20">
        {/* viewport */}
        <div
          ref={viewportRef}
          className="overflow-hidden px-[6px] sm:px-[10px] md:px-[14px] outline-none"
          role="region"
          aria-roledescription="carousel"
          aria-label={carouselRaw.title || 'Product carousel'}
          aria-live="polite"
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          {hasImages && !loading ? (
            <div
              ref={trackRef}
              className={
                'flex items-end gap-[10px] will-change-transform ' +
                (prefersReducedMotion ? '' : 'transition-transform duration-300 ease-in-out')
              }
              style={{ width: cardWidth > 0 ? undefined : '100%' }}
              aria-atomic="false"
            >
              {displayImages.map((item, index) => (
                <Link
                  key={`${item.src}-${index}`}
                  href={item.href}
                  prefetch
                  className="flex-shrink-0 rounded-[10px] overflow-hidden group focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  style={{ width: `${cardWidth}px` }}
                  aria-label={`Go to ${item.title || 'subcategory'} page`}
                >
                  <div className="w-full aspect-square overflow-hidden rounded-t-md flex items-end">
                    <SafeImg
                      src={item.src}
                      // Eager-load first viewport set for better LCP
                      loading={index < ITEMS_PER_VIEW ? 'eager' : 'lazy'}
                      decoding="async"
                      width="600"
                      height="600"
                      alt={item.title || 'Carousel image'}
                      onError={(e) => (e.currentTarget.src = '/images/img1.jpg')}
                      className="object-contain w-full h-auto"
                    />
                  </div>

                  {(item.title || item.caption) && (
                    <div className="py-2 flex justify-between items-start gap-2">
                      <div className="flex-1 text-center">
                        {item.title && (
                          <h3 className="text-sm font-medium text-[#333]">{item.title}</h3>
                        )}
                        {item.caption && (
                          <p className="text-xs font-normal text-[#666]">{item.caption}</p>
                        )}
                      </div>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            // Lightweight skeleton to stabilize layout (reduces CLS)
            <div className="w-full flex items-center justify-center">
              <div className="grid grid-cols-4 gap-[10px] w-full">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-[10px] bg-gray-100 animate-pulse"
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pagination & Controls */}
      {hasImages && (
        <nav className="flex flex-col items-center gap-4 mt-2" aria-label="carousel navigation">
          {totalPages > 1 && (
            <div className="flex gap-2" role="group" aria-label="Slide pages">
              {Array.from({ length: totalPages }).map((_, index) => {
                const active = index === currentPage;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => goToPage(index)}
                    className={`w-3 h-3 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${
                      active ? 'bg-[#891F1A]' : 'bg-[#D9D9D9] border border-[#891F1A]'
                    }`}
                    aria-label={`Go to page ${index + 1}`}
                    aria-pressed={active}
                  />
                );
              })}
            </div>
          )}

          <div className="flex gap-6">
            <button
              type="button"
              onClick={scrollLeft}
              disabled={currentIndex === 0}
              aria-label="Scroll left"
              className="w-10 h-10 bg-white border-2 border-[#891F1A] text-[#891F1A] rounded-full flex items-center justify-center hover:bg-[#891F1A] hover:text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <FaChevronLeft />
            </button>
            <button
              type="button"
              onClick={scrollRight}
              disabled={currentIndex >= maxIndex}
              aria-label="Scroll right"
              className="w-10 h-10 bg-white border-2 border-[#891F1A] text-[#891F1A] rounded-full flex items-center justify-center hover:bg-[#891F1A] hover:text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <FaChevronRight />
            </button>
          </div>
        </nav>
      )}

      {/* SR-only live update for page status */}
      <p className="sr-only" aria-live="polite">
        {hasImages ? `Page ${currentPage + 1} of ${totalPages}` : loading ? 'Loading carousel…' : error || 'No items'}
      </p>
    </section>
  );
}
