"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useId,
} from "react";
import AdminSidebar from "../components/AdminSideBar";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Checkbox from "@mui/material/Checkbox";
import Modal from "../components/ProductModal";
import { API_BASE_URL } from "../../utils/api";

/* ======================== FRONTEND KEY helper ======================== */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  // keep headers minimal to avoid CORS preflights; never send credentials
  return { ...init, headers, cache: "no-store", credentials: "omit", mode: "cors" };
};

/* ======================= Utility: absolute URL ======================= */
const toAbsolute = (maybeRelative: string) => {
  if (!maybeRelative) return "";
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  const base = API_BASE_URL.replace(/\/+$/, "");
  const path = maybeRelative.startsWith("/") ? maybeRelative : `/${maybeRelative}`;
  return `${base}${path}`;
};

// If your Modal typing doesn't accept `children`, keep a loose alias
const ModalAny = Modal as unknown as React.ComponentType<any>;

/* ============================== Types =============================== */
type Product = {
  id: string;
  name?: string;
  title?: string;
  sizes?: string[];
  stock_quantity?: number | string;
  quantity?: number;
  price?: number;
  printing_methods?: string[]; // backend variant
  printingMethod?: string[]; // normalized here
  image?: string;
  images?: Array<{ type: "url" | string; value: string; file?: File | null }>;
  subcategory?: { id?: string | number };
  isVisible?: boolean;
};

type SubcategoryRow = {
  id: string | number;
  name: string;
  status: string;
  categories: string[];
};

type CategoryRow = {
  name: string;
  status: "visible" | "hidden" | string;
};

export default function InventoryManagerPage() {
  /* ============================ State ============================ */
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [stockRange, setStockRange] = useState<{ min: number; max: number }>({
    min: 0,
    max: Number.POSITIVE_INFINITY,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const captionId = useId();

  /* =========================== Effects =========================== */

  // Debounce search for perf
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Load inventory (abortable)
  const refreshProducts = useCallback(async () => {
    const ac = new AbortController();
    setLoading(true);
    try {
      const [productRes, subcatRes, catRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/show-product/?_=${Date.now()}`, {
          ...withFrontendKey(),
          signal: ac.signal,
        }),
        fetch(`${API_BASE_URL}/api/show-subcategories/?_=${Date.now()}`, {
          ...withFrontendKey(),
          signal: ac.signal,
        }),
        fetch(`${API_BASE_URL}/api/show-categories/?_=${Date.now()}`, {
          ...withFrontendKey(),
          signal: ac.signal,
        }),
      ]);

      if (!productRes.ok || !subcatRes.ok || !catRes.ok) {
        throw new Error(
          `Fetch failed (${productRes.status}/${subcatRes.status}/${catRes.status})`
        );
      }

      const [productsJson, subcategoriesJson, categoriesJson] = await Promise.all([
        productRes.json(),
        subcatRes.json(),
        catRes.json(),
      ]);

      const subcategories: SubcategoryRow[] = Array.isArray(subcategoriesJson)
        ? (subcategoriesJson as any)
        : [];
      const categories: CategoryRow[] = Array.isArray(categoriesJson) ? (categoriesJson as any) : [];
      const productsArr: any[] = Array.isArray(productsJson) ? productsJson : [];

      // Lookups
      const subcatMap: Record<
        string,
        { name: string; status: string; categories: string[] }
      > = {};
      subcategories.forEach((sub) => {
        subcatMap[String(sub.id)] = {
          name: sub.name,
          status: sub.status,
          categories: Array.isArray(sub.categories) ? sub.categories : [],
        };
      });

      const categoryStatusByName: Record<string, string> = {};
      categories.forEach((cat) => {
        categoryStatusByName[String(cat.name)] = cat.status;
      });

      // Enrich/normalize
      const enriched: Product[] = productsArr.map((p: any) => {
        const subId = p?.subcategory?.id != null ? String(p.subcategory.id) : "";
        const subcatInfo = subcatMap[subId];
        const subcatStatus = subcatInfo?.status || "hidden";
        const subcatCategories = subcatInfo?.categories || [];
        const hasVisibleCategory = subcatCategories.some(
          (catName) => categoryStatusByName[catName] === "visible"
        );

        const quantityNum =
          typeof p.stock_quantity === "number"
            ? p.stock_quantity
            : parseInt(String(p.stock_quantity ?? p.quantity ?? "0"), 10) || 0;

        const printingList = Array.isArray(p.printing_methods) ? p.printing_methods : [];

        return {
          ...p,
          id: String(p.id),
          quantity: quantityNum,
          printingMethod: printingList,
          images: [{ type: "url", value: p.image || "", file: null }],
          isVisible: subcatStatus === "visible" && hasVisibleCategory,
        };
      });

      setProducts(enriched);
    } catch (err) {
      console.error("Error loading inventory:", err);
      toast.error("Failed to load inventory");
      setProducts([]);
    } finally {
      setLoading(false);
    }
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const cleanup = refreshProducts();
    return () => {
      try {
        (cleanup as any)?.();
      } catch {}
    };
  }, [refreshProducts]);

  /* ======================== Selection helpers ======================== */
  const toggleSelectProduct = (id: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
  };

  /* ======================= Derived / memoized data ======================= */
  const filteredInventory = useMemo(() => {
    const lower = debouncedSearch;
    return products.filter((prod) => {
      if (!prod.isVisible) return false;
      const name = (prod.name || prod.title || "").toLowerCase();
      const stock = typeof prod.quantity === "number" ? prod.quantity : 0;
      const matchesStock = stock >= stockRange.min && stock <= stockRange.max;
      const matchesSearch = !lower || name.includes(lower);
      return matchesStock && matchesSearch;
    });
  }, [products, debouncedSearch, stockRange.min, stockRange.max]);

  const areAllSelected =
    filteredInventory.length > 0 &&
    filteredInventory.every((p) => selectedProductIds.includes(String(p.id)));

  const visibleSelectedCount = useMemo(
    () => filteredInventory.filter((p) => selectedProductIds.includes(String(p.id))).length,
    [filteredInventory, selectedProductIds]
  );

  const totalStock = useMemo(
    () => filteredInventory.reduce((sum, p) => sum + (p.quantity || 0), 0),
    [filteredInventory]
  );

  /* ============================== Actions ============================== */
  const toggleSelectAll = () => {
    if (areAllSelected) {
      // only unselect those currently visible to avoid surprising users
      const visibleIds = new Set(filteredInventory.map((p) => String(p.id)));
      setSelectedProductIds((prev) => prev.filter((id) => !visibleIds.has(id)));
    } else {
      const ids = filteredInventory.map((p) => String(p.id));
      setSelectedProductIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  const handleEditProduct = (product: Product) => {
    setEditingProductId(String(product.id));
    setIsModalOpen(true);
  };

  const handleDeleteSelected = async () => {
    if (selectedProductIds.length === 0) return;

    const confirmDelete = confirm(
      `Delete ${selectedProductIds.length} product${
        selectedProductIds.length !== 1 ? "s" : ""
      }? This cannot be undone.`
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/delete-product/`, {
        ...withFrontendKey({
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selectedProductIds, confirm: true }),
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(`❌ Bulk delete failed: ${result?.error || "Unknown error"}`);
        return;
      }

      toast.success("🗑️ Selected products deleted");
      setSelectedProductIds([]);
      refreshProducts();
    } catch (err: any) {
      toast.error(`❌ Delete failed: ${err?.message || "Unknown error"}`);
    }
  };

  const handleMarkOutOfStock = async () => {
    if (selectedProductIds.length === 0) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/edit_product/`, {
        ...withFrontendKey({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_ids: selectedProductIds,
            quantity: 0,
          }),
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(`❌ Failed: ${result?.error || "Unknown error"}`);
        return;
      }

      toast.success("📦 Selected products marked out of stock");
      setSelectedProductIds([]);
      refreshProducts();
    } catch (err: any) {
      toast.error(`❌ Failed: ${err?.message || "Unknown error"}`);
    }
  };

  /* ============================== Render ============================== */
  return (
    <AdminAuthGuard>
      <ToastContainer position="top-right" newestOnTop closeOnClick pauseOnFocusLoss={false} />
      <div
        className="flex min-h-screen bg-gradient-to-br from-gray-50 to-white text-black"
        style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}
      >
        <aside className="w-64 hidden lg:block border-r border-gray-200 bg-white">
          <AdminSidebar />
        </aside>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 lg:py-10">
          {/* Header */}
          <header className="mb-6 sm:mb-8 bg-gradient-to-r from-white via-[#f8f9fa] to-gray-100 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                📦 Inventory
              </h1>
              <p className="text-gray-500 mt-1 text-sm">
                Manage product stock, availability, and pricing.
              </p>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <label htmlFor="inv-search" className="sr-only">
                Search products
              </label>
              <input
                id="inv-search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name..."
                className="border border-gray-300 px-3 py-2 rounded-md text-sm bg-white text-black placeholder:text-gray-400 focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A]"
              />
              <label htmlFor="stock-filter" className="sr-only">
                Filter by stock range
              </label>
              <select
                id="stock-filter"
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "0-100") setStockRange({ min: 0, max: 100 });
                  else if (val === "100-200") setStockRange({ min: 100, max: 200 });
                  else setStockRange({ min: 0, max: Number.POSITIVE_INFINITY });
                }}
                className="border border-gray-300 px-3 py-2 rounded-md text-sm bg-white text-black focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A]"
                defaultValue="all"
              >
                <option value="all">All Stock</option>
                <option value="0-100">Stock: 0 - 100</option>
                <option value="100-200">Stock: 100 - 200</option>
              </select>
              <button
                className="bg-[#891F1A] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#6d1915] transition-colors"
                onClick={() => setIsModalOpen(true)}
                type="button"
              >
                + Add Product
              </button>
            </div>
          </header>

          {/* Table */}
          <div className="overflow-auto rounded-2xl shadow-lg border border-gray-200 max-h-[560px] thin-scrollbar bg-white">
            <table className="w-full table-auto text-sm">
              <caption id={captionId} className="sr-only">
                Inventory table
              </caption>
              <thead className="text-white bg-[#891F1A] sticky top-0 z-10">
                <tr>
                  <th scope="col" className="p-3 text-center w-4">
                    <Checkbox
                      inputProps={{ "aria-label": "Select all visible products" }}
                      checked={areAllSelected}
                      indeterminate={!areAllSelected && visibleSelectedCount > 0}
                      onChange={toggleSelectAll}
                      sx={{
                        color: "#fff",
                        "&.Mui-checked": { color: "#fff" },
                        marginLeft: "-13px",
                      }}
                    />
                  </th>
                  <th scope="col" className="p-3 text-center">
                    ID
                  </th>
                  <th scope="col" className="p-3 text-center">
                    Thumbnail
                  </th>
                  <th scope="col" className="p-3 text-left">
                    Name
                  </th>
                  <th scope="col" className="p-3 text-center">
                    Stock
                  </th>
                  <th scope="col" className="p-3 text-center">
                    Price
                  </th>
                  <th scope="col" className="p-3 text-center">
                    Printing
                  </th>
                  <th scope="col" className="p-3 text-center">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="text-gray-800 divide-y divide-gray-100">
                {loading && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-gray-500">
                      Loading inventory…
                    </td>
                  </tr>
                )}

                {!loading && filteredInventory.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-gray-500">
                      No products match your filters.
                    </td>
                  </tr>
                )}

                {!loading &&
                  filteredInventory.map((prod) => {
                    const imgSrc =
                      prod.images?.[0]?.value ? toAbsolute(prod.images[0].value) : "/img1.jpg";
                    const printingList =
                      prod.printingMethod ?? prod.printing_methods ?? [];
                    const printingText = Array.isArray(printingList) && printingList.length
                      ? printingList.join(", ")
                      : "—";

                    return (
                      <tr key={prod.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-3 text-center">
                          <Checkbox
                            inputProps={{ "aria-label": `Select product ${prod.id}` }}
                            checked={selectedProductIds.includes(String(prod.id))}
                            onChange={() => toggleSelectProduct(String(prod.id))}
                            sx={{
                              color: "#891F1A",
                              "&.Mui-checked": { color: "#891F1A" },
                              marginLeft: "-13px",
                            }}
                          />
                        </td>
                        <th scope="row" className="p-3 text-[#891F1A] font-semibold text-center">
                          {prod.id}
                        </th>
                        <td className="p-3 text-center">
                          <img
                            src={imgSrc}
                            alt={`${prod.name || prod.title || "Product"} thumbnail`}
                            width={45}
                            height={45}
                            loading="lazy"
                            decoding="async"
                            sizes="45px"
                            className="rounded shadow mx-auto object-cover w-[45px] h-[45px]"
                            onError={(e) => {
                              const el = e.currentTarget as HTMLImageElement;
                              el.onerror = null;
                              el.src = "/img1.jpg";
                            }}
                          />
                        </td>
                        <td className="p-3">{prod.name || prod.title || "—"}</td>
                        <td className="p-3 text-center text-red-700 font-semibold">
                          {prod.quantity}
                        </td>
                        <td className="p-3 text-center text-green-700 font-semibold">
                          £{Number(prod.price || 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-center">{printingText}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleEditProduct(prod)}
                            className="bg-[#891F1A] hover:bg-[#6e1915] text-white text-xs px-4 py-2 rounded-full transition-colors"
                            type="button"
                          >
                            View / Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Footer Summary / Actions */}
          <div className="flex justify-between items-center mt-4 flex-wrap gap-3 text-sm">
            <div className="flex items-center gap-4">
              <span className="text-gray-700">
                Selected: {selectedProductIds.length} product
                {selectedProductIds.length !== 1 ? "s" : ""}
              </span>
              <span className="text-gray-500">Visible items: {filteredInventory.length}</span>
              <span className="text-gray-500">Total stock (visible): {totalStock}</span>
            </div>

            <div className="flex gap-3 items-center">
              <button
                onClick={handleMarkOutOfStock}
                disabled={selectedProductIds.length === 0}
                className={`px-3 py-1 rounded text-sm ${
                  selectedProductIds.length === 0
                    ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                    : "bg-[#891F1A] text-white hover:bg-red-700"
                }`}
                type="button"
              >
                Mark Out of Stock
              </button>

              <button
                onClick={handleDeleteSelected}
                disabled={selectedProductIds.length === 0}
                className={`px-3 py-1 rounded text-sm ${
                  selectedProductIds.length === 0
                    ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                    : "bg-[#891F1A] text-white hover:bg-red-700"
                }`}
                type="button"
              >
                Delete Selected
              </button>
            </div>
          </div>

          <p className="mt-3 italic text-gray-600 text-xs">
            Note: SP = Screen Printing, DP = Digital Printing, OP = Offset Printing
          </p>
        </main>
      </div>

      {/* MODAL */}
      <ModalAny
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingProductId(null);
        }}
        onFirstImageUpload={(f: File) => {
          // optional: hook for first image upload
        }}
        productId={editingProductId ?? undefined}
      >
        <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="mb-2 font-semibold">
            {editingProductId ? "Edit Product" : "Add New Product"}
          </div>

          {/* TODO: Your product form goes here */}

          <div className="flex justify-end gap-4 sticky bottom-0 bg-white py-3">
            <button
              onClick={() => setIsModalOpen(false)}
              className="bg-gray-300 text-black px-4 py-2 rounded"
              type="button"
            >
              Back
            </button>
            <button
              onClick={() => {
                setIsModalOpen(false);
              }}
              className="bg-green-600 text-white px-4 py-2 rounded"
              type="button"
            >
              {editingProductId ? "Update Product" : "Save Product"}
            </button>
          </div>
        </div>
      </ModalAny>
    </AdminAuthGuard>
  );
}
