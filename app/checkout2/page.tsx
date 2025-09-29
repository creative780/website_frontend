'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus, Trash2 } from 'lucide-react';
import Toastify from 'toastify-js';
import 'toastify-js/src/toastify.css';

import MobileTopBar from '../components/HomePageTop';
import Footer from '../components/Footer';
import { API_BASE_URL } from '../utils/api';
import { ChatBot } from '../components/ChatBot';
import { SafeImg } from '../components/SafeImage';

/* 🔐 Firebase auth hook-in */
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import TempHeader from '../components/TempHeader';
import Script from 'next/script';

/* =========================================================
   HELPERS (kept local to this file)
   ========================================================= */

// Browser-stable device UUID
function ensureDeviceUUID(): string {
  if (typeof window === 'undefined') return ''; // SSR guard
  const KEY = 'cart_user_id';
  let id = localStorage.getItem(KEY)?.trim();
  if (id) return id;

  // RFC4122-ish v4 (device-scoped)
  id = ([1e7] as any + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c: string) =>
    (Number(c) ^ ((crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> (Number(c) / 4))).toString(16)
  );

  localStorage.setItem(KEY, id);
  return id;
}

// Fetch wrapper that always injects X-Frontend-Key + X-Device-UUID
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
function fetchWithKey(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set('X-Frontend-Key', FRONTEND_KEY);
  try {
    const deviceUUID = ensureDeviceUUID();
    if (deviceUUID) headers.set('X-Device-UUID', deviceUUID);
  } catch {}
  return fetch(url, { ...init, headers });
}

// Reusable Add-to-Cart util (kept internal)
async function addToCart(opts: {
  product_id: string;
  quantity?: number;
  selected_size?: string;
  selected_attributes?: Record<string, string>;
}) {
  const device_uuid = ensureDeviceUUID();

  const res = await fetch(`${API_BASE_URL}/api/save-cart/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Frontend-Key': FRONTEND_KEY,
      'X-Device-UUID': device_uuid,
    },
    body: JSON.stringify({
      device_uuid,
      product_id: opts.product_id,
      quantity: opts.quantity ?? 1,
      selected_size: opts.selected_size ?? '',
      selected_attributes: opts.selected_attributes ?? {},
    }),
  });

  if (!res.ok) {
    throw new Error(await res.text().catch(() => 'Failed to add to cart'));
  }
}

/* =========================================================
   PAGE CODE
   ========================================================= */

type ProductTuple = [string, string, string, number, string]; // [rowId, name, image, unitPrice, desc]

type HumanAttr = {
  attribute_id?: string;
  option_id?: string;
  attribute_name: string;
  option_label: string;
  price_delta: string; // "0.00" from backend
};

export default function PaymentCheckoutPage() {
  const router = useRouter();

  // 🔐 AUTH GATE — allow if Firebase user exists OR pseudo session exists
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  const [cartData, setCartData] = useState<{ products: ProductTuple[] }>({ products: [] });
  const [loading, setLoading] = useState(true);

  // quantity and price keyed by our internal row id (cart_item_id if present, else product_id|signature)
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});

  // extra metadata passed to order payload (not shown in UI)
  const [cartMeta, setCartMeta] = useState<
    Record<
      string,
      {
        cart_item_id?: string;
        product_id: string; // real product id for backend
        selected_size?: string;
        selected_attributes?: Record<string, string>;
        selected_attributes_human?: HumanAttr[];
        variant_signature?: string;
        attributes_price_delta?: number;
        base_price?: number;
        line_total?: number;
      }
    >
  >({});

  const [discountCode, setDiscountCode] = useState('');
  const [userInfo, setUserInfo] = useState({
    name: '', email: '', phone: '', company: '',
    address: '', city: '', zip: '', instructions: '',
  });
  const [token, setToken] = useState<string | null>(null);

  /* ---------- AUTH BOOTSTRAP ---------- */
  useEffect(() => {
    let unsub = () => {};
    // 1) Pseudo session (backend-only success)
    try {
      const pseudo = localStorage.getItem('pseudo_session');
      if (pseudo) {
        setIsAuthed(true);
        return;
      }
    } catch {}

    // 2) Firebase session
    try {
      unsub = onAuthStateChanged(auth, (u) => {
        setIsAuthed(!!u);
      });
    } catch {
      setIsAuthed(false);
    }

    return () => {
      try { unsub(); } catch {}
    };
  }, []);

  // Hard redirect if not authed
  useEffect(() => {
    if (isAuthed === false) {
      Toastify({
        text: 'Please log in to access your cart',
        duration: 2800,
        gravity: 'top',
        position: 'right',
        backgroundColor: '#d32f2f',
        style: { borderRadius: '0.75rem', padding: '12px 20px' },
        ariaLive: 'polite',
      }).showToast();
      router.replace('/home'); // you can use /home?login=1 to auto-open modal
    }
  }, [isAuthed, router]);

  /* ---------- Token bootstrap ---------- */
  useEffect(() => {
    const storedToken = localStorage.getItem('cart_user_id');
    if (storedToken) setToken(storedToken);
  }, []);

  /* ---------- Fetch cart (only after auth) ---------- */
  useEffect(() => {
    if (isAuthed !== true) return; // block fetch until auth passes

    const deviceUUID = ensureDeviceUUID();
    if (!deviceUUID) {
      console.warn('❌ No device UUID available.');
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const fetchCart = async () => {
      try {
        setLoading(true);

        const res = await fetchWithKey(`${API_BASE_URL}/api/show-cart/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_uuid: deviceUUID }),
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Cart fetch failed: ${res.status}`);
        }

        const data = await res.json();
        const items = data?.cart_items || [];

        const q: Record<string, number> = {};
        const p: Record<string, number> = {};
        const prod: ProductTuple[] = [];
        const meta: typeof cartMeta = {};

        for (const item of items) {
          const cartItemId = item.cart_item_id;
          const productId = item.product_id;
          const signature = item.variant_signature || '';

          // Robust unique row id
          const rowId: string = cartItemId || `${productId}${signature ? `|${signature}` : ''}`;

          const unitPriceStr =
            item?.price_breakdown?.unit_price ??
            item?.unit_price ??
            item?.product_price ??
            '0';
          const unitPriceNum = parseFloat(unitPriceStr) || 0;

          // Human-readable selections
          const size = (item.selected_size || '').toString().trim();
          const human: HumanAttr[] = Array.isArray(item.selected_attributes_human)
            ? item.selected_attributes_human
            : [];
          const selectionParts: string[] = [];
          if (size) selectionParts.push(`Size: ${size}`);
          human.forEach((d) => selectionParts.push(`${d.attribute_name}: ${d.option_label}`));
          const selectionDesc = selectionParts.join(' • ');

          // Fill UI lists
          q[rowId] = item.quantity || 1;
          p[rowId] = unitPriceNum;
          prod.push([
            rowId,
            item.product_name,
            item.product_image || '/images/default.jpg',
            unitPriceNum,
            selectionDesc,
          ]);

          // Stash metadata used later
          const basePriceNum = parseFloat(item?.price_breakdown?.base_price ?? '0') || 0;
          const lineTotalNum = parseFloat(item?.price_breakdown?.line_total ?? '0') || 0;
          const attrsDeltaNum =
            parseFloat(item?.price_breakdown?.attributes_delta ?? item?.attributes_price_delta ?? '0') || 0;

          meta[rowId] = {
            cart_item_id: cartItemId,
            product_id: productId,
            selected_size: size,
            selected_attributes: item.selected_attributes || {},
            selected_attributes_human: human,
            variant_signature: signature,
            attributes_price_delta: attrsDeltaNum,
            base_price: basePriceNum,
            line_total: lineTotalNum,
          };
        }

        setQuantities(q);
        setCustomPrices(p);
        setCartData({ products: prod });
        setCartMeta(meta);
      } catch (err) {
        console.error('❌ Cart fetch error:', err);
        setCartData({ products: [] });
      } finally {
        setLoading(false);
      }
    };

    fetchCart();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  /* ---------- Pricing ---------- */
  const subtotal = useMemo(
    () =>
      cartData.products.reduce(
        (acc, [rowId]) => acc + (quantities[rowId] || 1) * (customPrices[rowId] || 0),
        0
      ),
    [cartData.products, quantities, customPrices]
  );
  const tax = 50;
  const shipping = 100;
  const total = useMemo(() => subtotal + tax + shipping, [subtotal]);

  /* ---------- Quantity / Remove ---------- */
  const updateQuantity = useCallback((rowId: string, delta: number) => {
    setQuantities((prev) => ({
      ...prev,
      [rowId]: Math.max(1, Math.min(99, (prev[rowId] || 1) + delta)),
    }));
  }, []);

  const removeItem = useCallback(async (rowId: string) => {
    const meta = cartMeta[rowId];
    const realProductId = meta?.product_id || rowId;

    // Optimistic UI updates
    setQuantities((prev) => {
      const copy = { ...prev };
      delete copy[rowId];
      return copy;
    });

    setCustomPrices((prev) => {
      const copy = { ...prev };
      delete copy[rowId];
      return copy;
    });

    setCartData((prev) => ({
      ...prev,
      products: prev.products.filter(([rid]) => rid !== rowId),
    }));

    try {
      const res = await fetchWithKey(`${API_BASE_URL}/api/delete-cart-item/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: token, // legacy compatibility
          product_id: realProductId,
          variant_signature: meta?.variant_signature || '',
          device_uuid: ensureDeviceUUID(), // new way
        }),
      });

      if (!res.ok) throw new Error();

      Toastify({
        text: 'Product removed from cart successfully',
        duration: 3000,
        gravity: 'top',
        position: 'right',
        backgroundColor: 'linear-gradient(to right, #af4c4cff, #d30000ff)',
        style: { borderRadius: '0.75rem', padding: '12px 20px' },
        ariaLive: 'polite',
      }).showToast();
    } catch {
      Toastify({
        text: 'Failed to remove product from cart',
        duration: 3000,
        gravity: 'top',
        position: 'right',
        backgroundColor: '#d32f2f',
        style: { borderRadius: '0.75rem', padding: '12px 20px' },
        ariaLive: 'assertive',
      }).showToast();
    }
  }, [API_BASE_URL, cartMeta, token]);

  /* ---------- Place Order ---------- */
  const handleOrderNow = async () => {
    const device_uuid = ensureDeviceUUID();

    if (!userInfo.email || !userInfo.address || !userInfo.city || !userInfo.phone || !userInfo.name) {
      Toastify({
        text: 'Please fill in all required delivery fields',
        duration: 3000,
        gravity: 'top',
        position: 'right',
        backgroundColor: '#d32f2f',
        style: { borderRadius: '0.75rem', padding: '12px 20px' },
        ariaLive: 'assertive',
      }).showToast();
      return;
    }

    const msgLines: string[] = [
      `Name: ${userInfo.name}`,
      `Email: ${userInfo.email}`,
      `Phone: ${userInfo.phone}`,
      `Company: ${userInfo.company || 'N/A'}`,
      `Address: ${userInfo.address}`,
      `City: ${userInfo.city}`,
      `Zip: ${userInfo.zip || 'N/A'}`,
      `Instructions: ${userInfo.instructions || 'N/A'}`,
      ``,
      `Order:`,
    ];

    const itemsForBackend: any[] = [];

    for (const [rowId, name] of cartData.products.map(([rid, n]) => [rid, n] as const)) {
      const qty = quantities[rowId] || 1;
      const unitPrice = customPrices[rowId] || 0;

      const meta = cartMeta[rowId];
      const realProductId = meta?.product_id ?? rowId;

      const size = meta?.selected_size?.trim() ? `Size: ${meta.selected_size.trim()}` : '';
      const human = Array.isArray(meta?.selected_attributes_human) ? meta.selected_attributes_human : [];

      const selectionTokens: string[] = [];
      if (size) selectionTokens.push(size);
      human.forEach((d) => selectionTokens.push(`${d.attribute_name}: ${d.option_label}`));
      const selectionParen = selectionTokens.length ? ` (${selectionTokens.join(', ')})` : '';

      const base = typeof meta?.base_price === 'number' ? meta.base_price : unitPrice;
      const deltas = human.map((d) => d.price_delta || '0');
      const mathParts = [base.toString(), ...deltas].join(' + ');
      const lineTotal = (unitPrice * qty).toFixed(2);

      msgLines.push(`${name}${selectionParen}: ${qty} x $(${mathParts}) = $${lineTotal}`);

      itemsForBackend.push({
        product_id: realProductId,
        quantity: parseInt(qty.toString()),
        unit_price: Number(unitPrice.toFixed(2)),
        total_price: Number((unitPrice * qty).toFixed(2)),
        selected_size: meta?.selected_size || '',
        selected_attributes: meta?.selected_attributes || {},
        selected_attributes_human: human,
        base_price: typeof meta?.base_price === 'number' ? meta.base_price : undefined,
        variant_signature: meta?.variant_signature || '',
        attributes_price_delta: meta?.attributes_price_delta || 0,
      });
    }

    msgLines.push(
      ``,
      `Subtotal: AED ${subtotal.toFixed(2)}`,
      `Tax: AED ${tax}`,
      `Shipping: AED ${shipping}`,
      `Total: AED ${total.toFixed(2)}`
    );

    const payload = {
      user_name: userInfo.name || 'Guest',
      total_price: total.toFixed(2),
      status: 'pending',
      notes: 'Order from checkout page',
      device_uuid, // store device on order
      items: itemsForBackend,
      delivery: {
        name: userInfo.name,
        email: userInfo.email,
        phone: userInfo.phone,
        street_address: userInfo.address,
        city: userInfo.city,
        zip_code: userInfo.zip,
        instructions: userInfo.instructions?.trim() ? [userInfo.instructions.trim()] : [],
      },
    };

    try {
      const res = await fetchWithKey(`${API_BASE_URL}/api/save-order/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());

      Toastify({
        text: 'Order successfully placed!',
        duration: 3000,
        gravity: 'top',
        position: 'right',
        backgroundColor: '#c41717ff',
        style: { borderRadius: '0.75rem', padding: '12px 20px' },
        ariaLive: 'polite',
      }).showToast();

      // After order: attempt to clean cart items
      for (const [rowId] of cartData.products) {
        const meta = cartMeta[rowId];
        const realProductId = meta?.product_id || rowId;
        try {
          await fetchWithKey(`${API_BASE_URL}/api/delete-cart-item/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: token, // legacy compatibility
              product_id: realProductId,
              variant_signature: meta?.variant_signature || '',
              device_uuid, // also pass device
            }),
          });
        } catch (err) {
          console.warn(`❌ Failed to delete item ${rowId} after order:`, err);
        }
      }

      setCartData({ products: [] });
      setQuantities({});
      setCustomPrices({});

      const msg = msgLines.join('\n');
      // open WhatsApp intent in a safe way
      window.open(`https://wa.me/971545396249?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('❌ Order save failed:', err);
      Toastify({
        text: 'Failed to place order',
        duration: 3000,
        gravity: 'top',
        position: 'right',
        backgroundColor: '#d32f2f',
        style: { borderRadius: '0.75rem', padding: '12px 20px' },
        ariaLive: 'assertive',
      }).showToast();
    }
  };

  const orderItems = cartData.products.map(([rowId, name, pic, unitPrice, desc]) => ({
    id: rowId,
    name,
    pic: pic || 'images/img1.jpg',
    desc: desc || '',
    quantity: quantities[rowId] || 1,
    price: customPrices[rowId] || unitPrice || 0,
  }));

  // 🔐 Gate render while auth resolves OR cart loads
  if (isAuthed === null || loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-xl text-gray-600"
        style={{ fontFamily: 'var(--font-poppins), Arial, Helvetica, sans-serif' }}
        role="status"
        aria-live="polite"
      >
        {isAuthed === null ? 'Checking sign-in…' : 'Loading your cart...'}
      </div>
    );
  }

  // Safety: if not authed, we already redirected; render nothing
  if (isAuthed === false) return null;

  // SEO hygiene for checkout: discourage indexing
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Checkout', item: `${siteUrl}/checkout2` },
    ],
  };

  return (
    <div
      className="min-h-screen bg-gray-50 text-black text-[3.5vw] sm:text-base"
      style={{ fontFamily: 'var(--font-poppins), Arial, Helvetica, sans-serif' }}
    >
      {/* Robots noindex/nofollow (since this is a transactional page) */}
      <Script id="robots-checkout" strategy="afterInteractive">{`(function(){var m=document.createElement('meta');m.name='robots';m.content='noindex,nofollow';document.head.appendChild(m);document.title='Checkout';})();`}</Script>
      <Script
        id="breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <TempHeader />
      <MobileTopBar />

      <main
        className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-8"
        aria-labelledby="checkout-heading"
      >
        <h1 id="checkout-heading" className="sr-only">Checkout</h1>

        {/* Delivery Section */}
        <section className="bg-white shadow rounded-lg p-8" aria-labelledby="delivery-heading">
          <h2 id="delivery-heading" className="text-2xl font-semibold mb-6 text-black">Delivery Address</h2>

          <div className="space-y-4 text-black">
            {[
              { label: 'Full Name', key: 'name', type: 'text', autoComplete: 'name', required: true },
              { label: 'Email Address', key: 'email', type: 'email', autoComplete: 'email', required: true },
              { label: 'Phone', key: 'phone', type: 'tel', autoComplete: 'tel', required: true, inputMode: 'tel', pattern: '[0-9 +()-]+' },
              { label: 'Company', key: 'company', type: 'text', autoComplete: 'organization' },
              { label: 'Street Address', key: 'address', type: 'text', autoComplete: 'street-address', required: true },
              { label: 'City', key: 'city', type: 'text', autoComplete: 'address-level2', required: true },
              { label: 'Zip', key: 'zip', type: 'text', autoComplete: 'postal-code', inputMode: 'numeric' },
              { label: 'Instructions', key: 'instructions', type: 'text', autoComplete: 'off' },
            ].map(({ label, key, type, autoComplete, required, inputMode, pattern }) => {
              const id = `field-${key}`;
              const half = ['phone', 'company', 'city', 'zip', 'instructions'].includes(key);
              return (
                <div key={key} className={half ? 'w-full sm:w-1/2' : ''}>
                  <label htmlFor={id} className="text-sm font-normal block">
                    {label}{required ? <span className="text-red-600"> *</span> : null}
                  </label>
                  <input
                    id={id}
                    type={type as any}
                    required={!!required}
                    onChange={(e) => setUserInfo((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="mt-1 w-full p-2 border border-gray-300 rounded-md bg-gray-50"
                    autoComplete={autoComplete as any}
                    inputMode={inputMode as any}
                    pattern={pattern as any}
                  />
                </div>
              );
            })}
          </div>

          <button
            onClick={handleOrderNow}
            disabled={cartData.products.length === 0}
            className={`w-full mt-8 py-3 text-sm font-medium rounded-md transition-all
              ${cartData.products.length === 0
                ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                : 'bg-[#891F1A] text-white hover:bg-[#6e1815] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400'}`}
            aria-disabled={cartData.products.length === 0}
            aria-label="Place order"
          >
            Order Now
          </button>
        </section>

        {/* Order Summary */}
        <section className="bg-white shadow rounded-lg p-8" aria-labelledby="order-heading">
          <h2 id="order-heading" className="text-2xl font-semibold mb-6 text-black">Order</h2>

          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2" aria-live="polite">
            {orderItems.length === 0 ? (
              <p className="text-sm text-gray-600">Your cart is empty.</p>
            ) : (
              orderItems.map((item) => (
                <article
                  key={item.id}
                  className="flex flex-wrap sm:flex-nowrap items-center justify-between border p-3 rounded-md bg-gray-50 text-black"
                  aria-label={`${item.name}, quantity ${item.quantity}`}
                >
                  <SafeImg
                    src={item.pic || '/images/default.jpg'}
                    alt={item.name}
                    width={56}
                    height={56}
                    loading="lazy"
                    className="w-14 h-14 object-cover rounded flex-shrink-0"
                    onError={(e) => (e.currentTarget.src = '/images/img1.jpg')}
                  />
                  <div className="flex-1 ml-4 text-sm min-w-[160px]">
                    <h3 className="font-medium line-clamp-1">{item.name}</h3>
                    {item.desc ? (
                      <p className="text-xs text-gray-600 mt-0.5 font-normal">{item.desc}</p>
                    ) : null}
                  </div>

                  <div className="flex items-center space-x-1 my-2 sm:my-0" aria-label="Quantity controls">
                    <button
                      onClick={() => updateQuantity(item.id, -1)}
                      className="border w-8 h-8 flex items-center justify-center rounded font-medium"
                      aria-label="Decrease quantity"
                    >
                      <Minus size={15} />
                    </button>
                    <span className="font-normal" aria-live="polite">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, 1)}
                      className="border w-8 h-8 flex items-center justify-center rounded font-medium"
                      aria-label="Increase quantity"
                    >
                      <Plus size={15} />
                    </button>
                  </div>

                  <div className="flex flex-col items-end ml-4 space-y-1">
                    <button
                      onClick={() => removeItem(item.id)}
                      className="font-medium"
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 size={14} className="text-red-600" />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          {/* Discount */}
          <div className="mt-6">
            <label htmlFor="discount" className="text-sm font-normal text-black mb-1 block">Discount Code</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="discount"
                type="text"
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
                className="flex-1 px-2 py-2 border border-gray-300 rounded-md"
                placeholder="Enter code"
                autoComplete="off"
              />
              <button
                onClick={() =>
                  Toastify({
                    text: 'Invalid discount code',
                    duration: 3000,
                    gravity: 'top',
                    position: 'right',
                    backgroundColor: '#d32f2f',
                    ariaLive: 'polite',
                  }).showToast()
                }
                disabled={!discountCode.trim()}
                className="px-4 py-2 border border-gray-300 rounded-md font-medium disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>

          {/* Totals */}
          <div className="mt-6 border-t pt-4 space-y-2 text-black">
            <div className="flex justify-between text-sm">
              <span className="font-normal">Subtotal</span>
              <span className="font-normal">AED {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-normal">Tax</span>
              <span className="font-normal">AED {tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-normal">Shipping</span>
              <span className="font-normal">AED {shipping.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <strong className="text-lg">Total</strong>
              <strong className="text-lg">AED {total.toFixed(2)}</strong>
            </div>
          </div>
        </section>
      </main>

      <Footer />
      <ChatBot />
    </div>
  );
}
