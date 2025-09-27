"use client";

import { useState } from "react";
import AdminSidebar from "../components/AdminSideBar";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import GeneralSettings from "../components/GeneralSettings";
import PaymentSettings from "../components/PaymentSettings";
import ShippingSettings from "../components/ShippingSettings";
import { FaCog } from "react-icons/fa"; // red icon for heading


const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState("General");

  return (
    <AdminAuthGuard>
      <div className="flex">
        <AdminSidebar />

        <div className="flex-1 px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 lg:py-10 bg-gray-50 min-h-screen">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6 sm:mb-8 bg-gradient-to-r from-white via-[#f8f9fa] to-gray-100 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FaCog className="text-[#891F1A] text-2xl" />
                <h1 className="text-3xl font-bold text-[#891F1A]">
                  Settings & Site Configuration
                </h1>
              </div>
              <p className="text-sm text-gray-500 mt-1 hidden md:block">
                Manage your general, payment, and shipping settings here.
              </p>
            </div>

            {/* Tabs */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-md p-4 sm:p-6 mb-6 sm:mb-8">
              <div className="flex space-x-4 border-b border-gray-200 pb-2">
                {["General", "Payment", "Shipping"].map((tab) => (
                  <button
                    key={tab}
                    className={`px-4 py-2 text-sm font-semibold transition rounded-t-md ${
                      activeTab === tab
                        ? "text-[#891F1A] border-b-2 border-[#891F1A] bg-red-50"
                        : "text-black hover:text-[#891F1A]"
                    }`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="pt-4">
                {activeTab === "General" && <GeneralSettings />}
                {activeTab === "Payment" && <PaymentSettings />}
                {activeTab === "Shipping" && <ShippingSettings />}
              </div>
            </div>
          </div>
        </div>
      </div>
      </AdminAuthGuard>
  );
};

export default SettingsPage;
