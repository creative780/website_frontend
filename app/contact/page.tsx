'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Header from '../components/header';
import LogoSection from '../components/LogoSection';
import Footer from '../components/Footer';
import MobileTopBar from '../components/HomePageTop';
import Navbar from '../components/Navbar';
import Script from 'next/script';

export default function Contact() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [toastLoaded, setToastLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Client-side meta since this is a client page
  useEffect(() => {
    const title = 'Contact · Creative Connect';
    const description =
      'Request a call-back from Creative Connect. Tell us what you need—printing, branding, or production—and we’ll get in touch.';

    document.title = title;

    let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', description);

    const href = typeof window !== 'undefined' ? window.location.href.split('?')[0] : '/contact';
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = href;

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Dynamic import for Toastify to reduce initial JS
  const ensureToast = useCallback(async () => {
    if (toastLoaded) return (window as any).__toastify__;
    const mod = await import('toastify-js');
    // Cache on window to reuse without re-import
    (window as any).__toastify__ = mod.default || (mod as any);
    setToastLoaded(true);
    return (window as any).__toastify__;
  }, [toastLoaded]);

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;

    // Honeypot: if filled, silently ignore
    const hp = (form.elements.namedItem('company') as HTMLInputElement | null)?.value?.trim();
    if (hp) return;

    try {
      setSubmitting(true);

      const Toastify = await ensureToast();
      setIsSubmitted(true);

      Toastify({
        text: "We'll call you back soon",
        duration: 3000,
        gravity: 'top',
        position: 'right',
        style: {
          background: 'linear-gradient(to right, #00b09b, #96c93d)',
        },
      }).showToast();

      form.reset();
      timerRef.current = setTimeout(() => setIsSubmitted(false), 4000);
    } finally {
      setSubmitting(false);
    }
  }, [ensureToast]);

  return (
    <>
      {/* Skip link for keyboard users */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-white focus:text-black focus:px-3 focus:py-2 focus:rounded"
      >
        Skip to main content
      </a>

      <Header />
      <MobileTopBar />
      <LogoSection />
      <Navbar />

      <section
        className="relative px-4 sm:px-6 lg:px-24 py-24 bg-white"
        id="contact-form"
        style={{ fontFamily: 'var(--font-poppins), Arial, Helvetica, sans-serif' }}
        aria-labelledby="contact-title"
      >
        {/* Visible H1 improves a11y/SEO */}
        <h1 id="contact-title" className="text-2xl sm:text-3xl font-semibold text-center text-[#891F1A] mb-10">
          Request a Call-Back
        </h1>

        <div className="relative z-20 -mt-24 px-4 sm:px-6 lg:px-24">
          <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-2xl">
            {/* Live region for screen readers on success */}
            <p
              role="status"
              aria-live="polite"
              className={`mb-4 text-sm ${isSubmitted ? 'text-green-700' : 'sr-only'}`}
            >
              Thanks — we’ll call you back soon.
            </p>

            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              {/* Honeypot field (hidden from users) */}
              <div className="hidden">
                <label htmlFor="company" className="block text-sm font-normal text-gray-700 mb-1">
                  Company
                </label>
                <input
                  type="text"
                  id="company"
                  name="company"
                  tabIndex={-1}
                  autoComplete="off"
                  className="w-full border border-gray-300 rounded-md p-3"
                />
              </div>

              <div>
                <label htmlFor="name" className="block text-sm font-normal text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  placeholder="Enter your full name"
                  autoComplete="name"
                  inputMode="text"
                  className="w-full border border-gray-300 rounded-md p-3 text-gray-700 bg-white font-normal placeholder:font-normal"
                  aria-required="true"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-normal text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  required
                  placeholder="e.g. +971 50 123 4567"
                  autoComplete="tel"
                  inputMode="tel"
                  pattern="^\+?[0-9 ()\-]{7,20}$"
                  className="w-full border border-gray-300 rounded-md p-3 text-gray-700 bg-white font-normal placeholder:font-normal"
                  aria-required="true"
                />
                <small className="text-xs text-gray-500">Include country code if possible.</small>
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-normal text-gray-700 mb-1">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  required
                  placeholder="Briefly tell us what this is about"
                  className="w-full border border-gray-300 rounded-md p-3 text-gray-700 bg-white font-normal placeholder:font-normal"
                  aria-required="true"
                  maxLength={2000}
                />
              </div>

              <div className="flex justify-center">
                <button
                  type="submit"
                  className="bg-[#891F1A] text-white px-8 py-3 rounded-md hover:bg-[#6f1814] transition font-medium disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  disabled={submitting}
                >
                  {submitting ? 'Sending…' : 'Send Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <Footer />

      {/* JSON-LD: ContactPage + Organization (boosts SEO) */}
      <Script id="contact-jsonld" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'ContactPage',
          name: 'Contact · Creative Connect',
          url:
            typeof window !== 'undefined'
              ? `${window.location.origin}/contact`
              : 'https://example.com/contact',
          mainEntity: {
            '@type': 'Organization',
            name: 'Creative Connect Advertising',
            url:
              typeof window !== 'undefined'
                ? `${window.location.origin}/`
                : 'https://example.com/',
          },
        })}
      </Script>
    </>
  );
}
