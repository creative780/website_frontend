"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import AdminSidebar from "../components/AdminSideBar";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import { API_BASE_URL } from "../../utils/api";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";

/* ==============================
   Frontend key & fetch helpers
   ============================== */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  headers.set("Accept", "application/json");
  return { ...init, headers, cache: "no-store" };
};

const fetchJSON = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, withFrontendKey(init));
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

const postJSON = async <T,>(path: string, body: unknown): Promise<T> => {
  const res = await fetch(
    path,
    withFrontendKey({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Request failed: ${res.status}${msg ? ` - ${msg}` : ""}`);
  }
  return res.json();
};

const reorder = <T,>(list: T[], startIndex: number, endIndex: number) => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
};

/* ==============================
   Types
   ============================== */
interface FlatProduct {
  id: string;
  name: string;
  image?: string;
  subcategory?: { id: string | null; name: string | null } | null;
  stock_status?: string | null;
  stock_quantity?: number | null;
  price?: string;
  printing_methods?: string[];
}

interface ProductImageItem {
  id: string | null; // backend image_id; may be null for legacy
  url: string;
  is_primary?: boolean;
}

interface ProductRow {
  id: string;
  name: string;
  thumbnail: string | null;
  images: ProductImageItem[];
  subcategoryId: string | null;
  subcategoryName: string | null;
}

/* ==============================
   Small UI bits
   ============================== */
const sr = (t: string) => <span className="sr-only">{t}</span>;
const validUrl = (u?: string | null) =>
  (u || "").startsWith("http") || (u || "").startsWith("/");

/* ==============================
   Images Modal
   ============================== */
function ImagesModal({
  open,
  onClose,
  productId,
  productName,
  currentThumb,
  images,
  onSelectThumbnail,
  onLoadImagesForProduct,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  currentThumb: string | null;
  images: ProductImageItem[];
  onSelectThumbnail: (img: ProductImageItem) => Promise<void>;
  onLoadImagesForProduct: (productId: string) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Lazy fetch images on open
  useEffect(() => {
    if (open && productId) onLoadImagesForProduct(productId);
  }, [open, productId, onLoadImagesForProduct]);

  // Focus trap lite
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => prev?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="mt-[50px] h-[70vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[#891F1A]/20 bg-white shadow-xl outline-none"
      >
        <div className="flex items-center justify-between border-b border-[#891F1A]/20 p-4">
          <h3 id={titleId} className="text-lg font-bold text-[#891F1A]">
            Images — {productName || productId}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg border border-[#891F1A] px-3 py-1 text-sm text-[#891F1A] hover:bg-[#891F1A] hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="p-4">
          {(!images || images.length === 0) && (
            <p className="text-sm text-gray-600">No images found for this product.</p>
          )}

          {images && images.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {images.map((img) => {
                const isActive = currentThumb === img.url;
                const alt = `Image for ${productName || productId}`;
                return (
                  <div
                    key={img.url}
                    className={`group relative overflow-hidden rounded-xl border border-[#891F1A]/20 ${
                      isActive ? "ring-2 ring-[#891F1A]" : ""
                    }`}
                    aria-current={isActive ? "true" : "false"}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={validUrl(img.url) ? img.url : "/images/img1.jpg"}
                      alt={alt}
                      className="h-48 w-full object-cover"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = "/images/img1.jpg";
                      }}
                    />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-white/95 p-2 text-xs">
                      <button
                        className="rounded-md border border-[#891F1A] px-2 py-1 text-[#891F1A] hover:bg-[#891F1A] hover:text-white"
                        onClick={() => onSelectThumbnail(img)}
                        aria-pressed={isActive}
                        aria-label={`Set as thumbnail for ${productName || productId}`}
                      >
                        {isActive ? "Current thumbnail" : "Set as thumbnail"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==============================
   Page
   ============================== */
export default function AdminNavBarViewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ProductRow[]>([]);

  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string | "ALL">("ALL");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalProductId, setModalProductId] = useState<string>("");
  const [modalProductName, setModalProductName] = useState<string>("");
  const [modalCurrentThumb, setModalCurrentThumb] = useState<string | null>(null);

  const subFilterId = useId();

  // Minimal toast (keeps current no-deps behavior; swap in your Toastify if you want)
  const toast = (msg: string) => console.log(`[info] ${msg}`);
  const toastErr = (msg: string) => console.error(`[error] ${msg}`);

  // Load products (abort-safe)
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const flat = await fetchJSON<FlatProduct[]>(
          `${API_BASE_URL}/api/show-product/?_=${Date.now()}`,
          { signal }
        );
        if (signal.aborted) return;

        const built: ProductRow[] = (flat || []).map((p) => ({
          id: String(p.id),
          name: p.name,
          thumbnail: validUrl(p.image) ? p.image! : null,
          images: [], // lazy-load on modal open
          subcategoryId: p.subcategory?.id ?? null,
          subcategoryName: p.subcategory?.name ?? null,
        }));

        setRows(built);
      } catch (e: any) {
        if (signal.aborted) return;
        setError(e?.message || "Failed to load products");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  const allSubcategoriesForSelect = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.subcategoryId && r.subcategoryName) map.set(r.subcategoryId, r.subcategoryName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (selectedSubcategoryId === "ALL") return rows;
    return rows.filter((r) => r.subcategoryId === selectedSubcategoryId);
  }, [rows, selectedSubcategoryId]);

  // Modal handlers
  const handleOpenModal = (productId: string, currentThumb: string | null, name: string) => {
    setModalProductId(productId);
    setModalCurrentThumb(currentThumb);
    setModalProductName(name);
    setModalOpen(true);
  };

  const loadImagesForProduct = async (productId: string) => {
    try {
      const details = await postJSON<{
        images?: string[];
        images_with_ids?: { id: string | null; url: string; is_primary?: boolean }[];
      }>(`${API_BASE_URL}/api/show_product_other_details/`, { product_id: productId });

      const images: ProductImageItem[] =
        details.images_with_ids?.length
          ? details.images_with_ids
          : (details.images || []).map((u) => ({ id: null, url: u }));

      setRows((prev) => prev.map((r) => (r.id === productId ? { ...r, images } : r)));
    } catch (e: any) {
      toastErr(e?.message || "Failed to load product images");
    }
  };

  const handleSelectNewThumb = async (img: ProductImageItem) => {
    if (!img.id) {
      toastErr("Cannot set thumbnail: missing image_id from backend.");
      return;
    }
    try {
      const resp = await postJSON<{ success: boolean; thumbnail_url?: string }>(
        `${API_BASE_URL}/api/set-product-thumbnail/`,
        { product_id: modalProductId, image_id: img.id }
      );

      const newThumb = resp.thumbnail_url || img.url;

      // Update table row
      setRows((prev) =>
        prev.map((r) => (r.id === modalProductId ? { ...r, thumbnail: newThumb } : r))
      );
      setModalCurrentThumb(newThumb);

      // Mark primary locally in modal list
      setRows((prev) =>
        prev.map((r) =>
          r.id === modalProductId
            ? { ...r, images: r.images.map((x) => ({ ...x, is_primary: x.url === newThumb })) }
            : r
        )
      );

      toast("Thumbnail updated");
    } catch (e: any) {
      toastErr(e?.message || "Failed to set thumbnail");
    }
  };

  // DnD reorder (persist order for visible subset only)
  const handleDragEnd = async (result: DropResult) => {
    const { destination, source } = result;
    if (!destination || destination.index === source.index) return;

    const newFiltered = reorder(filteredRows, source.index, destination.index);
    const visibleIds = new Set(filteredRows.map((r) => r.id));

    // Merge new order back into full list
    const nextRows: ProductRow[] = [];
    let j = 0;
    for (const r of rows) {
      if (visibleIds.has(r.id)) {
        nextRows.push(newFiltered[j++]);
      } else {
        nextRows.push(r);
      }
    }
    setRows(nextRows);

    // Fire-and-forget persistence (keep current contract)
    try {
      await fetch(
        `${API_BASE_URL}/api/update-product-order/`,
        withFrontendKey({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ products: newFiltered.map((r) => ({ id: r.id })) }),
        })
      );
    } catch {
      /* non-blocking */
    }
  };

  return (
    <AdminAuthGuard>
      <div
        className="flex min-h-screen bg-gray-100"
        style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}
      >
        <AdminSidebar />

        <main
          className="flex-1 px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 lg:py-10 bg-gray-50 min-h-screen"
          aria-labelledby="navbar-view-title"
        >
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6 sm:mb-8 bg-gradient-to-r from-white via-[#f8f9fa] to-gray-100 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
              <div>
                <h1 id="navbar-view-title" className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                  🧭 NavBar View
                </h1>
                <p className="text-gray-600 mt-1 text-sm">
                  Manage product visibility and ordering in the navigation bar.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <label htmlFor={subFilterId} className="sr-only">
                  Filter by subcategory
                </label>
                <select
                  id={subFilterId}
                  className="border border-gray-300 px-3 py-2 rounded-md text-sm bg-white text-black focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A]"
                  value={selectedSubcategoryId}
                  onChange={(e) => setSelectedSubcategoryId(e.target.value as any)}
                >
                  <option value="ALL">All Subcategories</option>
                  {allSubcategoriesForSelect.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-auto rounded-2xl shadow-lg border border-gray-200 max-h-[500px] thin-scrollbar">
              <table className="w-full table-auto text-sm bg-white">
                <thead className="text-white bg-[#891F1A] sticky top-0 z-10">
                  <tr>
                    <th className="p-3 text-center">ID</th>
                    <th className="p-3 text-left">Name</th>
                    <th className="p-3 text-center">Thumbnail</th>
                    <th className="p-3 text-left">Subcategory</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700 divide-y divide-gray-100">
                  {loading && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-gray-600">
                        Loading data…
                      </td>
                    </tr>
                  )}

                  {error && !loading && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-red-600">
                        {error}
                      </td>
                    </tr>
                  )}

                  {!loading && !error && filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-gray-600">
                        No products found.
                      </td>
                    </tr>
                  )}

                  {!loading && !error && filteredRows.length > 0 && (
                    <DragDropContext onDragEnd={handleDragEnd}>
                      <Droppable droppableId="products">
                        {(provided) => (
                          <tbody ref={provided.innerRef} {...provided.droppableProps}>
                            {filteredRows.map((r, index) => (
                              <Draggable key={r.id} draggableId={r.id} index={index}>
                                {(providedDraggable, snapshot) => (
                                  <tr
                                    ref={providedDraggable.innerRef}
                                    {...providedDraggable.draggableProps}
                                    {...providedDraggable.dragHandleProps}
                                    className={`hover:bg-gray-50 transition ${
                                      snapshot.isDragging ? "bg-yellow-50" : ""
                                    }`}
                                    aria-roledescription="Draggable row"
                                  >
                                    <td className="p-3 text-[#891F1A] font-semibold text-center">
                                      {r.id}
                                    </td>
                                    <td className="p-3">
                                      <span className="block max-w-[36ch] truncate" title={r.name}>
                                        {r.name}
                                      </span>
                                    </td>
                                    <td className="p-3 text-center">
                                      <div className="h-12 w-16 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 mx-auto">
                                        {r.thumbnail ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={validUrl(r.thumbnail) ? r.thumbnail : "/images/default.jpg"}
                                            alt={`Thumbnail for ${r.name}`}
                                            width={64}
                                            height={48}
                                            className="h-full w-full object-cover"
                                            loading="lazy"
                                            decoding="async"
                                            onError={(e) => {
                                              (e.currentTarget as HTMLImageElement).src = "/images/default.jpg";
                                            }}
                                          />
                                        ) : (
                                          <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                                            No image
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                    <td className="p-3">{r.subcategoryName || "—"}</td>
                                    <td className="p-3 text-center">
                                      <button
                                        className="bg-white border border-[#891F1A] text-[#891F1A] px-3 py-2 rounded-md text-sm font-medium hover:bg-[#891F1A] hover:text-white transition-colors"
                                        onClick={() => handleOpenModal(r.id, r.thumbnail, r.name)}
                                        aria-label={`View or change images for ${r.name}`}
                                      >
                                        View / Edit
                                      </button>
                                    </td>
                                  </tr>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </tbody>
                        )}
                      </Droppable>
                    </DragDropContext>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      <ImagesModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        productId={modalProductId}
        productName={modalProductName}
        currentThumb={modalCurrentThumb}
        images={rows.find((r) => r.id === modalProductId)?.images || []}
        onSelectThumbnail={handleSelectNewThumb}
        onLoadImagesForProduct={loadImagesForProduct}
      />
    </AdminAuthGuard>
  );
}
