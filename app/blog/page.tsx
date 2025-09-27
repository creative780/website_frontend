'use client';

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Header from "../components/header";
import MobileTopBar from "../components/HomePageTop";
import LogoSection from "../components/LogoSection";
import Footer from "../components/Footer";
import { SafeImg } from "../components/SafeImage";
import { API_BASE_URL } from "../utils/api";

const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

const fallbackPosts = [
  { id: 1, title: "Design Thinking in Print", description: "Explore how creative process maps into physical printing for high-conversion marketing materials.", thumbnail: "/images/m2.jpg", category: "Inspiration" },
  { id: 2, title: "Typography Trends 2025", description: "See how typography evolves across digital and print. Use it to grab attention and guide flow.", thumbnail: "/images/m3.jpg", category: "Design" },
  { id: 3, title: "Eco-Friendly Print Tips", description: "Sustainable choices in printing for a greener business. Learn the best materials and vendors.", thumbnail: "/images/m4.jpg", category: "Sustainability" },
  { id: 4, title: "Why Brand Colors Matter", description: "Consistency in branding begins with color. See real-world examples that nailed their print identity.", thumbnail: "/images/m5.jpg", category: "Branding" },
];

function toDate(v?: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export default function BlogPage() {
  const [blogs, setBlogs] = useState<any[]>([]);

  useEffect(() => {
    const fetchBlogs = async () => {
      try {
        // ✅ Let backend filter: only non-draft and publish_date <= now (or null).
        //    Scheduled posts auto-appear once time passes.
        const res = await fetch(`${API_BASE_URL}/api/show-all-blogs/`, withFrontendKey());
        if (!res.ok) throw new Error("Failed to fetch blogs");
        const data = await res.json();

        // Defensive: ensure we only show items with status === "Published"
        const onlyPublished = (Array.isArray(data) ? data : []).filter(
          (p: any) => String(p.status || "").toLowerCase() === "published"
        );

        // Sort newest first: prefer created, then updated (API returns yyyy-mm-dd)
        const key = (p: any) =>
          toDate(p.created) || toDate(p.updated) || new Date(0);

        onlyPublished.sort((a: any, b: any) => (key(b)!.getTime() - key(a)!.getTime()));

        setBlogs(onlyPublished.length > 0 ? onlyPublished : fallbackPosts);
      } catch (error) {
        console.warn("Falling back to static posts", error);
        setBlogs(fallbackPosts);
      }
    };

    fetchBlogs();
  }, []);

  const featured = blogs[0];
  const others = blogs.slice(1);

  return (
    <div className="flex flex-col bg-white" style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}>
      <Header />
      <MobileTopBar />
      <LogoSection />
      <Navbar />

      {/* Blog Section */}
      <main className="px-4 md:px-12 lg:px-24 py-16 bg-white">
        {/* Hero Article */}
        {featured && (
          <article className="mb-10 flex flex-col md:flex-row gap-8">
            <div className="w-full md:w-[500px] flex-shrink-0">
              <Link href={`/blog/${featured.id}`} aria-label={`Open blog: ${featured.title}`}>
                <SafeImg
                  src={featured.thumbnail}
                  alt={featured.title}
                  className="w-full h-auto object-cover rounded-xl shadow-md cursor-pointer"
                />
              </Link>
            </div>
            <div className="flex flex-col mt-6 md:mt-0">
              <small className="text-sm uppercase text-[#891F1A] font-light mb-2 tracking-wide">Featured</small>
              <Link href={`/blog/${featured.id}`}>
                <h1 className="text-3xl font-bold text-gray-900 mb-4 leading-tight hover:underline">
                  {featured.title}
                </h1>
              </Link>
              <p className="text-gray-600 text-sm md:text-base mb-4 line-clamp-[8] font-normal">
                {featured.metaDescription || featured.description}
              </p>
              <Link
                href={`/blog/${featured.id}`}
                className="self-start bg-[#891F1A] text-white text-sm px-5 py-2 rounded-md hover:bg-[#701912] transition-all duration-200 font-medium"
                aria-label={`Show more about: ${featured.title}`}
              >
                Show more →
              </Link>
            </div>
          </article>
        )}

        {/* Blog Grid */}
        <section className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {others.map((post: any) => (
            <Link
              key={post.id}
              href={`/blog/${post.id}`}
              className="block focus:outline-none focus:ring-2 focus:ring-[#891F1A] rounded-xl"
              aria-label={`Open blog: ${post.title}`}
            >
              <article
                className="relative rounded-xl overflow-hidden h-[320px] group shadow-md bg-cover bg-center cursor-pointer"
                style={{ backgroundImage: `url(${post.thumbnail})` }}
                role="img"
                aria-label={`${post.title}: ${post.metaDescription || post.description}`}
              >
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-all duration-300" />
                <div className="absolute bottom-0 p-5 text-white z-10">
                  <h3 className="text-lg font-medium leading-tight mb-2">{post.title}</h3>
                  <p className="text-sm text-white/90 font-normal">
                    {post.metaDescription || post.description}
                  </p>
                </div>
              </article>
            </Link>
          ))}
        </section>
      </main>

      <Footer />
    </div>
  );
}
