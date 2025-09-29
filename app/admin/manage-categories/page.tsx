"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import AdminSidebar from "../components/AdminSideBar";
import { API_BASE_URL } from "../../utils/api";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Checkbox from "@mui/material/Checkbox";
import CheckIcon from "@mui/icons-material/Check";
import CategorySubCategoryModal from "../components/CategorySubCategoryModal";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

/* ------------------ constants & helpers ------------------ */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();

const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers, cache: "no-store", credentials: "omit", mode: "cors" };
};

const jsonFetch = async (url: string, init: RequestInit = {}) => {
  const res = await fetch(url, withFrontendKey({ ...init, headers: { "Content-Type": "application/json", ...(init.headers || {}) } }));
  const text = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error((data && (data.error || data.detail)) || text || `HTTP ${res.status}`);
  return data;
};

const resolveImageSrc = (raw?: string | null) => {
  const val = (raw || "").trim();
  if (!val) return "/images/img1.jpg";
  if (val.startsWith("http") || val.startsWith("data:image/")) return val;
  // normalize leading slash for media
  const path = val.startsWith("/") ? val : `/${val}`;
  return `${API_BASE_URL}${path.startsWith("/media/") ? path : `/media${path}`}`;
};

const CategorySubCategoryModalAny =
  CategorySubCategoryModal as unknown as React.ComponentType<any>;

/* ------------------ persistence keys ------------------ */
const PERSIST_KEYS = {
  VIEW_TYPE: "cc_admin_cat_viewType",
  SHOW_HIDDEN: "cc_admin_cat_showHidden",
  SORT_ORDER: "cc_admin_cat_sortOrder",
} as const;

/* ------------------ memo checkbox ------------------ */
const CustomCheckbox = React.memo((props: React.ComponentProps<typeof Checkbox>) => (
  <Checkbox
    {...props}
    icon={
      <span
        style={{
          border: "2px solid #b91c1c",
          width: 20,
          height: 20,
          borderRadius: 4,
          display: "block",
        }}
      />
    }
    checkedIcon={
      <span
        style={{
          backgroundColor: "#b91c1c",
          width: 20,
          height: 20,
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
        }}
      >
        <CheckIcon style={{ fontSize: 18 }} />
      </span>
    }
  />
));

/* ------------------ page ------------------ */
export default function CategorySubcategoryAdminPage() {
  const [showSidebar, setShowSidebar] = useState(true);

  const [viewType, setViewType] = useState<"categories" | "subcategories">(() => {
    if (typeof window === "undefined") return "categories";
    return ((localStorage.getItem(PERSIST_KEYS.VIEW_TYPE) as any) || "categories") as
      | "categories"
      | "subcategories";
  });
  const [showHidden, setShowHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(PERSIST_KEYS.SHOW_HIDDEN) === "true";
  });
  const [sortOrder, setSortOrder] = useState<"none" | "asc" | "desc">(() => {
    if (typeof window === "undefined") return "none";
    return ((localStorage.getItem(PERSIST_KEYS.SORT_ORDER) as any) || "none") as "none" | "asc" | "desc";
  });

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(PERSIST_KEYS.VIEW_TYPE, viewType);
  }, [viewType]);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(PERSIST_KEYS.SHOW_HIDDEN, String(showHidden));
  }, [showHidden]);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(PERSIST_KEYS.SORT_ORDER, sortOrder);
  }, [sortOrder]);

  const [loading, setLoading] = useState(true);
  const [netError, setNetError] = useState<string | null>(null);

  const [categories, setCategories] = useState<any[]>([]);
  const [subCategories, setSubCategories] = useState<any[]>([]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [openCategoryModal, setOpenCategoryModal] = useState(false);
  const [openSubCategoryModal, setOpenSubCategoryModal] = useState(false);
  const [selectedCategoryData, setSelectedCategoryData] = useState<any>(null);
  const [selectedSubCategoryData, setSelectedSubCategoryData] = useState<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setNetError(null);
    try {
      const [cats, subs] = await Promise.all([
        jsonFetch(`${API_BASE_URL}/api/show-categories/`, { method: "GET" }),
        jsonFetch(`${API_BASE_URL}/api/show-subcategories/`, { method: "GET" }),
      ]);

      setCategories(
        (Array.isArray(cats) ? cats : []).sort((a: any, b: any) => (a.order || 0) - (b.order || 0)).map((c: any) => ({
          ...c,
          id: c.id || c.category_id,
          subcategories: c.subcategories?.names || [],
          subCount: c.subcategories?.count || 0,
          productCount: c.products || 0,
          status: c.status,
          image: c.image || "",
          imageAlt: c.imageAlt ?? c.alt_text ?? "",
          caption: c.caption ?? "",
          description: c.description ?? "",
        }))
      );

      setSubCategories(
        (Array.isArray(subs) ? subs : []).sort((a: any, b: any) => (a.order || 0) - (b.order || 0)).map((s: any) => ({
          ...s,
          id: s.id || s.subcategory_id,
          parentCategory: s.categories?.join(", "),
          productCount: s.products || 0,
          status: s.status,
          image: s.image || "",
          imageAlt: s.imageAlt ?? s.alt_text ?? "",
          caption: s.caption ?? "",
          description: s.description ?? "",
        }))
      );
    } catch (e: any) {
      setNetError(e?.message || "Failed to load data");
      toast.error("Failed to load category/subcategory data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleSelect = useCallback((id: any) => {
    const sid = String(id);
    setSelectedIds((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]));
  }, []);

  /* ---------- filter/sort view ---------- */
  const baseList = viewType === "categories" ? categories : subCategories;
  const filteredData = useMemo(() => {
    const list = (showHidden ? baseList.filter((i) => i.status === "hidden") : baseList.filter((i) => i.status !== "hidden")) as any[];
    if (sortOrder === "none") return list;
    const arr = [...list];
    arr.sort((a, b) => {
      const A = a.productCount || 0;
      const B = b.productCount || 0;
      return sortOrder === "asc" ? A - B : B - A;
    });
    return arr;
  }, [baseList, showHidden, sortOrder, viewType]);

  const allSelected = filteredData.length > 0 && filteredData.every((i) => selectedIds.includes(String(i.id)));
  const handleSelectAllToggle = useCallback(() => {
    if (allSelected) setSelectedIds((prev) => prev.filter((id) => !filteredData.some((i) => String(i.id) === id)));
    else setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredData.map((i) => String(i.id))])));
  }, [allSelected, filteredData]);

  /* ---------- destructive ops ---------- */
  const handleDelete = useCallback(async () => {
    if (!selectedIds.length) {
      toast.error(`Please select at least one ${viewType === "categories" ? "Category" : "Subcategory"} to delete.`);
      return;
    }

    const hardWarning =
      viewType === "categories"
        ? "Are you sure you want to delete these categories? All subcategories and products related to them (that are NOT shared) will be deleted."
        : "Are you sure you want to delete these subcategories? All products related to them (that are NOT shared) will be deleted.";

    if (!window.confirm(hardWarning)) return;

    const endpoint = viewType === "categories" ? "delete-categories" : "delete-subcategories";

    try {
      // phase 1 — server may return confirm=true if cascade is needed
      const first = await jsonFetch(`${API_BASE_URL}/api/${endpoint}/`, {
        method: "POST",
        body: JSON.stringify({ ids: selectedIds, confirm: false }),
      });

      if (first?.confirm) {
        if (!window.confirm(first.message || "This will remove related objects. Continue?")) return;
        const second = await jsonFetch(`${API_BASE_URL}/api/${endpoint}/`, {
          method: "POST",
          body: JSON.stringify({ ids: selectedIds, confirm: true }),
        });
        if (!second?.success) throw new Error(second?.error || "Delete failed");
      } else if (!first?.success) {
        throw new Error(first?.error || "Delete failed");
      }

      // local update
      if (viewType === "categories") {
        setCategories((prev) => prev.filter((c) => !selectedIds.includes(String(c.id))));
      } else {
        setSubCategories((prev) => prev.filter((s) => !selectedIds.includes(String(s.id))));
      }
      setSelectedIds([]);
      toast.success("Deleted successfully");
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong during delete");
    }
  }, [selectedIds, viewType]);

  const updateStatus = useCallback(
    async (status: "hidden" | "visible", singleId?: string) => {
      const idsToUpdate = singleId ? [String(singleId)] : selectedIds;
      if (!idsToUpdate.length) {
        toast.error(
          `Please select at least one ${viewType === "categories" ? "Category" : "Subcategory"} to ${
            status === "hidden" ? "hide" : "unhide"
          }.`
        );
        return;
      }

      const isCats = viewType === "categories";
      const prevCats = categories;
      const prevSubs = subCategories;

      if (isCats) {
        setCategories((prev) => prev.map((c) => (idsToUpdate.includes(String(c.id)) ? { ...c, status } : c)));
      } else {
        setSubCategories((prev) => prev.map((s) => (idsToUpdate.includes(String(s.id)) ? { ...s, status } : s)));
      }
      setSelectedIds([]);

      try {
        const result = await jsonFetch(`${API_BASE_URL}/api/update_hidden_status/`, {
          method: "POST",
          body: JSON.stringify({
            ids: idsToUpdate,
            type: isCats ? "categories" : "subcategories",
            status,
          }),
        });
        if (!result?.success) throw new Error(result?.error || "Failed to update visibility status");
        toast.success(`${status === "hidden" ? "Hidden" : "Unhidden"} selected ${isCats ? "Categories" : "Subcategories"} successfully`);
      } catch (err: any) {
        // rollback
        if (isCats) setCategories(prevCats);
        else setSubCategories(prevSubs);
        toast.error(err?.message || "Something went wrong while updating visibility");
      }
    },
    [selectedIds, viewType, categories, subCategories]
  );

  /* ---------- drag & drop order ---------- */
  const handleDragEnd = useCallback(
    async (result: any) => {
      if (!result.destination) return;
      if (result.source.index === result.destination.index) return;

      if (sortOrder !== "none") {
        toast.warn("Turn off sorting to reorder.");
        return;
      }

      const isCats = viewType === "categories";

      if (isCats) {
        const prev = categories;

        // Build working slices by current visibility
        const visible = categories.filter((c) => c.status !== "hidden");
        const hidden = categories.filter((c) => c.status === "hidden");
        const working = showHidden ? hidden : visible;

        // Reorder ONLY within the shown slice (filteredData is exactly working when sort=none)
        const reorderedSlice = Array.from(working);
        const [moved] = reorderedSlice.splice(result.source.index, 1);
        reorderedSlice.splice(result.destination.index, 0, moved);

        // Merge back to full list preserving the other slice
        const fullAfter = showHidden ? [...visible, ...reorderedSlice] : [...reorderedSlice, ...hidden];

        // write sequential order
        const withOrder = fullAfter.map((cat, idx) => ({ ...cat, order: idx + 1 }));
        setCategories(withOrder);

        const payload = withOrder.map((cat) => ({ id: cat.id, order: cat.order }));

        try {
          const out = await jsonFetch(`${API_BASE_URL}/api/update-category-order/`, {
            method: "POST",
            body: JSON.stringify({ ordered_categories: payload }),
          });
          if (!out?.success) throw new Error(out?.error || "Failed to save category order");
          toast.success("Category order saved!");
        } catch (e: any) {
          setCategories(prev);
          toast.error(e?.message || "Network error saving category order");
        }
      } else {
        const prev = subCategories;

        const visible = subCategories.filter((s) => s.status !== "hidden");
        const hidden = subCategories.filter((s) => s.status === "hidden");
        const working = showHidden ? hidden : visible;

        const reorderedSlice = Array.from(working);
        const [moved] = reorderedSlice.splice(result.source.index, 1);
        reorderedSlice.splice(result.destination.index, 0, moved);

        const fullAfter = showHidden ? [...visible, ...reorderedSlice] : [...reorderedSlice, ...hidden];
        const withOrder = fullAfter.map((s, idx) => ({ ...s, order: idx + 1 }));
        setSubCategories(withOrder);

        const payload = withOrder.map((s) => ({ id: s.id, order: s.order }));

        try {
          const out = await jsonFetch(`${API_BASE_URL}/api/update-subcategory-order/`, {
            method: "POST",
            body: JSON.stringify({ ordered_subcategories: payload }),
          });
          if (!out?.success) throw new Error(out?.error || "Failed to save subcategory order");
          toast.success("Subcategory order saved!");
        } catch (e: any) {
          setSubCategories(prev);
          toast.error(e?.message || "Network error saving subcategory order");
        }
      }
    },
    [viewType, categories, subCategories, showHidden, sortOrder]
  );

  const cycleSortOrder = useCallback(() => {
    setSortOrder((prev) => (prev === "none" ? "desc" : prev === "desc" ? "asc" : "none"));
  }, []);

  const handleViewEdit = useCallback(
    (item: any) => {
      if (viewType === "categories") {
        setSelectedCategoryData({
          id: item.id,
          title: item.name,
          image: item.image || "",
          imageAlt: item.imageAlt || "",
          caption: item.caption || "",
          description: item.description || "",
        });
        setOpenCategoryModal(true);
      } else {
        setSelectedSubCategoryData({
          id: item.id,
          title: item.name,
          image: item.image || "",
          imageAlt: item.imageAlt || "",
          selectedCategories: item.categories || [],
          caption: item.caption || "",
          description: item.description || "",
        });
        setOpenSubCategoryModal(true);
      }
    },
    [viewType]
  );

  /* ------------------ UI ------------------ */
  return (
    <AdminAuthGuard>
      <div className="flex w-full bg-white text-black min-h-screen">
        {showSidebar && (
          <div className="lg:w-64 w-full">
            <AdminSidebar />
          </div>
        )}
        <div className="flex-1 px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 lg:py-10 bg-gray-50 min-h-screen">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6 sm:mb-8 bg-gradient-to-r from-white via-[#f8f9fa] to-gray-100 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">📁 Admin Category Management</h1>
                <p className="text-gray-500 mt-1 text-sm">Manage product categories and subcategories with drag-and-drop ordering.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <button onClick={() => setOpenCategoryModal(true)} className="bg-[#891F1A] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#6d1915] transition-colors">
                  + Add Category
                </button>
                <button onClick={() => setOpenSubCategoryModal(true)} className="bg-[#891F1A] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#6d1915] transition-colors">
                  + Add Sub Category
                </button>
                <button onClick={cycleSortOrder} className="bg-white border border-[#891F1A] text-[#891F1A] px-3 py-2 rounded-md text-sm font-medium hover:bg-[#891F1A] hover:text-white transition-colors">
                  Sort: {sortOrder === "none" ? "Unsorted" : sortOrder === "asc" ? "Low - High" : "High - Low"}
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center mb-6 sm:mb-8">
              <select
                className="border border-gray-300 px-3 py-2 rounded-md text-sm bg-white text-black focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A] w-full md:w-72"
                value={viewType}
                onChange={(e) => {
                  const next = e.target.value as "categories" | "subcategories";
                  setViewType(next);
                  setSelectedIds([]);
                }}
              >
                <option value="categories">Show all Categories</option>
                <option value="subcategories">Show all Sub Categories</option>
              </select>
            </div>

            <div className="overflow-auto rounded-2xl shadow-lg border border-gray-200 max-h-[500px] thin-scrollbar">
              <table className="w-full table-auto text-sm bg-white">
                <thead className="text-white bg-[#891F1A] sticky top-0 z-10">
                  <tr>
                    <th className="p-3 text-center w-4">
                      <CustomCheckbox checked={allSelected} onChange={handleSelectAllToggle} />
                    </th>
                    <th className="p-3 text-center">ID</th>
                    <th className="p-3 text-center">Thumbnail</th>
                    <th className="p-3 text-left">Name</th>
                    <th className="p-3 text-left">{viewType === "categories" ? "Subcategories Count" : "Category"}</th>
                    <th className="p-3 text-center">Products</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>

                {loading ? (
                  <tbody>
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-gray-500 italic">
                        Loading…
                      </td>
                    </tr>
                  </tbody>
                ) : netError ? (
                  <tbody>
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-red-600">
                        {netError}
                      </td>
                    </tr>
                  </tbody>
                ) : filteredData.length === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-gray-500 italic">
                        No items to display
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId={viewType}>
                      {(provided) => (
                        <tbody {...provided.droppableProps} ref={provided.innerRef} className="text-gray-700 divide-y divide-gray-100">
                          {filteredData.map((item, index) => (
                            <Draggable key={String(item.id)} draggableId={String(item.id)} index={index}>
                              {(prov, snapshot) => (
                                <tr
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  {...prov.dragHandleProps}
                                  className={`hover:bg-gray-50 ${snapshot.isDragging ? "bg-yellow-50" : ""}`}
                                >
                                  <td className="p-3 text-center">
                                    <CustomCheckbox
                                      checked={selectedIds.includes(String(item.id))}
                                      onChange={() => toggleSelect(item.id)}
                                    />
                                  </td>
                                  <td className="p-3 text-center">{item.id}</td>
                                  <td className="p-3 text-center">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={resolveImageSrc(item.image)}
                                      onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).src = "/images/img1.jpg";
                                      }}
                                      alt={item.imageAlt || "Image not available"}
                                      className="w-10 h-10 rounded object-cover mx-auto"
                                    />
                                  </td>
                                  <td className="p-3">{item.name}</td>
                                  <td className="p-3">
                                    {viewType === "categories" ? item.subcategories?.length || 0 : item.parentCategory}
                                  </td>
                                  <td className="p-3 text-center">{item.productCount}</td>
                                  <td className="p-3 text-center">
                                    {showHidden ? (
                                      <button
                                        onClick={() => updateStatus("visible", String(item.id))}
                                        className="bg-[#891F1A] text-white px-4 py-1 rounded hover:bg-red-800"
                                      >
                                        Unhide
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleViewEdit(item)}
                                        className="bg-[#891F1A] text-white px-4 py-1 rounded hover:bg-red-800"
                                      >
                                        View / Edit
                                      </button>
                                    )}
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
              </table>
            </div>

            {/* footer actions */}
            <div className="flex flex-wrap justify-end items-center mt-4 text-sm gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <CustomCheckbox checked={allSelected} onChange={handleSelectAllToggle} />
                  <span>Select All</span>
                </div>
                <span className="text-gray-700">
                  Selected {selectedIds.length} {viewType}
                </span>
                <button
                  onClick={handleDelete}
                  disabled={!selectedIds.length}
                  className={`px-3 py-1 rounded border text-white ${
                    !selectedIds.length ? "bg-gray-400 border-gray-400 cursor-not-allowed" : "bg-red-500 border-red-600 hover:bg-red-900"
                  }`}
                >
                  Delete Selected
                </button>
                <button
                  onClick={() => updateStatus(showHidden ? "visible" : "hidden")}
                  disabled={!selectedIds.length}
                  className={`px-3 py-1 rounded border text-white ${
                    !selectedIds.length
                      ? "bg-gray-400 border-gray-400 cursor-not-allowed"
                      : showHidden
                      ? "bg-green-600 border-green-700 hover:bg-green-800"
                      : "bg-yellow-500 border-yellow-600 hover:bg-yellow-600"
                  }`}
                >
                  {showHidden ? "Unhide Selected" : "Hide Selected"}
                </button>

                <button
                  onClick={() => setShowHidden((s) => !s)}
                  className={`px-3 py-1 rounded border text-white ${
                    showHidden ? "bg-red-700 border-red-800" : "bg-red-500 border-red-600"
                  } hover:opacity-90`}
                >
                  {showHidden ? "Back to All" : "Show Hidden Items"}
                </button>
              </div>
            </div>
          </div>

          <CategorySubCategoryModalAny
            openCategoryModal={openCategoryModal}
            openSubCategoryModal={openSubCategoryModal}
            onCloseCategory={() => {
              setOpenCategoryModal(false);
              setSelectedCategoryData(null);
            }}
            onCloseSubCategory={() => {
              setOpenSubCategoryModal(false);
              setSelectedSubCategoryData(null);
            }}
            categories={categories.map((c: any) => ({ id: c.id, name: c.name }))}
            initialCategoryData={selectedCategoryData}
            initialSubCategoryData={selectedSubCategoryData}
            reloadData={loadData}
          />

          <ToastContainer position="top-center" />
        </div>
      </div>
    </AdminAuthGuard>
  );
}
