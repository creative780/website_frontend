"use client";

import { useState } from "react";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import AdminSidebar from "../components/AdminSideBar";
import { Line, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

export default function AdminDashboard() {
  const [showSidebar, setShowSidebar] = useState(true);

  function GlassCard({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-200 hover:shadow-xl transition">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">{title}</h2>
        {children}
      </div>
    );
  }

  function Card({ title, value, change, note, icon }: any) {
    const isPositive = change.startsWith("+");
    return (
      <div className="rounded-2xl p-5 text-white shadow-md transition-all duration-300 bg-[#891F1A] hover:scale-105">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm">{title}</span>
          <span className="text-lg">{icon}</span>
        </div>
        <div className="text-3xl font-bold">{value}</div>
        <div
          className={`text-sm mt-1 ${
            isPositive ? "text-green-200" : "text-red-200"
          }`}
        >
          {change}
        </div>
        <div className="text-xs text-white/80 mt-1">{note}</div>
      </div>
    );
  }

  return (
    <AdminAuthGuard>
      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 z-40 h-screen transition-all duration-300 ease-in-out
          ${
            showSidebar
              ? "w-64 translate-x-0 opacity-100"
              : "w-0 -translate-x-full opacity-0"
          }
          bg-white shadow-md overflow-hidden lg:w-64 lg:translate-x-0 lg:opacity-100`}
      >
        <AdminSidebar />
      </div>

      {/* Main layout wrapper */}
      <div
        className={`flex min-h-screen bg-gray-50 text-gray-900 transition-all duration-300 ${
          showSidebar ? "pl-64" : "pl-0"
        }`}
      >
        <main className="flex-1 p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between sticky top-0 z-10 bg-white px-4 py-3 rounded-lg shadow-md">
            <h1 className="text-xl md:text-2xl font-bold">
              Dashboard -{" "}
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </h1>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="px-4 py-2 bg-[#891F1A] text-white rounded-md hover:bg-[#891F1A] transition lg:hidden"
            >
              {showSidebar ? "◀ Hide Sidebar" : "▶ Show Sidebar"}
            </button>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card
              title="Total Revenue"
              value="$1,250.00"
              change="+12.5%"
              note="Trending up"
              icon="💰"
            />
            <Card
              title="New Users"
              value="1234"
              change="-20%"
              note="Down this period"
              icon="👤"
            />
            <Card
              title="Active Users"
              value="45678"
              change="+12.5%"
              note="Strong retention"
              icon="🔥"
            />
            <Card
              title="Growth Rate"
              value="4.5%"
              change="+4.5%"
              note="Steady growth"
              icon="📈"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <GlassCard title="📊 Live Radius User Based Operator">
              <div className="h-64">
                <Line
                  data={{
                    labels: ["0", "20", "40", "60", "80", "100"],
                    datasets: [
                      {
                        label: "Top Value",
                        data: [100, 200, 300, 250, 400, 350],
                        borderColor: "#891F1A",
                        backgroundColor: "transparent",
                        fill: true,
                        tension: 0.4,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      x: { title: { display: true, text: "Time" } },
                      y: {
                        title: { display: true, text: "Users" },
                        beginAtZero: true,
                      },
                    },
                  }}
                />
              </div>
            </GlassCard>

            <GlassCard title="🎯 Targets">
              <div className="h-64 flex items-center justify-center">
                <div className="w-full max-w-md h-full relative">
                  <Pie
                    data={{
                      labels: [
                        "Name-1",
                        "Name-2",
                        "Name-3",
                        "Name-4",
                        "Name-5",
                      ],
                      datasets: [
                        {
                          data: [20, 15, 25, 20, 20],
                          backgroundColor: [
                            "#F87171",
                            "#6366F1",
                            "#FBBF24",
                            "#10B981",
                            "#FB923C",
                          ],
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { position: "right" } },
                    }}
                  />
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Lists */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <GlassCard title="🌍 Top Destination Countries">
              <ul className="space-y-4">
                {[
                  { country: "USA", percentage: 65 },
                  { country: "UK", percentage: 30 },
                  { country: "Canada", percentage: 60 },
                  { country: "Australia", percentage: 55 },
                ].map((dest, idx) => (
                  <li key={idx}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{dest.country}</span>
                      <span className="font-semibold">{dest.percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#891F1A]"
                        style={{ width: `${dest.percentage}%` }}
                      ></div>
                    </div>
                  </li>
                ))}
              </ul>
            </GlassCard>

            <GlassCard title="🔗 Top Visited Websites">
              <ul className="space-y-4">
                {[
                  { url: "www.google.com", visits: 80 },
                  { url: "www.youtube.com", visits: 60 },
                  { url: "www.facebook.com", visits: 50 },
                  { url: "www.instagram.com", visits: 40 },
                ].map((site, idx) => (
                  <li key={idx}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{site.url}</span>
                      <span className="font-semibold">{site.visits}%</span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#891F1A]"
                        style={{ width: `${site.visits}%` }}
                      ></div>
                    </div>
                  </li>
                ))}
              </ul>
            </GlassCard>
          </div>
        </main>
      </div>
    </AdminAuthGuard>
  );
}
