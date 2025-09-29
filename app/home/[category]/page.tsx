'use client';

import React, { useEffect, useMemo, useState, use } from 'react';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import SecondCarousel from '../../components/second_carousel';
import Header from '../../components/header';
import LogoSection from '../../components/LogoSection';
import Footer from '../../components/Footer';
import HomePageTop from '../../components/HomePageTop';
import { API_BASE_URL } from '../../utils/api';
import { ChatBot } from '../../components/ChatBot';
import { SafeImg } from '../../components/SafeImage';
import DOMPurify from 'isomorphic-dompurify';

/** ==== Types ==== */
interface Props {
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
  return fetch(url, { ...init, headers, cache: 'no-store' });
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
  }).replaceAll('<a ', '<a rel="nofollow noopener" target="_blank" '); // enforce safe link attrs

const CategoryPage: React.FC<Props> = ({ params }) => {
  const { category: categorySlug } = use(params);

  /** ==== State ==== */
  const [categoryInfo, setCategoryInfo] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);

  const [heroImages, setHeroImages] = useState<HeroImage[]>([]);
  const [desktopImages, setDesktopImages] = useState<string[]>(['/images/img1.jpg']);
  const [mobileImages, setMobileImages] = useState<string[]>(['/images/img1.jpg']);
  const [desktopIndex, setDesktopIndex] = useState(0);
  const [mobileIndex, setMobileIndex] = useState(0);

  /** ==== Derived values ==== */
  const categoryText = useMemo(
    () =>
      categorySlug
        ?.split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ') || '',
    [categorySlug]
  );

  /** ==== Data fetching ==== */
  useEffect(() => {
    let canceled = false;

    const fetchCategoryData = async () => {
      try {
        // 1) Get nav items and locate the current category
        const navRes = await fetchWithKey(`${API_BASE_URL}/api/show_nav_items/`);
        if (!navRes.ok) throw new Error('Failed to fetch nav items');
        const navData: Category[] = await navRes.json();

        const matchedCategory =
          navData.find((cat) => cat.url?.toLowerCase() === categorySlug?.toLowerCase()) || null;

        if (!matchedCategory) {
          if (!canceled) setCategoryInfo(null);
          return;
        }

        // 2) Enrich with /api/show-categories/
        try {
          const catRes = await fetchWithKey(`${API_BASE_URL}/api/show-categories/`);
          if (catRes.ok) {
            const catList: Array<{
              id: string | number;
              name: string;
              description?: string;
              caption?: string;
              image?: string;
              imageAlt?: string;
            }> = await catRes.json();

            const enriched =
              catList.find((c) => String(c.id) === String(matchedCategory.id)) ||
              catList.find(
                (c) => c.name?.toLowerCase() === matchedCategory.name?.toLowerCase()
              );

            const finalCat: Category = {
              ...matchedCategory,
              description: enriched?.description ?? matchedCategory.description,
              caption: enriched?.caption ?? matchedCategory.caption,
            };

            if (!canceled) setCategoryInfo(finalCat);
          } else {
            if (!canceled) setCategoryInfo(matchedCategory);
          }
        } catch {
          if (!canceled) setCategoryInfo(matchedCategory);
        }
      } catch (error) {
        console.error('❌ Category fetch error:', error);
        if (!canceled) setCategoryInfo(null);
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    const fetchHeroImages = async () => {
      try {
        const res = await fetchWithKey(`${API_BASE_URL}/api/hero-banner/`);
        if (!res.ok) throw new Error('Failed to fetch hero images');
        const data = await res.json();
        const images: HeroImage[] = data?.images || [];

        const desktop = images.filter((i) => i.device_type === 'desktop').map((i) => i.url);
        const mobile = images.filter((i) => i.device_type === 'mobile').map((i) => i.url);

        if (!canceled) {
          if (desktop.length) setDesktopImages(desktop);
          if (mobile.length) setMobileImages(mobile);
          setHeroImages(images);
        }
      } catch (error) {
        console.error('❌ Hero banner fetch error:', error);
      }
    };

    fetchCategoryData();
    fetchHeroImages();

    return () => {
      canceled = true;
    };
  }, [categorySlug]);

  /** ==== Motion-safe, memory-safe auto-advance for hero images ==== */
  useEffect(() => {
    // Respect reduced motion to improve a11y & Lighthouse
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return;
    if (heroImages.length < 2) return;

    const interval = setInterval(() => {
      setDesktopIndex((prev) => (prev + 1) % Math.max(desktopImages.length, 1));
      setMobileIndex((prev) => (prev + 1) % Math.max(mobileImages.length, 1));
    }, 5000);

    return () => clearInterval(interval);
  }, [heroImages.length, desktopImages.length, mobileImages.length]);

  /** ==== Client-side SEO: title, meta, JSON-LD (since this is a client file) ==== */
  useEffect(() => {
    if (!categoryText) return;
    const title = `${categoryText} · Categories`;
    const description =
      (categoryInfo?.caption || categoryInfo?.description || 'Explore our product range.')
        .toString()
        .replace(/<[^>]*>/g, '')
        .slice(0, 160);

    // Title & meta description
    document.title = title;

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', description);

    // Canonical
    const href = typeof window !== 'undefined' ? window.location.href.split('?')[0] : '';
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = href;

    // Breadcrumb JSON-LD
    const scriptId = 'category-breadcrumb-jsonld';
    let ld = document.getElementById(scriptId) as HTMLScriptElement | null;
    const breadcrumb = {
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
          name: categoryText,
          item:
            typeof window !== 'undefined'
              ? `${window.location.origin}/home/${categorySlug}`
              : `/home/${categorySlug}`,
        },
      ],
    };

    if (!ld) {
      ld = document.createElement('script');
      ld.type = 'application/ld+json';
      ld.id = scriptId;
      document.head.appendChild(ld);
    }
    ld.text = JSON.stringify(breadcrumb);
  }, [categoryText, categorySlug, categoryInfo?.caption, categoryInfo?.description]);

  /** ==== Loading state (kept minimal; avoids big CLS) ==== */
  if (loading) {
    return (
      <div
        className="bg-white overflow-x-hidden"
        style={{ fontFamily: 'var(--font-poppins), Arial, sans-serif' }}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-white focus:text-black focus:px-3 focus:py-2 focus:rounded"
        >
          Skip to main content
        </a>
        <Header />
        <LogoSection />
        <HomePageTop />
        <Navbar />
        {/* Lightweight skeleton for hero to cut layout shift */}
        <div aria-hidden className="w-full h-[300px] sm:h-[400px] bg-gray-100 animate-pulse" />
      </div>
    );
  }

  /** ==== 404 (no category) ==== */
  if (!categoryInfo) {
    // Add a noindex meta for this state to avoid SEO noise
    if (typeof document !== 'undefined') {
      let robots = document.querySelector('meta[name="robots"]');
      if (!robots) {
        robots = document.createElement('meta');
        robots.setAttribute('name', 'robots');
        document.head.appendChild(robots);
      }
      robots.setAttribute('content', 'noindex, follow');
    }

    return (
      <div
        className="bg-white overflow-x-hidden lg:overflow-y-hidden"
        style={{ fontFamily: 'var(--font-poppins), Arial, sans-serif' }}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-white focus:text-black focus:px-3 focus:py-2 focus:rounded"
        >
          Skip to main content
        </a>
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

  const rawDescription = (categoryInfo.description || '').trim();
  const descriptionHtml = sanitizeHtml(rawDescription) || '<p>Explore our product range.</p>';
  const categoryImage = categoryInfo.images?.[0]?.url || '/images/img1.jpg';

  return (
    <div
      className="flex flex-col bg-white"
      style={{ fontFamily: 'var(--font-poppins), Arial, Helvetica, sans-serif' }}
    >
      {/* Skip link for keyboard users */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-white focus:text-black focus:px-3 focus:py-2 focus:rounded"
      >
        Skip to main content
      </a>

      <Header />
      <LogoSection />
      <Navbar />
      <HomePageTop />

      {/* Hero Banner (desktop first, priority to reduce LCP) */}
      <SafeImg
        loading="eager"
        width="1440"
        height="400"
        src={desktopImages[desktopIndex]}
        alt="Promotional hero banner for desktop"
        className="hidden sm:block w-full h-auto mx-auto"
        // @ts-expect-error: pass-through to <img> if SafeImg forwards props
        fetchpriority="high"
        decoding="async"
      />
      <SafeImg
        loading="lazy"
        width="768"
        height="300"
        src={mobileImages[mobileIndex]}
        alt="Promotional hero banner for mobile"
        className="block sm:hidden w-full h-auto object-cover mx-auto"
        decoding="async"
      />

      {/* Main content */}
      <main id="main">
        {/* Subcategories */}
        <section className="px-4 sm:px-6 lg:px-24 py-10 bg-white" aria-labelledby="subcategory-title">
          <h2
            id="subcategory-title"
            className="text-[#891F1A] text-2xl sm:text-3xl font-semibold text-center mb-6"
          >
            {categoryText}
          </h2>

          <div
            className="
              grid gap-2
              grid-cols-3
              sm:grid-cols-4
              md:grid-cols-5
            "
            role="list"
          >
            {categoryInfo.subcategories.map((subcat) => {
              const subcatImage = subcat.images?.[0]?.url || '/images/default.jpg';
              const subcatSlug = subcat.url;

              return (
                <Link
                  href={`/home/${categorySlug}/${subcatSlug}`}
                  key={String(subcat.id) || `${subcatSlug}-${subcat.name}`}
                  className="block group"
                  role="listitem"
                  aria-label={`View ${subcat.name}`}
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
              );
            })}
          </div>
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
