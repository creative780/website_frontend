'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
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

const axiosWithKey = axios.create();
axiosWithKey.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!config.headers) {
    config.headers = new AxiosHeaders();
  } else if (!(config.headers instanceof AxiosHeaders)) {
    config.headers = AxiosHeaders.from(config.headers);
  }
  (config.headers as AxiosHeaders).set('X-Frontend-Key', FRONTEND_KEY);
  return config;
});

type UIItem = {
  title: string;
  quantity: number;
  price: number; // unit price
  lineTotal?: number; // optional, for safety
};

export default function OrderDetailPage() {
  const params = useParams();
  const orderId =
    (Array.isArray((params as any)?.orderId) ? (params as any).orderId[0] : (params as any)?.orderId) as string;

  const [order, setOrder] = useState<any>(null);
  const [status, setStatus] = useState('');
  const [newNote, setNewNote] = useState('');
  const [error, setError] = useState('');

  // util first so it's hoisted and safe to call
  const capitalizeStatus = (s: string): string => {
    const v = s?.toLowerCase();
    if (v === 'pending') return 'Pending';
    if (v === 'processing') return 'Processing'; // UI convenience; backend does not persist this value
    if (v === 'shipped') return 'Shipped';
    if (v === 'completed') return 'Completed';
    if (v === 'cancelled') return 'Cancelled';
    return 'Pending';
  };

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await axiosWithKey.get(`${API_BASE_URL}/api/show-order/`);
        const orders = res.data.orders || [];
        const found = orders.find((o: any) => o.orderID === orderId);

        if (!found) {
          setError('❌ Invalid order ID');
          return;
        }

        const total = Number(found.total ?? 0) || 0;

        // Prefer the detailed payload from backend (has real quantities)
        const itemObj = found.item || {};
        const detail = Array.isArray(itemObj.detail) ? itemObj.detail : [];
        const namesRaw = itemObj.names;
        const names: string[] = Array.isArray(namesRaw) ? namesRaw : [];
        const count = Number(itemObj.count ?? 0);

        let items: UIItem[] = [];

        if (detail.length > 0) {
          // Use real items from backend
          items = detail.map((d: any) => {
            const qty = Number(d?.quantity ?? 1) || 1;
            const unit = Number(d?.unit_price ?? d?.math?.base ?? 0) || 0;
            const lineTotal = Number(d?.total_price ?? unit * qty) || unit * qty;

            return {
              title: String(d?.product_name || 'Item'),
              quantity: qty,
              price: unit,
              lineTotal,
            };
          });
        } else if (names.length > 0 && count > 0) {
          // Fallback: split total evenly across synthesized items
          const perItem = total / count;
          items = names.map((title) => ({
            title,
            quantity: 1,
            price: perItem,
            lineTotal: perItem,
          }));
        } else if (count > 0) {
          // Fallback: generic items if only count is known
          const perItem = total / count;
          items = Array.from({ length: count }).map((_, idx) => ({
            title: `Item ${idx + 1}`,
            quantity: 1,
            price: perItem,
            lineTotal: perItem,
          }));
        } else if (total > 0) {
          // Last resort: single line
          items = [
            {
              title: names[0] || 'Item',
              quantity: 1,
              price: total,
              lineTotal: total,
            },
          ];
        } else {
          items = [];
        }

        const addr = found.Address || {};
        const addressParts = [addr.street, addr.city, addr.zip].filter(Boolean);
        const address = addressParts.join(', ');

        setOrder({
          id: found.orderID,
          date: (found.Date || '').split(' ')[0] || '',
          customer: {
            name: found.UserName || 'N/A',
            email: found.email || 'N/A',
            address: address || 'N/A',
          },
          items,
          total,
          status: found.status || 'pending',
          notes: [`Order placed on ${found.Date || 'N/A'}`],
        });
        setStatus(capitalizeStatus(found.status || 'pending'));
      } catch (err) {
        setError('❌ Failed to fetch order');
      }
    };

    if (orderId) fetchOrder();
  }, [orderId]);

  // status change → update backend (no items sent)
  useEffect(() => {
    if (!order || !status) return;
    if (status.toLowerCase() === String(order.status).toLowerCase()) return;

    const updateStatus = async () => {
      try {
        await axiosWithKey.put(`${API_BASE_URL}/api/edit-order/`, {
          order_id: order.id,
          status: status.toLowerCase(),
        });
        toast.success(`Status updated to ${status}`);
        // also reflect locally to prevent re-trigger
        setOrder((prev: any) => ({ ...prev, status: status.toLowerCase() }));
      } catch (err) {
        console.error(err);
        toast.error('❌ Failed to update order status');
      }
    };

    updateStatus();
  }, [status, order]);

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    setOrder((prev: any) => ({
      ...prev,
      notes: [...prev.notes, `${newNote} (added on ${new Date().toLocaleDateString()})`],
    }));
    setNewNote('');
  };

  const statusBadge = (s: string) => {
    const base =
      'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide';
    switch (s) {
      case 'Pending':
        return <span className={`${base} bg-yellow-100 text-yellow-700`}><FaClock /> Pending</span>;
      case 'Processing':
        return <span className={`${base} bg-blue-100 text-blue-700`}><FaSyncAlt /> Processing</span>;
      case 'Shipped':
        return <span className={`${base} bg-indigo-100 text-indigo-700`}><FaTruck /> Shipped</span>;
      case 'Completed':
        return <span className={`${base} bg-green-100 text-green-700`}><FaCheck /> Completed</span>;
      case 'Cancelled':
        return <span className={`${base} bg-gray-200 text-gray-700`}>Cancelled</span>;
      default:
        return <span className={`${base} bg-gray-200 text-gray-700`}>Unknown</span>;
    }
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
      <div className="flex items-center justify-center h-screen bg-gray-50 text-gray-400 text-lg">
        Fetching order...
      </div>
    );
  }

  return (
    <AdminAuthGuard>
      <div className="flex">
        <AdminSidebar />

        <motion.div
          className="flex-1 px-4 sm:px-6 py-8 bg-gray-50 min-h-screen"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="max-w-4xl mx-auto space-y-6">
            <motion.div
              className="bg-gradient-to-r from-white via-gray-100 to-white px-6 py-5 rounded-xl border shadow-sm"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                🧾 Order #{order.id}
              </h1>
              <p className="text-sm text-gray-500 mt-1">Placed on {order.date}</p>
            </motion.div>

            <motion.div
              className="bg-white rounded-2xl border shadow-lg p-6 space-y-10"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <section>
                <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-700 mb-3">
                  <FaUserAlt /> Customer Info
                </h2>
                <div className="space-y-1 text-sm text-gray-600 pl-1">
                  <p><strong>Name:</strong> {order.customer.name}</p>
                  <p><strong>Email:</strong> {order.customer.email}</p>
                  <p><strong>Address:</strong> {order.customer.address}</p>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-700 mb-3">
                  <FaShoppingCart /> Ordered Items
                </h2>
                <ul className="divide-y divide-gray-100 text-sm text-gray-700">
                  {order.items.map((item: UIItem, i: number) => (
                    <motion.li
                      key={i}
                      className="py-2 flex justify-between"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                    >
                      <span>{item.title} (x{item.quantity})</span>
                      <span className="font-semibold">
                        ${(
                          typeof item.lineTotal === 'number'
                            ? item.lineTotal
                            : item.price * item.quantity
                        ).toFixed(2)}
                      </span>
                    </motion.li>
                  ))}
                  {order.items.length === 0 && (
                    <li className="py-2 text-gray-500 italic">No items to display.</li>
                  )}
                </ul>
                <p className="mt-4 font-semibold text-right text-lg text-green-700">
                  Total: ${Number(order.total || 0).toFixed(2)}
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-700 mb-3">
                  <FaBoxOpen /> Order Status
                </h2>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div>{statusBadge(status)}</div>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full sm:w-64 border-gray-300 focus:ring-2 focus:ring-red-700 focus:border-red-700 rounded-md px-4 py-2 text-sm text-gray-700 transition-all shadow-sm"
                  >
                    <option>Pending</option>
                    {/* 'Processing' is not a backend enum; keep in UI if you want, but backend will persist as lowercase string */}
                    <option>Processing</option>
                    <option>Shipped</option>
                    <option>Completed</option>
                    <option>Cancelled</option>
                  </select>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-700 mb-3">
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
                  whileTap={{ scale: 0.95 }}
                  onClick={handleAddNote}
                  className="mt-2 bg-red-700 hover:bg-red-800 text-white px-4 py-2 rounded-md text-sm transition"
                >
                  ➕ Add Note
                </motion.button>
                <ToastContainer position="top-right" autoClose={3000} />
                <ul className="mt-4 space-y-3 text-sm text-gray-600">
                  {order.notes.map((note: string, i: number) => (
                    <motion.li
                      key={i}
                      className="bg-gray-50 border border-gray-200 rounded-md p-3"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 + 0.3 }}
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
