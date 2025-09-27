'use client';

import Link from 'next/link';
import LogoSection from './components/LogoSection';
import Header from './components/header';
import HomePageTop from './components/HomePageTop';
import Footer from './components/Footer';

export default function NotFound() {
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
          {/* p → Regular */}
          <p className="mb-4 sm:mb-6 tracking-[0.25em] text-[10px] sm:text-xs font-normal text-[#891F1A]">
            OOPS! PAGE NOT FOUND
          </p>

          {/* h1 → Bold */}
          <h1
            id="page-title"
            aria-label="404"
            className="relative mx-auto mb-4 sm:mb-6 flex items-center justify-center font-bold leading-none text-[#891F1A] select-none"
          >
            {/* span digits → Bold */}
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

          {/* p → Regular */}
          <p className="mx-auto max-w-xl text-sm sm:text-base text-[#891F1A] font-normal px-2">
            WE ARE SORRY, BUT THE PAGE YOU REQUESTED WAS NOT FOUND
          </p>

          <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 w-full">
            {/* a (Link) → Regular */}
            <Link
              href="/"
              className="inline-flex justify-center rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-normal text-[#891F1A] transition hover:bg-red-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              Go to Home
            </Link>

            {/* button → Medium */}
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
