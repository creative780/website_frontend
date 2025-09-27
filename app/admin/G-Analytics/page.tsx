"use client";

import React from "react";
import { AnalyticsOverviewCard } from "../components/AnalyticsOverviewCard";
import { AnalyticsLineChart } from "../components/AnalyticsLineChart";
import { AnalyticsRealtimeBar } from "../components/AnalyticsRealtimeBar"; // Keep this import now that the component is separate
import AdminSidebar from "../components/AdminSideBar";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import { useRef } from "react";

export default function AnalyticsPage() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const amount = 320;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -amount : amount,
        behavior: "smooth",
      });
    }
  };

  return (
    <AdminAuthGuard>
      <div className="flex min-h-screen bg-gray-50">
        {/* Sidebar */}
        <div className="w-64 hidden lg:block border-r border-gray-200">
          <AdminSidebar />
        </div>

        {/* Main Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 lg:py-10 bg-gray-50 min-h-screen">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6 sm:mb-8 bg-gradient-to-r from-white via-[#f8f9fa] to-gray-100 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                  📊 Analytics Dashboard
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                  View comprehensive analytics and performance metrics for your website.
                </p>
              </div>
              <button className="px-4 py-2 text-sm font-medium text-white bg-[#891F1A] hover:bg-[#6d1915] rounded-md transition-colors">
                Download Report
              </button>
            </div>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <AnalyticsOverviewCard
              title="Active Users"
              value="1"
              change="+12%"
            />
            <AnalyticsOverviewCard
              title="Event Count"
              value="144"
              change="+8%"
            />
            <AnalyticsOverviewCard title="Key Events" value="0" change="0%" />
            <AnalyticsOverviewCard title="New Users" value="1" change="+1%" />
          </div>
          {/* Line Chart + Realtime Activity */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
            {" "}
            {/* This is the parent div */}
            <div className="xl:col-span-2">
              <AnalyticsLineChart title="User Activity (Last 7 Days)" />
            </div>
            {/* Real-time Users Card */}
            <div className="bg-white border border-gray-200 rounded-md p-4 shadow-sm flex flex-col min-h-[360px]">
              <div className="flex items-start justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                  Active Users in Last 30 Minutes
                </h2>
                <div className="bg-green-100 text-green-600 text-xs px-2 py-0.5 rounded-full font-medium flex items-center">
                  <svg
                    className="w-4 h-4 mr-1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Live
                </div>
              </div>

              <div className="text-4xl font-bold mb-2 text-[#891F1A]">1</div>

              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">
                  Active Users Per Minute
                </p>
                <div className="h-[100px] overflow-hidden">
                  <AnalyticsRealtimeBar />
                </div>
              </div>

              <hr className="border-gray-200 my-2" />

              <div className="text-xs text-gray-700 flex justify-between mb-1 font-medium">
                <span>Country</span>
                <span>Active Users</span>
              </div>
              <div className="text-sm flex justify-between text-gray-800">
                <span className="text-[#891F1A] font-semibold">Pakistan</span>
                <span>1</span>
              </div>

              <div className="text-right mt-auto pt-4">
                <button className="text-sm text-[#891F1A] hover:underline">
                  View Realtime
                </button>
              </div>
            </div>
            {/* END Real-time Users Card */}
          </div>{" "}
          {/* This is the correct closing div for "Line Chart + Realtime Activity" grid */}
          {/* Recently Accessed */}
          <div className="mb-12 w-full relative">
            {/* Header */}
            <div className="flex items-center justify-between px-6 mb-4">
              <h2 className="text-lg font-semibold text-[#891F1A]">
                Recently accessed
              </h2>
              <button className="text-sm text-[#891F1A] hover:underline">
                View All
              </button>
            </div>

            {/* Scrollable Cards with Arrows */}
            <div className="relative w-full px-4">
              {/* Left Arrow */}
              <div
                className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 bg-white border border-gray-300 rounded-full shadow w-9 h-9 flex items-center justify-center hover:bg-gray-100 cursor-pointer"
                onClick={() => scroll("left")}
              >
                <svg
                  className="w-4 h-4 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </div>

              {/* Scroll Container */}
              <div
                ref={scrollRef}
                className="flex gap-4 overflow-x-auto scroll-smooth hide-scrollbar"
              >
                {[
                  { name: "Queries", icon: "📊" },
                  { name: "Admin", icon: "⚙" },
                  { name: "Users overview", icon: "👥" },
                  { name: "Realtime overview", icon: "⏱" },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="min-w-[270px] w-full max-w-sm bg-white border border-gray-200 rounded-xl px-6 py-5 text-sm text-gray-800 hover:text-blue-600 shadow-sm flex flex-col shrink-0"
                  >
                    <div className="flex items-center gap-2 text-blue-600 mb-2">
                      {/* Replace with specific icons if desired */}
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 6h16M4 10h16M4 14h16"
                          style={{ color: "#891F1A" }}
                        />
                      </svg>
                      <span className="text-sm font-medium text-[#891F1A]">
                        {item.name}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">2 days ago</div>
                  </div>
                ))}
              </div>

              {/* Right Arrow */}
              <div
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-white border border-gray-300 rounded-full shadow w-9 h-9 flex items-center justify-center hover:bg-gray-100 cursor-pointer"
                onClick={() => scroll("right")}
              >
                <svg
                  className="w-4 h-4 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>
          </div>
          {/* Suggested for You */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-gray-700">
                Suggested for You
              </h2>
              <button className="text-xs text-[#891F1A] hover:underline">
                View All Insights
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {/* Card 1: New Users by Source */}
              <div className="bg-white border border-gray-200 rounded-md p-4 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-600 uppercase mb-3">
                  New users by <br /> First user source
                </h3>
                <table className="w-full text-sm text-gray-700">
                  <thead>
                    <tr className="border-b text-xs text-gray-500">
                      <th className="text-left py-1">First User Source</th>
                      <th className="text-right py-1">New Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-1">(direct)</td>
                      <td className="text-right py-1">1</td>
                    </tr>
                  </tbody>
                </table>
                <div className="text-xs text-gray-400 mt-3">Last 7 days</div>
              </div>

              {/* Card 2: Active Users by Country */}
              <div className="bg-white border border-gray-200 rounded-md p-4 shadow-sm relative">
                <h3 className="text-xs font-semibold text-gray-600 uppercase mb-3">
                  Active users{" "}
                  <span className="normal-case">by Country ID</span>
                </h3>

                {/* 🌍 World Map Container */}
                <div className="relative w-full h-36 bg-gray-100 rounded mb-4 overflow-hidden flex items-center justify-center">
                  <img
                    src="/images/world-map.png" // Update to your actual map image path
                    alt="World Map"
                    className="w-full h-full object-contain"
                  />

                  {/* 🏷 Hover-like Static Tooltip */}
                  <div className="absolute bottom-2 left-2 bg-white text-xs text-gray-700 shadow-md rounded-md p-3 border border-gray-200 w-fit">
                    <div className="text-[10px] text-gray-500 mb-1">
                      Jul 22 – Jul 28, 2025
                    </div>
                    <div className="flex items-center gap-2">
                      <img
                        src="/images/pk-flag.png"
                        alt="Pakistan Flag"
                        className="w-4 h-4 rounded-sm"
                      />
                      <span className="font-medium text-gray-800">
                        Pakistan
                      </span>
                      <span className="ml-auto font-semibold text-gray-900">
                        1
                      </span>
                    </div>
                  </div>
                </div>

                {/* 📊 Country Data Table */}
                <table className="w-full text-sm text-gray-700">
                  <thead>
                    <tr className="border-b text-xs text-gray-500">
                      <th className="text-left py-1">Country</th>
                      <th className="text-right py-1">Active Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-1 text-[#891F1A] font-semibold">
                        Pakistan
                      </td>
                      <td className="text-right py-1">1</td>
                    </tr>
                  </tbody>
                </table>

                {/* 📅 Footer */}
                <div className="mt-3 flex justify-between text-xs text-gray-400">
                  <span>Last 7 days</span>
                  <a href="#" className="text-[#891F1A] hover:underline">
                    View countries
                  </a>
                </div>
              </div>

              {/* Card 3: Views by Page Title */}
              <div className="bg-white border border-gray-200 rounded-md p-4 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-600 uppercase mb-3">
                  Views by <br /> Page title and screen
                </h3>
                <table className="w-full text-sm text-gray-700">
                  <thead>
                    <tr className="border-b text-xs text-gray-500">
                      <th className="text-left py-1">Page Title</th>
                      <th className="text-right py-1">Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td
                        className="py-1 truncate"
                        title="404: This page could not be found"
                      >
                        404: This page could...
                      </td>
                      <td className="text-right py-1">3</td>
                    </tr>
                  </tbody>
                </table>
                <div className="text-xs text-gray-400 mt-3">Last 7 days</div>
              </div>
            </div>
          </div>
          {/* Insights & recommendations */}
          {/* Insights & Recommendations Section */}
          <div className="mt-12">
            {/* Heading outside the card */}
            <h1 className="text-base font-medium text-gray-800 mb-3">
              Insights & recommendations
            </h1>

            {/* Card Box */}
            <div className="bg-gray-50 border border-gray-200 rounded-md px-6 py-16 text-center shadow-sm">
              <div className="flex flex-col items-center justify-center max-w-md mx-auto">
                {/* Illustration */}
                <img
                  src="https://ssl.gstatic.com/analytics/analytics-frontend.indexpage_20250727.19_p0/index/static/components/noinsights/waiting_hourglass.png" // Replace with the actual path in your public folder
                  alt="Insights Illustration"
                  className="w-28 h-28 mb-6"
                />

                {/* Main Text */}
                <p className="text-sm text-gray-800 font-medium mb-2">
                  Your insights will appear here soon.
                </p>

                {/* Subtext */}
                <p className="text-sm text-gray-600 mb-5">
                  In the meantime, you can create new custom insights to monitor
                  your most important metrics.{" "}
                  <a href="#" className="text-blue-600 hover:underline">
                    Learn more
                  </a>
                </p>

                {/* CTA Button */}
                <button className="bg-[#891F1A] hover:bg-[brown] text-white text-sm font-semibold px-4 py-2 rounded-md shadow">
                  See Suggested Insights
                </button>
              </div>
            </div>
          </div>
          </div>
        </main>
      </div>
    </AdminAuthGuard>
  );
}
