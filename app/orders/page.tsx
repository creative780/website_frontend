'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaUserAlt, FaShoppingCart, FaBoxOpen } from 'react-icons/fa';
import { X } from 'lucide-react';
import Toastify from 'toastify-js';
import 'toastify-js/src/toastify.css';

// Top / Bottom stack (already in your project)
import Header from '../components/header';
import LogoSection from '../components/LogoSection';
import Navbar from '../components/Navbar';
import HomePageTop from '../components/HomePageTop';
import Footer from '../components/Footer';
import { ChatBot } from '../components/ChatBot';

// Your API base
import { API_BASE_URL } from '../utils/api';

/* =============================================================================
   HELPERS (single-file as requested)
   ========================================================================== */

// Stable per-browser device UUID
function ensureDeviceUUID(): string {
  if (typeof window === 'undefined') return '';
  const KEY = 'cart_user_id';
  let id = localStorage.getItem(KEY)?.trim();
  if (id) return id;

  // RFC4122-ish v4
  id = ([1e7] as any + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c: string) =>
    (Number(c) ^ ((crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> (Number(c) / 4))).toString(16)
  );
  localStorage.setItem(KEY, id);
  return id;
}

// Always send keys/headers
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
function fetchWithKey(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('X-Frontend-Key', FRONTEND_KEY);
  try {
    const deviceUUID = ensureDeviceUUID();
    if (deviceUUID) headers.set('X-Device-UUID', deviceUUID);
  } catch {}
  return fetch(url, { ...init, headers });
}

// UI helpers
function cn(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(' ');
}
function truncate35(s: string) {
  if (!s) return '';
  return s.length > 35 ? s.slice(0, 35).trim() + '…' : s;
}
function AED(amount: number | string) {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(n as number)) return 'AED: 0.00';
  return `AED: ${(n as number).toFixed(2)}`;
}

// Admin → User mapping
// Admin statuses: Pending, Processing, Shipped, Completed (and maybe Cancelled)
// User sees: In Processing, Shipped, Completed
function userFacingStatus(raw: string) {
  const v = (raw || '').toLowerCase();
  if (v === 'pending' || v === 'processing') return 'In Processing';
  if (v === 'shipped') return 'Shipped';
  if (v === 'completed') return 'Completed';
  if (v === 'cancelled') return 'Cancelled';
  return raw || '—';
}
function statusBadge(raw: string) {
  const label = userFacingStatus(raw);
  const base = 'inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold';
  switch (label) {
    case 'In Processing':
      return <span className={cn(base, 'bg-yellow-100 text-yellow-800 border border-yellow-200')}>{label}</span>;
    case 'Shipped':
      return <span className={cn(base, 'bg-blue-100 text-blue-800 border border-blue-200')}>{label}</span>;
    case 'Completed':
      return <span className={cn(base, 'bg-green-100 text-green-800 border border-green-200')}>{label}</span>;
    case 'Cancelled':
      return <span className={cn(base, 'bg-gray-100 text-gray-700 border border-gray-200')}>{label}</span>;
    default:
      return <span className={cn(base, 'bg-gray-100 text-gray-700 border border-gray-200')}>{label}</span>;
  }
}

/* =============================================================================
   TYPES (mirroring your backend responses)
   ========================================================================== */

// /api/show-specific-user-orders/
type OrderItemLite = {
  product_id: string;
  quantity: number;
  unit_price: string | number;
  total_price: string | number;
};
type SpecificOrder = {
  order_id: string;
  date: string; // "YYYY-MM-DD HH:MM:SS"
  status: 'pending' | 'processing' | 'shipped' | 'completed' | 'cancelled' | string;
  total_price: number;
  product_ids: string[];
  items: OrderItemLite[];
};
type SpecificUserOrdersResp = { orders: SpecificOrder[] };

// /api/show-order/
type HumanAttr = {
  attribute_id: string;
  option_id: string;
  attribute_name: string;
  option_label: string;
  price_delta: string; // numeric string
  attribute_order?: number;
  option_order?: number;
};
type ShowOrderItemDetail = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  selection: string;
  math: { base: string; deltas: string[] };
  variant_signature: string;
  // Newly surfaced by backend (optional typing for safety):
  selected_size?: string;
  selected_attributes_human?: HumanAttr[];
};
type ShowOrderEntry = {
  orderID: string;
  Date: string;
  UserName: string;
  item: {
    count: number;
    names: string[];
    detail: ShowOrderItemDetail[];
  };
  total: number;
  status: string;
  Address: { street?: string; city?: string; zip?: string };
  email?: string;
  order_placed_on: string;
};
type ShowOrderResp = { orders: ShowOrderEntry[] };

type DeliveryInfo = {
  name?: string;
  email?: string;
  street?: string;
  city?: string;
  zip?: string;
};

/* =============================================================================
   RECEIPT HTML (single source of truth for Download + Print)
   ========================================================================== */

function buildReceiptHTML(
  order: SpecificOrder,
  orderDetail?: ShowOrderEntry,
  nameCache: Record<string, string> = {}
) {
  const items = order.items || [];
  const safe = (v?: string) => (v && String(v).trim()) || '—';

  const customerName = safe(orderDetail?.UserName);
  const customerEmail = safe(orderDetail?.email);
  const customerAddress =
    [orderDetail?.Address?.street, orderDetail?.Address?.city, orderDetail?.Address?.zip]
      .filter(Boolean)
      .join(', ') || '—';

  // resolve product names
  const lines = items.map((it) => {
    const nm =
      orderDetail?.item?.detail?.find((d) => d.product_id === it.product_id)?.product_name ||
      nameCache[it.product_id] ||
      it.product_id;
    const qty = Number(it.quantity) || 0;
    const unit = Number(it.unit_price) || 0;
    return `<li>${nm} (x${qty}) — AED ${(qty * unit).toFixed(2)}</li>`;
  });

  // clean, print-friendly CSS
  const css = `
    *{box-sizing:border-box}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#111; margin:24px;}
    h1{font-size:28px;margin:0 0 12px}
    h2{font-size:20px;margin:20px 0 8px}
    p{margin:4px 0}
    ul{margin:8px 0 0 20px}
    li{margin:4px 0}
    .muted{color:#555}
    .total{font-weight:700;margin-top:16px;font-size:18px}
    .divider{height:1px;background:#e5e7eb;margin:16px 0}
    @page{margin:14mm}
    @media print {
      a[href]{text-decoration:none}
    }
  `;

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${order.order_id}</title>
<style>${css}</style>
</head>
<body>
  <h1>Order #${order.order_id}</h1>
  <p class="muted">Date: ${order.date}</p>
  <p class="muted">Status: ${userFacingStatus(order.status)}</p>

  <div class="divider"></div>

  <h2>Customer</h2>
  <p>${customerName}</p>
  <p>${customerEmail}</p>
  <p>${customerAddress}</p>

  <div class="divider"></div>

  <h2>Items</h2>
  <ul>
    ${lines.join('')}
  </ul>
  <p class="total">Total: AED ${(Number(order.total_price) || 0).toFixed(2)}</p>
</body>
</html>
  `.trim();
}

/* =============================================================================
   PAGE
   ========================================================================== */

export default function OrdersPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<SpecificOrder[]>([]);
  // Tabs for user: All, In Processing, Shipped, Completed
  const [activeTab, setActiveTab] = useState<'all' | 'processing' | 'shipped' | 'completed'>('all');

  // Maps from /api/show-order/
  const [orderDetailMap, setOrderDetailMap] = useState<Record<string, ShowOrderEntry>>({});
  const [nameCache, setNameCache] = useState<Record<string, string>>({}); // product_id -> product_name

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SpecificOrder | null>(null);
  const [delivery, setDelivery] = useState<DeliveryInfo | null>(null);

  // Initial fetch: device-scoped orders + full order lookups for enrichment
  useEffect(() => {
    const device_uuid = ensureDeviceUUID();
    if (!device_uuid) {
      Toastify({ text: 'Missing device id', duration: 3000, backgroundColor: '#d32f2f' }).showToast();
      setLoading(false);
      return;
    }

    const run = async () => {
      try {
        setLoading(true);

        // 1) specific-user-orders (device filter)
        const url = `${API_BASE_URL}/api/show-specific-user-orders/?device_uuid=${encodeURIComponent(device_uuid)}`;
        const res = await fetchWithKey(url, { method: 'GET', cache: 'no-store' });
        const data: SpecificUserOrdersResp = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(data));
        const list = Array.isArray(data?.orders) ? data.orders : [];
        setOrders(list);

        // 2) show-order (for names, delivery, etc.)
        const res2 = await fetchWithKey(`${API_BASE_URL}/api/show-order/`, { method: 'GET', cache: 'no-store' });
        const allOrders: ShowOrderResp = await res2.json();
        if (res2.ok && Array.isArray(allOrders?.orders)) {
          const map: Record<string, ShowOrderEntry> = {};
          const localNameCache: Record<string, string> = {};
          for (const entry of allOrders.orders) {
            map[entry.orderID] = entry;
            // cache product names
            entry.item?.detail?.forEach((d) => {
              if (d?.product_id && d?.product_name) {
                localNameCache[d.product_id] = d.product_name;
              }
            });
          }
          setOrderDetailMap(map);
          setNameCache((prev) => ({ ...localNameCache, ...prev }));
        }
      } catch (e) {
        console.error('Order fetch failed:', e);
        Toastify({ text: 'Failed to load orders', duration: 3000, backgroundColor: '#d32f2f' }).showToast();
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  // Filtered list by tab (user semantics)
  const filtered = useMemo(() => {
    if (activeTab === 'all') return orders;
    if (activeTab === 'processing') {
      return orders.filter((o) => {
        const s = (o.status || '').toLowerCase();
        return s === 'pending' || s === 'processing';
      });
    }
    return orders.filter((o) => (o.status || '').toLowerCase() === activeTab);
  }, [orders, activeTab]);

  // Build items display for table/cards
  function itemsDisplay(o: SpecificOrder) {
    // Try names from /api/show-order/
    const entry = orderDetailMap[o.order_id];
    let names = (entry?.item?.names || []).filter(Boolean);

    // Fallback: nameCache per product_id; fall back to product_id itself
    if (!names.length) {
      const derived = (o.items || []).map((it) => nameCache[it.product_id] || it.product_id);
      names = derived;
    }

    const joined = (names || []).join(', ');
    return truncate35(joined);
  }

  function totalItems(o: SpecificOrder) {
    return (o.items || []).reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  }

  // Open modal + fill delivery section
  const onView = (o: SpecificOrder) => {
    setSelectedOrder(o);
    const entry = orderDetailMap[o.order_id];
    if (entry) {
      setDelivery({
        name: entry?.UserName || '',
        email: entry?.email || '',
        street: entry?.Address?.street || '',
        city: entry?.Address?.city || '',
        zip: entry?.Address?.zip || '',
      });
    } else {
      setDelivery(null);
    }
    setModalOpen(true);
  };

  /* ============================
     Print / Download — SAME HTML
     ============================ */

  function downloadReceiptHTML(order: SpecificOrder) {
    try {
      const entry = orderDetailMap[order.order_id];
      const html = buildReceiptHTML(order, entry, nameCache);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${order.order_id}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      Toastify({ text: 'Failed to download receipt', duration: 2500, backgroundColor: '#d32f2f' }).showToast();
    }
  }

  // Hidden-iframe approach avoids popup blockers and prints the exact same HTML
  function printReceipt(order: SpecificOrder) {
    try {
      const entry = orderDetailMap[order.order_id];
      const html = buildReceiptHTML(order, entry, nameCache);

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) throw new Error('No print document');

      doc.open();
      doc.write(html);
      doc.close();

      iframe.onload = () => {
        const win = iframe.contentWindow;
        if (!win) return;
        win.focus();
        win.print();
        setTimeout(() => document.body.removeChild(iframe), 300);
      };
    } catch {
      Toastify({ text: 'Failed to print receipt', duration: 2500, backgroundColor: '#d32f2f' }).showToast();
    }
  }

  // Build the exact line:
  // ProductName (Attribute 1:Selected Option, Attribute 2:Selected Option): Product Quantity x $(Base + Delta1, Delta2) = $Total
  function buildDetailLine(
    productName: string,
    d?: ShowOrderItemDetail | null,
    qty?: number,
    unit?: number,
    total?: number
  ) {
    const name = productName || 'Item';
    const q = Number(qty ?? d?.quantity ?? 1) || 1;

    const size = (d?.selected_size || '').trim();
    const human = Array.isArray(d?.selected_attributes_human) ? d!.selected_attributes_human : [];

    const parts: string[] = [];
    if (size) parts.push(`Size: ${size}`);
    for (const h of human) {
      const a = (h.attribute_name || '').trim();
      const o = (h.option_label || '').trim();
      if (a && o) parts.push(`${a}: ${o}`);
    }
    const insideParens = parts.length ? ` (${parts.join(', ')})` : '';

    const base = d?.math?.base ?? (typeof unit === 'number' ? String(unit) : '0');
    const deltas = Array.isArray(d?.math?.deltas) ? d!.math.deltas : [];
    const nonZeroDeltas = deltas.filter((x) => Number(x || 0) !== 0);

    const pricePieces = [Number(base || 0).toFixed(2), ...nonZeroDeltas.map((x) => Number(x || 0).toFixed(2))];
    const priceExpr = `$(${pricePieces.join(' + ') || Number(base || 0).toFixed(2)})`;

    const lineTotal = typeof total === 'number' ? total : Number(d?.total_price || 0);

    return `${name}${insideParens}: ${q} x ${priceExpr} = $${Number(lineTotal || 0).toFixed(2)}`;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-black" style={{ fontFamily: 'var(--font-poppins), Arial, Helvetica, sans-serif' }}>
      {/* Top stack */}
      <Header />
      <LogoSection />
      <Navbar />
      <HomePageTop />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        {/* Tabs */}
        <div className="mt-8 flex flex-wrap gap-2">
          {[
            { key: 'all', label: 'All Orders' },
            { key: 'processing', label: 'In Processing' }, // pending OR processing
            { key: 'shipped', label: 'Shipped' },
            { key: 'completed', label: 'Completed' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as any)}
              className={cn(
                'px-4 py-2 rounded-full text-sm border transition',
                activeTab === t.key ? 'bg-[#891F1A] text-white border-[#891F1A]' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ------------ DESKTOP / TABLET TABLE (md+) ------------ */}
        <div className="mt-6 bg-white rounded-xl border shadow-sm overflow-hidden hidden md:block">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-[#891F1A] text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold ">Order ID</th>
                  <th className="px-4 py-3 text-left font-semibold ">Order Items</th>
                  <th className="px-4 py-3 text-left font-semibold ">Total Items</th>
                  <th className="px-4 py-3 text-left font-semibold ">Price</th>
                  <th className="px-4 py-3 text-left font-semibold ">Status</th>
                  <th className="px-4 py-3 text-left font-semibold ">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading…</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No orders found.</td>
                  </tr>
                ) : (
                  filtered.map((o) => (
                    <tr key={o.order_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{o.order_id}</td>
                      <td className="px-4 py-3 text-gray-700">{itemsDisplay(o)}</td>
                      <td className="px-4 py-3 text-gray-700">{totalItems(o)}</td>
                      <td className="px-4 py-3 text-gray-900 font-semibold">{AED(o.total_price)}</td>
                      <td className="px-4 py-3">{statusBadge(o.status)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onView(o)}
                          className="px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-[#891F1A] text-white hover:bg-[#6e1815]"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ------------ MOBILE CARDS (sm and down) ------------ */}
        <div className="mt-6 space-y-3 md:hidden">
          {loading ? (
            <div className="p-6 text-center bg-white rounded-xl border shadow-sm text-gray-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center bg-white rounded-xl border shadow-sm text-gray-500">No orders found.</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.order_id}
                onClick={() => onView(o)}
                className="w-full text-left bg-white rounded-xl border shadow-sm p-4 active:scale-[0.99] transition"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Order#: {o.order_id}</h3>
                  {statusBadge(o.status)}
                </div>
                <div className="mt-2 text-sm text-gray-700">
                  <p className="mt-1"><span className="font-medium">Total Items:</span> {totalItems(o)}</p>
                  <p className="mt-1"><span className="font-medium">Total Price:</span> {AED(o.total_price)}</p>
                  <p className="mt-1 text-gray-500"><span className="font-medium">Placed on:</span> {o.date}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </main>

      {/* Bottom stack */}
      <Footer />
      <ChatBot />

      {/* Receipt Modal */}
      <AnimatePresence>
        {modalOpen && selectedOrder && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/30" onClick={() => setModalOpen(false)} />

            {/* Panel */}
            <motion.div
              className="relative z-10 w-full max-w-3xl"
              initial={{ scale: 0.98, y: 8, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.98, y: 8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            >
              <div className="bg-white rounded-2xl border shadow-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b bg-[#891F1A] text-white ">
                  <h3 className="text-lg font-semibold">Order Receipt</h3>
                  <button onClick={() => setModalOpen(false)} className="p-1.5 rounded hover:bg-black">
                    <X size={18} />
                  </button>
                </div>

                <div className="p-6 max-h-[80vh] overflow-y-auto">
                  {/* Heading */}
                  <motion.div
                    className="bg-gradient-to-r from-white via-gray-100 to-white px-6 py-5 rounded-xl border shadow-sm"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 flex items-center gap-2">
                      🧾 Order #{selectedOrder.order_id}
                    </h1>
                    <p className="text-sm text-gray-200 sm:text-gray-500 mt-1">Placed on {selectedOrder.date}</p>
                  </motion.div>

                  {/* Body */}
                  <motion.div
                    className="bg-white rounded-2xl border shadow-lg p-6 space-y-10 mt-6"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    {/* Customer Info */}
                    <section>
                      <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-700 mb-3">
                        <FaUserAlt /> Customer Info
                      </h2>
                      <div className="space-y-1 text-sm text-gray-600 pl-1">
                        <p><strong>Name:</strong> {delivery?.name || '—'}</p>
                        <p><strong>Email:</strong> {delivery?.email || '—'}</p>
                        <p>
                          <strong>Address:</strong>{' '}
                          {[delivery?.street, delivery?.city, delivery?.zip].filter(Boolean).join(', ') || '—'}
                        </p>
                      </div>
                    </section>

                    {/* Items */}
                    <section>
                      <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-700 mb-3">
                        <FaShoppingCart /> Ordered Items
                      </h2>
                      <ul className="divide-y divide-gray-100 text-sm text-gray-700">
                        {(selectedOrder.items || []).map((it, i) => {
                          const entry = orderDetailMap[selectedOrder.order_id];
                          const d: ShowOrderItemDetail | undefined =
                            entry?.item?.detail?.find((x) => x.product_id === it.product_id);
                          const nm =
                            d?.product_name ||
                            nameCache[it.product_id] ||
                            it.product_id;

                          const qty = Number(it.quantity) || Number(d?.quantity || 1) || 1;
                          const unit = Number(it.unit_price) || Number(d?.unit_price || 0) || 0;
                          const total = Number(it.total_price) || Number(d?.total_price || unit * qty) || unit * qty;

                          const prettyLine = buildDetailLine(nm, d, qty, unit, total);

                          return (
                            <motion.li
                              key={`${it.product_id}-${i}`}
                              className="py-3 flex items-start justify-between gap-4"
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.06 }}
                            >
                              <div className="flex-1 min-w-0">
                                {/* Product title */}
                                <div className="font-medium text-gray-900 truncate">{nm}</div>
                                {/* Exact required line under the product */}
                                <div className="text-xs text-gray-600 mt-0.5">{prettyLine}</div>
                              </div>
                              <div className="font-semibold whitespace-nowrap">
                                AED {Number(total).toFixed(2)}
                              </div>
                            </motion.li>
                          );
                        })}
                      </ul>
                      <p className="mt-4 font-semibold text-right text-lg text-green-700">
                        Total: AED {Number(selectedOrder.total_price || 0).toFixed(2)}
                      </p>
                    </section>

                    {/* Status (read-only look per your spec) */}
                    <section>
                      <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-700 mb-3">
                        <FaBoxOpen /> Order Status
                      </h2>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div>{statusBadge(selectedOrder.status)}</div>
                      </div>
                    </section>

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row gap-3 justify-end">
                      <button
                        onClick={() => printReceipt(selectedOrder)}
                        className="px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
                      >
                        Print Receipt
                      </button>
                      <button
                        onClick={() => downloadReceiptHTML(selectedOrder)}
                        className="px-4 py-2 rounded-md bg-[#891F1A] text-white hover:bg-[#6e1815]"
                      >
                        Download Receipt
                      </button>
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
