// Front_End/app/admin/orders/[orderId]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import AdminSidebar from '../../components/AdminSideBar';
import AdminAuthGuard from '../../components/AdminAuthGaurd';
import { motion } from 'framer-motion';
import axios, { AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  FaBoxOpen,
  FaTruck,
  FaCheck,
  FaClock,
  FaStickyNote,
  FaShoppingCart,
  FaUserAlt,
  FaSyncAlt,
} from 'react-icons/fa';
import { API_BASE_URL } from '../../../utils/api';

const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();

/* Axios with the Frontend key header */
const axiosWithKey = axios.create();
axiosWithKey.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!config.headers) config.headers = new AxiosHeaders();
  else if (!(config.headers instanceof AxiosHeaders)) {
    config.headers = AxiosHeaders.from(config.headers);
  }
  (config.headers as AxiosHeaders).set('X-Frontend-Key', FRONTEND_KEY);
  return config;
});

/* Types */
type UIItem = {
  title: string;
  quantity: number;
  price: number;       // unit price
  lineTotal?: number;  // line total
};

type LoadedOrder = {
  id: string;
  date: string; // yyyy-mm-dd
  customer: { name: string; email: string; address: string };
  items: UIItem[];
  total: number;
  status: string; // lower-case backend status
  notes: string[];
};

const toAED = (n: number) => `AED ${Number(n || 0).toFixed(2)}`;

/* Map backend -> UI label */
const labelStatus = (s: string): 'Pending' | 'Processing' | 'Shipped' | 'Completed' | 'Cancelled' => {
  const v = (s || '').toLowerCase();
  if (v === 'processing' || v === 'pending') return 'Pending'; // UI merges both as "Pending" or show "Processing" if you prefer
  if (v === 'shipped') return 'Shipped';
  if (v === 'completed') return 'Completed';
  if (v === 'cancelled') return 'Cancelled';
  return 'Pending';
};

/* For the dropdown -> backend value */
const uiToBackendStatus = (label: string) => {
  const v = (label || '').toLowerCase();
  if (v === 'processing') return 'processing';
  if (v === 'pending') return 'pending';
  if (v === 'shipped') return 'shipped';
  if (v === 'completed') return 'completed';
  if (v === 'cancelled') return 'cancelled';
  return 'pending';
};

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = useMemo(() => {
    const raw = (params as any)?.orderId;
    return Array.isArray(raw) ? raw[0] : (raw as string | undefined);
  }, [params]);

  const [order, setOrder] = useState<LoadedOrder | null>(null);
  const [statusLabel, setStatusLabel] = useState<'Pending' | 'Processing' | 'Shipped' | 'Completed' | 'Cancelled'>('Pending');
  const [newNote, setNewNote] = useState('');
  const [error, setError] = useState('');

  const fetchedRef = useRef(false);

  /* Fetch the order (abort/cancel safe) */
  useEffect(() => {
    if (!orderId || fetchedRef.current) return;

    const controller = new AbortController();
    (async () => {
      try {
        const res = await axiosWithKey.get(`${API_BASE_URL}/api/show-order/`, { signal: controller.signal as any });
        const orders = res.data?.orders || [];
        const found = orders.find((o: any) => String(o.orderID) === String(orderId));

        if (!found) {
          setError('❌ Invalid order ID');
          return;
        }

        const total = Number(found.total ?? 0) || 0;
        const itemObj = found.item || {};
        const detail = Array.isArray(itemObj.detail) ? itemObj.detail : [];
        const names: string[] = Array.isArray(itemObj.names) ? itemObj.names : [];
        const count = Number(itemObj.count ?? 0);

        let items: UIItem[] = [];

        if (detail.length > 0) {
          items = detail.map((d: any) => {
            const qty = Number(d?.quantity ?? 1) || 1;
            const unit = Number(d?.unit_price ?? d?.math?.base ?? 0) || 0;
            const lineTotal = Number(d?.total_price ?? unit * qty) || unit * qty;
            return { title: String(d?.product_name || 'Item'), quantity: qty, price: unit, lineTotal };
          });
        } else if (names.length > 0 && count > 0) {
          const perItem = total / count;
          items = names.map((title) => ({ title, quantity: 1, price: perItem, lineTotal: perItem }));
        } else if (count > 0) {
          const perItem = total / count;
          items = Array.from({ length: count }, (_, i) => ({
            title: `Item ${i + 1}`,
            quantity: 1,
            price: perItem,
            lineTotal: perItem,
          }));
        } else if (total > 0) {
          items = [{ title: names[0] || 'Item', quantity: 1, price: total, lineTotal: total }];
        }

        const addr = found.Address || {};
        const address = [addr.street, addr.city, addr.zip].filter(Boolean).join(', ');

        const loaded: LoadedOrder = {
          id: String(found.orderID),
          date: String(found.Date || '').split(' ')[0] || '',
          customer: {
            name: found.UserName || 'N/A',
            email: found.email || 'N/A',
            address: address || 'N/A',
          },
          items,
          total,
          status: String(found.status || 'pending').toLowerCase(),
          notes: [`Order placed on ${found.Date || 'N/A'}`],
        };

        setOrder(loaded);
        setStatusLabel(labelStatus(loaded.status));
        fetchedRef.current = true;
      } catch (err: any) {
        if (err?.name === 'CanceledError') return;
        setError('❌ Failed to fetch order');
      }
    })();

    return () => controller.abort();
  }, [orderId]);

  /* Persist status changes (PUT) */
  useEffect(() => {
    if (!order) return;
    const backendTarget = uiToBackendStatus(statusLabel);
    if (backendTarget === order.status) return;

    (async () => {
      try {
        await axiosWithKey.put(`${API_BASE_URL}/api/edit-order/`, {
          order_id: order.id,
          status: backendTarget,
        });
        toast.success(`Status updated to ${statusLabel}`);
        setOrder((prev) => (prev ? { ...prev, status: backendTarget } : prev));
      } catch (err) {
        toast.error('❌ Failed to update order status');
      }
    })();
  }, [statusLabel, order]);

  /* UI helpers */
  const StatusBadge = ({ s }: { s: typeof statusLabel }) => {
    const base =
      'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide';
    if (s === 'Pending')
      return <span className={`${base} bg-yellow-100 text-yellow-700`}><FaClock /> Pending</span>;
    if (s === 'Processing')
      return <span className={`${base} bg-blue-100 text-blue-700`}><FaSyncAlt /> Processing</span>;
    if (s === 'Shipped')
      return <span className={`${base} bg-indigo-100 text-indigo-700`}><FaTruck /> Shipped</span>;
    if (s === 'Completed')
      return <span className={`${base} bg-green-100 text-green-700`}><FaCheck /> Completed</span>;
    if (s === 'Cancelled')
      return <span className={`${base} bg-gray-200 text-gray-700`}>Cancelled</span>;
    return <span className={`${base} bg-gray-200 text-gray-700`}>Unknown</span>;
  };

  const addNote = () => {
    if (!newNote.trim()) return;
    setOrder((prev) =>
      prev
        ? { ...prev, notes: [...prev.notes, `${newNote} (added on ${new Date().toLocaleDateString()})`] }
        : prev
    );
    setNewNote('');
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 text-red-600 text-lg">
        {error}
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 text-gray-500 text-lg">
        Fetching order…
      </div>
    );
  }

  return (
    <AdminAuthGuard>
      <div
        className="flex"
        style={{ fontFamily: 'var(--font-poppins), Arial, Helvetica, sans-serif' }}
      >
        <AdminSidebar />

        <motion.div
          className="flex-1 px-4 sm:px-6 py-8 bg-gray-50 min-h-screen"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="max-w-4xl mx-auto space-y-6">
            <motion.div
              className="bg-gradient-to-r from-white via-gray-100 to-white px-6 py-5 rounded-xl border shadow-sm"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                🧾 Order #{order.id}
              </h1>
              <p className="text-sm text-gray-500 mt-1">Placed on {order.date}</p>
            </motion.div>

            <motion.div
              className="bg-white rounded-2xl border shadow-lg p-6 space-y-10"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              {/* Customer */}
              <section aria-labelledby="customer-info">
                <h2 id="customer-info" className="text-lg font-semibold flex items-center gap-2 text-gray-700 mb-3">
                  <FaUserAlt /> Customer Info
                </h2>
                <div className="space-y-1 text-sm text-gray-700 pl-1">
                  <p><strong>Name:</strong> {order.customer.name}</p>
                  <p><strong>Email:</strong> {order.customer.email}</p>
                  <p><strong>Address:</strong> {order.customer.address}</p>
                </div>
              </section>

              {/* Items */}
              <section aria-labelledby="ordered-items">
                <h2 id="ordered-items" className="text-lg font-semibold flex items-center gap-2 text-gray-700 mb-3">
                  <FaShoppingCart /> Ordered Items
                </h2>
                <ul className="divide-y divide-gray-100 text-sm text-gray-700">
                  {order.items.map((item: UIItem, i: number) => {
                    const line = typeof item.lineTotal === 'number' ? item.lineTotal : item.price * item.quantity;
                    return (
                      <motion.li
                        key={`${item.title}-${i}`}
                        className="py-2 flex justify-between"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <span>{item.title} (x{item.quantity})</span>
                        <span className="font-semibold">{toAED(line)}</span>
                      </motion.li>
                    );
                  })}
                  {order.items.length === 0 && (
                    <li className="py-2 text-gray-500 italic">No items to display.</li>
                  )}
                </ul>
                <p className="mt-4 font-semibold text-right text-lg text-green-700">
                  Total: {toAED(order.total)}
                </p>
              </section>

              {/* Status */}
              <section aria-labelledby="order-status">
                <h2 id="order-status" className="text-lg font-semibold flex items-center gap-2 text-gray-700 mb-3">
                  <FaBoxOpen /> Order Status
                </h2>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div><StatusBadge s={statusLabel} /></div>
                  <select
                    aria-label="Change order status"
                    value={statusLabel}
                    onChange={(e) => setStatusLabel(e.target.value as any)}
                    className="w-full sm:w-64 border-gray-300 focus:ring-2 focus:ring-red-700 focus:border-red-700 rounded-md px-4 py-2 text-sm text-gray-700 transition-all shadow-sm"
                  >
                    {/* If you want to expose Processing distinctly in UI, keep it here */}
                    <option>Pending</option>
                    <option>Processing</option>
                    <option>Shipped</option>
                    <option>Completed</option>
                    <option>Cancelled</option>
                  </select>
                </div>
              </section>

              {/* Notes (UI-only; not persisted unless you add an endpoint) */}
              <section aria-labelledby="internal-notes">
                <h2 id="internal-notes" className="text-lg font-semibold flex items-center gap-2 text-gray-700 mb-3">
                  <FaStickyNote /> Internal Notes
                </h2>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note (admin only)"
                  rows={3}
                  className="w-full border border-gray-300 rounded-md p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-700 transition shadow-sm"
                />
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={addNote}
                  className="mt-2 bg-red-700 hover:bg-red-800 text-white px-4 py-2 rounded-md text-sm transition"
                >
                  ➕ Add Note
                </motion.button>

                <ToastContainer position="top-right" autoClose={2500} />

                <ul className="mt-4 space-y-3 text-sm text-gray-700">
                  {order.notes.map((note, i) => (
                    <motion.li
                      key={`${note}-${i}`}
                      className="bg-gray-50 border border-gray-200 rounded-md p-3"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 + 0.2 }}
                    >
                      {note}
                    </motion.li>
                  ))}
                </ul>
              </section>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </AdminAuthGuard>
  );
}
