"use client";

import React, { useState, useEffect, lazy, Suspense } from "react";
import "toastify-js/src/toastify.css";
import Navbar from "../components/Navbar";
import Header from "../components/header";
import LogoSection from "../components/LogoSection";
import Footer from "../components/Footer";
import MobileTopBar from "../components/HomePageTop";
import Link from "next/link";
import {
  FaEnvelopeOpenText,
  FaMapMarkerAlt,
  FaPhoneAlt,
  FaWhatsapp,
} from "react-icons/fa";
import Toastify from "toastify-js";
import { API_BASE_URL } from "../utils/api";
import { ChatBot } from "../components/ChatBot";
import { SafeImg } from "../components/SafeImage";

// 🔐 Frontend key helper
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

// ⛔ Do NOT export helpers from a page file; keep them internal.
function slugify(value: string, allowUnicode = false): string {
  let newValue = value.toString();

  if (!allowUnicode) {
    // Normalize to ASCII
    newValue = newValue.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  } else {
    newValue = newValue.normalize("NFKC");
  }

  // Remove invalid chars, lowercase
  newValue = newValue.toLowerCase().replace(/[^\w\s-]/g, "");

  // Replace spaces/dashes with single dash and trim
  return newValue.replace(/[-\s]+/g, "-").replace(/^[-_]+|[-_]+$/g, "");
}

// Lazy-loaded heavy sections
const Carousel = lazy(() => import("../components/Carousel"));
const Reviews = lazy(() => import("../components/reviews"));
const SecondCarousel = lazy(() => import("../components/second_carousel"));

export default function PrintingServicePage() {
  const fallbackImage =
    "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/ZfQW3qI2ok/ymeg8jht_expires_30_days.png";

  const [desktopImages, setDesktopImages] = useState<string[]>([fallbackImage]);
  const [mobileImages, setMobileImages] = useState<string[]>([fallbackImage]);
  const [desktopIndex, setDesktopIndex] = useState(0);
  const [mobileIndex, setMobileIndex] = useState(0);
  const [categories, setCategories] = useState<any[]>([]);
  const COLS = 4;
  const remainder = categories.length % COLS;
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/hero-banner/`, withFrontendKey())
      .then((res) => res.json())
      .then((data) => {
        const all = data?.images || [];
        const desktop = all
          .filter((img: any) => img.device_type === "desktop")
          .map((img: any) => img.url);
        const mobile = all
          .filter((img: any) => img.device_type === "mobile")
          .map((img: any) => img.url);
        const mid = Math.ceil(all.length / 2);

        setDesktopImages(
          desktop.length
            ? desktop
            : all.slice(0, mid).map((img: any) => img.url) || [fallbackImage]
        );
        setMobileImages(
          mobile.length
            ? mobile
            : all.slice(mid).map((img: any) => img.url) || [fallbackImage]
        );
      })
      .catch(() => {
        setDesktopImages([fallbackImage]);
        setMobileImages([fallbackImage]);
      });
  }, []);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/show-categories/`, withFrontendKey())
      .then((res) => res.json())
      .then((data) => {
        const visible = data.filter(
          (category: any) => category.status === "visible"
        );
        setCategories(visible);
      })
      .catch((err) => console.error("Error fetching categories:", err));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setDesktopIndex((prev) => (prev + 1) % desktopImages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [desktopImages]);

  useEffect(() => {
    const interval = setInterval(() => {
      setMobileIndex((prev) => (prev + 1) % mobileImages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [mobileImages]);

  const contactItems = [
    {
      icon: <FaWhatsapp className="text-[#014C3D] text-[44px]" />,
      title: "Whatsapp",
      value: "+971 50 279 3948",
      href: "https://wa.me/971502793948",
      color: "#014C3D",
    },
    {
      icon: <FaPhoneAlt className="text-[#00B7FF] text-[44px]" />,
      title: "Call",
      value: "+971 54 539 6249",
      href: "tel:+971545396249",
      color: "#00B7FF",
    },
    {
      icon: <FaMapMarkerAlt className="text-[#891F1A] text-[44px]" />,
      title: "Find Us",
      value: "Naif – Deira – Dubai",
      href: "https://maps.google.com/?q=Naif+Deira+Dubai",
      color: "#891F1A",
    },
    {
      icon: <FaEnvelopeOpenText className="text-[#E6492D] text-[44px]" />,
      title: "Email",
      value: "ccaddxb@gmail.com",
      href: "mailto:ccaddxb@gmail.com",
      color: "#E6492D",
    },
  ];

  const [isSubmitted, setIsSubmitted] = useState(false);
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitted(true);

    Toastify({
      text: "We'll Call you back soon",
      duration: 3000,
      gravity: "top",
      position: "right",
      backgroundColor: "linear-gradient(to right, #00b09b, #96c93d)",
    }).showToast();

    e.currentTarget.reset();
    setTimeout(() => setIsSubmitted(false), 4000);
  };

  return (
    <main
      className="flex flex-col bg-white font-normal"
      style={{
        fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif",
      }}
    >
      {/* HEADER / NAV */}
      <header role="banner">
        <Header />
        <LogoSection />
        <nav aria-label="Primary">
          <Navbar />
        </nav>
        <MobileTopBar />
      </header>

      {/* HERO */}
      <section aria-label="Hero banners">
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
      </section>

      {/* CAROUSELS */}
      <Suspense fallback={<div />}>
        <section aria-label="Featured products carousel">
          <Carousel />
        </section>
      </Suspense>

      <SafeImg
        height="250"
        src="/images/Banner3.jpg"
        alt="Banner Image"
        className="block bg-[#D9D9D9] w-full h-auto mx-auto"
      />

      {/* CATEGORIES */}
      <section
        className="sm:px-6 lg:px-10 py-8 m-0"
        aria-labelledby="categories-heading"
      >
        {/* h2 → SemiBold (600) */}
        <h2
          id="categories-heading"
          className="text-[#891F1A] text-lg sm:text-3xl font-semibold text-center mb-6"
        >
          Discover our categories
        </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-7 mb-6 w-full px-4 sm:px-0">
          {categories.map((category: any, i: number) => {
            const formattedUrl = `/home/${slugify(category.name)}`;
            const lastRowStart = categories.length - remainder;

            // default: no offset
            let offsetClass = "";

            if (remainder === 1 && i === lastRowStart) {
              // 1 item left -> center perfectly in 4-col grid
              offsetClass = "sm:col-start-2 sm:col-span-1";
            } else if (remainder === 2 && i === lastRowStart) {
              // 2 items left -> shift the first to start at col 2 (the next will fall into col 3)
              offsetClass = "sm:col-start-2";
            }
            // remainder === 3 -> looks fine left-aligned; skip offsets

            return (
              <div key={category.id} className={offsetClass}>
                <article>
                  <Link
                    href={formattedUrl}
                    className="flex flex-col items-center cursor-pointer hover:scale-105 transition-transform duration-300"
                    aria-label={category.name}
                  >
                    {/* Ratio box via wrapperClassName; no plugin needed */}
                    <SafeImg
                      src={`${API_BASE_URL}${category.image}`}
                      alt={category.name}
                      className="absolute inset-0 w-full h-full object-contain" // <- h-full (not h-auto)
                      wrapperClassName="relative w-full h-0 pb-[75%] overflow-hidden rounded-lg bg-white"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "/images/img1.jpg";
                      }}
                    />

                  <h3
                    className="mt-2 text-xs sm:text-lg font-normal sm:font-bold text-[#333] text-center"
                  >
                    {category.name}
                  </h3>
                  </Link>
                </article>
              </div>
            );
          })}
        </div>
      </section>

      <SafeImg
        height="250"
        src="/images/Banner2.jpg"
        alt="Banner Image"
        className="block bg-[#D9D9D9]  w-full h-auto"
      />

      <Suspense fallback={<div />}>
        <section aria-label="Secondary carousel">
          <SecondCarousel />
        </section>
        <section aria-label="Customer reviews">
          <Reviews />
        </section>
      </Suspense>

      {/* CTA */}
      <section
        className="flex flex-col lg:flex-row items-center sm:px-6 lg:px-12 xl:px-10 py-12 bg:white"
        aria-labelledby="cta-heading"
      >
        <div className="flex-1">
          <p className="text-[#837E8C] text-sm font-normal mb-2">
            Call To Action
          </p>
          {/* h2 → SemiBold (600) */}
          <h2
            id="cta-heading"
            className="text-[#0E0E0E] text-3xl sm:text-4xl font-semibold leading-tight mb-4"
          >
            Let&apos;s Bring Your Ideas to Life
          </h2>
          <p className="text-[#868686] max-w-xl font-normal">
            Scelerisque in dolor donec neque velit. Risus aenean integer
            elementum odio sed adipiscing. Sem id scelerisque nunc quis.
            Imperdiet nascetur consequat.
          </p>

          {/* Callback Form */}
          <form
            onSubmit={handleSubmit}
            className="mt-10 space-y-6 max-w-xl"
            aria-label="Request a callback"
          >
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-normal text-gray-700 mb-1"
              >
                Full Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                placeholder="Enter your full name"
                className="w-full border border-gray-300 rounded-md p-3 text-gray-700 bg-white font-normal"
              />
            </div>

            <div className="mt-6">
              <label
                htmlFor="phone"
                className="block text-sm font-normal text-gray-700 mb-1"
              >
                Phone Number
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                required
                placeholder="e.g. +971-50-123-4567"
                className="w-full border border-gray-300 rounded-md p-3 text-gray-700 bg-white font-normal"
              />
            </div>

            <div>
              <label
                htmlFor="message"
                className="block text-sm font-normal text-gray-700 mb-1"
              >
                Message
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                required
                placeholder="Briefly tell us what this is about"
                className="w-full border border-gray-300 rounded-md p-3 text-gray-700 bg-white font-normal"
              />
            </div>

            <div className="flex justify-left">
              {/* button → Medium (500) */}
              <button
                type="submit"
                className="bg-[#891F1A] text-white px-8 py-3 rounded-md hover:bg-[#6f1814] transition font-medium"
              >
                Send Request
              </button>
            </div>
          </form>
        </div>

        <aside
          aria-label="Decorative placeholder"
          className="w-full mr-[10px] sm:w-[500px] h-[600px] bg-[#8B8491] rounded-xl"
        />
      </section>

      <div className="w-full bg-white h-[100px]" aria-hidden="true"></div>

      {/* CONTACT INFO */}
      <section
        className="bg-[#FAFAFA] px-4 sm:px-6 lg:px-24 py-8"
        aria-labelledby="contact-heading"
      >
        <h2 id="contact-heading" className="sr-only font-semibold">
          Contact information
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {contactItems.map((item, index) => (
            <a
              key={index}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center sm:items-start transition-all duration-300 font-medium"
            >
              <div className="flex items-center gap-4">
                {item.icon}
                <div>
                  {/* h3 → Medium (500) */}
                  <h3
                    className="text-[28px] font-medium"
                    style={{ color: item.color }}
                  >
                    {item.title}
                  </h3>
                  {/* p → Regular (400) */}
                  <p
                    className="text-[16px] font-normal"
                    style={{ color: item.color }}
                  >
                    {item.value}
                  </p>
                </div>
              </div>
              <div
                className="mt-2 w-0 group-hover:w-24 h-[2px] transition-all duration-300"
                style={{ backgroundColor: item.color }}
              />
            </a>
          ))}
        </div>
      </section>
      <footer role="contentinfo">
        <Footer />
      </footer>
      <ChatBot />
    </main>
  );
}
