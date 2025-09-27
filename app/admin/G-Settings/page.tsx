"use client";

import React from "react";
import { motion } from "framer-motion";
import type { MotionProps } from "framer-motion";
import AdminSidebar from "../components/AdminSideBar";
import AdminAuthGuard from "../components/AdminAuthGaurd";

import Link from "next/link";
import { MdDelete, MdHelpOutline } from "react-icons/md";
import {
  FaCogs,
  FaUserCog,
  FaHistory,
  FaTrash,
  FaChartBar,
  FaDatabase,
  FaEnvelope,
  FaSearch,
  FaCodeBranch,
  FaShareAlt,
  FaEye,
  FaArrowAltCircleUp,
  FaSlidersH,
  FaFileAlt,
  FaGooglePlay,
} from "react-icons/fa";
import {
  SiGoogleads,
  SiAdguard,
  SiGooglebigquery,
  SiGoogledisplayandvideo360,
  SiGoogletagmanager,
  SiGooglemarketingplatform,
  SiGooglesearchconsole,
} from "react-icons/si";

const cardAnimation: MotionProps = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  // Use cubic-bezier easing (compatible with Framer Motion v10+)
  transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
};

type SettingsItem = {
  label: string;
  icon: React.ReactNode;
  url: string;
};

type CardProps = {
  title: string;
  subtitle?: string;
  items: SettingsItem[];
};

const GridCard: React.FC<CardProps> = ({ title, subtitle, items }) => (
  <motion.div
    {...cardAnimation}
    className="backdrop-blur-md bg-white/70 rounded-xl border border-[#e0e0e0] px-6 py-6 shadow-md hover:shadow-xl transition-all duration-300"
  >
    <h3 className="text-base font-semibold text-[#202124] mb-1">{title}</h3>
    {subtitle && <p className="text-xs text-[#5f6368] mb-4">{subtitle}</p>}
    <div className="grid sm:grid-cols-2 gap-x-4 gap-y-4">
      {items.map(({ label, icon, url }, i) => (
        <div key={i} className="flex items-center justify-between group">
          {url.startsWith("/") ? (
            <Link
              href={url}
              className="flex items-center gap-3 text-sm text-[#202124] group-hover:text-blue-600 transition"
            >
              <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-lg shadow-sm">
                {icon}
              </span>
              {label}
            </Link>
          ) : (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-sm text-[#202124] group-hover:text-blue-600 transition"
            >
              <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-lg shadow-sm">
                {icon}
              </span>
              {label}
            </a>
          )}
          <MdHelpOutline className="text-[16px] text-[#9e9e9e] group-hover:text-blue-500 transition" />
        </div>
      ))}
    </div>
  </motion.div>
);

const SectionCard: React.FC<CardProps> = ({ title, subtitle, items }) => (
  <motion.div
    {...cardAnimation}
    className="backdrop-blur-md bg-white/70 rounded-xl border border-[#e0e0e0] px-6 py-6 w-full shadow-md hover:shadow-xl transition-all duration-300"
  >
    <h3 className="text-base font-semibold text-[#202124] mb-1">{title}</h3>
    {subtitle && <p className="text-xs text-[#5f6368] mb-4">{subtitle}</p>}
    <div className="space-y-4">
      {items.map(({ label, icon, url }, i) => (
        <div key={i} className="flex justify-between items-center group">
          {url.startsWith("/") ? (
            <Link
              href={url}
              className="flex items-center gap-3 text-sm text-[#202124] group-hover:text-blue-600 transition"
            >
              <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-lg shadow-sm">
                {icon}
              </span>
              {label}
            </Link>
          ) : (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-sm text-[#202124] group-hover:text-blue-600 transition"
            >
              <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-lg shadow-sm">
                {icon}
              </span>
              {label}
            </a>
          )}
          <MdHelpOutline className="text-[16px] text-[#9e9e9e] group-hover:text-blue-500 transition" />
        </div>
      ))}
    </div>
  </motion.div>
);

export default function AdminSettingsPage() {
  const accountSettings: SettingsItem[] = [
    {
      label: "Account details",
      icon: <FaCogs />,
      url: "https://example.com/account/details",
    },
    {
      label: "Account access management",
      icon: <FaUserCog />,
      url: "https://example.com/account/access",
    },
    {
      label: "Account change history",
      icon: <FaHistory />,
      url: "https://example.com/account/history",
    },
    {
      label: "API quota history",
      icon: <FaChartBar />,
      url: "https://example.com/account/api",
    },
    {
      label: "Trash",
      icon: <FaTrash />,
      url: "https://example.com/account/trash",
    },
  ];

  const propertySettings: SettingsItem[] = [
    { label: "Property details", icon: <FaCogs />, url: "/admin/property" },
    {
      label: "Access management",
      icon: <FaUserCog />,
      url: "/admin/property/access",
    },
    {
      label: "Change history",
      icon: <FaHistory />,
      url: "/admin/property/history",
    },
    {
      label: "Quota usage",
      icon: <FaChartBar />,
      url: "/admin/property/quota",
    },
    { label: "Scheduled emails", icon: <FaEnvelope />, url: "/admin/emails" },
    { label: "Search history", icon: <FaSearch />, url: "/admin/search" },
  ];

  const dataCollection: SettingsItem[] = [
    { label: "Data streams", icon: <FaDatabase />, url: "/admin/datastreams" },
    {
      label: "Collection settings",
      icon: <FaDatabase />,
      url: "/admin/datacollection",
    },
    {
      label: "Import data",
      icon: <FaArrowAltCircleUp />,
      url: "/admin/import",
    },
    {
      label: "Retention settings",
      icon: <FaSlidersH />,
      url: "/admin/retention",
    },
    { label: "Filters", icon: <FaSlidersH />, url: "/admin/filters" },
    { label: "Delete requests", icon: <MdDelete />, url: "/admin/deletion" },
    { label: "Consent settings", icon: <FaFileAlt />, url: "/admin/consent" },
  ];

  const dataDisplay: SettingsItem[] = [
    { label: "Events", icon: <FaCodeBranch />, url: "/admin/events" },
    { label: "Network settings", icon: <FaCogs />, url: "/admin/network" },
    { label: "Audiences", icon: <FaShareAlt />, url: "/admin/audiences" },
    { label: "Annotations", icon: <FaSearch />, url: "/admin/annotations" },
    { label: "Comparisons", icon: <FaChartBar />, url: "/admin/comparisons" },
    { label: "Segments", icon: <FaSearch />, url: "/admin/segments" },
    {
      label: "Custom definitions",
      icon: <FaCodeBranch />,
      url: "/admin/definitions",
    },
    { label: "Channel groups", icon: <FaCodeBranch />, url: "/admin/channels" },
    { label: "Reporting identity", icon: <FaEye />, url: "/admin/identity" },
    { label: "DebugView", icon: <FaEye />, url: "/admin/debug" },
  ];

  const productLinks: SettingsItem[] = [
    {
      label: "Google AdSense links",
      icon: <SiGoogleads className="text-[#fbbc05]" />,
      url: "https://adsense.google.com/",
    },
    {
      label: "Google Ads links",
      icon: <SiGoogleads className="text-[#4285f4]" />,
      url: "https://ads.google.com/",
    },
    {
      label: "Ad Manager links",
      icon: <SiAdguard className="text-[#34a853]" />,
      url: "https://admanager.google.com/",
    },
    {
      label: "BigQuery links",
      icon: <SiGooglebigquery className="text-[#4285f4]" />,
      url: "https://console.cloud.google.com/bigquery",
    },
    {
      label: "Display & Video 360",
      icon: <SiGoogledisplayandvideo360 className="text-[#34a853]" />,
      url: "https://dv360.google.com/",
    },
    {
      label: "Floodlight",
      icon: <SiGoogletagmanager className="text-[#ea4335]" />,
      url: "https://tagmanager.google.com/",
    },
    {
      label: "Merchant Center",
      icon: <SiGooglemarketingplatform className="text-[#34a853]" />,
      url: "https://merchants.google.com/",
    },
    {
      label: "Google Play links",
      icon: <FaGooglePlay className="text-[#0f9d58]" />,
      url: "https://play.google.com/console",
    },
    {
      label: "Search Ads 360",
      icon: <SiGooglemarketingplatform className="text-[#34a853]" />,
      url: "https://searchads.google.com/",
    },
    {
      label: "Search Console",
      icon: <SiGooglesearchconsole className="text-[#ea4335]" />,
      url: "https://search.google.com/search-console",
    },
  ];

  return (
    <AdminAuthGuard>
      <div className="flex min-h-screen bg-[#f8f9fa]">
        <div className="w-64 hidden lg:block sticky top-0 h-screen overflow-y-auto bg-white shadow-md">
          <AdminSidebar />
        </div>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 lg:py-10 bg-gray-50 min-h-screen">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6 sm:mb-8 bg-gradient-to-r from-white via-[#f8f9fa] to-gray-100 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-200">
              <motion.h1
                {...cardAnimation}
                className="text-3xl font-bold text-gray-800 flex items-center gap-2 mb-2"
              >
                ⚙️ Admin Settings
              </motion.h1>
              <p className="text-gray-500 text-sm">
                These settings apply to all users of this account and property. For
                settings that apply only to you, go to{" "}
                <span className="text-blue-600 cursor-pointer hover:underline">
                  My preferences
                </span>{" "}
                in the left navigation.
              </p>
            </div>

          <section className="mb-8 sm:mb-12">
            <h2 className="text-[12px] text-[#5f6368] font-medium tracking-wide mb-3 uppercase">
              Account Settings
            </h2>
            <GridCard
              title="Account"
              subtitle="These settings affect your analytics account. What's an account?"
              items={accountSettings}
            />
          </section>

          <section className="mb-12 sm:mb-16">
            <h2 className="text-[12px] text-[#5f6368] font-medium tracking-wide mb-3 uppercase">
              Property Settings
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              <SectionCard
                title="Property"
                subtitle="These settings affect your property. What's a property?"
                items={propertySettings}
              />
              <SectionCard
                title="Data collection and modification"
                subtitle="These settings control how data is collected and modified"
                items={dataCollection}
              />
              <SectionCard
                title="Data display"
                subtitle="These settings control how data is shown in your reports"
                items={dataDisplay}
              />
              <SectionCard
                title="Product links"
                subtitle="These settings control which products link to this property"
                items={productLinks}
              />
            </div>
          </section>

          <footer className="text-sm text-[#5f6368] border-t border-[#dadce0] pt-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-y-4">
            <p>© 2025 Creative Connect</p>
            <div className="space-x-6">
              <span className="text-blue-600 cursor-pointer hover:underline">
                Analytics Home
              </span>
              <span className="text-blue-600 cursor-pointer hover:underline">
                Terms
              </span>
              <span className="text-blue-600 cursor-pointer hover:underline">
                Privacy
              </span>
              <span className="cursor-pointer hover:underline">Feedback</span>
            </div>
          </footer>
          </div>
        </main>
      </div>
    </AdminAuthGuard>
  );
}
