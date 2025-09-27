"use client";

import React, { useEffect, useState } from "react";
import AdminSidebar from "../components/AdminSideBar";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Checkbox from "@mui/material/Checkbox";
import Modal from "../components/ProductModal";
import { API_BASE_URL } from "../../utils/api";

// ---- Frontend key helper (matches FrontendOnlyPermission on backend)
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

// ---- Utility: make URL absolute for preview if it's relative
const toAbsolute = (maybeRelative: string) => {
  if (!maybeRelative) return "";
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  const base = API_BASE_URL.replace(/\/+$/, "");
  const path = maybeRelative.startsWith("/")
    ? maybeRelative
    : `/${maybeRelative}`;
  return `${base}${path}`;
};

// If your Modal typing doesn't accept `children`, create a loose-typed alias so you can pass body content.
const ModalAny = Modal as unknown as React.ComponentType<any>;

export default function InventoryManagerPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [stockRange, setStockRange] = useState<{ min: number; max: number }>({
    min: 0,
    max: Infinity,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const refreshProducts = async () => {
    try {
      if (!FRONTEND_KEY) {
        console.warn("NEXT_PUBLIC_FRONTEND_KEY is missing.");
      }

      const [productRes, subcatRes, catRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/show-product/`, withFrontendKey()),
        fetch(`${API_BASE_URL}/api/show-subcategories/`, withFrontendKey()),
        fetch(`${API_BASE_URL}/api/show-categories/`, withFrontendKey()),
      ]);

      if (!productRes.ok || !subcatRes.ok || !catRes.ok) {
        throw new Error(
          `Fetch failed (${productRes.status}/${subcatRes.status}/${catRes.status})`
        );
      }

      const [productsJson, subcategoriesJson, categoriesJson] =
        await Promise.all([productRes.json(), subcatRes.json(), catRes.json()]);

      const subcategories = Array.isArray(subcategoriesJson)
        ? subcategoriesJson
        : [];
      const categories = Array.isArray(categoriesJson) ? categoriesJson : [];
      const productsArr = Array.isArray(productsJson) ? productsJson : [];

      // Build lookup maps
      const subcatMap: Record<
        string,
        { name: string; status: string; categories: string[] }
      > = {};
      subcategories.forEach((sub: any) => {
        subcatMap[String(sub.id)] = {
          name: sub.name,
          status: sub.status,
          categories: Array.isArray(sub.categories) ? sub.categories : [],
        };
      });

      const categoryMap: Record<string, string> = {};
      categories.forEach((cat: any) => {
        categoryMap[String(cat.name)] = cat.status;
      });

      // Enrich products with visibility + normalized fields
      const enriched = productsArr.map((p: any) => {
        const subId =
          p?.subcategory?.id != null ? String(p.subcategory.id) : "";
        const subcatInfo = subcatMap[subId];
        const subcatStatus = subcatInfo?.status || "hidden";
        const subcatCategories = subcatInfo?.categories || [];
        const hasVisibleCategory = subcatCategories.some(
          (catName) => categoryMap[catName] === "visible"
        );

        const quantityNum =
          typeof p.stock_quantity === "number"
            ? p.stock_quantity
            : parseInt(String(p.stock_quantity || "0")) || 0;

        return {
          ...p,
          id: String(p.id), // normalize ID to string
          brand_title: p.brand_title ?? "",
          fit_description: p.fit_description ?? "",
          sizes: Array.isArray(p.sizes) ? p.sizes : [],
          quantity: quantityNum,
          printingMethod: Array.isArray(p.printing_methods)
            ? p.printing_methods
            : [],
          images: [{ type: "url", value: p.image || "", file: null }],
          isVisible: subcatStatus === "visible" && hasVisibleCategory,
        };
      });

      setProducts(enriched);
    } catch (err) {
      console.error("Error loading inventory:", err);
      toast.error("Failed to load inventory");
    }
  };

  useEffect(() => {
    refreshProducts().catch((err) => {
      console.error("Error fetching inventory:", err);
      toast.error("Failed to load inventory");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelectProduct = (id: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
  };

  const filteredInventory = products.filter((prod) => {
    const name = prod.name || prod.title || "";
    const stock = typeof prod.quantity === "number" ? prod.quantity : 0;
    const matchesStock = stock >= stockRange.min && stock <= stockRange.max;
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStock && matchesSearch && prod.isVisible;
  });

  const areAllSelected =
    filteredInventory.length > 0 &&
    filteredInventory.every((p) => selectedProductIds.includes(String(p.id)));

  const toggleSelectAll = () => {
    if (areAllSelected) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(filteredInventory.map((p) => String(p.id)));
    }
  };

  const handleEditProduct = (product: any) => {
    setEditingProductId(String(product.id));
    setIsModalOpen(true);
  };

  const handleDeleteSelected = async () => {
    if (selectedProductIds.length === 0) return;

    const confirmDelete = confirm(
      "Are you sure you want to delete selected products?"
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/delete-product/`,
        withFrontendKey({
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selectedProductIds, confirm: true }),
        })
      );

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          `❌ Bulk delete failed: ${result?.error || "Unknown error"}`
        );
        return;
      }

      toast.success("🗑️ Selected products deleted");
      setSelectedProductIds([]);
      refreshProducts();
    } catch (err: any) {
      toast.error(`❌ Delete failed: ${err.message}`);
    }
  };

  const handleMarkOutOfStock = async () => {
    if (selectedProductIds.length === 0) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/edit_product/`,
        withFrontendKey({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_ids: selectedProductIds,
            quantity: 0,
          }),
        })
      );

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(`❌ Failed: ${result?.error || "Unknown error"}`);
        return;
      }

      toast.success("📦 Selected products marked out of stock");
      setSelectedProductIds([]);
      refreshProducts();
    } catch (err: any) {
      toast.error(`❌ Failed: ${err.message}`);
    }
  };

  return (
    <AdminAuthGuard>
      <ToastContainer />
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <div className="w-64 hidden lg:block">
          <AdminSidebar />
        </div>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 lg:py-10">
          {/* Header */}
          <div className="mb-6 sm:mb-8 bg-gradient-to-r from-white via-[#f8f9fa] to-gray-100 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
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
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name..."
                className="border border-gray-300 px-3 py-2 rounded-md text-sm bg-white text-black placeholder:text-gray-400 focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A]"
              />
              <select
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "0-100") setStockRange({ min: 0, max: 100 });
                  else if (val === "100-200")
                    setStockRange({ min: 100, max: 200 });
                  else setStockRange({ min: 0, max: Infinity });
                }}
                className="border border-gray-300 px-3 py-2 rounded-md text-sm bg-white text-black focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A]"
              >
                <option value="all">All Stock</option>
                <option value="0-100">Stock: 0 - 100</option>
                <option value="100-200">Stock: 100 - 200</option>
              </select>
              <button
                className="bg-[#891F1A] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#6d1915] transition-colors"
                onClick={() => setIsModalOpen(true)}
              >
                + Add Product
              </button>
            </div>
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

              <tbody className="text-gray-800 divide-y divide-gray-100">
                {filteredInventory.map((prod) => {
                  const imgSrc = prod.images?.[0]?.value
                    ? toAbsolute(prod.images[0].value)
                    : "/img1.jpg";
                  const printingList =
                    prod.printingMethod ?? prod.printing_methods ?? [];
                  const printingText = Array.isArray(printingList)
                    ? printingList.join(", ")
                    : "—";

                  return (
                    <tr key={prod.id} className="hover:bg-gray-50 transition">
                      <td className="p-3 text-center">
                        <Checkbox
                          checked={selectedProductIds.includes(String(prod.id))}
                          onChange={() => toggleSelectProduct(String(prod.id))}
                          sx={{
                            color: "#891F1A",
                            "&.Mui-checked": { color: "#891F1A" },
                            marginLeft: "-13px",
                          }}
                        />
                      </td>
                      <td className="p-3 text-[#891F1A] font-semibold">
                        {prod.id}
                      </td>
                      <td className="p-3 text-center">
                        <img
                          src={imgSrc}
                          alt="product"
                          width={45}
                          height={45}
                          className="rounded shadow mx-auto object-cover"
                          onError={(e) =>
                            ((e.currentTarget as HTMLImageElement).src =
                              "/img1.jpg")
                          }
                        />
                      </td>
                      <td className="p-3">{prod.name || prod.title || "—"}</td>
                      <td className="p-3 text-center text-red-600 font-bold">
                        {prod.quantity}
                      </td>
                      <td className="p-3 text-center text-green-700 font-bold">
                        £{prod.price || 0}
                      </td>
                      <td className="p-3 text-center">{printingText}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleEditProduct(prod)}
                          className="bg-[#891F1A] hover:bg-[#6e1915] text-white text-xs px-4 py-2 rounded-full transition"
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

          {/* Footer Actions */}
          <div className="flex justify-between items-center mt-4 flex-wrap gap-3 text-sm">
            <span className="italic text-gray-600">
              Note: SP = Screen Printing, DP = Digital Printing, OP = Offset
              Printing
            </span>

            <div className="flex gap-3 items-center">
              <span className="text-gray-700">
                Selected: {selectedProductIds.length} product
                {selectedProductIds.length !== 1 ? "s" : ""}
              </span>

              <button
                onClick={handleMarkOutOfStock}
                disabled={selectedProductIds.length === 0}
                className={`px-3 py-1 rounded text-sm ${
                  selectedProductIds.length === 0
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "bg-[#891F1A] text-white hover:bg-red-700"
                }`}
              >
                Mark Out of Stock
              </button>

              <button
                onClick={handleDeleteSelected}
                disabled={selectedProductIds.length === 0}
                className={`px-3 py-1 rounded text-sm ${
                  selectedProductIds.length === 0
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "bg-[#891F1A] text-white hover:bg-red-700"
                }`}
              >
                Delete Selected
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* MODAL (loose-typed alias allows children while keeping your existing Modal type unchanged) */}
      <ModalAny
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingProductId(null);
        }}
        onFirstImageUpload={(f: File) => {
          // optional: handle first image uploaded in modal
        }}
        productId={editingProductId ?? undefined}
      >
        <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="mb-2 font-semibold">
            {editingProductId ? "Edit Product" : "Add New Product"}
          </div>

          {/* PRODUCT FORM GOES HERE */}

          <div className="flex justify-end gap-4 sticky bottom-0 bg-white py-3">
            <button
              onClick={() => setIsModalOpen(false)}
              className="bg-gray-300 text-black px-4 py-2 rounded"
            >
              Back
            </button>
            <button
              onClick={() => {
                // You can trigger a save inside Modal if needed
                setIsModalOpen(false);
              }}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              {editingProductId ? "Update Product" : "Save Product"}
            </button>
          </div>
        </div>
      </ModalAny>
    </AdminAuthGuard>
  );
}
