// Front_End/app/about/page.tsx

import React from 'react';
import Header from '../components/header';
import Footer from '../components/Footer';
import Image from 'next/image';
import MobileTopBar from '../components/HomePageTop';
import { ChatBot } from '../components/ChatBot';
import LogoSection from '../components/LogoSection';
import Navbar from '../components/Navbar';
import Script from 'next/script';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Us · Creative Connect',
  description:
    'Creative Connect Advertising — 50+ years of craftsmanship in printing, branding, and fast global fulfillment. Meet the team and our mission.',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About Creative Connect',
    description:
      '50+ years of craftsmanship in printing & branding. Meet the team behind Creative Connect.',
    url: '/about',
    type: 'website',
  },
};

const team = [
  { name: 'Muhammad Mehrban Malik', title: 'Founder & Chairman', image: '/images/mehrban.png' },
  { name: 'Yasir Malik', title: 'CEO', image: '/images/yasir.png' },
  { name: 'Rizwan Malik', title: 'Production Head / Art Director', image: '/images/rizwan.png' },
  { name: 'Tahir Latif', title: 'Branch Manager', image: '/images/tahir.png' },
  { name: 'Mansoor Alam', title: 'Production Department', image: '/images/mansoor.png' },
  { name: 'Husnain Shafique', title: 'PK Branch Manager', image: '/images/hussnain.png' },
  { name: 'Akrash Noman', title: 'Full Stack Web Developer', image: '/images/akrash.png' },
];

const logos = [
  { src: '/images/google.jpg', alt: 'Google' },
  { src: '/images/amazon.png', alt: 'Amazon' },
  { src: '/images/emirates.jpg', alt: 'Emirates' },
  { src: '/images/adnoc.png', alt: 'ADNOC' },
  { src: '/images/etihad.png', alt: 'Etihad' },
  { src: '/images/du.png', alt: 'du Telecom' },
  { src: '/images/dm.png', alt: 'Dubai Mall' },
  { src: '/images/nike.jpg', alt: 'Nike' },
  { src: '/images/adidas.png', alt: 'Adidas' },
  { src: '/images/mcdonalds.png', alt: 'McDonald’s' },
];

// Tailwind JIT-safe color mapping (avoids dynamic class names getting purged)
const tileColorMap = {
  blue: {
    border: 'border-blue-100',
    badge: 'from-blue-600 to-blue-400',
    title: 'text-blue-700',
  },
  green: {
    border: 'border-green-100',
    badge: 'from-green-600 to-green-400',
    title: 'text-green-700',
  },
  purple: {
    border: 'border-purple-100',
    badge: 'from-purple-600 to-purple-400',
    title: 'text-purple-700',
  },
} as const;

const AboutPage = () => {
  return (
    <div
      className="flex flex-col min-h-screen bg-white"
      style={{ fontFamily: 'var(--font-poppins), Arial, sans-serif' }}
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

      <main id="main" className="flex-grow px-4 md:px-16 py-12 text-gray-800 font-normal">
        {/* Page title (single H1 for a11y/SEO) */}
        <h1 className="sr-only">About Creative Connect Advertising</h1>

        {/* Stats Section */}
        <section
          className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-24"
          aria-labelledby="stats-title"
        >
          <h2 id="stats-title" className="sr-only">
            Company at a glance
          </h2>

          <div className="grid grid-cols-2 gap-6 sm:gap-8" style={{ color: '#891F1A' }}>
            {[
              { value: '5M', label: 'Invested in Equipment' },
              { value: '60+', label: 'Employees in Dubai & Sharjah' },
              { value: '20M+', label: 'Printing Services Sold' },
              { value: '25M+', label: 'Printed Items Delivered' },
            ].map((stat, idx) => (
              <div
                key={idx}
                className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition duration-300 text-center border"
              >
                <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-[#891F1A] text-white text-2xl font-bold rounded-full shadow-md">
                  {stat.value}
                </div>
                <p className="text-sm font-normal text-gray-700">{stat.label}</p>
              </div>
            ))}
          </div>

          <div>
            <h2 className="text-3xl font-semibold text-gray-900 leading-tight mb-4">
              A legacy built on <span style={{ color: '#891F1A' }}>performance</span> and trust
            </h2>
            <p className="text-gray-600 text-lg font-normal">
              With over 50 years of consistent growth and customer satisfaction, our numbers reflect
              the scale, speed, and service that define Creative Connect Advertising.
            </p>
          </div>
        </section>

        {/* Shipping CTA */}
        <section
          className="relative max-w-5xl mx-auto mb-24 px-6 py-12 bg-[#E7D2D1] rounded-3xl shadow-lg text-center overflow-hidden"
          aria-labelledby="shipping-title"
        >
          <h2 id="shipping-title" className="text-3xl font-semibold text-gray-900 mb-4">
            The <span className="underline" style={{ color: '#891F1A' }}>Best Shipping Rates</span>{' '}
            for Print-on-Demand
          </h2>
          <p className="text-lg text-gray-700 font-normal max-w-2xl mx-auto">
            No matter the quantity or urgency, we provide ultra-fast shipping with unmatched pricing
            — ensuring your prints reach you securely and on time.
          </p>
          <div className="mt-6">
            <Link
              href="/contact"
              className="inline-block bg-[#891F1A] text-white font-medium px-6 py-3 rounded-full shadow-md hover:shadow-xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              aria-label="Get a shipping quote"
            >
              Get a Shipping Quote
            </Link>
          </div>
        </section>

        {/* About Section */}
        <section
          className="bg-[#E7D2D1] rounded-3xl px-6 md:px-14 py-16 mb-20 shadow-xl"
          aria-labelledby="about-title"
        >
          <div className="max-w-6xl mx-auto text-center">
            <h2 id="about-title" className="text-4xl font-semibold mb-6 tracking-tight text-gray-900">
              Empowering Brands with <span style={{ color: '#891F1A' }}>50+ Years</span> of
              Craftsmanship
            </h2>
            <p className="text-lg text-gray-700 font-normal max-w-3xl mx-auto mb-12 leading-relaxed">
              Creative Connect Advertising was born from the vision of{' '}
              <strong className="font-bold">Malik Muhammad Mehrban</strong>, a trailblazer in the
              printing world. From offset to UV, from screen printing to giveaways — we’ve shaped
              ideas into tangible impact.
            </p>

            <div className="grid md:grid-cols-3 gap-8 text-left" role="list">
              {[
                {
                  title: '👨‍🏭 Founding Vision',
                  desc: 'Mehrban Malik’s dream began with a single press and an unwavering belief in quality. That spark lit a legacy.',
                },
                {
                  title: '🧬 Generational Excellence',
                  desc: 'With each generation, we’ve expanded our services and mastered new technologies to meet evolving client needs.',
                },
                {
                  title: '🚚 Global Reach',
                  desc: 'With offices in Dubai and Sharjah and clients across the world, we ship over 25M+ printed goods annually.',
                },
              ].map((item, idx) => (
                <div key={idx} className="p-6 bg-white rounded-xl shadow hover:shadow-md transition" role="listitem">
                  <h3 className="text-xl font-medium mb-2">{item.title}</h3>
                  <p className="text-gray-600 font-normal">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-16 bg-[#891F1A] rounded-xl text-white px-8 py-10">
              <h3 className="text-2xl font-medium mb-2">Let’s Print the Future Together</h3>
              <p className="text-white/90 font-normal mb-4">
                Whether you&apos;re a startup or enterprise, we’ll bring your ideas to life. Fast.
                Custom. Reliable.
              </p>
              <Link
                href="/contact"
                className="mt-2 inline-block px-6 py-2 bg-white font-medium rounded-full shadow hover:shadow-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                style={{ color: '#891F1A' }}
                aria-label="Contact us"
              >
                Contact Us Today
              </Link>
            </div>
          </div>
        </section>

        {/* Team Grid */}
        <section
          className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 text-center"
          aria-labelledby="team-title"
        >
          <h2 id="team-title" className="sr-only">
            Leadership and Team
          </h2>

          {team.map((member, index) => (
            <article
              key={member.name}
              className="relative bg-white shadow-md hover:shadow-xl transition-shadow duration-300 rounded-xl p-6 flex flex-col items-center overflow-hidden group"
            >
              <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-100 via-white to-purple-100 opacity-60 group-hover:opacity-80 transition-all duration-700 blur-xl rounded-xl" />
              <div className="h-[180px] flex items-end justify-center mb-4">
                <Image
                  src={member.image}
                  alt={`${member.name} — ${member.title}`}
                  width={160}
                  height={160}
                  className="object-contain rounded-full"
                  priority={index < 2}
                />
              </div>
              <h3 className="text-lg font-medium text-gray-900">{member.name}</h3>
              <p className="text-sm text-gray-600 font-light">{member.title}</p>
            </article>
          ))}
        </section>

        {/* Vision, Mission & Values */}
        <section className="max-w-6xl mx-auto py-20 px-4 text-center" aria-labelledby="vmv-title">
          <h2 id="vmv-title" className="text-4xl font-semibold text-gray-900 mb-12">
            Our Vision, Mission &amp; Values
          </h2>

          <div className="grid md:grid-cols-3 gap-10 text-left">
            {[
              { icon: '🎯', title: 'Mission', color: 'blue', text: 'To deliver cutting-edge printing and branding solutions that ship fast, look great, and scale globally.' },
              { icon: '🌍', title: 'Vision', color: 'green', text: 'To be the most trusted and sustainable print partner across the Middle East and beyond.' },
              { icon: '💎', title: 'Core Values', color: 'purple', list: ['Customer-Centric', 'Innovation-Driven', 'Eco-Responsible', 'Integrity & Excellence'] },
            ].map((item, i) => {
              const colors = tileColorMap[item.color as keyof typeof tileColorMap];
              return (
                <div
                  key={i}
                  className={`bg-white p-6 rounded-2xl shadow-md hover:shadow-xl border ${colors.border}`}
                >
                  <div className="flex items-center mb-4">
                    <div
                      className={`w-10 h-10 bg-gradient-to-br ${colors.badge} text-white flex items-center justify-center rounded-full shadow-md text-lg`}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </div>
                    <h3 className={`text-xl font-medium ${colors.title} ml-3`}>{item.title}</h3>
                  </div>

                  {'text' in item && item.text ? (
                    <p className="text-gray-700 font-normal leading-relaxed">{item.text}</p>
                  ) : null}

                  {'list' in item && item.list ? (
                    <ul className="list-disc list-inside text-gray-700 font-normal leading-relaxed space-y-1">
                      {item.list.map((li, j) => (
                        <li key={j}>{li}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {/* Testimonials */}
        <section className="max-w-6xl mx-auto py-20 px-4 text-center" aria-labelledby="testimonials-title">
          <h2 id="testimonials-title" className="text-4xl font-semibold text-gray-900 mb-12">
            What Our Clients Say
          </h2>

          <div className="grid md:grid-cols-3 gap-8" style={{ color: '#891F1A' }}>
            {[
              { name: 'Ahmed Raza', comment: 'Creative Connect is our go-to partner for print. Fast turnaround, flawless output.' },
              { name: 'Sarah Al Nahyan', comment: 'Their branding services are unmatched. Consistent quality at scale.' },
              { name: 'David Chan', comment: 'We’ve printed thousands of items with them. Reliable and cost-effective.' },
            ].map((t, i) => (
              <blockquote
                key={i}
                className="bg-white p-6 rounded-2xl shadow-md hover:shadow-xl transition duration-300 text-left relative border"
              >
                <span className="text-3xl absolute -top-5 left-6 text-blue-600 opacity-20" aria-hidden="true">
                  “
                </span>
                <p className="text-gray-700 italic font-normal leading-relaxed mb-6">“{t.comment}”</p>
                <footer>
                  <cite className="not-italic font-medium text-base" style={{ color: '#891F1A' }}>
                    {t.name}
                  </cite>
                </footer>
              </blockquote>
            ))}
          </div>
        </section>

        {/* Client Logos */}
        <section className="bg-[#E7D2D1] py-20 px-4" aria-labelledby="logos-title">
          <h2 id="logos-title" className="text-3xl font-semibold text-center text-gray-900 mb-10">
            Trusted by Leading Brands
          </h2>

          <div
            className="flex flex-wrap justify-center items-center gap-10 max-w-6xl mx-auto"
            role="list"
          >
            {logos.map((logo, i) => (
              <div key={logo.alt} className="w-28 transition duration-300 ease-in-out" role="listitem">
                <Image
                  src={logo.src}
                  alt={`${logo.alt} logo`}
                  width={112}
                  height={56}
                  className="w-full h-auto object-contain mix-blend-multiply"
                  priority={i < 3}
                />
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
      <ChatBot />

      {/* JSON-LD: Organization (improves SEO) */}
      <Script id="org-jsonld" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'Creative Connect Advertising',
          url:
            typeof window !== 'undefined'
              ? `${window.location.origin}/about`
              : 'https://example.com/about',
          logo: '/images/logo.png',
          sameAs: [],
        })}
      </Script>
    </div>
  );
};

export default AboutPage;
