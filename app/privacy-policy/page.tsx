"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Footer from "../components/Footer";
import { SafeImg } from "../components/SafeImage";
import TempHeader from "../components/TempHeader";
import MobileTopBar from "../components/HomePageTop";

export default function PrivacyPolicy() {
  const router = useRouter();

  // --- Minimal local state so the header renders safely without your global auth/modal context
  const [user, setUser] = useState<null | { name?: string }>(null);
  const [pseudoLoggedIn] = useState<boolean>(false);
  const [username] = useState<string>("");
  const [pseudoName] = useState<string>("");

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  // Fallbacks if your global modal system isn't available on this page
  const openModal = (key: "signin") => {
    // Replace with your modal trigger if present
    if (key === "signin") router.push("/login");
  };
  const handleLogout = async () => {
    // Wire to your real logout
    setUser(null);
    setUserMenuOpen(false);
    router.refresh();
  };

  // Close user menu on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [userMenuOpen]);

  return (
    <>
      <TempHeader />
      <MobileTopBar />

      {/* ====== Banner ====== */}
      <SafeImg
        height="250"
        src="/images/Banner3.jpg"
        alt="Banner Image"
        className="block bg-[#D9D9D9] w-full h-auto mx-auto"
      />

      {/* ====== Page Shell ====== */}
      <main className="bg-white text-black" style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}>
        {/* Giant Title */}
        <section className="max-w-7xl mx-auto px-6 pt-10 sm:pt-14">
          <h1
            className="uppercase font-extrabold leading-[0.85] tracking-[-0.04em]
                       text-[14vw] sm:text-[12vw] md:text-[9vw] lg:text-[7.5vw]"
          >
            Privacy Policy
          </h1>

          <hr className="mt-6 border-gray-200" />

          {/* Top Row: Left CTA + Intro Block */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8 items-start">
            {/* Left Pill CTA */}
            <aside className="lg:col-span-3">
              <a
                href="/terms-of-use"
                className="inline-flex items-center justify-between w-full sm:w-auto
                           rounded-full px-6 py-3 bg-[#EEF2FF] hover:bg-[#E7ECFF]
                           text-gray-700 text-sm font-semibold transition-all"
              >
                <span className="mr-3">TERMS OF USE</span>
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M7.05 3.94a1 1 0 011.4-1.42l6.6 6.5a1 1 0 010 1.44l-6.6 6.5a1 1 0 11-1.4-1.42L12.88 10 7.05 3.94z" />
                </svg>
              </a>
            </aside>

            {/* Intro Copy */}
            <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-4">
                <p className="text-xs tracking-widest text-gray-400 uppercase">
                  Welcome to Creative Connect
                </p>
              </div>
              <div className="md:col-span-8">
                <p className="text-xl md:text-2xl leading-8 text-gray-900">
                  This Data Collection and Processing Policy, or Privacy Policy (hereafter referred to as the “Policy”)
                  explains how Creative Connect Advertising LLC collects information about you, how it is used, kept,
                  and disclosed when you visit the website or engage with our services.
                </p>
              </div>
            </div>
          </div>

          <hr className="mt-10 border-gray-200" />
        </section>

        {/* Body Content – 2-Column Grid */}
        <section className="max-w-7xl mx-auto px-6 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-12 mt-8 text-[15px] leading-7">
            {/* Organization Block */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold tracking-widest text-[#891F1A] uppercase">Organization</h2>
              <p>
                <strong className="text-[#891F1A]">Privacy Policy – Creative Connect Advertising LLC</strong>
                <br />
                Effective Date: 01-08-2022
                <br />
                Creative Connect Advertising
                <br />
                <a
                  href="https://creativeprints.ae"
                  className="underline decoration-[#891F1A] hover:text-[#891F1A]"
                >
                  https://creativeprints.ae
                </a>
                <br />
                Email: info@creativeprints.ae
                <br />
                Phone: +97143259806
              </p>
            </div>

            {/* 1. Introduction */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold tracking-widest text-[#891F1A] uppercase">1. Introduction</h2>
              <p>
                At Creative Prints, your privacy is important to us. This Privacy Policy describes how we collect, use,
                and protect your personal information when you engage with our services—whether through our website,
                contact forms, online advertisements, or direct communication.
              </p>
              <p>
                By using our website or providing your personal information through our ads or contact channels, you
                consent to the terms of this Privacy Policy.
              </p>
            </div>

            {/* 2. What We Collect – Personal Info */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold tracking-widest text-[#891F1A] uppercase">
                2. What We Collect — Personal Information You Provide
              </h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Full Name</li>
                <li>Email Address</li>
                <li>Phone Number</li>
                <li>Company Name (optional)</li>
                <li>Delivery/Billing Address</li>
                <li>Order Details and Preferences</li>
                <li>Any uploaded files or designs for printing</li>
              </ul>
            </div>

            {/* 2.2 Automatically Collected Data */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold tracking-widest text-[#891F1A] uppercase">
                2.2 Automatically Collected Data
              </h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>IP address and location</li>
                <li>Browser type and device</li>
                <li>Pages viewed and time spent</li>
                <li>Products or services viewed or searched</li>
                <li>Form interactions or CTA button clicks</li>
                <li>Source of your visit (search, ad, referral, etc.)</li>
              </ul>
            </div>

            {/* 3. How We Use */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold tracking-widest text-[#891F1A] uppercase">
                3. How We Use Your Information
              </h2>
              <p>We use your personal data to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Respond to quote requests and inquiries</li>
                <li>Process and fulfill your orders</li>
                <li>Send confirmations and delivery updates</li>
                <li>Contact you for follow-ups or customer support</li>
                <li>Improve our website functionality and user experience</li>
                <li>Share relevant offers (if you’ve opted in)</li>
              </ul>
              <p>We do not use your data for automated decision-making or profiling without your consent.</p>
            </div>

            {/* 4. Sharing */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold tracking-widest text-[#891F1A] uppercase">4. Sharing Your Data</h2>
              <p>We respect your privacy and will not share your data with third parties except in the following cases:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>With delivery partners to fulfill your orders</li>
                <li>With customer support or marketing platforms used by Creative Prints</li>
                <li>When legally required (e.g., by a UAE government agency)</li>
                <li>In case of a business transfer or merger</li>
              </ul>
              <p>Our partners are required to treat your data with the same level of care.</p>
            </div>

            {/* 5. Security */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold tracking-widest text-[#891F1A] uppercase">5. Data Security</h2>
              <p>We implement appropriate technical and organizational measures to protect your data, including:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>SSL encryption for all data submissions</li>
                <li>Restricted access to personal information</li>
                <li>Secure servers hosted in the UAE or EEA</li>
                <li>Routine data monitoring and backups</li>
              </ul>
              <p>If you suspect any unauthorized use of your data, please contact us immediately.</p>
            </div>

            {/* 6. Cookies */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold tracking-widest text-[#891F1A] uppercase">6. Cookies and Analytics</h2>
              <p>Our website uses cookies to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Track browsing behavior</li>
                <li>Analyze website performance</li>
                <li>Remember your preferences</li>
                <li>Deliver personalized ads (e.g., remarketing)</li>
              </ul>
              <p>You can control cookies in your browser settings. Disabling them may affect site functionality.</p>
            </div>

            {/* 7. Rights */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold tracking-widest text-[#891F1A] uppercase">7. Your Rights</h2>
              <p>Under UAE data protection regulations and international best practices, you have the right to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Request access to your data</li>
                <li>Correct inaccuracies</li>
                <li>Request deletion of your information</li>
                <li>Withdraw consent for marketing at any time</li>
                <li>Transfer your data to another provider</li>
              </ul>
              <p>
                To exercise these rights, email us at{" "}
                <a href="mailto:info@creativeprints.ae" className="underline decoration-[#891F1A]">
                  info@creativeprints.ae
                </a>
              </p>
            </div>

            {/* 8. Third-Party Links */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold tracking-widest text-[#891F1A] uppercase">8. Third-Party Links</h2>
              <p>
                Creative Prints may link to third-party websites (e.g., delivery tracking, portfolio galleries, payment
                gateways). We are not responsible for their privacy practices, and we encourage you to review their
                policies separately.
              </p>
            </div>

            {/* 9. Retention */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold tracking-widest text-[#891F1A] uppercase">9. Data Retention</h2>
              <p>We retain your personal data only as long as necessary:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>For fulfilling printing orders and follow-ups</li>
                <li>For accounting and record-keeping (as per UAE law)</li>
                <li>For marketing (if opted-in), unless unsubscribed</li>
              </ul>
              <p>Inactive data is periodically reviewed and deleted after a reasonable period (usually 6–7 years).</p>
            </div>

            {/* 10. Changes */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold tracking-widest text-[#891F1A] uppercase">10. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. Changes will be posted on this page and are
                effective upon publication.
              </p>
            </div>

            {/* 11. Contact */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold tracking-widest text-[#891F1A] uppercase">11. Contact Us</h2>
              <p>
                If you have any questions or concerns about this Privacy Policy or how we handle your data, please
                contact us at:
              </p>
              <p>
                Creative Connect Advertising
                <br />
                📧 Email: info@creativeprints.ae
                <br />
                📞 Phone: +97143259806
                <br />
                🌐 Website:{" "}
                <a href="https://creativeprints.ae" className="underline decoration-[#891F1A]">
                  https://creativeprints.ae
                </a>
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
