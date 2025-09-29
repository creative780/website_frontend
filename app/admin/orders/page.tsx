"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import AdminSidebar from "../components/AdminSideBar";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import axios, { AxiosHeaders, InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "../../utils/api";

/* ========================= Types ========================= */
type OrderStatus = "Pending" | "Processing" | "Shipped" | "Completed";

type Order = {
  id: string;
  date: string; // YYYY-MM-DD
  customer: string;
  items: number;
  total: number;
  status: OrderStatus;
};

/* ================= FRONTEND KEY → request helper ================= */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();

const axiosWithKey = axios.create({
  withCredentials: false,
});

axiosWithKey.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Normalize headers for Axios v1
  if (!config.headers) {
    config.headers = new AxiosHeaders();
  } else if (!(config.headers instanceof AxiosHeaders)) {
    config.headers = AxiosHeaders.from(config.headers);
  }
  if (FRONTEND_KEY) {
    (config.headers as AxiosHeaders).set("X-Frontend-Key", FRONTEND_KEY);
  }
  // Safeguards to reduce accidental caching and preflights
  (config.headers as AxiosHeaders).set("Accept", "application/json");
  (config.headers as AxiosHeaders).set("Content-Type", "application/json");
  config.transformRequest = [(data) => (data ? JSON.stringify(data) : data)];
  return config;
});

/* ======================= Utilities ======================= */
const toOrderStatus = (status: unknown): OrderStatus => {
  const s = String(status || "").toLowerCase();
  if (s === "pending") return "Pending";
  if (s === "processing") return "Processing";
  if (s === "shipped") return "Shipped";
  if (s === "completed") return "Completed";
  return "Pending";
};

const currency = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

/* ========================= Page ========================= */
export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filter, setFilter] = useState<OrderStatus | "All">("All");
  const [loading, setLoading] = useState(true);

  const captionId = useId();

  const statusFilters: Array<OrderStatus | "All"> = useMemo(
    () => ["All", "Pending", "Processing", "Shipped", "Completed"],
    []
  );

  const statusClass = useCallback((status: OrderStatus | "All") => {
    const base =
      "px-4 py-2 text-sm rounded-full border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
    const map: Record<OrderStatus | "All", string> = {
      All: "border-gray-300 bg-white text-gray-700 hover:bg-gray-100 focus-visible:ring-gray-400",
      Pending:
        "border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 focus-visible:ring-yellow-400",
      Processing:
        "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 focus-visible:ring-blue-400",
      Shipped:
        "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 focus-visible:ring-indigo-400",
      Completed:
        "border-green-300 bg-green-50 text-green-700 hover:bg-green-100 focus-visible:ring-green-400",
    };
    return `${base} ${map[status]}`;
  }, []);

  const tableStatusPill = useCallback((status: OrderStatus) => {
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
  }, []);

  /* ===================== Data Loading ===================== */
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const res = await axiosWithKey.get(`${API_BASE_URL}/api/show-order/`, {
          signal: ac.signal as any, // axios supports AbortController
          params: { _: Date.now() }, // cache buster
        });
        const apiOrders = res?.data?.orders ?? [];
        const mapped: Order[] = apiOrders.map((o: any) => ({
          id: String(o.orderID ?? o.id ?? ""),
          date: String(o.Date ?? o.date ?? "").split(" ")[0] || "",
          customer: String(o.UserName ?? o.customer ?? "Unknown"),
          items: Number(o.item?.count ?? o.items ?? 0) || 0,
          total: Number(o.total ?? o.total_price ?? 0) || 0,
          status: toOrderStatus(o.status),
        }));
        setOrders(mapped);
      } catch (err: any) {
        if (err?.name !== "CanceledError") {
          toast.error("❌ Failed to load orders");
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  /* ===================== Actions/Mutations ===================== */
  const handleStatusChange = useCallback(
    async (orderId: string, newStatus: OrderStatus) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;

      try {
        await axiosWithKey.put(`${API_BASE_URL}/api/edit-order/`, {
          order_id: orderId,
          user_name: order.customer,
          total_price: order.total,
          status: newStatus.toLowerCase(),
        });

        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
        );
        toast.success(`✅ Order status updated to ${newStatus}`);
      } catch {
        toast.error("❌ Failed to update status");
      }
    },
    [orders]
  );

  // Keep the incoming structure tolerant; normalize into our Order shape then prepend.
  const handleSaveOrder = useCallback(
    (order: any) => {
      const customer = String(order.customer ?? order.user_name ?? "Unknown");
      const items = Number(
        typeof order.items === "number" ? order.items : order.items_count ?? 0
      );
      const totalNum = Number(order.total ?? order.total_price ?? 0) || 0;
      const status = toOrderStatus(order.status ?? "Pending");
      const newId = `ORD${String(orders.length + 1).padStart(3, "0")}`;
      const today = new Date().toISOString().split("T")[0];

      const newEntry: Order = {
        id: newId,
        date: today,
        customer,
        items,
        total: totalNum,
        status,
      };
      setOrders((prev) => [newEntry, ...prev]);
      toast.success("✅ Order added successfully");
      setIsModalOpen(false);
    },
    [orders.length]
  );

  /* ========================= Render ========================= */
  return (
    <AdminAuthGuard>
      <div
        className="flex bg-gray-50 text-black"
        style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}
      >
        <aside className="w-64 hidden lg:block border-r border-gray-200 bg-white">
          <AdminSidebar />
        </aside>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 lg:py-10 min-h-screen">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <header className="mb-6 sm:mb-8 bg-gradient-to-r from-white via-[#f8f9fa] to-gray-100 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-800">🧾 Orders</h1>
                <p className="text-gray-500 mt-1 text-sm">
                  View, manage, and track all customer orders in one place.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-gray-400 hidden md:block text-sm" aria-live="polite">
                  Last updated: {new Date().toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="bg-[#891F1A] text-white px-4 py-2 rounded text-sm hover:bg-[#6d1915] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#891F1A]"
                >
                  + Add Order
                </button>
              </div>
            </header>

            {/* Filters */}
            <section className="flex flex-col sm:flex-row gap-2 sm:items-center mb-6 sm:mb-8">
              <div className="flex flex-wrap items-center gap-2">
                {statusFilters.map((status) => {
                  const isActive = filter === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setFilter(status)}
                      className={`${statusClass(status)} ${
                        isActive ? "ring-2 ring-offset-1 ring-[#891F1A]" : ""
                      }`}
                      aria-pressed={isActive}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Table */}
            <section className="overflow-auto rounded-2xl shadow-lg border border-gray-200 max-h-[500px] thin-scrollbar">
              <table className="w-full table-auto text-sm bg-white" aria-describedby={captionId}>
                <caption id={captionId} className="sr-only">
                  Orders table with filtering and inline status updates
                </caption>
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
                  {loading && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-gray-400">
                        <div className="animate-pulse text-sm">Loading orders…</div>
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    orders
                      .filter((o) => filter === "All" || o.status === filter)
                      .map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50 transition">
                          <th scope="row" className="p-4 font-semibold text-[#891F1A]">
                            {order.id}
                          </th>
                          <td className="p-4 text-gray-600">{order.date || "—"}</td>
                          <td className="p-4">{order.customer}</td>
                          <td className="p-4 text-center">{order.items}</td>
                          <td className="p-4 text-right font-bold text-green-700">
                            {currency.format(order.total)}
                          </td>
                          <td className="p-4 text-center">
                            <label className="sr-only" htmlFor={`status-${order.id}`}>
                              Change status for order {order.id}
                            </label>
                            <select
                              id={`status-${order.id}`}
                              value={order.status}
                              onChange={(e) =>
                                handleStatusChange(order.id, e.target.value as OrderStatus)
                              }
                              className={`${tableStatusPill(order.status)} bg-white cursor-pointer`}
                            >
                              {(["Pending", "Processing", "Shipped", "Completed"] as OrderStatus[]).map(
                                (s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                )
                              )}
                            </select>
                          </td>
                          <td className="p-4 text-center">
                            <Link
                              href={`/admin/orders/${order.id}`}
                              className="bg-[#891F1A] hover:bg-[#6d1915] text-white text-xs px-4 py-2 rounded-full transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#891F1A]"
                              aria-label={`View order ${order.id}`}
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}

                  {!loading && orders.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-gray-400">
                        No orders found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </div>
        </main>
      </div>

      {/* Lazy-mounted to avoid hydration mismatch */}
      {isModalOpen && (
        // NOTE: keeping your existing component API
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        <OrderForm onClose={() => setIsModalOpen(false)} onSave={handleSaveOrder} />
      )}

      <ToastContainer />
    </AdminAuthGuard>
  );
}
