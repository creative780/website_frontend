'use client';

import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
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
    slug?: string; // if your backend returns it
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
  headers.set('X-Frontend-Key', FRONTEND_KEY);
  return { ...init, headers };
};

const norm = (s?: string | number) =>
  (s ?? '').toString().trim().toLowerCase();

export default function SecondCarousel() {
  const [carouselRaw, setCarouselRaw] = useState<CarouselDataRaw>({ title: '', description: '', images: [] });
  const [navCats, setNavCats] = useState<NavCat[]>([]);
  const [loading, setLoading] = useState(true);

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

// Fetch nav + carousel (nav first, because URLs depend on it)
useEffect(() => {
  const baseUrl = `${API_BASE_URL}`.replace(/\/+$/, '');
  const controller = new AbortController();
  const { signal } = controller;

  (async () => {
    try {
      // Use allSettled so an abort doesn't throw; also avoid caching in dev.
      const [navResSettle, carResSettle] = await Promise.allSettled([
        fetch(`${baseUrl}/api/show_nav_items/?_=${Date.now()}`, withFrontendKey({ signal, cache: 'no-store' })),
        fetch(`${baseUrl}/api/second-carousel/?_=${Date.now()}`, withFrontendKey({ signal, cache: 'no-store' })),
      ]);

      // If the effect was cleaned up, bail before touching state.
      if (signal.aborted) return;

      // Handle results only if fulfilled; ignore AbortError rejections.
      if (navResSettle.status === 'fulfilled' && carResSettle.status === 'fulfilled') {
        const [navJson, carJson] = await Promise.all([
          navResSettle.value.json(),
          carResSettle.value.json(),
        ]);

        setNavCats(Array.isArray(navJson) ? navJson : []);
        setCarouselRaw({
          title: carJson?.title || '',
          description: carJson?.description || '',
          images: Array.isArray(carJson?.images)
            ? carJson.images.map((img: any, i: number) => {
                const raw = typeof img?.src === 'string' ? img.src : '';
                const src = raw.startsWith('http') ? raw : `${baseUrl}${raw.startsWith('/') ? '' : '/'}${raw}`;

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
            : [],
        });
      } else {
        // If either was rejected:
        // - ignore AbortError
        // - log real errors
        const reasons = [navResSettle, carResSettle]
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map(r => r.reason)
          .filter((e: any) => e?.name !== 'AbortError');

        if (reasons.length) {
          console.error('❌ Failed to fetch nav/carousel:', reasons);
          setCarouselRaw(prev => ({ ...prev, images: [] }));
        }
      }
    } catch (err: any) {
      // Belt & suspenders
      if (err?.name === 'AbortError') return;
      console.error('❌ Unexpected fetch error:', err);
      if (!signal.aborted) setCarouselRaw(prev => ({ ...prev, images: [] }));
    } finally {
      // Don’t flip state after unmount/abort.
      if (!signal.aborted) setLoading(false);
    }
  })();

  return () => controller.abort('component unmounted');
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

        // Prefer id key if present
        if (sub?.id != null) map.set(`id:${norm(sub.id)}`, { catUrl, subUrl });

        // Also index by name + url slug for resilience
        if (sub?.name) map.set(`name:${norm(sub.name)}`, { catUrl, subUrl });
        map.set(`url:${norm(subUrl)}`, { catUrl, subUrl });
      }
    }

    return map;
  }, [navCats]);

  // Resolve each image's click URL strictly via nav mapping
  const displayImages = useMemo(() => {
    return carouselRaw.images.map((img) => {
      const sid = norm(img.subcategory?.id);
      const sname = norm(img.subcategory?.name);
      const sslug = norm(img.subcategory?.slug);

      let route = subToRoute.get(`id:${sid}`) ||
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

  const scrollLeft = () => setCurrentIndex((prev) => Math.max(0, prev - 1));
  const scrollRight = () => setCurrentIndex((prev) => Math.min(maxIndex, prev + 1));

  return (
    <section
      style={{ fontFamily: 'var(--font-poppins), Arial, Helvetica, sans-serif' }}
      className="w-full py-3 px-1 md:px-0 flex flex-col items-center font-normal"
    >
      <header className="text-center w-3/4 m-0">
        <h1 className="text-[#891F1A] text-2xl sm:text-3xl font-semibold text-center mb-2">{carouselRaw.title}</h1>
        <p className="text-[#757575] text-sm font-normal ">{carouselRaw.description}</p>
      </header>

      <div className="relative w-[calc(100%-30px)] sm:-mt-20 ">
        {/* viewport */}
        <div ref={viewportRef} className="overflow-hidden px-[6px] sm:px-[10px] md:px-[14px]">
          {hasImages && !loading ? (
            <div
              ref={trackRef}
              className="flex items-end gap-[10px] transition-transform duration-300 ease-in-out will-change-transform"
              style={{ width: cardWidth > 0 ? undefined : '100%' }}
            >
              {displayImages.map((item, index) => (
                <Link
                  key={`${item.src}-${index}`}
                  href={item.href}
                  prefetch={true}
                  className="flex-shrink-0 rounded-[10px] overflow-hidden scroll-snap-start group"
                  style={{ width: `${cardWidth}px` }}
                  aria-label={`Go to ${item.title || 'subcategory'} page`}
                >
                  <div className="w-full aspect-square overflow-hidden rounded-t-md flex items-end cursor-pointer">
                    <SafeImg
                      src={item.src}
                      loading={index < ITEMS_PER_VIEW ? 'eager' : 'lazy'}
                      decoding="async"
                      alt={item.title || 'Carousel image'}
                      onError={(e) => (e.currentTarget.src = '/images/img1.jpg')}
                      className="object-contain w-full h-auto transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  </div>

                  {(item.title || item.caption) && (
                    <div className="py-2 flex justify-between items-start gap-2">
                      <div className="flex-1">
                        {item.title && (
                          <h3 className="text-sm font-medium text-[#333] text-center">
                            {item.title}
                          </h3>
                        )}
                        {item.caption && (
                          <p className="text-xs font-normal text-[#666] text-center">
                            {item.caption}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className="w-full flex items-center justify-center" />
          )}
        </div>
      </div>

      {/* Pagination & Controls */}
      {hasImages && (
        <nav className="flex flex-col items-center gap-4" aria-label="carousel navigation">
          {totalPages > 1 && (
            <div className="flex gap-2">
              {Array.from({ length: totalPages }).map((_, index) => (
                <span
                  key={index}
                  className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    index === currentPage ? 'bg-[#891F1A]' : 'bg-[#D9D9D9] border border-[#891F1A]'
                  }`}
                  aria-label={`Page ${index + 1}`}
                />
              ))}
            </div>
          )}

          <div className="flex gap-6 mt-2">
            <button
              onClick={scrollLeft}
              disabled={currentIndex === 0}
              aria-label="Scroll left"
              className="w-10 h-10 bg-white border-2 border-[#891F1A] text-[#891F1A] rounded-full flex items-center justify-center hover:bg-[#891F1A] hover:text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              <FaChevronLeft />
            </button>
            <button
              onClick={scrollRight}
              disabled={currentIndex >= maxIndex}
              aria-label="Scroll right"
              className="w-10 h-10 bg-white border-2 border-[#891F1A] text-[#891F1A] rounded-full flex items-center justify-center hover:bg-[#891F1A] hover:text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              <FaChevronRight />
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}
