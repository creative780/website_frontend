'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import Header from '../components/header';
import MobileTopBar from '../components/HomePageTop';
import LogoSection from '../components/LogoSection';
import Footer from '../components/Footer';
import { SafeImg } from '../components/SafeImage';
import { API_BASE_URL } from '../utils/api';
import Script from 'next/script';

type Blog = {
  id: string | number;
  title: string;
  description?: string;
  metaDescription?: string;
  thumbnail: string;
  category?: string;
  status?: string;
  created?: string | null;
  updated?: string | null;
};

const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set('X-Frontend-Key', FRONTEND_KEY);
  headers.set('Accept', 'application/json');
  return { ...init, headers, cache: 'no-store' };
};

const fallbackPosts: Blog[] = [
  {
    id: 1,
    title: 'Design Thinking in Print',
    description:
      'Explore how creative process maps into physical printing for high-conversion marketing materials.',
    thumbnail: '/images/m2.jpg',
    category: 'Inspiration',
  },
  {
    id: 2,
    title: 'Typography Trends 2025',
    description:
      'See how typography evolves across digital and print. Use it to grab attention and guide flow.',
    thumbnail: '/images/m3.jpg',
    category: 'Design',
  },
  {
    id: 3,
    title: 'Eco-Friendly Print Tips',
    description:
      'Sustainable choices in printing for a greener business. Learn the best materials and vendors.',
    thumbnail: '/images/m4.jpg',
    category: 'Sustainability',
  },
  {
    id: 4,
    title: 'Why Brand Colors Matter',
    description:
      'Consistency in branding begins with color. See real-world examples that nailed their print identity.',
    thumbnail: '/images/m5.jpg',
    category: 'Branding',
  },
];

function toDate(v?: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export default function BlogPage() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let canceled = false;

    const fetchBlogs = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/show-all-blogs/`, withFrontendKey());
        if (!res.ok) throw new Error('Failed to fetch blogs');
        const data: Blog[] = await res.json();

        const onlyPublished = (Array.isArray(data) ? data : []).filter(
          (p) => String(p.status || '').toLowerCase() === 'published'
        );

        const key = (p: Blog) => toDate(p.created) || toDate(p.updated) || new Date(0);
        onlyPublished.sort((a, b) => key(b)!.getTime() - key(a)!.getTime());

        if (!canceled) setBlogs(onlyPublished.length > 0 ? onlyPublished : fallbackPosts);
      } catch (error) {
        console.warn('Falling back to static posts', error);
        if (!canceled) setBlogs(fallbackPosts);
      } finally {
        if (!canceled) setLoaded(true);
      }
    };

    fetchBlogs();
    return () => {
      canceled = true;
    };
  }, []);

  const featured = blogs[0];
  const others = blogs.slice(1);

  // Derived page meta (client-side since this is a client page)
  const pageTitle = useMemo(() => 'Blog · Creative Connect', []);
  const pageDescription = useMemo(
    () =>
      (featured?.metaDescription ||
        featured?.description ||
        'Insights on printing, branding, and production from Creative Connect.'
      )
        .toString()
        .replace(/<[^>]*>/g, '')
        .slice(0, 160),
    [featured?.description, featured?.metaDescription]
  );

  // Inject basic SEO (title, meta, canonical) on client
  useEffect(() => {
    document.title = pageTitle;

    const ensureMeta = (name: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      return el;
    };

    ensureMeta('description')!.setAttribute('content', pageDescription);

    const href = typeof window !== 'undefined' ? window.location.href.split('?')[0] : '/blog';
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = href;
  }, [pageTitle, pageDescription]);

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
      <MobileTopBar />

      <main id="main" className="px-4 md:px-12 lg:px-24 py-16 bg-white">
        {/* Visible H1 for SEO/A11y */}
        <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-8">Blog</h1>

        {/* Loading skeleton to reduce CLS while images load */}
        {!loaded && (
          <div aria-hidden className="mb-10 animate-pulse">
            <div className="h-[260px] md:h-[320px] w-full bg-gray-100 rounded-xl mb-6" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-[320px] bg-gray-100 rounded-xl" />
              ))}
            </div>
          </div>
        )}

        {/* Hero Article (LCP-friendly SafeImg) */}
        {featured && (
          <article className="mb-10 flex flex-col md:flex-row gap-8">
            <div className="w-full md:w-[500px] flex-shrink-0">
              <Link href={`/blog/${featured.id}`} aria-label={`Open blog: ${featured.title}`}>
                <SafeImg
                  src={featured.thumbnail}
                  alt={featured.title}
                  width="1000"
                  height="640"
                  className="w-full h-auto object-cover rounded-xl shadow-md cursor-pointer"
                  loading="eager"
                  // @ts-expect-error: pass-through to <img> if SafeImg forwards props
                  fetchpriority="high"
                  decoding="async"
                />
              </Link>
            </div>
            <div className="flex flex-col mt-6 md:mt-0">
              <small className="text-sm uppercase text-[#891F1A] font-light mb-2 tracking-wide">
                Featured
              </small>
              <Link href={`/blog/${featured.id}`}>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 leading-tight hover:underline">
                  {featured.title}
                </h2>
              </Link>
              <p className="text-gray-600 text-sm md:text-base mb-4 line-clamp-[8] font-normal">
                {featured.metaDescription || featured.description}
              </p>
              <Link
                href={`/blog/${featured.id}`}
                className="self-start bg-[#891F1A] text-white text-sm px-5 py-2 rounded-md hover:bg-[#701912] transition-all duration-200 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                aria-label={`Read more: ${featured.title}`}
              >
                Read more →
              </Link>
            </div>
          </article>
        )}

        {/* Blog Grid (use real <img> for a11y; no background-image role=img) */}
        <section
          className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8"
          aria-labelledby="all-posts-title"
        >
          <h2 id="all-posts-title" className="sr-only">
            All posts
          </h2>

          {others.map((post) => (
            <article
              key={post.id}
              className="rounded-xl overflow-hidden group shadow-md cursor-pointer focus-within:ring-2 focus-within:ring-[#891F1A]"
            >
              <Link
                href={`/blog/${post.id}`}
                className="block"
                aria-label={`Open blog: ${post.title}`}
              >
                <SafeImg
                  src={post.thumbnail}
                  alt={post.title}
                  width="640"
                  height="400"
                  className="w-full h-[200px] object-cover"
                  loading="lazy"
                  decoding="async"
                />
                <div className="p-4">
                  {post.category ? (
                    <p className="text-xs uppercase tracking-wide text-[#891F1A] mb-1">
                      {post.category}
                    </p>
                  ) : null}
                  <h3 className="text-lg font-medium leading-tight mb-2 group-hover:underline">
                    {post.title}
                  </h3>
                  <p className="text-sm text-gray-600 font-normal line-clamp-3">
                    {post.metaDescription || post.description}
                  </p>
                </div>
              </Link>
            </article>
          ))}
        </section>
      </main>

      <Footer />

      {/* JSON-LD: ItemList of blog posts for richer SERP */}
      <Script id="blog-list-jsonld" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          itemListElement: blogs.slice(0, 20).map((b, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            url:
              typeof window !== 'undefined'
                ? `${window.location.origin}/blog/${b.id}`
                : `/blog/${b.id}`,
            name: b.title,
          })),
        })}
      </Script>
    </div>
  );
}
