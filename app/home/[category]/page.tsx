'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Navbar from '../../components/Navbar';
import SecondCarousel from '../../components/second_carousel';
import Header from '../../components/header';
import LogoSection from '../../components/LogoSection';
import Footer from '../../components/Footer';
import MobileTopBar from '../../components/HomePageTop';
import { API_BASE_URL } from '../../utils/api';
import { ChatBot } from '../../components/ChatBot';
import HomePageTop from '../../components/HomePageTop';
import { SafeImg } from '../../components/SafeImage';
import DOMPurify from 'isomorphic-dompurify';

interface Props {
  params: Promise<{
    category: string;
  }>;
}

interface Product {
  id: string;
  name: string;
  url: string;
  images: { url: string; alt_text?: string }[];
}

interface Subcategory {
  id: string;
  name: string;
  url: string;
  images: { url: string; alt_text?: string }[];
  products: Product[];
}

interface Category {
  id: string;
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
  device_type: string;
}

/** 🔐 Inject X-Frontend-Key on every request */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
const fetchWithKey = (url: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  headers.set('X-Frontend-Key', FRONTEND_KEY);
  return fetch(url, { ...init, headers });
};

/** Allow HTML formatting in description; keep it safe from scripts/iframes */
const sanitizeHtml = (dirty: string) =>
  DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'p', 'br', 'ul', 'ol', 'li', 'span', 'a'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
    RETURN_TRUSTED_TYPE: false,
  });

const CategoryPage: React.FC<Props> = ({ params }) => {
  const { category: categorySlug } = use(params);
  const [categoryInfo, setCategoryInfo] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);

  const [heroImages, setHeroImages] = useState<HeroImage[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const fallbackImage = '/images/img1.jpg';
  const [desktopImages, setDesktopImages] = useState<string[]>([fallbackImage]);
  const [mobileImages, setMobileImages] = useState<string[]>([fallbackImage]);
  const [desktopIndex, setDesktopIndex] = useState(0);
  const [mobileIndex, setMobileIndex] = useState(0);

  useEffect(() => {
    const fetchCategoryData = async () => {
      try {
        // 1) Get nav items and find the current category
        const navRes = await fetchWithKey(`${API_BASE_URL}/api/show_nav_items/`, {
          cache: 'no-store',
        });
        if (!navRes.ok) throw new Error('Failed to fetch nav items');
        const navData: Category[] = await navRes.json();

        const matchedCategory = navData.find(
          (cat) => cat.url.toLowerCase() === categorySlug.toLowerCase()
        );

        if (!matchedCategory) {
          setCategoryInfo(null);
          return;
        }

        // 2) Enrich with description from ShowCategoryAPIView (/api/show-categories/)
        try {
          const catRes = await fetchWithKey(`${API_BASE_URL}/api/show-categories/`, {
            cache: 'no-store',
          });
          if (catRes.ok) {
            const catList: Array<{
              id: string;
              name: string;
              description?: string;
              caption?: string;
              image?: string;
              imageAlt?: string;
            }> = await catRes.json();

            // Match by id if available, else by name
            const matchById =
              catList.find((c) => String(c.id) === String(matchedCategory.id)) ??
              catList.find((c) => c.name?.toLowerCase() === matchedCategory.name?.toLowerCase());

            if (matchById) {
              setCategoryInfo({
                ...matchedCategory,
                description: matchById.description ?? matchedCategory.description,
                caption: matchById.caption ?? matchedCategory.caption,
              });
            } else {
              setCategoryInfo(matchedCategory);
            }
          } else {
            // If categories call fails, still render with nav data
            setCategoryInfo(matchedCategory);
          }
        } catch {
          setCategoryInfo(matchedCategory);
        }
      } catch (error) {
        console.error('❌ Category fetch error:', error);
        setCategoryInfo(null);
      } finally {
        setLoading(false);
      }
    };

    const fetchHeroImages = async () => {
      try {
        const res = await fetchWithKey(`${API_BASE_URL}/api/hero-banner/`);
        if (!res.ok) throw new Error('Failed to fetch hero images');
        const data = await res.json();
        const images: HeroImage[] = data.images || [];

        const desktop = images.filter((i) => i.device_type === 'desktop').map((i) => i.url);
        const mobile = images.filter((i) => i.device_type === 'mobile').map((i) => i.url);

        if (desktop.length) setDesktopImages(desktop);
        if (mobile.length) setMobileImages(mobile);
        setHeroImages(images);
      } catch (error) {
        console.error('❌ Hero banner fetch error:', error);
      }
    };

    fetchCategoryData();
    fetchHeroImages();
  }, [categorySlug]);

  useEffect(() => {
    if (heroImages.length > 1) {
      const interval = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % heroImages.length);
        setDesktopIndex((prev) => (prev + 1) % desktopImages.length);
        setMobileIndex((prev) => (prev + 1) % mobileImages.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [heroImages, desktopImages.length, mobileImages.length]);

  const formatCategoryName = (slug: string) =>
    slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

  if (loading) {
    return (
      <div
        className="bg-white overflow-x-hidden"
        style={{ fontFamily: 'var(--font-poppins), Arial, sans-serif' }}
      >
        <Header />
        <LogoSection />
        <HomePageTop />
        <Navbar />
      </div>
    );
  }

  if (!categoryInfo) {
    return (
      <div
        className="bg-white overflow-x-hidden lg:overflow-y-hidden"
        style={{ fontFamily: 'var(--font-poppins), Arial, sans-serif' }}
      >
        <Header />
        <LogoSection />
        <HomePageTop />

        <main
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
              It looks like you've navigated to the wrong URL.
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

  const categoryText = formatCategoryName(categorySlug);

  // Build sanitized HTML (no masking; all words allowed) — NOT a hook.
  const rawDescription = (categoryInfo.description || '').trim();
  const descriptionHtml =
    sanitizeHtml(rawDescription) || '<p>Explore our product range.</p>';

  return (
    <div
      className="flex flex-col bg-white"
      style={{ fontFamily: 'var(--font-poppins), Arial, Helvetica, sans-serif' }}
    >
      <Header />
      <LogoSection />
      <Navbar />
      <MobileTopBar />

      {/* Hero Banner */}
      <SafeImg
        loading="lazy"
        width="1440"
        height="400"
        src={desktopImages[desktopIndex]}
        alt="Hero Desktop"
        className="hidden sm:block w-full h-auto mx-auto"
      />
      <SafeImg
        loading="lazy"
        width="768"
        height="300"
        src={mobileImages[mobileIndex]}
        alt="Hero Mobile"
        className="block sm:hidden w-full h-auto object-cover mx-auto"
      />

      {/* Subcategories */}
      <section className="px-4 sm:px-6 lg:px-24 py-10 bg-white">
        <h2 className="text-[#891F1A] text-2xl sm:text-3xl font-semibold text-center mb-6">
          {categoryText}
        </h2>

        <div
          className="
            grid gap-2
            grid-cols-3
            sm:grid-cols-4
            md:grid-cols-5
          "
        >
          {categoryInfo.subcategories.map((subcat, index) => {
            const subcatImage = subcat.images?.[0]?.url || '/images/default.jpg';
            const subcatSlug = subcat.url;

            return (
              <Link href={`/home/${categorySlug}/${subcatSlug}`} key={index} className="block">
                <SafeImg
                  src={subcatImage}
                  alt={subcat.name}
                  loading="lazy"
                  className="w-full h-full object-cover rounded-lg hover:scale-105 transition"
                />
                <div className="mt-2">
                  <p className="text-gray-800 font-medium flex justify-center items-center">{subcat.name}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Category Info */}
      <section className="px-4 sm:px-6 lg:px-24 py-10">
        <div className="flex flex-col lg:flex-row items-start">
          {/* Left: Image */}
          <div className="lg:w-1/3 w-full mt-3 lg:mt-0 lg:pr-8">
            <SafeImg
              loading="lazy"
              alt="Category Description"
              src={categoryInfo.images?.[0]?.url || '/images/img1.jpg'}
              className="object-cover object-center rounded mb-5 w-full h-auto"
            />
          </div>

          {/* Right: Text */}
          <div className="lg:w-2/3 w-full mt-3 lg:mt-0">
            <h1 className="text-red-700 text-4xl font-bold mb-1">{categoryText}</h1>

            {categoryInfo.caption?.trim() ? (
              <p className="leading-relaxed font-normal text-black">{categoryInfo.caption}</p>
            ) : null}

            {/* Description (sanitized HTML, supports lists/links) */}
            <div
              className="leading-relaxed mt-3 text-gray-700 font-normal text-[15px] [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-6 [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: descriptionHtml }}
            />
          </div>
        </div>
      </section>

      <SecondCarousel />
      <Footer />
      <ChatBot />
    </div>
  );
};

export default CategoryPage;
