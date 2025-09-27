"use client";

import { useEffect, useState } from "react";
import AdminSidebar from "../components/AdminSideBar";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { FaBoxOpen, FaClock, FaCheck, FaTruck } from "react-icons/fa";
import OrderForm from "../components/OrderModal";
import axios, { AxiosHeaders, InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "../../utils/api";

type Order = {
  id: string;
  date: string;
  customer: string;
  items: number;
  total: number;
  status: "Pending" | "Processing" | "Shipped" | "Completed";
};

const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();

const axiosWithKey = axios.create();
axiosWithKey.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!config.headers) {
    config.headers = new AxiosHeaders();
  } else if (!(config.headers instanceof AxiosHeaders)) {
    config.headers = AxiosHeaders.from(config.headers);
  }
  (config.headers as AxiosHeaders).set("X-Frontend-Key", FRONTEND_KEY);
  return config;
});

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filter, setFilter] = useState<
    "All" | "Pending" | "Processing" | "Shipped" | "Completed"
  >("All");

  const capitalizeStatus = (status: string): Order["status"] => {
    const s = status.toLowerCase();
    if (s === "pending") return "Pending";
    if (s === "processing") return "Processing";
    if (s === "shipped") return "Shipped";
    if (s === "completed") return "Completed";
    return "Pending";
  };

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await axiosWithKey.get(`${API_BASE_URL}/api/show-order/`);
        const apiOrders = res.data.orders || [];
        const mappedOrders: Order[] = apiOrders.map((o: any) => ({
          id: o.orderID,
          date: o.Date?.split(" ")[0] || "",
          customer: o.UserName || "Unknown",
          items: o.item?.count || 0,
          total: o.total || 0,
          status: capitalizeStatus(o.status || "pending"),
        }));
        setOrders(mappedOrders);
      } catch (err) {
        toast.error("❌ Failed to load orders");
      }
    };
    fetchOrders();
  }, []);

  const getStatusStyle = (status: string) => {
    const base =
      "inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full";
    switch (status) {
      case "Pending":
        return `${base} bg-yellow-100 text-yellow-800`;
      case "Processing":
        return `${base} bg-blue-100 text-blue-800`;
      case "Shipped":
        return `${base} bg-indigo-100 text-indigo-800`;
      case "Completed":
        return `${base} bg-green-100 text-green-800`;
      default:
        return `${base} bg-gray-200 text-gray-700`;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Pending":
        return <FaClock className="text-yellow-500" />;
      case "Processing":
        return <FaBoxOpen className="text-blue-500" />;
      case "Shipped":
        return <FaTruck className="text-indigo-500" />;
      case "Completed":
        return <FaCheck className="text-green-500" />;
      default:
        return null;
    }
  };

  const handleStatusChange = async (
    orderId: string,
    newStatus: Order["status"]
  ) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    try {
      await axiosWithKey.put(`${API_BASE_URL}/api/edit-order/`, {
        order_id: orderId,
        user_name: order.customer,
        total_price: order.total,
        status: newStatus.toLowerCase(),
      });
      toast.success(`✅ Order status updated to ${newStatus}`);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );
    } catch {
      toast.error("❌ Failed to update status");
    }
  };

  const handleSaveOrder = (order: any) => {
    const customer = order.customer ?? order.user_name ?? "Unknown";
    const items =
      typeof order.items === "number" ? order.items : order.items_count ?? 0;
    const totalStr = String(order.total ?? order.total_price ?? "0");
    const st = String(order.status ?? "Pending");
    const status = capitalizeStatus(st);
    const newId = `ORD${String(orders.length + 1).padStart(3, "0")}`;
    const today = new Date().toISOString().split("T")[0];
    const newEntry: Order = {
      id: newId,
      date: today,
      customer,
      items,
      total: parseFloat(totalStr),
      status,
    };
    setOrders([newEntry, ...orders]);
    toast.success("✅ Order added successfully");
    setIsModalOpen(false);
  };

  return (
    <AdminAuthGuard>
      <div className="flex">
        <AdminSidebar />
        <div className="flex-1 px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 lg:py-10 bg-gray-50 min-h-screen">
          <div className="max-w-7xl mx-auto">
            <div className="mb-6 sm:mb-8 bg-gradient-to-r from-white via-[#f8f9fa] to-gray-100 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                  🧾 Orders
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                  View, manage, and track all customer orders in one place.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-gray-400 hidden md:block text-sm">
                  Last updated: {new Date().toLocaleDateString()}
                </span>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="bg-[#891F1A] text-white px-4 py-2 rounded text-sm hover:bg-[#6d1915]"
                >
                  + Add Order
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center mb-6 sm:mb-8">
              <div className="flex flex-wrap items-center gap-2">
                {["All", "Pending", "Processing", "Shipped", "Completed"].map(
                  (status) => {
                    const isActive = filter === status;
                    const baseStyle =
                      "px-4 py-2 text-sm rounded-full border transition-all";
                    const statusColors: { [key: string]: string } = {
                      All: "border-gray-300 bg-white text-gray-700 hover:bg-gray-100",
                      Pending:
                        "border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100",
                      Processing:
                        "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100",
                      Shipped:
                        "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
                      Completed:
                        "border-green-300 bg-green-50 text-green-700 hover:bg-green-100",
                    };
                    const activeRing = isActive
                      ? "ring-2 ring-offset-1 ring-[#891F1A]"
                      : "";
                    return (
                      <button
                        key={status}
                        onClick={() => setFilter(status as typeof filter)}
                        className={`${baseStyle} ${statusColors[status]} ${activeRing}`}
                      >
                        {status}
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            <div className="overflow-auto rounded-2xl shadow-lg border border-gray-200 max-h-[500px] thin-scrollbar">
              <table className="w-full table-auto text-sm bg-white">
                <thead className="text-white bg-[#891F1A] sticky top-0 z-10">
                  <tr>
                    <th className="p-3 text-left">Order ID</th>
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Customer</th>
                    <th className="p-3 text-center">Items</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700 divide-y divide-gray-100">
                  {orders
                    .filter(
                      (order) => filter === "All" || order.status === filter
                    )
                    .map((order) => (
                      <tr
                        key={order.id}
                        className="hover:bg-gray-50 transition"
                      >
                        <td className="p-4 font-semibold text-[#891F1A]">
                          {order.id}
                        </td>
                        <td className="p-4 text-gray-600">{order.date}</td>
                        <td className="p-4">{order.customer}</td>
                        <td className="p-4 text-center">{order.items}</td>
                        <td className="p-4 text-right font-bold text-green-700">
                          ${order.total.toFixed(2)}
                        </td>
                        <td className="p-4 text-center">
                          <select
                            value={order.status}
                            onChange={(e) =>
                              handleStatusChange(
                                order.id,
                                e.target.value as Order["status"]
                              )
                            }
                            className={`${getStatusStyle(
                              order.status
                            )} bg-white cursor-pointer`}
                          >
                            {[
                              "Pending",
                              "Processing",
                              "Shipped",
                              "Completed",
                            ].map((status) => (
                              <option key={status} value={status}>
                                {status} (↓)
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-4 text-center">
                          <a
                            href={`/admin/orders/${order.id}`}
                            className="bg-[#891F1A] hover:bg-[#6d1915] text-white text-xs px-4 py-2 rounded-full transition duration-200"
                          >
                            View
                          </a>
                        </td>
                      </tr>
                    ))}
                  {orders.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-10 text-center text-gray-400"
                      >
                        <div className="animate-pulse text-sm">
                          Loading orders...
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <OrderForm
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveOrder}
        />
      )}

      <ToastContainer />
    </AdminAuthGuard>
  );
}
