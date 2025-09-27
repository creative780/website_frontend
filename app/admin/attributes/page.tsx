"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import AdminSidebar from "../components/AdminSideBar";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Checkbox } from "@mui/material";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { API_BASE_URL } from "../../utils/api";

import "react-quill-new/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });
/* =================== TYPES =================== */
type AttrType = "size" | "color" | "material" | "custom";
type StatusType = "visible" | "hidden";

type AttributeValue = {
  id: string;
  name: string;
  price_delta?: number;
  is_default?: boolean;
  image_url?: string | null;
  image_id?: string | null;        // ✅ add this
  _preview_data?: string | null;
  image_data?: string | null;
  short_description?: string | null;
};


type Attribute = {
  id: string;
  name: string;
  slug?: string;
  type: AttrType;
  status: StatusType;
  values: AttributeValue[];
  created_at: string;
  /** empty = global, otherwise list of subcategory ids */
  subcategory_ids: string[];
};

type Category = { id: string; name: string; status?: string };
type Subcategory = {
  id: string;
  name: string;
  status?: string;
  categories?: string[];
};
type OptionShortDescEntry = {
  description: string;
  attrId: string;
  optionId: string;
  optionName?: string;
  updatedAt?: string;
};

type OptionShortDescMap = Record<string, OptionShortDescEntry>;

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* =================== HELPERS =================== */
const nowIso = () => new Date().toISOString();
const uid = () =>
  typeof crypto !== "undefined" && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2);

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Invalid file result"));
    };
    reader.onerror = () =>
      reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

/* =================== REQUIRED HEADERS =================== */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};
const uploadImage = async (dataUrl: string) => {
  const body = JSON.stringify({
    image: dataUrl, // your SaveImageAPIView accepts base64 in "image"
    alt_text: "Option",
    linked_table: "AttributeSubCategory",
  });

  const res = await fetch(
    MEDIA_ENDPOINTS.SAVE_IMAGE,
    withFrontendKey({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `Upload failed ${res.status}`);
  }
  const json = await res.json().catch(() => null);
  // Prefer absolute URL for <img src>
  const url = toAbsoluteUrl(json?.url || null);
  if (!url) throw new Error("No image URL returned");
  return { url, image_id: json?.image_id };
};

/* =================== ENDPOINTS =================== */
const TAX_ENDPOINTS = {
  SHOW_CATS: `${API_BASE_URL}/api/show-categories/`,
  SHOW_SUBS: `${API_BASE_URL}/api/show-subcategories/`,
};

const ATTR_ENDPOINTS = {
  SHOW: `${API_BASE_URL}/api/show-subcat-attributes/`,
  SAVE: `${API_BASE_URL}/api/save-subcat-attributes/`,
  EDIT: `${API_BASE_URL}/api/edit-subcat-attributes/`,
  DELETE: `${API_BASE_URL}/api/delete-subcat-attributes/`, // (typo preserved as provided)
  // Additional endpoints to sync with product attributes
  PRODUCT_ATTRS: `${API_BASE_URL}/api/show-product-attributes/`,
  SYNC_ATTRS: `${API_BASE_URL}/api/sync-product-attributes/`,
};

const MEDIA_ENDPOINTS = {
  SAVE_IMAGE: `${API_BASE_URL}/api/save-image/`,
};

const toAbsoluteUrl = (u?: string | null) => {
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  // handle "/media/..." or "media/..."
  if (u.startsWith("/")) return `${API_BASE_URL}${u}`;
  return `${API_BASE_URL}/${u}`;
};

/* Unified JSON fetcher with key + JSON headers */
const jsonFetch = async (url: string, options: RequestInit = {}) => {
  const init = withFrontendKey({
    ...options,
    headers: new Headers({
      "Content-Type": "application/json",
      ...(options.headers || {}),
    }),
  });
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }
  // handle empty 204
  if (res.status === 204) return null;
  // some backends may return empty
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  return res.json().catch(() => null);
};

const normalizeAttribute = (raw: any): Attribute => {
  const valuesSrc = Array.isArray(raw?.values)
    ? raw.values
    : Array.isArray(raw?.options)
    ? raw.options
    : [];

  const attrId = String(raw?.id ?? raw?.attribute_id ?? uid());
const values: AttributeValue[] = valuesSrc.map((v: any) => ({
  id: String(v.id ?? v.option_id ?? uid()),
  name: String(v.name ?? v.label ?? ""),
  price_delta: typeof v.price_delta === "number" ? v.price_delta : undefined,
  is_default: !!v.is_default,
  image_url: v.image_url ? toAbsoluteUrl(String(v.image_url)) : null,
  image_id: v.image_id ?? null,               // ✅
  short_description: typeof v.description === "string" ? v.description : null,
}));


  return {
    id: attrId,
    name: String(raw?.name ?? raw?.title ?? "Attribute"),
    slug:
      typeof raw?.slug === "string"
        ? raw.slug
        : String(
            (raw?.name ?? "")
              .toLowerCase()
              .replace(/\s+/g, "-")
              .replace(/[^a-z0-9-]/g, "")
          ),
    type: (raw?.type as AttrType) || "custom",
    status: (raw?.status as StatusType) || "visible",
    values,
    created_at: String(raw?.created_at || raw?.createdAt || nowIso()),
    subcategory_ids: Array.isArray(raw?.subcategory_ids)
      ? raw.subcategory_ids.map((x: any) => String(x))
      : [],
  };
};


/* =================== ATTRIBUTE MODAL =================== */
type AttributeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (id?: string) => void;
  editing?: Attribute | null;
  selectedSubId: string; // '__all__' or id
  subcategories: Subcategory[];
};

const AttributeModal: React.FC<AttributeModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  editing,
  selectedSubId,
  subcategories,
}) => {
  const GLOBAL_SCOPE = "__global__";
  const isEdit = !!editing;

  const createEmptyOption = useCallback(
  (): AttributeValue => ({
    id: uid(),
    name: "",
    price_delta: undefined,
    is_default: false,
    image_url: null,          // ✅
    _preview_data: null,      // ✅
  }),
  []
);


  const [name, setName] = useState("");
  const [status, setStatus] = useState<StatusType>("visible");
  const [values, setValues] = useState<AttributeValue[]>([createEmptyOption()]);
  const [selectedSubcategory, setSelectedSubcategory] =
    useState<string>(GLOBAL_SCOPE);
  const [saving, setSaving] = useState(false);
  const [draftAttrId, setDraftAttrId] = useState<string>(
    () => editing?.id || uid()
  );

  useEffect(() => {
    if (!isOpen) return;
    setDraftAttrId(editing?.id || uid());
  }, [isOpen, editing?.id]);

  useEffect(() => {
  if (!isOpen) return;

  setName(editing?.name || "");
  setStatus((editing?.status as StatusType) || "visible");
  const attrIdForForm = editing?.id || draftAttrId;

// inside AttributeModal useEffect that initializes form state
// inside AttributeModal useEffect(...) that runs on open
const nextValues = editing?.values?.length
  ? editing.values.map((v) => ({
      id: v.id || uid(),
      name: v.name || "",
      price_delta:
        typeof v.price_delta === "number" ? v.price_delta : undefined,
      is_default: !!v.is_default,
      image_url: v.image_url ?? null,
      image_id: (v as any).image_id ?? null,
      _preview_data: null,
      short_description:
        typeof v.short_description === "string" ? v.short_description : "",
    }))
  : [createEmptyOption()];

// ✅ this is the missing line
setValues(nextValues);


  if (editing?.subcategory_ids?.length) {
    setSelectedSubcategory(String(editing.subcategory_ids[0]));
  } else if (selectedSubId !== "__all__") {
    setSelectedSubcategory(String(selectedSubId));
  } else {
    setSelectedSubcategory(GLOBAL_SCOPE);
  }

  setSaving(false);
}, [
  isOpen,
  editing,
  selectedSubId,
  createEmptyOption,
  draftAttrId,
]);

  const addOption = () => setValues((prev) => [...prev, createEmptyOption()]);
  const removeOption = (id: string) =>
    setValues((prev) =>
      prev.length <= 1 ? prev : prev.filter((o) => o.id !== id)
    );
  const updateOption = (id: string, patch: Partial<AttributeValue>) =>
    setValues((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...patch } : o))
    );
  const toggleDefault = (id: string) =>
    setValues((prev) => {
      const target = prev.find((o) => o.id === id);
      const shouldSet = !target?.is_default;
      return prev.map((o) => {
        if (o.id !== id)
          return {
            ...o,
            is_default: false,
          };

        if (!shouldSet)
          return {
            ...o,
            is_default: false,
          };

        return {
          ...o,
          is_default: true,
          price_delta: undefined,
        };
      });
    });
  const handlePriceChange = (id: string, raw: string) => {
    setValues((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        if (raw === "") return { ...o, price_delta: undefined };
        const parsed = Number(raw);
        if (Number.isNaN(parsed)) return o;
        return { ...o, price_delta: parsed };
      })
    );
  };

const handleOptionImageChange = (id: string, file: File | null) => {
  if (!file) {
    updateOption(id, { image_url: null, image_id: null, _preview_data: null });
    return;
  }
  if (!file.type?.startsWith("image/")) {
    toast.error("Only image files are supported.");
    return;
  }

  fileToDataUrl(file)
    .then(async (dataUrl) => {
      updateOption(id, { _preview_data: dataUrl });
      const { url, image_id } = await uploadImage(dataUrl);
      updateOption(id, { image_url: url, image_id, _preview_data: null });   // ✅ keep id
      toast.success("Image uploaded");
    })
    .catch(() => {
      toast.error("Could not process the selected image.");
    });
};
  
  const quillModules = useMemo(
    () => ({
      toolbar: [
        [{ header: [1, 2, false] }],
        ["bold", "italic", "underline"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link"],
        ["clean"],
      ],
      history: { delay: 400, maxStack: 100, userOnly: true },
    }),
    []
  );

  const quillFormats = useMemo(
    () => ["header", "bold", "italic", "underline", "list", "bullet", "link"],
    []
  );

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Name is required");
    const meaningful = values.filter((v) => v.name.trim());
    if (!meaningful.length)
      return toast.error("Add at least one option with a label.");

    setSaving(true);
const sanitizedValues = meaningful.map((v) => ({
  id: v.id,
  name: v.name.trim(),
  price_delta:
    typeof v.price_delta === "number" && !Number.isNaN(v.price_delta)
      ? v.price_delta
      : undefined,
  is_default: !!v.is_default,
  image_url: v.image_url || null,
  image_id: v.image_id || null,                  // ✅ include id
  description:
    typeof v.short_description === "string"
      ? stripHtml(v.short_description || "")
      : undefined,
}));

    const base: Attribute = {
      id: editing?.id || draftAttrId || uid(),
      name: name.trim(),
      slug: name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, ""),
      type: editing?.type || "custom",
      status,
      values: sanitizedValues,
      created_at: editing?.created_at || nowIso(),
      subcategory_ids:
        selectedSubcategory === "__global__"
          ? []
          : [String(selectedSubcategory)],
    };

    try {
      if (isEdit) {
        // EDIT existing
        await jsonFetch(ATTR_ENDPOINTS.EDIT, {
          method: "PUT",
          body: JSON.stringify(base),
        });
        toast.success("Attribute updated");
      } else {
        // SAVE new
        const created = await jsonFetch(ATTR_ENDPOINTS.SAVE, {
          method: "POST",
          body: JSON.stringify(base),
        });
        // If backend returns ID, adopt it
        if (created?.id) base.id = String(created.id);
        toast.success("Attribute created");
      }
      onSaved(base.id);
      onClose();
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-gray-200 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div className="p-4 border-b flex items-center justify-between flex-shrink-0">
          <h3 className="text-xl font-semibold text-[#7A1C16]">
            {isEdit ? "Edit Attribute" : "Add Attribute"}
          </h3>
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-full border hover:bg-gray-50 text-black"
          >
            Close
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-black mb-1">
                Subcategory
              </label>
              <select
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#7A1C16] bg-white text-black"
                value={selectedSubcategory}
                onChange={(e) => setSelectedSubcategory(e.target.value)}
              >
                <option value={GLOBAL_SCOPE}>Global (all subcategories)</option>
                {subcategories.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-2">
                Choose the subcategory this attribute should belong to. Pick
                "Global" to make it available everywhere.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-black">
                Attribute Name
              </label>
              <input
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#7A1C16] text-black"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Print Type"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black">
                Status
              </label>
              <select
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#7A1C16] bg-white text-black"
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusType)}
              >
                <option value="visible">Visible</option>
                <option value="hidden">Hidden</option>
              </select>
            </div>
          </div>

          <div className="border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
              <div>
                <h4 className="font-semibold text-black">Attribute Options</h4>
                <p className="text-xs text-gray-500">
                  Add every option customers can pick along with optional price
                  adjustments.
                </p>
              </div>
              <button
                onClick={addOption}
                className="bg-[#7A1C16] text-white px-4 py-1.5 rounded-full hover:opacity-90 text-sm"
              >
                + Add Option
              </button>
            </div>

            <div className="p-4 space-y-4">
              {values.map((option, idx) => (
                <div
                  key={option.id}
                  className="border border-gray-200 rounded-2xl bg-white shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-600 bg-gray-200 px-2 py-1 rounded-full">
                        Option {idx + 1}
                      </span>
                      {option.is_default && (
                        <span className="text-xs font-semibold text-[#7A1C16] bg-red-100 px-2 py-1 rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleDefault(option.id)}
                        className={`px-3 py-1.5 rounded-full border text-xs font-medium transition ${
                          option.is_default
                            ? "border-[#7A1C16] text-white bg-[#7A1C16]"
                            : "border-gray-300 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {option.is_default ? "Unset default" : "Set default"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeOption(option.id)}
                        className="px-3 py-1.5 rounded-full border text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={values.length <= 1}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="p-4 grid md:grid-cols-12 gap-3">
                    <div className="md:col-span-5">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Option label
                      </label>
                      <input
                        className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#7A1C16] text-black"
                        value={option.name}
                        onChange={(e) =>
                          updateOption(option.id, { name: e.target.value })
                        }
                        placeholder="e.g., Gloss, Matte"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Price adjustment
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-2 rounded-lg border bg-gray-100 text-gray-600 text-sm">
                          ±
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          className={`flex-1 px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#7A1C16] text-black ${
                            option.is_default
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : ""
                          }`}
                          value={
                            typeof option.price_delta === "number"
                              ? option.price_delta
                              : ""
                          }
                          onChange={(e) =>
                            handlePriceChange(option.id, e.target.value)
                          }
                          placeholder="0.00"
                          disabled={option.is_default}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {option.is_default
                          ? "Default option uses the base price."
                          : "Use negative values for discounts."}
                      </p>
                    </div>
                    <div className="md:col-span-12">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Short description
                      </label>
                      <div className="rounded-lg border text-black border-gray-200 overflow-hidden">
                        <ReactQuill
                          theme="snow"
                          value={option.short_description || ""}
                          onChange={(content) =>
                            updateOption(option.id, {
                              short_description: content,
                            })
                          }
                          modules={quillModules}
                          formats={quillFormats}
                          className="h-40"
                        />
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">
                        Customers will see this when they hover over the option.
                      </p>
                    </div>
                   <div className="md:col-span-3">
  <label className="block text-xs font-medium text-gray-600 mb-1">
    Option image
  </label>
  <div className="flex items-start gap-3">
    <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg border-2 border-dashed border-gray-300 overflow-hidden bg-white flex items-center justify-center">
      {option._preview_data || option.image_url ? (
        <img
          src={option._preview_data || (option.image_url as string)}
          alt={option.name || `Option ${idx + 1}`}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = "/images/default.jpg";
          }}
        />
      ) : (
        <svg
          className="w-6 h-6 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 16l5-5a2 2 0 012.828 0L17 17m-2-2l1.586-1.586a2 2 0 012.828 0L21 15M4 7h16"
          />
        </svg>
      )}
    </div>

    <div className="flex flex-col gap-2 text-xs">
      <label className="px-3 py-1.5 rounded-full border border-[#7A1C16] text-[#7A1C16] cursor-pointer hover:bg-[#7A1C16]/10 text-center">
        {(option._preview_data || option.image_url) ? "Change" : "Upload"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) =>
            handleOptionImageChange(
              option.id,
              (e.target.files && e.target.files[0]) || null
            )
          }
        />
      </label>

      {(option._preview_data || option.image_url) && (
        <button
          type="button"
          onClick={() => updateOption(option.id, { image_url: null, _preview_data: null })}
          className="text-red-600 hover:text-red-700 underline"
        >
          Remove
        </button>
      )}

      <p className="text-[10px] text-gray-500 max-w-[9rem]">
        JPG or PNG up to 2&nbsp;MB.
      </p>
    </div>
  </div>
</div>

                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="flex justify-end gap-2 p-5 border-t bg-gray-50/50 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full border hover:bg-gray-50 text-black"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-5 py-2 rounded-full bg-[#7A1C16] text-white hover:opacity-90 transition ${
              saving ? "opacity-75 cursor-wait" : ""
            }`}
          >
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Attribute"}
          </button>
        </div>
      </div>
    </div>
  );
};

/* =================== MAIN PAGE =================== */
export default function AttributesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // filters
  const [selectedCategory, setSelectedCategory] = useState<string>(""); // '' = all
  const [selectedSubId, setSelectedSubId] = useState<string>("__all__"); // '__all__' or real id
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusType | "">("");
  const [sortOrder, setSortOrder] = useState<"alpha" | "recent" | "">("");

  // bulk
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Attribute | null>(null);

  // values reordering
  const [activeValuesAttr, setActiveValuesAttr] = useState<string | null>(null);
  const [valuesDraft, setValuesDraft] = useState<AttributeValue[]>([]);

  /* ============ API: taxonomy ============ */
  const loadTaxonomy = useCallback(async () => {
    setIsLoading(true);
    try {
      const [catRes, subRes] = await Promise.all([
        fetch(TAX_ENDPOINTS.SHOW_CATS, withFrontendKey()).catch(() => null),
        fetch(TAX_ENDPOINTS.SHOW_SUBS, withFrontendKey()).catch(() => null),
      ]);

      let cats: Category[] = [];
      let subs: Subcategory[] = [];

      if (catRes && catRes.ok) {
        const data = await catRes.json().catch(() => []);
        cats = (Array.isArray(data) ? data : [])
          .filter((c: any) => (c.status || "").toLowerCase() !== "hidden")
          .map((c: any) => ({
            id: String(c.id ?? c.category_id ?? c.name),
            name: c.name || "Category",
          }));
      }

      if (subRes && subRes.ok) {
        const data = await subRes.json().catch(() => []);
        subs = (Array.isArray(data) ? data : [])
          .filter((s: any) => (s.status || "").toLowerCase() !== "hidden")
          .map((s: any) => ({
            id: String(s.subcategory_id ?? s.id ?? s.name),
            name: s.name || "Subcategory",
            categories: Array.isArray(s.categories) ? s.categories : [],
          }));
      }

      // If backend returns nothing, we still show empty filters gracefully.
      setCategories(cats);
      setSubcategories(subs);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /* ============ API: attributes ============ */
  const loadAttributesApi = useCallback(async (subId?: string) => {
    const q =
      subId && subId !== "__all__"
        ? `${ATTR_ENDPOINTS.SHOW}?subcategory_id=${encodeURIComponent(
            String(subId)
          )}`
        : ATTR_ENDPOINTS.SHOW;
    try {
      setIsLoading(true);
      const data = await jsonFetch(q, { method: "GET" });

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.attributes)
        ? data.attributes
        : [];
      setAttributes(list.map((raw: any) => normalizeAttribute(raw)));
    } catch (e: any) {
      setAttributes([]);
      toast.error(
        `Failed to load attributes: ${e?.message || "Server unreachable"}`
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  /* ============ API: sync product attributes ============ */
  const syncProductAttributes = useCallback(async () => {
    try {
      // First, try to sync product attributes to the attributes system
      await jsonFetch(ATTR_ENDPOINTS.SYNC_ATTRS, {
        method: "POST",
        body: JSON.stringify({ sync_all: true }),
      });

      // Then reload the attributes
      await loadAttributesApi(selectedSubId);

      toast.success("Product attributes synchronized successfully!");
    } catch (e: any) {
      console.warn("Sync failed, continuing with regular load:", e);
      // If sync fails, just load normally
      await loadAttributesApi(selectedSubId);
    }
  }, [loadAttributesApi, selectedSubId]);


  useEffect(() => {
    loadAttributesApi(selectedSubId);
  }, [selectedSubId, loadAttributesApi]);

  useEffect(() => {
  loadTaxonomy();
  loadAttributesApi(selectedSubId);
}, [selectedSubId]);


  // cascade: restrict subs by selected category
  const subOptions = useMemo(() => {
    if (!selectedCategory) return subcategories;
    return subcategories.filter((s) =>
      (s.categories || []).includes(selectedCategory)
    );
  }, [subcategories, selectedCategory]);

  useEffect(() => {
    if (
      selectedSubId !== "__all__" &&
      !subOptions.some((s) => s.id === selectedSubId)
    ) {
      setSelectedSubId("__all__");
      loadAttributesApi("__all__");
    }
  }, [selectedCategory, subOptions, selectedSubId, loadAttributesApi]);

  // filters/sort
  const filtered = useMemo(() => {
    let base = [...attributes];

    if (selectedCategory && selectedSubId === "__all__") {
      const subsInCat = new Set(subOptions.map((s) => s.id));
      base = base.filter(
        (a) =>
          a.subcategory_ids.length === 0 ||
          a.subcategory_ids.some((id) => subsInCat.has(id))
      );
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      base = base.filter((a) => a.name.toLowerCase().includes(q));
    }
    if (statusFilter) base = base.filter((a) => a.status === statusFilter);

    if (sortOrder === "alpha")
      base.sort((a, b) => a.name.localeCompare(b.name));
    if (sortOrder === "recent")
      base.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

    return base;
  }, [
    attributes,
    search,
    statusFilter,
    sortOrder,
    selectedCategory,
    selectedSubId,
    subOptions,
  ]);

  const categoryNameMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => {
      const key = String(c.id ?? c.name);
      map.set(key, c.name);
      map.set(c.name, c.name);
    });
    return map;
  }, [categories]);

  const subcategoryMap = useMemo(() => {
    const map = new Map<string, Subcategory>();
    subcategories.forEach((s) => {
      map.set(String(s.id), s);
    });
    return map;
  }, [subcategories]);

  // bulk
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  const allSelected =
    filtered.length > 0 && filtered.every((a) => selectedIds.includes(a.id));
  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? [] : filtered.map((a) => a.id));

const handleDelete = async () => {
  if (!selectedIds.length || isDeleting || isLoading) return;
  if (!confirm(`Delete ${selectedIds.length} selected attribute(s)?`)) return;

  setIsDeleting(true);
  try {
    const res = await jsonFetch(ATTR_ENDPOINTS.DELETE, {
      method: "POST",
      body: JSON.stringify({ ids: selectedIds }),
    });
    const deleted = typeof res?.deleted === "number" ? res.deleted : 0;
    toast.success(`Deleted ${deleted} item(s)`);
    setSelectedIds([]);
    await loadAttributesApi(selectedSubId);
  } catch (e: any) {
    toast.error(`Delete failed: ${e?.message || "Unknown error"}`);
  } finally {
    setIsDeleting(false);
  }
};


  // values reorder
  const openValues = (attr: Attribute) => {
    setActiveValuesAttr(attr.id);
    setValuesDraft(attr.values || []);
  };
  const closeValues = () => {
    setActiveValuesAttr(null);
    setValuesDraft([]);
  };
  const onDragEndValues = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(valuesDraft);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setValuesDraft(items);
  };
  const saveValuesOrder = async () => {
    if (!activeValuesAttr) return;
    try {
      // Send edited values order through EDIT endpoint.
      const attr = attributes.find((a) => a.id === activeValuesAttr);
      if (!attr) throw new Error("Attribute not found");
      const reordered: Attribute = {
        ...attr,
values: valuesDraft.map((v) => ({
  id: v.id,
  name: v.name,
  price_delta: typeof v.price_delta === "number" && !Number.isNaN(v.price_delta) ? v.price_delta : undefined,
  is_default: !!v.is_default,
  image_url: v.image_url || null,
  image_id: v.image_id || null,                 // ✅ keep id on reorder too
  description: typeof v.short_description === "string" ? stripHtml(v.short_description || "") : undefined,
})),

      };

      await jsonFetch(ATTR_ENDPOINTS.EDIT, {
        method: "PUT",
        body: JSON.stringify(reordered),
      });
      toast.success("Values order saved");
      closeValues();
      await loadAttributesApi(selectedSubId);
    } catch (e: any) {
      toast.error(`Reorder failed: ${e?.message || "Unknown error"}`);
    }
  };

  // link/unlink
  const canLinkOps = selectedSubId !== "__all__";
  const patchLinking = async (id: string, nextSubIds: string[]) => {
    const attr = attributes.find((a) => a.id === id);
    if (!attr) return;
    const payload: Attribute = { ...attr, subcategory_ids: nextSubIds };
    try {
      await jsonFetch(ATTR_ENDPOINTS.EDIT, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      await loadAttributesApi(selectedSubId);
    } catch (e: any) {
      toast.error(`Update failed: ${e?.message || "Unknown error"}`);
    }
  };

  const handleLink = async (id: string) => {
    if (!canLinkOps) return toast.info("Pick a specific subcategory first.");
    const attr = attributes.find((a) => a.id === id);
    if (!attr) return;
    const set = new Set(attr.subcategory_ids || []);
    set.add(String(selectedSubId));
    await patchLinking(id, Array.from(set));
    toast.success("Linked");
  };

  const handleUnlink = async (id: string) => {
    if (!canLinkOps) return toast.info("Pick a specific subcategory first.");
    const attr = attributes.find((a) => a.id === id);
    if (!attr) return;
    const next = (attr.subcategory_ids || []).filter(
      (x) => x !== String(selectedSubId)
    );
    await patchLinking(id, next);
    toast.success("Unlinked");
  };

  const isLinkedToSelected = (a: Attribute) =>
    selectedSubId !== "__all__" &&
    a.subcategory_ids.includes(String(selectedSubId));

  /* =================== UI =================== */
  return (
    <AdminAuthGuard>
      <ToastContainer position="top-right" />
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <div className="w-64 flex-shrink-0">
          <AdminSidebar />
        </div>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 lg:py-10 bg-gray-50 min-h-screen">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6 sm:mb-8 bg-gradient-to-r from-white via-[#f8f9fa] to-gray-100 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                  🏷️ Attributes
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                  Manage product attributes and their values across categories.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  onClick={() => {
                    setEditing(null);
                    setIsModalOpen(true);
                  }}
                  className="bg-[#891F1A] text-white px-4 py-2 rounded-md hover:bg-[#6d1915] transition-colors text-sm"
                >
                  + Add Attribute
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center mb-6 sm:mb-8">
              <select
                className="border border-gray-300 px-3 py-2 rounded-md text-sm bg-white text-black focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A]"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                className="border border-gray-300 px-3 py-2 rounded-md text-sm bg-white text-black focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A]"
                value={selectedSubId}
                onChange={(e) => setSelectedSubId(e.target.value)}
              >
                <option value="__all__">All Subcategories</option>
                {(selectedCategory ? subOptions : subcategories).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <input
                className="border border-gray-300 px-3 py-2 rounded-md text-sm bg-white text-black focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A] w-56"
                placeholder="Search attribute…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <select
                className="border border-gray-300 px-3 py-2 rounded-md text-sm bg-white text-black focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A]"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option value="">Status: All</option>
                <option value="visible">Visible</option>
                <option value="hidden">Hidden</option>
              </select>

              <select
                className="border border-gray-300 px-3 py-2 rounded-md text-sm bg-white text-black focus:border-[#891F1A] focus:ring-1 focus:ring-[#891F1A]"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as any)}
              >
                <option value="">Sort</option>
                <option value="alpha">A → Z</option>
                <option value="recent">Recent</option>
              </select>
            </div>

            {/* TABLE */}
            <div className="max-h-[500px] overflow-auto shadow-lg rounded-2xl border border-gray-200 thin-scrollbar">
              <table className="w-full table-auto text-sm bg-white">
                <thead className="text-white bg-[#891F1A] sticky top-0 z-10">
                  <tr>
                    <th className="p-3 text-center w-4">
                     <Checkbox
  checked={allSelected}
  onChange={(_, __) => toggleSelectAll()}  // explicit
  color="secondary"
  size="small"
  sx={{ color: "#fff", "&.Mui-checked": { color: "#fff" }, marginLeft: "-13px" }}
/>

                    </th>
                    <th className="p-3 text-center">ID</th>
                    <th className="p-3 text-center">Thumbnail</th>
                    <th className="p-3 text-left">Name</th>
                    <th className="p-3 text-center">Categories</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Options</th>
                    <th className="p-3 text-center">Scope</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="text-gray-800 divide-y divide-gray-100">
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-6 text-center text-gray-500 italic"
                      >
                        Loading…
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-6 text-center text-gray-500 italic"
                      >
                        No attributes to show
                      </td>
                    </tr>
                  ) : (
                    filtered.map((a) => {
                      const prettyStatus =
                        a.status === "visible" ? "In Use" : "Hidden";
                      const statusColor =
                        a.status === "visible" ? "#28A745" : "#6C757D";
                      const linked = isLinkedToSelected(a);
                      const subRecords = a.subcategory_ids
                        .map((id) => subcategoryMap.get(String(id)))
                        .filter(Boolean) as Subcategory[];
                      const categoryLabels = Array.from(
                        new Set(
                          subRecords.flatMap((sub) => {
                            if (!sub.categories || sub.categories.length === 0)
                              return [];
                            return sub.categories
                              .map((catId) => {
                                const key = String(catId);
                                return categoryNameMap.get(key) || key;
                              })
                              .filter(Boolean);
                          })
                        )
                      );
                      const hasAnySub = a.subcategory_ids.length > 0;
                      const previewImage =
                        a.values.find((v) => v.image_url)?.image_url || null;

                      const fallbackInitial = a.name
                        ? a.name.charAt(0).toUpperCase()
                        : "?";
                      const optionCount = a.values.length;
                      const defaultOption = a.values.find((v) => v.is_default);

                      return (
                        <tr key={a.id} className="hover:bg-gray-50 transition">
                          <td className="p-3 text-center">
                            <Checkbox
                              checked={selectedIds.includes(a.id)}
                              onChange={() => toggleSelect(a.id)}
                              color="secondary"
                              size="small"
                              sx={{
                                color: "#891F1A",
                                "&.Mui-checked": { color: "#891F1A" },
                                p: 0,
                                "& .MuiSvgIcon-root": { fontSize: "1.1rem" },
                              }}
                            />
                          </td>
                          <td className="p-4 text-center font-semibold text-[#891F1A]">
                            {a.slug || a.id}
                          </td>
                          <td className="p-4 text-center">
                            {previewImage ? (
                              <img
                                src={previewImage}
                                alt={a.name}
                                className="w-12 h-12 object-cover rounded shadow mx-auto"
                              />
                            ) : (
                              <div className="w-12 h-12 mx-auto rounded-full bg-[#F5E8E7] text-[#891F1A] flex items-center justify-center font-semibold">
                                {fallbackInitial}
                              </div>
                            )}
                          </td>
                          <td className="p-4 text-center font-medium text-black">
                            {a.name}
                          </td>
                          <td className="p-4 text-center">
                            {categoryLabels.length ? (
                              <div className="flex flex-wrap gap-1 justify-center">
                                {categoryLabels.map((cat) => (
                                  <span
                                    key={`${a.id}-cat-${cat}`}
                                    className="text-xs px-2 py-1 rounded-full bg-[#F5E8E7] text-[#891F1A]"
                                  >
                                    {cat}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                                {hasAnySub ? "Uncategorised" : "All Categories"}
                              </span>
                            )}
                          </td>
                          <td
                            className="p-4 text-center font-semibold"
                            style={{ color: statusColor }}
                          >
                            {prettyStatus}
                          </td>
                          <td className="p-4 text-center">
                            <div className="font-semibold text-[#891F1A]">
                              {optionCount} option{optionCount === 1 ? "" : "s"}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {defaultOption
                                ? `Default: ${defaultOption.name}`
                                : "No default set"}
                            </div>
                            <button
                              onClick={() => openValues(a)}
                              className="mt-2 inline-flex items-center justify-center px-3 py-1.5 rounded-full border border-[#891F1A] text-xs text-[#891F1A] hover:bg-[#891F1A] hover:text-white transition"
                            >
                              Reorder Values
                            </button>
                          </td>
                          <td className="p-4 text-center">
                            {!hasAnySub ? (
                              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                                Global
                              </span>
                            ) : selectedSubId === "__all__" ? (
                              subRecords.length ? (
                                <div className="flex flex-wrap gap-1 justify-center">
                                  {subRecords.map((sub) => (
                                    <span
                                      key={`${a.id}-scope-${sub.id}`}
                                      className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800"
                                    >
                                      {sub.name}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
                                  Scoped
                                </span>
                              )
                            ) : linked ? (
                              <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                                This Subcategory
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                                Other Sub
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              <button
                                onClick={() => {
                                  setEditing(a);
                                  setIsModalOpen(true);
                                }}
                                className="bg-[#891F1A] hover:bg-[#6e1915] text-white text-xs px-4 py-2 rounded-full transition"
                              >
                                View / Edit
                              </button>

                              {selectedSubId !== "__all__" &&
                                (linked ? (
                                  <button
                                    onClick={() => handleUnlink(a.id)}
                                    className="text-xs px-4 py-2 rounded-full border border-[#891F1A] text-[#891F1A] hover:bg-[#891F1A] hover:text-white transition"
                                  >
                                    Unlink
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleLink(a.id)}
                                    className="text-xs px-4 py-2 rounded-full border border-[#891F1A] text-[#891F1A] hover:bg-[#891F1A] hover:text-white transition"
                                  >
                                    Link to Sub
                                  </button>
                                ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* footer actions (right aligned) */}
            <div className="flex items-center justify-end gap-3">
              <span className="text-sm text-gray-600">
                Selected: {selectedIds.length}
              </span>
                  <button
  onClick={handleDelete}
  disabled={!selectedIds.length || isDeleting || isLoading}
  className={`px-4 py-2 rounded-full text-sm ${
    !selectedIds.length || isDeleting || isLoading
      ? "bg-gray-400 text-white cursor-not-allowed"
      : "bg-[#7A1C16] text-white hover:opacity-90"
  }`}
>
  {isDeleting ? "Deleting…" : "Delete Selected"}
</button>

            </div>
          </div>
        </main>
      </div>

      {/* Add/Edit Attribute */}
      <AttributeModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditing(null);
        }}
        onSaved={() => loadAttributesApi(selectedSubId)}
        editing={editing || undefined}
        selectedSubId={selectedSubId}
        subcategories={selectedCategory ? subOptions : subcategories}
      />

      {/* Values Reorder Modal */}
      {activeValuesAttr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm p-4"
          onClick={closeValues}
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#7A1C16]">
                Reorder Values
              </h3>
              <button
                onClick={closeValues}
                className="px-3 py-2 rounded-full border hover:bg-gray-50"
              >
                Close
              </button>
            </div>
            <div className="p-4">
              {!valuesDraft || valuesDraft.length === 0 ? (
                <div className="py-10 text-center text-gray-500 italic">
                  No values to reorder.
                </div>
              ) : (
                <DragDropContext onDragEnd={onDragEndValues}>
                  <Droppable droppableId="attr-values">
                    {(provided) => (
                      <ul
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="space-y-2"
                      >
                        {valuesDraft.map((v, i) => (
                          <Draggable key={v.id} draggableId={v.id} index={i}>
                            {(prov) => (
                              <li
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                {...prov.dragHandleProps}
                                className="flex items-center justify-between p-3 rounded-xl border bg-white hover:bg-gray-50"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="w-6 h-6 rounded-full border flex items-center justify-center text-xs">
                                    ⇅
                                  </span>
                                  <div>
                                    <div className="font-medium flex items-center gap-2">
                                      <span>{v.name || "—"}</span>
                                      {v.is_default && (
                                        <span className="text-[10px] uppercase tracking-wide text-[#7A1C16] bg-red-100 px-2 py-0.5 rounded-full">
                                          Default
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-500 space-y-0.5">
                                      {v.image_data ? (
                                        <div className="flex items-center gap-1">
                                          <span role="img" aria-hidden="true">
                                            📷
                                          </span>
                                          <span>Image attached</span>
                                        </div>
                                      ) : null}
                                      {typeof v.price_delta === "number" &&
                                      !Number.isNaN(v.price_delta) ? (
                                        <div>
                                          Price Δ:{" "}
                                          {v.price_delta > 0 ? "+" : ""}
                                          {v.price_delta.toFixed(2)}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </li>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </ul>
                    )}
                  </Droppable>
                </DragDropContext>
              )}
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button
                onClick={closeValues}
                className="px-4 py-2 rounded-full border hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveValuesOrder}
                className="px-4 py-2 rounded-full bg-[#7A1C16] text-white hover:opacity-90"
              >
                Save Order
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminAuthGuard>
  );
}

