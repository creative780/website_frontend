'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../../utils/api';

//
// ---- Frontend key helper (required for FrontendOnlyPermission) ----
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set('X-Frontend-Key', FRONTEND_KEY);
  return { ...init, headers };
};
//
// -------------------------------------------------------------------

type OrderStatus = 'Pending' | 'Processing' | 'Shipped' | 'Completed';

type OrderFormData = {
  customer: string;
  items: number;
  total: string;
  status: OrderStatus;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  zip_code?: string;
  notes?: string;
  date?: string;
};

type OrderPayload = {
  user_name: string;
  delivery: {
    name: string;
    email: string;
    phone: string;
    street_address: string;
    city: string;
    zip_code: string;
    instructions: string;
  };
  status: OrderStatus;
  total_price: string;
  notes: string;
  items: {
    product_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }[];
};

type Product = {
  id: string | number;
  name: string;
  price: string | number;
  image?: string;
  subcategory?: { id: string | number | null; name: string | null };
  stock_status?: string | null;
  stock_quantity?: number | null;
  printing_methods?: string[];
};

interface OrderFormProps {
  onClose: () => void;
  onSave: (order: OrderPayload) => void;
}

export default function OrderForm({ onClose, onSave }: OrderFormProps) {
  const today = new Date().toISOString().split('T')[0];

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Selected product state now also tracks editable unitPrice
  const [selectedProducts, setSelectedProducts] = useState<{
    [id: string]: { quantity: number; unitPrice: number };
  }>({});

  // Warn once if key missing
  const warnedMissingKey = useRef(false);
  useEffect(() => {
    if (!FRONTEND_KEY && !warnedMissingKey.current) {
      warnedMissingKey.current = true;
      console.warn('NEXT_PUBLIC_FRONTEND_KEY is empty; requests may be rejected (401).');
      toast.warn('Frontend key missing. Set NEXT_PUBLIC_FRONTEND_KEY to avoid 401.');
    }
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/show-product/`,
          withFrontendKey({
            headers: { 'Content-Type': 'application/json' },
            method: 'GET',
          }),
        );

        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          setProducts([]);
          setErrorMsg(`Fetch failed (${res.status}).`);
          console.error('show-product non-OK:', res.status, txt);
          const msg =
            res.status === 401
              ? 'Products fetch failed (401). Check X-Frontend-Key.'
              : `Products fetch failed (${res.status}).`;
          toast.error(msg);
          return;
        }

        const data = await res.json();
        if (data && typeof data === 'object' && !Array.isArray(data) && 'detail' in data) {
          setProducts([]);
          const msg = (data as any).detail || 'Not authorized to fetch products.';
          setErrorMsg(String(msg));
          toast.error(String(msg));
          return;
        }

        const maybeArray = Array.isArray(data) ? data : (data && (data as any).products);
        if (Array.isArray(maybeArray)) {
          setProducts(maybeArray as Product[]);
          if (maybeArray.length === 0) {
            setErrorMsg('No products returned by API.');
            toast.info('No products found.');
          }
        } else {
          setProducts([]);
          setErrorMsg('Unexpected API response shape.');
          toast.error('Unexpected products response. Check API payload.');
        }
      } catch (err: any) {
        console.error('Failed to fetch products', err);
        setProducts([]);
        setErrorMsg('Network or parsing error while fetching products.');
        toast.error('Could not load products (network or JSON error).');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const [formData, setFormData] = useState<OrderFormData>({
    customer: '',
    items: 1,
    total: '',
    status: 'Pending',
    email: '',
    phone: '',
    address: '',
    city: '',
    zip_code: '',
    notes: '',
    date: today,
  });

  // Build selected items from state (uses editable unitPrice)
  const selectedItems = useMemo(() => {
    return Object.entries(selectedProducts).map(([product_id, { quantity, unitPrice }]) => {
      const safeUnit = Number.isFinite(unitPrice) ? unitPrice : 0;
      return {
        product_id,
        quantity,
        unit_price: safeUnit,
        total_price: safeUnit * quantity,
      };
    });
  }, [selectedProducts]);

  // Compute total from selected items
  const computedTotal = useMemo(() => {
    return selectedItems.reduce((acc, item) => acc + (item.total_price || 0), 0);
  }, [selectedItems]);

  // Keep the visible total in sync (read-only display)
  useEffect(() => {
    setFormData((prev) => ({ ...prev, total: computedTotal.toFixed(2) }));
  }, [computedTotal]);

  const handleAddSelectedProduct = (productId: string) => {
    if (!productId) return;
    if (selectedProducts[productId]) return; // already added
    const prod = products.find((p) => String(p.id) === String(productId));
    const defaultPrice = parseFloat(String(prod?.price ?? '0')) || 0;
    setSelectedProducts((prev) => ({
      ...prev,
      [productId]: { quantity: 1, unitPrice: defaultPrice },
    }));
  };

  const handleSubmit = async () => {
    if (!formData.customer.trim()) {
      toast.error('Please enter the customer name.');
      return;
    }
    if (!formData.address?.trim()) {
      toast.error('Please enter the address.');
      return;
    }
    if (!formData.city?.trim()) {
      toast.error('Please enter the city.');
      return;
    }
    if (!formData.zip_code?.trim()) {
      toast.error('Please enter the zip code.');
      return;
    }
    if (selectedItems.length === 0) {
      toast.error('Please select at least one product.');
      return;
    }

    const payload: OrderPayload = {
      user_name: formData.customer,
      delivery: {
        name: formData.customer,
        email: formData.email || 'NA',
        phone: formData.phone || 'NA',
        street_address: formData.address!,
        city: formData.city!,
        zip_code: formData.zip_code!,
        instructions: formData.notes || '',
      },
      status: formData.status,
      total_price: computedTotal.toFixed(2),
      notes: formData.notes || '',
      items: selectedItems,
    };

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/save-order/`,
        withFrontendKey({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );

      const result = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success('Order saved successfully!');
        onSave(payload);
        onClose();
      } else {
        const msg =
          res.status === 401
            ? 'Save failed (401). Check X-Frontend-Key.'
            : result?.error || `Failed to save the order. (${res.status})`;
        toast.error(msg);
      }
    } catch (error) {
      console.error('Failed to save order:', error);
      toast.error('Failed to save the order. Please try again.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-blur-400 bg-opacity-40 backdrop-blur-md flex items-center justify-center px-4"
      style={{ backdropFilter: 'blur(8px)' }}
    >
      <div className="bg-white text-gray-900 rounded-xl shadow-2xl w-full sm:max-w-xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 relative">
        {/* Header */}
        <header className="flex justify-between items-center border-b border-gray-200 pb-4 mb-6">
          <h2 className="text-2xl font-extrabold text-[#891F1A]">Add New Order</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-red-600 text-2xl font-bold focus:outline-none"
          >
            &times;
          </button>
        </header>

        {/* Form */}
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Customer Name *"
            value={formData.customer}
            onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
            className="w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-[#891F1A]"
          />

          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-[#891F1A]"
          />

          <input
            type="tel"
            placeholder="Phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-[#891F1A]"
          />

          <textarea
            placeholder="Street Address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            className="w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-[#891F1A]"
            rows={3}
          />

          <input
            type="text"
            placeholder="City *"
            value={formData.city || ''}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            className="w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-[#891F1A]"
          />

          <input
            type="text"
            placeholder="Zip Code *"
            value={formData.zip_code || ''}
            onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
            className="w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-[#891F1A]"
          />

          {/* Products */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#891F1A]">Add Products</h3>
              <span className="text-xs text-gray-500">
                {loading
                  ? 'Loading...'
                  : errorMsg
                  ? 'Error'
                  : `${products.length} product${products.length === 1 ? '' : 's'}`}
              </span>
            </div>

            <div className="flex gap-2 items-center">
              <select
                className="w-full border rounded px-3 py-2"
                onChange={(e) => {
                  const productId = e.target.value;
                  if (productId) handleAddSelectedProduct(productId);
                  e.target.value = '';
                }}
                defaultValue=""
                disabled={loading || !!errorMsg || products.length === 0}
              >
                <option value="" disabled>
                  {loading
                    ? 'Loading products...'
                    : errorMsg
                    ? 'Unable to load products'
                    : products.length === 0
                    ? 'No products found'
                    : 'Select a product'}
                </option>

                {Array.isArray(products) &&
                  products.map((product) => (
                    <option key={String(product.id)} value={String(product.id)}>
                      {product.name} - ${String(product.price)}
                    </option>
                  ))}
              </select>
            </div>

            {errorMsg && (
              <p className="text-xs text-red-600">
                {errorMsg}
                {errorMsg.includes('401') ? ' Ensure NEXT_PUBLIC_FRONTEND_KEY is set.' : ''}
              </p>
            )}
          </div>

          {/* Selected products list with editable price */}
          {Object.entries(selectedProducts).map(([productId, { quantity, unitPrice }]) => {
            const product = products.find((p) => String(p.id) === String(productId));
            if (!product) return null;
            const lineTotal = (unitPrice || 0) * (quantity || 0);

            return (
              <div
                key={productId}
                className="flex flex-col gap-2 border rounded px-3 py-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-gray-500">
                      Default: ${String(product.price)} • ID: {String(product.id)}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const updated = { ...selectedProducts };
                      delete updated[productId];
                      setSelectedProducts(updated);
                    }}
                    className="ml-3 text-red-600 font-bold text-lg"
                    title="Remove"
                  >
                    &times;
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <label className="flex flex-col text-sm">
                    <span className="mb-1 text-gray-600">Quantity</span>
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => {
                        const qty = Math.max(1, parseInt(e.target.value || '1', 10));
                        setSelectedProducts((prev) => ({
                          ...prev,
                          [productId]: { ...prev[productId], quantity: qty },
                        }));
                      }}
                      className="border rounded px-2 py-2"
                    />
                  </label>

                  <label className="flex flex-col text-sm">
                    <span className="mb-1 text-gray-600">Unit Price ($)</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={Number.isFinite(unitPrice) ? unitPrice : 0}
                      onChange={(e) => {
                        const v = e.target.value;
                        const priceNum = Math.max(0, parseFloat(v || '0'));
                        setSelectedProducts((prev) => ({
                          ...prev,
                          [productId]: { ...prev[productId], unitPrice: priceNum },
                        }));
                      }}
                      className="border rounded px-2 py-2"
                    />
                  </label>

                  <label className="flex flex-col text-sm">
                    <span className="mb-1 text-gray-600">Line Total ($)</span>
                    <input
                      type="text"
                      readOnly
                      value={lineTotal.toFixed(2)}
                      className="border rounded px-2 py-2 bg-gray-50"
                    />
                  </label>
                </div>
              </div>
            );
          })}

          {/* Total (computed) */}
          <input
            type="text"
            placeholder="Total ($) *"
            value={formData.total}
            readOnly
            className="w-full px-4 py-3 border rounded-md bg-gray-50 focus:ring-2 focus:ring-[#891F1A]"
          />

          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as OrderStatus })}
            className="w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-[#891F1A]"
          >
            <option value="Pending">Pending</option>
            <option value="Processing">Processing</option>
            <option value="Shipped">Shipped</option>
            <option value="Completed">Completed</option>
          </select>

          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-[#891F1A]"
          />

          <textarea
            placeholder="Order Notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-[#891F1A]"
            rows={3}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-4 mt-8">
          <button
            onClick={onClose}
            className="bg-gray-200 text-black px-5 py-2 rounded hover:bg-gray-300 transition"
          >
            Cancel
          </button>
          <button onClick={handleSubmit} className="btn-primary">
            Save Order
          </button>
        </div>
      </div>
    </div>
  );
}
