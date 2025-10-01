'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import DOMPurify from 'isomorphic-dompurify';
import { API_BASE_URL } from '../../utils/api';
import { SafeImg } from '../../components/SafeImage';

/** ==== Lazy-load strictly non-critical UI to cut LCP/TBT ==== */
const Header = dynamic(() => import('../../components/header'), { ssr: false });
const LogoSection = dynamic(() => import('../../components/LogoSection'), { ssr: false });
const Navbar = dynamic(() => import('../../components/Navbar'), { ssr: false });
const HomePageTop = dynamic(() => import('../../components/HomePageTop'), { ssr: false });
const SecondCarousel = dynamic(() => import('../../components/second_carousel'), {
  ssr: false,
  loading: () => <div aria-hidden className="h-[220px] w-full bg-gray-50" />,
});
const Footer = dynamic(() => import('../../components/Footer'), {
  ssr: false,
  loading: () => <div aria-hidden className="h-[160px] w-full bg-gray-50" />,
});
const ChatBot = dynamic(() => import('../../components/ChatBot').then((m) => m.ChatBot), { ssr: false });

/** ==== Types ==== */
interface Props {
  // Match App Router’s client entry typing: params is a Promise
  params: Promise<{ category: string }>;
}

interface Product {
  id: string;
  name: string;
  url: string;
  images: { url: string; alt_text?: string }[];
}

interface Subcategory {
  id: string | number;
  name: string;
  url: string;
  images: { url: string; alt_text?: string }[];
  products: Product[];
}

interface Category {
  id: string | number;
  name: string;
  url: string;
  images: { url: string; alt_text?: string }[];
  subcategories: Subcategory[];
  /** Enriched from /api/show-categories/ */
  description?: string;
  caption?: string;
}

interface HeroImage {
  url: string;
  device_type: 'desktop' | 'mobile' | string;
}

/** ==== Networking (adds X-Frontend-Key) ==== */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
const fetchWithKey = (url: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set('X-Frontend-Key', FRONTEND_KEY);
  headers.set('Accept', 'application/json');
  // Use default caching for GETs; avoid 'no-store' unless truly necessary
  const method = (init.method || 'GET').toUpperCase();
  const cache: RequestCache | undefined = method === 'GET' ? 'force-cache' : undefined;
  return fetch(url, { ...init, headers, cache });
};

/** ==== HTML sanitizer (safe links, no scripts/iframes) ==== */
const sanitizeHtml = (dirty: string) =>
  DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'p', 'br', 'ul', 'ol', 'li', 'span', 'a'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
    ADD_ATTR: ['rel'],
    FORBID_ATTR: ['onerror', 'onclick', 'style'],
    RETURN_TRUSTED_TYPE: false,
  }).replaceAll('<a ', '<a rel="nofollow noopener" target="_blank" ');

/** ==== Page (Client) ==== */
const CategoryPage: React.FC<Props> = ({ params }) => {
  /** ========================== HOOKS (UNCONDITIONAL) ========================== */
  // 1) Resolve params Promise into a usable slug
  const [categorySlug, setCategorySlug] = useState<string | undefined>(undefined);

  // 2) Data state
  const [categoryInfo, setCategoryInfo] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);

  // 3) Hero images state
  const [heroImages, setHeroImages] = useState<HeroImage[]>([]);
  const [desktopImages, setDesktopImages] = useState<string[]>(['/images/img1.jpg']);
  const [mobileImages, setMobileImages] = useState<string[]>(['/images/img1.jpg']);
  const [desktopIndex, setDesktopIndex] = useState(0);
  const [mobileIndex, setMobileIndex] = useState(0);

  // 4) Prefetch control
  const hasPrefetchedHeroRef = useRef(false);

  // 5) Derived
  const currentDesktopHero = desktopImages[desktopIndex];

  const categoryText = useMemo(
    () =>
      categorySlug
        ?.split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ') || '',
    [categorySlug]
  );

  // 6) Resolve slug from params
  useEffect(() => {
    let mounted = true;
    params
      .then((val) => {
        if (mounted) setCategorySlug(val?.category);
      })
      .catch(() => {
        if (mounted) setCategorySlug(undefined);
      });
    return () => {
      mounted = false;
    };
  }, [params]);

  // 7) Data fetching (guarded by slug, abort-safe)
  useEffect(() => {
    let canceled = false;
    const ctrl = new AbortController();

    // If slug not ready, show skeleton and bail early from effect body
    if (!categorySlug) {
      setLoading(true);
      setCategoryInfo(null);
      return () => {
        canceled = true;
        ctrl.abort();
      };
    }

    const fetchCategoryData = async () => {
      try {
        setLoading(true);

        const navPromise = fetchWithKey(`${API_BASE_URL}/api/show_nav_items/`, { signal: ctrl.signal });
        const heroPromise = fetchWithKey(`${API_BASE_URL}/api/hero-banner/`, { signal: ctrl.signal });
        const catsPromise = fetchWithKey(`${API_BASE_URL}/api/show-categories/`, { signal: ctrl.signal });

        const [navRes, heroRes, catsRes] = await Promise.allSettled([navPromise, heroPromise, catsPromise]);

        // --- Nav + category match ---
        if (navRes.status === 'fulfilled' && navRes.value.ok) {
          const navData: Category[] = await navRes.value.json();
          const matchedCategory =
            navData.find((cat) => cat.url?.toLowerCase() === categorySlug?.toLowerCase()) || null;

          // --- Enrich ---
          if (matchedCategory) {
            if (catsRes.status === 'fulfilled' && catsRes.value.ok) {
              const catList: Array<{
                id: string | number;
                name: string;
                description?: string;
                caption?: string;
              }> = await catsRes.value.json();

              const enriched =
                catList.find((c) => String(c.id) === String(matchedCategory.id)) ||
                catList.find((c) => c.name?.toLowerCase() === matchedCategory.name?.toLowerCase());

              const finalCat: Category = {
                ...matchedCategory,
                description: enriched?.description ?? matchedCategory.description,
                caption: enriched?.caption ?? matchedCategory.caption,
              };

              if (!canceled) setCategoryInfo(finalCat);
            } else {
              if (!canceled) setCategoryInfo(matchedCategory);
            }
          } else if (!canceled) {
            setCategoryInfo(null);
          }
        } else if (!canceled) {
          setCategoryInfo(null);
        }

        // --- Hero images ---
        if (heroRes.status === 'fulfilled' && heroRes.value.ok) {
          const data = await heroRes.value.json();
          const images: HeroImage[] = data?.images || [];
          const desktop = images.filter((i) => i.device_type === 'desktop').map((i) => i.url);
          const mobile = images.filter((i) => i.device_type === 'mobile').map((i) => i.url);

          if (!canceled) {
            if (desktop.length) setDesktopImages(desktop);
            if (mobile.length) setMobileImages(mobile);
            setHeroImages(images);
          }
        }
      } catch {
        if (!canceled) setCategoryInfo(null);
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    fetchCategoryData();
    return () => {
      canceled = true;
      ctrl.abort();
    };
  }, [categorySlug]);

  // 8) Motion-safe, memory-safe auto-advance for hero images
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || heroImages.length < 2) return;

    const interval = setInterval(() => {
      setDesktopIndex((prev) => (prev + 1) % Math.max(desktopImages.length, 1));
      setMobileIndex((prev) => (prev + 1) % Math.max(mobileImages.length, 1));
    }, 5000);

    return () => clearInterval(interval);
  }, [heroImages.length, desktopImages.length, mobileImages.length]);

  // 9) Preload current desktop hero (helps LCP)
  useEffect(() => {
    if (!currentDesktopHero || hasPrefetchedHeroRef.current) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = currentDesktopHero;
    document.head.appendChild(link);
    hasPrefetchedHeroRef.current = true;
    // keep link in head for session; don’t remove
  }, [currentDesktopHero]);

  /** ========================== DERIVED SEO BITS (SAFE ANYTIME) ========================== */
  const metaDescription =
    (categoryInfo?.caption || categoryInfo?.description || 'Explore our product range.')
      ?.toString()
      .replace(/<[^>]*>/g, '')
      .slice(0, 160) || 'Explore our product range.';

  const canonicalHref =
    typeof window !== 'undefined' ? window.location.href.split('?')[0] : `/home/${categorySlug || ''}`;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: typeof window !== 'undefined' ? `${window.location.origin}/` : '/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Categories',
        item: typeof window !== 'undefined' ? `${window.location.origin}/home` : '/home',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: categoryText || 'Category',
        item:
          typeof window !== 'undefined'
            ? `${window.location.origin}/home/${categorySlug || ''}`
            : `/home/${categorySlug || ''}`,
      },
    ],
  };

  /** ========================== UI BRANCHES (AFTER ALL HOOKS) ========================== */

  /** Early skeleton while slug resolves (prevents undefined access downstream) */
  if (!categorySlug) {
    return (
      <div className="bg-white overflow-x-hidden" style={{ fontFamily: 'var(--font-poppins), Arial, sans-serif' }}>
        <Head>
          <title>Categories</title>
          <meta name="description" content="Explore our product range." />
          <link rel="canonical" href={canonicalHref} />
        </Head>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-white focus:text-black focus:px-3 focus:py-2 focus:rounded"
        >
          Skip to main content
        </a>
        <div aria-hidden className="w-full bg-gray-100 animate-pulse" style={{ height: 'clamp(300px, 35vw, 420px)' }} />
      </div>
    );
  }

  /** Loading state (minimal CLS) */
  if (loading) {
    return (
      <div className="bg-white overflow-x-hidden" style={{ fontFamily: 'var(--font-poppins), Arial, sans-serif' }}>
        <Head>
          <title>{categoryText ? `${categoryText} · Categories` : 'Categories'}</title>
          <meta name="description" content={metaDescription} />
          <link rel="canonical" href={canonicalHref} />
        </Head>

        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-white focus:text-black focus:px-3 focus:py-2 focus:rounded"
        >
          Skip to main content
        </a>

        {/* Reserve hero space to prevent CLS */}
        <div aria-hidden className="w-full bg-gray-100 animate-pulse" style={{ height: 'clamp(300px, 35vw, 420px)' }} />
      </div>
    );
  }

  /** 404 (no category) */
  if (!categoryInfo) {
    return (
      <div
        className="bg-white overflow-x-hidden lg:overflow-y-hidden"
        style={{ fontFamily: 'var(--font-poppins), Arial, sans-serif' }}
      >
        <Head>
          <meta name="robots" content="noindex, follow" />
          <title>Page not found · Categories</title>
          <meta name="description" content="Requested page was not found." />
          <link rel="canonical" href={canonicalHref} />
          <script
            type="application/ld+json"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
          />
        </Head>

        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-white focus:text-black focus:px-3 focus:py-2 focus:rounded"
        >
          Skip to main content
        </a>

        {/* Keep header/nav lightweight while still visible after lazy loads */}
        <Header />
        <LogoSection />
        <HomePageTop />

        <main
          id="main"
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
              <span className="[-webkit-text-size-adjust:100%] [text-wrap:nowrap] font-bold -mr-2 sm:-mr-4 text-[clamp(6rem,22vw,12rem)]">
                4
              </span>
              <span className="[-webkit-text-size-adjust:100%] [text-wrap:nowrap] font-bold -mr-2 sm:-mr-4 text-[clamp(6rem,22vw,12rem)]">
                0
              </span>
              <span className="[-webkit-text-size-adjust:100%] [text-wrap:nowrap] font-bold text-[clamp(6rem,22vw,12rem)]">
                4
              </span>
            </h1>

            <p className="mx-auto max-w-xl text-sm sm:text-base text-[#891F1A] font-normal px-2">
              WE ARE SORRY, BUT THE PAGE YOU REQUESTED WAS NOT FOUND.
            </p>
            <p className="mx-auto max-w-xl text-sm sm:text-base text-[#891F1A] font-normal px-2">
              It looks like you&apos;ve navigated to the wrong URL.
            </p>

            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 w-full">
              <Link
                href="/"
                className="inline-flex justify-center rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-normal text-[#891F1A] transition hover:bg-red-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
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

  /** ==== Success UI ==== */
  const rawDescription = (categoryInfo.description || '').trim();
  const descriptionHtml = sanitizeHtml(rawDescription) || '<p>Explore our product range.</p>';
  const categoryImage = categoryInfo.images?.[0]?.url || '/images/img1.jpg';

  return (
    <div className="flex flex-col bg-white" style={{ fontFamily: 'var(--font-poppins), Arial, Helvetica, sans-serif' }}>
      <Head>
        <title>{categoryText ? `${categoryText} · Categories` : 'Categories'}</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href={canonicalHref} />
        {/* Breadcrumb JSON-LD */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
        />
      </Head>

      {/* Skip link for keyboard users */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-white focus:text-black focus:px-3 focus:py-2 focus:rounded"
      >
        Skip to main content
      </a>

      {/* Keep chrome components, but they’re lazy-loaded to shrink TBT without jarring CLS */}
      <Header />
      <LogoSection />
      <Navbar />
      <HomePageTop />

      {/* Hero wrapper reserves height to eliminate CLS; desktop first for LCP */}
      <section aria-label="Hero banner" className="w-full">
        <div className="hidden sm:block w-full mx-auto overflow-hidden" style={{ height: 'clamp(320px, 36vw, 440px)' }}>
          <SafeImg
            loading="eager"
            width="1440"
            height="440"
            src={currentDesktopHero}
            alt="Promotional hero banner for desktop"
            className="w-full h-full object-cover"
            // @ts-expect-error pass-through to <img> if SafeImg forwards props
            fetchpriority="high"
            decoding="async"
          />
        </div>

        <div className="block sm:hidden w-full mx-auto overflow-hidden" style={{ height: 'clamp(220px, 42vw, 320px)' }}>
          <SafeImg
            loading="lazy"
            width="768"
            height="320"
            src={mobileImages[mobileIndex]}
            alt="Promotional hero banner for mobile"
            className="w-full h-full object-cover"
            decoding="async"
          />
        </div>
      </section>

      {/* Main content */}
      <main id="main">
        {/* Subcategories: use real list semantics for a11y */}
        <section className="px-4 sm:px-6 lg:px-24 py-10 bg-white" aria-labelledby="subcategory-title">
          <h2 id="subcategory-title" className="text-[#891F1A] text-2xl sm:text-3xl font-semibold text-center mb-6">
            {categoryText}
          </h2>

          <ul
            className="
              grid gap-2
              grid-cols-3
              sm:grid-cols-4
              md:grid-cols-5
            "
          >
            {categoryInfo.subcategories.map((subcat) => {
              const subcatImage = subcat.images?.[0]?.url || '/images/default.jpg';
              const subcatSlug = subcat.url;

              return (
                <li key={String(subcat.id) || `${subcatSlug}-${subcat.name}`} className="block">
                  <Link
                    href={`/home/${categorySlug}/${subcatSlug}`}
                    aria-label={`View ${subcat.name}`}
                    className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded-lg"
                  >
                    <SafeImg
                      src={subcatImage}
                      alt={subcat.images?.[0]?.alt_text || subcat.name}
                      loading="lazy"
                      className="w-full h-full object-cover rounded-lg transition-transform group-hover:scale-105"
                      decoding="async"
                    />
                    <div className="mt-2">
                      <p className="text-gray-800 font-medium text-center">{subcat.name}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Category Info */}
        <section className="px-4 sm:px-6 lg:px-24 py-10" aria-labelledby="category-info-title">
          <div className="flex flex-col lg:flex-row items-start">
            {/* Left: Image */}
            <div className="lg:w-1/3 w-full mt-3 lg:mt-0 lg:pr-8">
              <SafeImg
                loading="lazy"
                alt={`${categoryText} overview image`}
                src={categoryImage}
                className="object-cover object-center rounded mb-5 w-full h-auto"
                decoding="async"
              />
            </div>

            {/* Right: Text */}
            <div className="lg:w-2/3 w-full mt-3 lg:mt-0">
              <h1 id="category-info-title" className="text-red-700 text-4xl font-bold mb-1">
                {categoryText}
              </h1>

              {categoryInfo.caption?.trim() ? (
                <p className="leading-relaxed font-normal text-black">{categoryInfo.caption}</p>
              ) : null}

              {/* Description (sanitized HTML) */}
              <div
                className="leading-relaxed mt-3 text-gray-700 font-normal text-[15px] [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-6 [&_a]:underline"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                aria-label={`${categoryText} description`}
              />
            </div>
          </div>
        </section>
      </main>

      <SecondCarousel />
      <Footer />
      <ChatBot />
    </div>
  );
};

export default CategoryPage;
