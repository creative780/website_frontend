"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import AdminSidebar from "../components/AdminSideBar";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Modal from "../components/ProductModal";
import { Checkbox } from "@mui/material";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { API_BASE_URL } from "../../utils/api";

const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();

/** Attach the frontend key only when present. Never send an empty header. */
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

/** Safer JSON parse + error bubbling for non-2xx results. */
const parseJsonStrict = async (res: Response, label: string) => {
  const bodyText = await res
    .clone()
    .text()
    .catch(() => "");
  let json: any = {};
  try {
    json = bodyText ? JSON.parse(bodyText) : {};
  } catch {}
  if (!res.ok) {
    const msg = json?.error || bodyText || `${label}: HTTP ${res.status}`;
    throw new Error(msg.length > 400 ? msg.slice(0, 400) + "…" : msg);
  }
  return json;
};

function addLowStockNotification(
  productName: string,
  productId: string,
  quantity: number
) {
  if (typeof window === "undefined") return;
  try {
    const existing = JSON.parse(localStorage.getItem("notifications") || "[]");
    const alreadyExists = existing.some(
      (n: any) => n.type === "low_stock" && n.product_id === productId
    );
    if (alreadyExists) return;

    const newNotification = {
      id: crypto.randomUUID(),
      type: "low_stock",
      order_id: productId,
      user: "System",
      status: "Low Stock",
      message: `⚠️ Product "${productName}" (ID: ${productId}) is low on stock (${quantity} left)`,
      created_at: new Date().toISOString(),
      product_id: productId,
    };

    localStorage.setItem(
      "notifications",
      JSON.stringify([newNotification, ...existing])
    );
  } catch {}
}

const printingMethodShortForms: Record<string, string> = {
  "Screen Printing": "SP",
  "Digital Printing": "DP",
  "Offset Printing": "OP",
  "UV Printing": "UV",
  Sublimation: "SB",
  "Pad Printing": "PP",
  "Laser Engraving": "LE",
  Embossing: "EM",
};

type ServerProduct = {
  id: string;
  product_id?: string;
  name: string;
  image?: string;
  /** legacy single */
  subcategory?: { id: string; name: string } | null;
  /** all mappings from backend */
  subcategories?: { id: string; name: string }[];
  stock_status?: string;
  stock_quantity?: number | string;
  price: string | number;
  printing_methods?: string[];
  brand_title?: string;
  fit_description?: string;
  sizes?: string[];
  created_at?: string;
};

const mapServerProduct = (p: ServerProduct) => ({
  ...p,
  subcategories: Array.isArray(p.subcategories) ? p.subcategories : [],
  brand_title: p.brand_title ?? "",
  fit_description: p.fit_description ?? "",
  sizes: Array.isArray(p.sizes) ? p.sizes : [],
  images: [{ type: "url", value: p.image || "", file: null }],
  printingMethod: Array.isArray(p.printing_methods) ? p.printing_methods : [],
  quantity: Number(p.stock_quantity ?? 0) || 0,
  stock_status: (p.stock_status || "").toString(),
});

type SubNode = {
  subcategory_id: string;
  id: string;
  name: string;
  products?: any[];
  categories?: string[];
  status?: string;
};

export default function AdminProductManager() {
  const [showSidebar, setShowSidebar] = useState(true);
  const [rawData, setRawData] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<SubNode[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [allProductsMaster, setAllProductsMaster] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSubCategory, setSelectedSubCategory] = useState("__all__");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | "">("");
  const [stockFilter, setStockFilter] = useState<"all" | "in" | "low" | "out">(
    "all"
  );
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);

  // Change Existing Product modal
  const [isChangeExistingOpen, setIsChangeExistingOpen] = useState(false);
  const [changeSearch, setChangeSearch] = useState("");
  const [changeStage, setChangeStage] = useState<"top3" | "first25" | "all">(
    "top3"
  );
  const [isMapping, setIsMapping] = useState<string | null>(null);

  // guards
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBulkOOS, setIsBulkOOS] = useState(false);

  const initialFetchAbortRef = useRef<AbortController | null>(null);

  // util: uniq by id (stringified)
  const uniqueById = <T extends { id: string }>(list: T[]) =>
    Array.from(new Map(list.map((p) => [String(p.id), p])).values());

  // ---------- Data load ----------
  const reloadAllData = useCallback(async () => {
    const controller = new AbortController();
    try {
      const [catRes, subRes, prodRes] = await Promise.all([
        fetch(
          `${API_BASE_URL}/api/show-categories/`,
          withFrontendKey({ signal: controller.signal })
        ),
        fetch(
          `${API_BASE_URL}/api/show-subcategories/`,
          withFrontendKey({ signal: controller.signal })
        ),
        fetch(
          `${API_BASE_URL}/api/show-product/`,
          withFrontendKey({ signal: controller.signal })
        ),
      ]);

      const [categoryData, subcategoryData, productData] = await Promise.all([
        parseJsonStrict(catRes, "show-categories"),
        parseJsonStrict(subRes, "show-subcategories"),
        parseJsonStrict(prodRes, "show-product"),
      ]);

      const arrCats = Array.isArray(categoryData) ? categoryData : [];
      const arrSubs = Array.isArray(subcategoryData) ? subcategoryData : [];
      const arrProds = (Array.isArray(productData) ? productData : []).map(
        mapServerProduct
      );

      const visibleCategories = arrCats.filter(
        (c: any) => c.status === "visible"
      );
      const visibleSubcategories = arrSubs.filter(
        (sc: any) => sc.status === "visible"
      );

      const categoryMap = new Map<string, any>();
      for (const c of visibleCategories)
        categoryMap.set(c.name, { ...c, subcategories: [] as any[] });

      // Build subId -> products using all mappings (and legacy)
      const prodsBySubId = new Map<string, any[]>();

      const getAllSubIdsFor = (p: any): string[] => {
        const many = Array.isArray(p.subcategories)
          ? p.subcategories.map((s: any) => String(s.id)).filter(Boolean)
          : [];
        const legacy = p?.subcategory?.id ? [String(p.subcategory.id)] : [];
        return Array.from(new Set([...many, ...legacy]));
      };

      for (const p of arrProds) {
        const subIds = getAllSubIdsFor(p);
        for (const sid of subIds) {
          if (!prodsBySubId.has(sid)) prodsBySubId.set(sid, []);
          prodsBySubId.get(sid)!.push(p);
        }
      }

      // Attach: unique products per subcategory; push subs into their categories
      for (const sub of visibleSubcategories) {
        const sid = String(
          (sub as any).subcategory_id || (sub as any).id || ""
        );
        (sub as any).products = uniqueById(prodsBySubId.get(sid) || []);

        const catNames = Array.isArray((sub as any).categories)
          ? (sub as any).categories
          : [];
        for (const catName of catNames) {
          const c = categoryMap.get(catName);
          if (c) c.subcategories.push(sub);
        }
      }

      const finalData = Array.from(categoryMap.values());
      const allSubcats = finalData.flatMap((c) => c.subcategories);
      const allProdsFromTree = uniqueById(
        allSubcats.flatMap((sc: any) => sc.products || [])
      );

      // Master, deduped list
      const allProdsMaster = uniqueById(arrProds);
      for (const p of allProdsMaster) {
        const qty = Number(p.quantity ?? 0);
        if (qty > 0 && qty <= 5) addLowStockNotification(p.name, p.id, qty);
      }

      setRawData(finalData);
      setCategories(finalData.map((c) => c.name));
      setSubcategories(allSubcats);
      setProducts(allProdsFromTree);
      setAllProductsMaster(allProdsMaster);
    } catch (err: any) {
      toast.error(`❌ Reload failed: ${err.message || err}`);
    }
  }, []);

  useEffect(() => {
    if (!FRONTEND_KEY) {
      toast.warn(
        "Frontend key missing. Set NEXT_PUBLIC_FRONTEND_KEY and restart.",
        { autoClose: 6000 }
      );
    }
    const controller = new AbortController();
    initialFetchAbortRef.current = controller;
    reloadAllData();
    return () => controller.abort();
  }, [reloadAllData]);

  // ---------- Cascades ----------
  useEffect(() => {
    if (!selectedCategory) {
      const allSubs = rawData.flatMap((c) => c.subcategories);
      setSubcategories(allSubs);
    } else {
      const cat = rawData.find((c) => c.name === selectedCategory);
      setSubcategories(cat?.subcategories || []);
    }
  }, [selectedCategory, rawData]);

  useEffect(() => {
    const allSubs = rawData.flatMap((c) => c.subcategories);

    if (!selectedCategory && selectedSubCategory === "__all__") {
      const all = allSubs.flatMap((sc: any) => sc.products || []);
      setProducts(uniqueById(all)); // global "All"
      return;
    }

    if (selectedCategory && selectedSubCategory === "__all__") {
      const cat = rawData.find((c) => c.name === selectedCategory);
      const catProds = (cat?.subcategories || []).flatMap(
        (sc: any) => sc.products || []
      );
      setProducts(uniqueById(catProds)); // Category + All
      return;
    }

    if (selectedSubCategory && selectedSubCategory !== "__all__") {
      const sub = allSubs.find((sc: any) => sc.name === selectedSubCategory);
      setProducts(uniqueById(sub?.products || [])); // specific subcategory
      return;
    }
  }, [selectedCategory, selectedSubCategory, rawData]);

  useEffect(() => setIsMounted(true), []);

  const selectedSubcategoryId = useMemo(() => {
    if (selectedSubCategory === "__all__") return null;
    const sub = subcategories.find((s: any) => s.name === selectedSubCategory);
    return sub ? String(sub.subcategory_id || sub.id) : null;
  }, [selectedSubCategory, subcategories]);

  // ---------- Bulk OOS ----------
  const handleBulkMarkOutOfStock = useCallback(async () => {
    if (selectedProductIds.length === 0 || isBulkOOS) return;
    setIsBulkOOS(true);

    try {
      const byId = new Map<string, any>();
      for (const p of products) byId.set(String(p.id), p);

      const getSubIdsForProduct = (pid: string): string[] => {
        const p = byId.get(String(pid));
        const single = p?.subcategory?.id ? [String(p.subcategory.id)] : [];

        const subs: string[] = [];
        if (!single.length) {
          for (const c of rawData) {
            for (const sc of c.subcategories || []) {
              const hit = (sc.products || []).some(
                (px: any) => String(px.id) === String(pid)
              );
              if (hit && (sc.subcategory_id || sc.id))
                subs.push(String(sc.subcategory_id || sc.id));
            }
          }
        }
        return Array.from(new Set([...single, ...subs]));
      };

      const requests = selectedProductIds.map((pid) => {
        const subIds = getSubIdsForProduct(pid);
        const payload = {
          product_ids: [pid],
          quantity: 0,
          selectedSubcategories: subIds,
          subcategory_ids: subIds,
          preserve_mappings: true,
        };

        return fetch(
          `${API_BASE_URL}/api/edit-product/`,
          withFrontendKey({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        ).then((res) => parseJsonStrict(res, "edit-product"));
      });

      const results = await Promise.allSettled(requests);
      const fails = results.filter(
        (r) => r.status === "rejected"
      ) as PromiseRejectedResult[];
      if (fails.length > 0) {
        toast.error(
          `❌ ${fails.length} product(s) failed to update. Others succeeded.`
        );
      } else {
        toast.success("📦 Selected products marked Out Of Stock");
      }

      setSelectedProductIds([]);
      await reloadAllData();
    } catch (err: any) {
      toast.error(`❌ Failed: ${err.message || err}`);
    } finally {
      setIsBulkOOS(false);
    }
  }, [selectedProductIds, isBulkOOS, products, rawData, reloadAllData]);

  // ---------- Delete ----------
  const handleDeleteMultiple = useCallback(async () => {
    if (selectedProductIds.length === 0 || isDeleting) return;
    const confirmDelete = confirm(
      "Are you sure you want to delete selected products?"
    );
    if (!confirmDelete) return;

    setIsDeleting(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/delete-product/`,
        withFrontendKey({
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selectedProductIds, confirm: true }),
        })
      );
      await parseJsonStrict(res, "delete-product");
      toast.success("🗑️ Selected products deleted");
      setSelectedProductIds([]);
      await reloadAllData();
    } catch (err: any) {
      toast.error(`❌ Delete failed: ${err.message || err}`);
    } finally {
      setIsDeleting(false);
    }
  }, [selectedProductIds, isDeleting, reloadAllData]);

  const handleBulkUnlinkFromSubcategory = useCallback(async () => {
    if (!selectedSubcategoryId) {
      toast.error("Select a specific subcategory first.");
      return;
    }
    if (selectedProductIds.length === 0 || isUnlinking) return;

    setIsUnlinking(true);
    try {
      const byId = new Map<string, any>();
      for (const p of products) byId.set(String(p.id), p);

      const calls = selectedProductIds.map((pid) => {
        const p = byId.get(String(pid));
        const productId = String(p?.product_id || p?.id);
        if (!productId)
          return Promise.reject(new Error(`Missing product_id for ${pid}`));

        const payload = {
          product_id: productId,
          subcategory_ids: [String(selectedSubcategoryId)],
        };

        return fetch(
          `${API_BASE_URL}/api/unlink-product-subcategory/`,
          withFrontendKey({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        ).then((res) => parseJsonStrict(res, "unlink-product-subcategory"));
      });

      const results = await Promise.allSettled(calls);
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const fail = results.length - ok;

      if (ok > 0)
        toast.success(`🔗 Unlinked ${ok} product(s) from the subcategory`);
      if (fail > 0) toast.error(`❌ ${fail} unlink(s) failed`);

      setSelectedProductIds([]);
      await reloadAllData();
    } catch (err: any) {
      toast.error(`❌ Unlink failed: ${err.message || err}`);
    } finally {
      setIsUnlinking(false);
    }
  }, [
    selectedProductIds,
    isUnlinking,
    products,
    selectedSubcategoryId,
    reloadAllData,
  ]);

  const toggleSelectProduct = useCallback((id: string) => {
    const sid = String(id);
    setSelectedProductIds((prev) =>
      prev.includes(sid) ? prev.filter((pid) => pid !== sid) : [...prev, sid]
    );
  }, []);

  // ---------- Render list (dedup FIRST, then filter/sort) ----------
  const filteredAndSortedProducts = useMemo(() => {
    // Hard guard: collapse any accidental dups before anything else.
    const baseUnique = uniqueById(products).map((p) => ({
      ...p,
      id: String(p.id),
    }));

    const filtered = baseUnique.filter((prod) => {
      const normalizedStatus = (prod.stock_status || "").trim().toLowerCase();
      const normalizedFilter = stockFilter.trim().toLowerCase();
      const isLow = Number(prod.quantity) > 0 && Number(prod.quantity) <= 5;

      if (normalizedFilter === "in") return normalizedStatus === "in stock";
      if (normalizedFilter === "out")
        return normalizedStatus === "out of stock";
      if (normalizedFilter === "low")
        return normalizedStatus === "low stock" || isLow;
      return true;
    });

    if (sortOrder === "asc") {
      return [...filtered].sort((a, b) => Number(a.price) - Number(b.price));
    }
    if (sortOrder === "desc") {
      return [...filtered].sort((a, b) => Number(b.price) - Number(a.price));
    }
    return filtered;
  }, [products, sortOrder, stockFilter]);

  const areAllSelected = useMemo(
    () =>
      filteredAndSortedProducts.length > 0 &&
      filteredAndSortedProducts.every((p) =>
        selectedProductIds.includes(String(p.id))
      ),
    [filteredAndSortedProducts, selectedProductIds]
  );

  const toggleSelectAll = useCallback(() => {
    if (areAllSelected) setSelectedProductIds([]);
    else
      setSelectedProductIds(filteredAndSortedProducts.map((p) => String(p.id)));
  }, [areAllSelected, filteredAndSortedProducts]);

  // ---------- Drag & Drop ----------
  const canReorder =
    sortOrder === "" &&
    stockFilter === "all" &&
    selectedSubCategory === "__all__" &&
    !selectedCategory;

  const handleDragEnd = useCallback(
    async (result: DropResult) => {
      if (!result.destination) return;
      if (!canReorder) {
        toast.info(
          "Reordering is available only in the All view without filters/sorting."
        );
        return;
      }

      const reordered = Array.from(filteredAndSortedProducts);
      const [moved] = reordered.splice(result.source.index, 1);
      reordered.splice(result.destination.index, 0, moved);

      setProducts((prev) => {
        const idOrder = reordered.map((p) => String(p.id));
        const mapPrev = new Map(prev.map((p) => [String(p.id), p]));
        return idOrder.map((id) => mapPrev.get(id)).filter(Boolean) as any[];
      });

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/update-product-order/`,
          withFrontendKey({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              products: reordered.map((p) => ({ id: String(p.id) })),
            }),
          })
        );
        await parseJsonStrict(response, "update-product-order");
        toast.success("✅ Product order saved");
      } catch (error: any) {
        toast.error(
          `❌ Failed to save product order: ${error.message || error}`
        );
      }
    },
    [canReorder, filteredAndSortedProducts]
  );

  // ---------- Change Existing Product modal helpers ----------
  const sortByRecent = useCallback((list: any[]) => {
    return [...list].sort((a, b) => {
      const aTime = a.created_at ? Date.parse(a.created_at) : NaN;
      const bTime = b.created_at ? Date.parse(b.created_at) : NaN;
      if (!isNaN(aTime) && !isNaN(bTime)) return bTime - aTime;
      const aId = Number(a.id);
      const bId = Number(b.id);
      if (!isNaN(aId) && !isNaN(bId)) return bId - aId;
      return 0;
    });
  }, []);

  const sortByAlpha = useCallback((list: any[]) => {
    return [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, []);

  const modalFiltered = useMemo(() => {
    const base = uniqueById(allProductsMaster).map((p) => ({
      ...p,
      id: String(p.id),
    })); // extra guard
    if (changeSearch.trim()) {
      const q = changeSearch.trim().toLowerCase();
      return base.filter((p) => (p.name || "").toLowerCase().includes(q));
    }
    if (changeStage === "top3") return sortByRecent(base).slice(0, 3);
    if (changeStage === "first25") return sortByAlpha(base).slice(0, 25);
    return sortByAlpha(base);
  }, [allProductsMaster, changeSearch, changeStage, sortByAlpha, sortByRecent]);

  const handleAddToSelectedSub = useCallback(
    async (product: any) => {
      if (!selectedSubcategoryId) {
        toast.error("Select a specific subcategory first.");
        return;
      }
      try {
        const pidToSend = String(product?.product_id || product?.id);
        if (!pidToSend) {
          toast.error("Missing product_id on selected product.");
          return;
        }

        setIsMapping(product?.id || pidToSend);

        const payload = {
          product_id: pidToSend,
          subcategory_id: String(selectedSubcategoryId),
          replace: false, // add-only
        };

        const res = await fetch(
          `${API_BASE_URL}/api/link-product-subcategory/`, // trailing slash
          withFrontendKey({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        );
        const data = await parseJsonStrict(res, "link-product-subcategory");

        if (
          Array.isArray(data?.skipped_missing) &&
          data.skipped_missing.length
        ) {
          toast.warn(
            `Linked with warnings. Skipped: ${data.skipped_missing.join(", ")}`
          );
        } else if (Array.isArray(data?.added) && data.added.length) {
          toast.success("✅ Product linked to subcategory");
        } else {
          toast.info("No changes (already linked).");
        }

        await reloadAllData();
      } catch (err: any) {
        toast.error(`❌ Link failed: ${err.message || err}`);
      } finally {
        setIsMapping(null);
      }
    },
    [selectedSubcategoryId, reloadAllData]
  );

  const ModalAny = Modal as unknown as React.ComponentType<any>;

  return (
    <AdminAuthGuard>
      <ToastContainer position="top-right" />
      <div className="flex flex-col lg:flex-row min-h-screen bg-gradient-to-br from-gray-50 to-white">
        {showSidebar && (
          <div className="lg:w-64 w-full">
            <AdminSidebar />
          </div>
        )}

        <main className="flex-1 px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 lg:py-10 bg-gray-50 min-h-screen">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6 sm:mb-8 bg-gradient-to-r from-white via-[#f8f9fa] to-gray-100 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                  📦 Admin Product Manager
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                  Manage products, inventory, and pricing across all categories.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <select
                  className="border border-gray-300 px-3 py-2 rounded-md text-sm bg-white text-black focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A]"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                >
                  <option value="">Sort by Price</option>
                  <option value="asc">Price: Low to High</option>
                  <option value="desc">Price: High to Low</option>
                </select>

                <select
                  className="border border-gray-300 px-3 py-2 rounded-md text-sm bg-white text-black focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A]"
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value as any)}
                >
                  <option value="all">Stock: All</option>
                  <option value="in">In Stock</option>
                  <option value="low">Low Stock</option>
                  <option value="out">Out of Stock</option>
                </select>

                <button
                  className="bg-[#891F1A] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#6d1915] transition-colors"
                  onClick={() => {
                    setEditingProductId(null);
                    setIsModalOpen(true);
                  }}
                >
                  + Add Product
                </button>

                {selectedSubCategory !== "__all__" && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangeExistingOpen(true);
                      setChangeSearch("");
                      setChangeStage("top3");
                    }}
                    className="whitespace-nowrap bg-white border border-[#891F1A] text-[#891F1A] hover:bg-[#891F1A] hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    title="Map an existing product into the selected subcategory"
                  >
                    Change Existing Product
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Filters row */}
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center mb-6 sm:mb-8">
            {/* Category select */}
            <select
              className="border border-gray-300 px-3 py-2 rounded-md text-sm bg-white text-black focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A] w-full"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={`cat::${cat}`} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Subcategory select */}
            <select
              className="border border-gray-300 px-3 py-2 rounded-md text-sm bg-white text-black focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A] w-full"
              value={selectedSubCategory}
              onChange={(e) => setSelectedSubCategory(e.target.value)}
            >
              <option value="__all__">All Subcategories</option>
              {subcategories.map((sub: any) => {
                const sid = String(sub.subcategory_id || sub.id || sub.name);
                return (
                  <option key={`subopt::${sid}`} value={sub.name}>
                    {sub.name}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Table */}
          <div className="overflow-auto rounded-2xl shadow-lg border border-gray-200 max-h-[500px] thin-scrollbar">
            <table className="w-full table-auto text-sm bg-white">
              <thead className="text-white bg-[#891F1A] sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-center w-4">
                    <Checkbox
                      checked={areAllSelected}
                      onChange={toggleSelectAll}
                      color="secondary"
                      size="medium"
                      sx={{
                        color: "#fff",
                        "&.Mui-checked": { color: "#fff" },
                        marginLeft: "-13px",
                      }}
                    />
                  </th>
                  <th className="p-3 text-center">ID</th>
                  <th className="p-3 text-center">Thumbnail</th>
                  <th className="p-3 text-left">Name</th>
                  <th className="p-3 text-center">Stock</th>
                  <th className="p-3 text-center">Price</th>
                  <th className="p-3 text-center">Printing</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>

              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="products">
                  {(provided) => (
                    <tbody
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="text-gray-800 divide-y divide-gray-100"
                    >
                      {!isMounted ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="text-center py-6 text-gray-400 italic"
                          >
                            Loading products...
                          </td>
                        </tr>
                      ) : filteredAndSortedProducts.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="text-center text-gray-500 py-6 italic"
                          >
                            No products to show
                          </td>
                        </tr>
                      ) : (
                        filteredAndSortedProducts.map((prod, pi) => {
                          const idStr = String(prod.id);
                          const dragId = `prod::${idStr}`;
                          const imageUrl =
                            prod?.images?.[0]?.value ||
                            prod?.image ||
                            "/img1.jpg";
                          const printingList =
                            (prod as any).printingMethod ??
                            (prod as any).printing_methods ??
                            [];
                          const printingText = Array.isArray(printingList)
                            ? printingList
                                .map(
                                  (pm: string) =>
                                    printingMethodShortForms[pm] || pm
                                )
                                .join(", ")
                            : "—";

                          const status = (prod.stock_status || "")
                            .trim()
                            .toLowerCase();
                          const statusColor =
                            status === "in stock"
                              ? "#28A745"
                              : status === "low stock"
                              ? "#9B870C"
                              : "#DC3545";

                          const prettyStatus = (prod.stock_status || "")
                            .split(" ")
                            .map(
                              (w: string) =>
                                w.charAt(0).toUpperCase() +
                                w.slice(1).toLowerCase()
                            )
                            .join(" ");

                          return (
                            <Draggable
                              key={dragId}
                              draggableId={dragId}
                              index={pi}
                            >
                              {(prov) => (
                                <tr
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  {...prov.dragHandleProps}
                                  className="hover:bg-gray-50 transition"
                                >
                                  <td className="p-3 text-center">
                                    <Checkbox
                                      checked={selectedProductIds.includes(
                                        idStr
                                      )}
                                      onChange={() =>
                                        toggleSelectProduct(idStr)
                                      }
                                      color="secondary"
                                      size="medium"
                                      sx={{
                                        color: "#891F1A",
                                        "&.Mui-checked": { color: "#891F1A" },
                                        marginLeft: "-13px",
                                      }}
                                    />
                                  </td>

                                  <td className="p-4 text-center font-semibold text-[#891F1A]">
                                    {idStr}
                                  </td>

                                  <td className="p-4 text-center">
                                    <img
                                      src={imageUrl}
                                      alt={prod.name}
                                      className="w-12 h-12 object-cover rounded shadow mx-auto"
                                    />
                                  </td>

                                  <td className="p-4 text-center">
                                    {prod.name}
                                  </td>

                                  <td
                                    className="p-4 text-center font-medium"
                                    style={{ color: statusColor }}
                                  >
                                    {prettyStatus || "—"}
                                  </td>

                                  <td className="p-4 text-center font-semibold text-green-700">
                                    £{prod.price}
                                  </td>

                                  <td className="p-4 text-center text-black">
                                    {printingText}
                                  </td>

                                  <td className="p-4 text-center">
                                    <button
                                      onClick={() => {
                                        setEditingProductId(idStr);
                                        setIsModalOpen(true);
                                      }}
                                      className="bg-[#891F1A] hover:bg-[#6e1915] text-white text-xs px-4 py-2 rounded-full transition"
                                    >
                                      View / Edit
                                    </button>
                                  </td>
                                </tr>
                              )}
                            </Draggable>
                          );
                        })
                      )}
                      {provided.placeholder}
                    </tbody>
                  )}
                </Droppable>
              </DragDropContext>
            </table>
          </div>

          {/* Footer actions */}
          <div className="flex justify-between items-center mt-2 flex-wrap gap-2 sm:gap-4 text-black">
            <div className="text-sm text-gray-600 italic">
              Note: SP = Screen Printing, DP = Digital Printing, OP = Offset
              Printing
            </div>

            <div className="flex gap-2 ml-auto">
              <span>Selected: {selectedProductIds.length}</span>

              {/* Mark Out of Stock */}
              <button
                onClick={handleBulkMarkOutOfStock}
                disabled={selectedProductIds.length === 0 || isBulkOOS}
                className={`px-3 py-1 rounded text-sm transition-colors duration-200 ${
                  selectedProductIds.length === 0 || isBulkOOS
                    ? "bg-gray-500 cursor-not-allowed text-white"
                    : "bg-[#891F1A] hover:bg-red-700 text-white"
                }`}
              >
                {isBulkOOS ? "Marking…" : "Mark Out of Stock"}
              </button>

              {/* Unlink vs Delete */}
              {selectedSubcategoryId ? (
                <button
                  onClick={handleBulkUnlinkFromSubcategory}
                  disabled={selectedProductIds.length === 0 || isUnlinking}
                  className={`px-3 py-1 rounded text-sm transition-colors duration-200 ${
                    selectedProductIds.length === 0 || isUnlinking
                      ? "bg-gray-500 cursor-not-allowed text-white"
                      : "bg-[#891F1A] hover:bg-red-700 text-white"
                  }`}
                >
                  {isUnlinking ? "Unlinking…" : "Unlink from Subcategory"}
                </button>
              ) : (
                <button
                  onClick={handleDeleteMultiple}
                  disabled={selectedProductIds.length === 0 || isDeleting}
                  className={`px-3 py-1 rounded text-sm transition-colors duration-200 ${
                    selectedProductIds.length === 0 || isDeleting
                      ? "bg-gray-500 cursor-not-allowed text-white"
                      : "bg-[#891F1A] hover:bg-red-700 text-white"
                  }`}
                >
                  {isDeleting ? "Deleting…" : "Delete Selected"}
                </button>
              )}
            </div>
          </div>

          {/* Add/Edit modal */}
          <ModalAny
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              setEditingProductId(null);
              reloadAllData();
            }}
            onFirstImageUpload={() => {}}
            productId={editingProductId || undefined}
          />

          {/* Change Existing Product modal */}
          {isChangeExistingOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm p-4"
              onClick={() => {
                setIsChangeExistingOpen(false);
              }}
            >
              <div
                className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5 text-gray-500"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M12.9 14.32a8 8 0 111.414-1.414l4.387 4.387a1 1 0 01-1.414 1.414l-4.387-4.387zM14 8a6 6 0 11-12 0 6 6 0 0112 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                    <input
                      value={changeSearch}
                      onChange={(e) => {
                        setChangeSearch(e.target.value);
                        setChangeStage("top3");
                      }}
                      placeholder="Search product…"
                      className="w-full pl-10 pr-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#891F1A] text-black"
                    />
                  </div>

                  <button
                    onClick={() => {
                      setIsChangeExistingOpen(false);
                      setChangeSearch("");
                      setChangeStage("top3");
                    }}
                    className="px-3 py-2 rounded-lg border hover:bg-gray-50 text-black"
                    title="Close"
                  >
                    Close
                  </button>
                </div>

                <div className="p-4 max-h-[60vh] overflow-auto custom-scrollbar">
                  {modalFiltered.length === 0 ? (
                    <div className="text-center text-gray-500 italic py-8">
                      No matching products.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {modalFiltered.map((p) => {
                        const img =
                          p?.images?.[0]?.value || p?.image || "/img1.jpg";
                        return (
                          <li
                            key={`modal::${p.id}`}
                            className="flex items-center justify-between gap-3 p-2 border rounded-lg hover:bg-gray-50"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <img
                                src={img}
                                alt={p.name}
                                className="w-10 h-10 rounded object-cover border"
                              />
                              <div className="truncate">
                                <div className="font-medium truncate text-black">
                                  {p.name}
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                  ID: {p.id}
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={() => handleAddToSelectedSub(p)}
                              disabled={
                                !selectedSubcategoryId || isMapping === p.id
                              }
                              className={`w-9 h-9 rounded-full flex items-center justify-center border ${
                                isMapping === p.id
                                  ? "bg-gray-200 cursor-wait"
                                  : "bg-white hover:bg-[#891F1A] hover:text-white text-[#891F1A] border-[#891F1A]"
                              }`}
                              title="Add to selected subcategory"
                            >
                              {isMapping === p.id ? (
                                <svg
                                  className="animate-spin h-5 w-5"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                                  />
                                </svg>
                              ) : (
                                <span className="text-xl leading-none">+</span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {!changeSearch.trim() && (
                  <div className="p-4 border-t flex justify-end">
                    {changeStage === "top3" && (
                      <button
                        onClick={() => setChangeStage("first25")}
                        className="px-4 py-2 rounded bg-[#891F1A] text-white hover:opacity-90"
                      >
                        Show more
                      </button>
                    )}
                    {changeStage === "first25" && (
                      <button
                        onClick={() => setChangeStage("all")}
                        className="px-4 py-2 rounded bg-[#891F1A] text-white hover:opacity-90"
                      >
                        Show all
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </AdminAuthGuard>
  );
}
