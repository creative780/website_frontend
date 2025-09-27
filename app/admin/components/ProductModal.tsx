"use client";

import type React from "react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "react-toastify";
import { API_BASE_URL } from "../../utils/api";
import dynamic from "next/dynamic";
import "react-quill-new/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

type AttributeOption = {
  id: string;
  label: string;
  price_delta: number;
  is_default?: boolean;
  image_id?: string | null;
  _image_file?: File | null;
  _image_preview?: string | null;
  image?: string | null;

  description?: string;
};
// add status
type CustomAttribute = {
  id: string;
  name: string;
  options: AttributeOption[];
  status?: string; // "active" | "hidden" | etc.
};

type ModalImage = {
  src: string;
  file?: File | null;
  kind: "file" | "url";
  alt?: string;
  caption?: string;
  tags?: string[];
  image_id?: string | null; // backend image PK if exists
  is_primary?: boolean; // backend truth
};

const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const MAX_IMAGES = 99;

// ---------------- Helpers ----------------

const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  if (!headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  return { ...init, headers };
};

const parseJsonSafe = async (res: Response, label: string) => {
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {}
    throw new Error(
      `${label}: HTTP ${res.status}${body ? ` • ${body.slice(0, 200)}…` : ""}`
    );
  }
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    const body = await res.text();
    throw new Error(
      `${label}: Non-JSON response (${ct}). Body: ${body.slice(0, 200)}…`
    );
  }
  return res.json();
};

const urlForDisplay = (src: string): string => {
  if (/^https?:/i.test(src)) return src;
  const base = API_BASE_URL.replace(/\/+$/, "");
  const rel = String(src || "").replace(/^\/+/, "");
  return `${base}/${rel}`;
};

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const formatPriceDelta = (value: number) => {
  const absolute = Math.abs(value);
  const formatted = Number.isInteger(absolute)
    ? absolute.toString()
    : absolute.toFixed(2);
  if (value > 0) return `+${formatted} AED`;
  if (value < 0) return `-${formatted} AED`;
  return `${formatted} AED`;
};

const getAttributeKey = (attr: {
  id?: string | null;
  name?: string | null;
}) => {
  if (attr?.id) return String(attr.id);
  if (attr?.name) return attr.name.trim().toLowerCase();
  return "";
};

const getOptionKey = (opt: { id?: string | null; label?: string | null }) => {
  if (opt?.id) return String(opt.id);
  if (opt?.label) return opt.label.trim().toLowerCase();
  return "";
};

const normalizeLibraryOption = (option: AttributeOption): AttributeOption => {
  const price =
    typeof option.price_delta === "number"
      ? option.price_delta
      : option.price_delta
      ? parseFloat(String(option.price_delta)) || 0
      : 0;

  // derive preview from any known field
  const previewFromAny =
    option._image_preview ?? (option as any).image_url ?? option.image ?? null;

  return {
    id: option.id,
    label: option.label,
    price_delta: Number.isFinite(price) ? price : 0,
    is_default: Boolean(option.is_default),
    image_id: option.image_id ?? null,
    _image_file: null,
    _image_preview: previewFromAny
      ? urlForDisplay(String(previewFromAny))
      : null,
    image: null, // keep null so payload only sends new uploads
    description: option.description ?? "",
  };
};

const ensureDefaultOption = (
  options: AttributeOption[],
  preferredKey?: string
) => {
  if (!options.length) return options;

  let defaultIndex = options.findIndex((opt) => opt.is_default);
  let assignedPreferred = false;

  if (defaultIndex === -1 && preferredKey) {
    const preferredIndex = options.findIndex(
      (opt) => getOptionKey(opt) === preferredKey
    );
    if (preferredIndex !== -1) {
      defaultIndex = preferredIndex;
      assignedPreferred = true;
    }
  }

  if (defaultIndex === -1) {
    defaultIndex = 0;
    assignedPreferred = true;
  }

  return options.map((opt, idx) => {
    const isDefault = idx === defaultIndex;
    if (assignedPreferred && isDefault) {
      return { ...opt, is_default: true, price_delta: 0 };
    }
    return { ...opt, is_default: isDefault };
  });
};
// minimal HTML→text for validation
const stripHtmlToText = (html: string) =>
  (html || "")
    .replace(/<\/(p|div|br|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

// --------------- Component ----------------

// Build payload for attributes that backend expects
const buildAttributesPayload = async (attrs: CustomAttribute[]) => {
  const out: any[] = [];
  for (const a of attrs) {
    const name = (a.name || "").trim();
    if (!name) continue;

    const options: any[] = [];
    for (const o of a.options || []) {
      const label = (o.label || "").trim();
      if (!label) continue;

      // Convert a newly uploaded option image file → base64 for backend
      // inside buildAttributesPayload() when preparing each option:
      let imageDataUrl: string | null = null;
      if (o._image_file) {
      imageDataUrl = await fileToBase64(o._image_file);
      } else if (o.image && o.image.startsWith("data:image/")) {
      imageDataUrl = o.image;
      } else if (o._image_preview && /^https?:/i.test(o._image_preview)) {
      // NEW: pass through existing URL so backend can persist it
      imageDataUrl = o._image_preview;
      }

      options.push({
      id: o.id,
      label,
      price_delta: Number.isFinite(o.price_delta) ? o.price_delta : 0,
      is_default: !!o.is_default,
      image_id: o.image_id || null,
      image: imageDataUrl,           // ← now may be base64 OR URL
      description: o.description || "",
      });

    }

    out.push({ id: a.id, name, options });
  }
  return out;
};

const Modal = ({
  isOpen,
  onClose,
  onFirstImageUpload,
  productId = null,
}: {
  isOpen: boolean;
  onClose: () => void;
  onFirstImageUpload?: (f: File) => void;
  productId?: string | null;
}) => {
  const [isMounted, setIsMounted] = useState(false);
  const [previewImages, setPreviewImages] = useState<ModalImage[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [isSettingThumb, setIsSettingThumb] = useState(false);

  // attributes + product fields (unchanged from your version except irrelevant parts trimmed)
  const [customAttributes, setCustomAttributes] = useState<CustomAttribute[]>(
    []
  );
  const [libraryAttributes, setLibraryAttributes] = useState<CustomAttribute[]>(
    []
  );
  const [isLoadingLibraryAttributes, setIsLoadingLibraryAttributes] =
    useState(false);
  const [libraryAttributesError, setLibraryAttributesError] = useState<
    string | null
  >(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<any[]>([]);
  const [selectedSubcategories, setSelectedSubcategories] = useState<any[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);

  const printingMethods = [
    { value: "SP", label: "Screen Printing" },
    { value: "DP", label: "Digital Printing" },
    { value: "OP", label: "Offset Printing" },
  ];

  const [formData, setFormData] = useState<any>({
    title: "",
    description: "",
    longDescription: "",
    sku: "",
    category: "",
    subcategory: "",
    rating: "",
    ratingCount: "",
    brand: "",
    imageAlt: "",
    videoUrl: "",
    metaTitle: "",
    metaDescription: "",
    metaKeywords: "",
    ogTitle: "",
    ogDescription: "",
    ogImage: "",
    canonicalUrl: "",
    jsonLdSchema: "",
    normalPrice: "",
    discountedPrice: "",
    taxRate: "",
    priceCalculator: "",
    stockQuantity: "",
    lowStockAlert: "",
    stockStatus: "",
    size: [],
    colorVariants: [],
    materialType: [],
    fabricFinish: "",
    printingMethod: "",
    addOnOptions: "",
    variantCombinations: "",
    customTags: "",
    groupedFilters: "",
    processingTime: "",
    shippingClass: [],
  });

  const [errors, setErrors] = useState<any>({});

  // comma “temp” fields
  const [tempMetaKeywords, setTempMetaKeywords] = useState("");
  const [tempSizes, setTempSizes] = useState("");
  const [tempColorVariants, setTempColorVariants] = useState("");
  const [tempMaterialType, setTempMaterialType] = useState("");
  const [tempAddOnOptions, setTempAddOnOptions] = useState("");
  const [tempCustomTags, setTempCustomTags] = useState("");
  const [tempGroupedFilters, setTempGroupedFilters] = useState("");
  const [tempShippingClass, setTempShippingClass] = useState("");
  const [tempVariantCombinations, setTempVariantCombinations] = useState("");

  // ---------- Image preview modal helpers ----------
  const openImageDetailsAt = useCallback(
    (idx: number) => {
      if (previewImages.length === 0) return;
      setActivePreviewIndex(idx);
      setIsPreviewOpen(true);
    },
    [previewImages.length]
  );
  const closePreview = useCallback(() => setIsPreviewOpen(false), []);
  const nextPreview = useCallback(() => {
    setActivePreviewIndex((i) => (i + 1) % Math.max(previewImages.length, 1));
  }, [previewImages.length]);
  const prevPreview = useCallback(() => {
    setActivePreviewIndex(
      (i) =>
        (i - 1 + Math.max(previewImages.length, 1)) %
        Math.max(previewImages.length, 1)
    );
  }, [previewImages.length]);

  // ---------- Derived names ----------
  const categoryName = useMemo(() => {
    if (!formData.category) return "";
    const found = categories.find(
      (c) => c.id?.toString() === formData.category?.toString()
    );
    return found?.name || "";
  }, [categories, formData.category]);

  const subcategoryName = useMemo(() => {
    const subId = formData.subcategory || selectedSubcategories?.[0];
    if (!subId) return "";
    const found = subcategories.find(
      (s) => s.id?.toString() === subId?.toString()
    );
    return found?.name || "";
  }, [subcategories, formData.subcategory, selectedSubcategories]);
  const activeSubcategoryIds = useMemo(() => {
    const ids = [...selectedSubcategories];
    if (formData.subcategory) ids.push(formData.subcategory);
    return Array.from(new Set(ids.filter(Boolean).map((id) => id.toString())));
  }, [selectedSubcategories, formData.subcategory]);

  const normalizeLibraryOption = (option: AttributeOption): AttributeOption => {
    const price =
      typeof option.price_delta === "number"
        ? option.price_delta
        : option.price_delta
        ? parseFloat(String(option.price_delta)) || 0
        : 0;

    return {
      id: option.id,
      label: option.label,
      price_delta: Number.isFinite(price) ? price : 0,
      is_default: Boolean(option.is_default),
      image_id: option.image_id ?? null,
      _image_file: null,
      _image_preview: option._image_preview ?? null,
      image: null,
      description: option.description ?? "", // 👈 keep it here too
    };
  };

  // ---------- Load: add mode vs edit mode ----------
  useEffect(() => {
    setIsEditMode(!!productId);
  }, [productId]);

  // Single source of truth loader for "other details" (images)
  const fetchOtherDetails = useCallback(async (prodId: string) => {
    const res = await fetch(
      `${API_BASE_URL}/api/show_product_other_details/`,
      withFrontendKey({
        method: "POST",
        body: JSON.stringify({ product_id: prodId }),
      })
    );
    const other = await parseJsonSafe(res, "show_product_other_details");

    // 1) NEW: images_with_ids [{ id, url, is_primary }]
    const imgs: ModalImage[] = Array.isArray(other.images_with_ids)
      ? other.images_with_ids.map((row: any) => ({
          src: urlForDisplay(row.url),
          kind: "url",
          file: null,
          alt: typeof row.alt === "string" ? row.alt : "",
          caption: typeof row.caption === "string" ? row.caption : "",
          // normalize tags to string[]
          tags: Array.isArray(row.tags)
            ? row.tags.map((t: any) => String(t).trim()).filter(Boolean)
            : typeof row.tags === "string"
            ? row.tags
                .split(/[,|]/)
                .map((t: string) => t.trim())
                .filter(Boolean)
            : [],
          image_id: row.id || null, // IMPORTANT: backend key is "id"
          is_primary: !!row.is_primary, // IMPORTANT: backend truth
        }))
      : [];

    // 2) Legacy fallback if backend only returns "images": string[]
    if (imgs.length === 0 && Array.isArray(other.images)) {
      // None is primary without explicit info
      other.images.forEach((u: string) => {
        imgs.push({
          src: urlForDisplay(u),
          kind: "url",
          file: null,
          alt: "",
          caption: "",
          tags: [],
          image_id: null,
          is_primary: false,
        });
      });
    }

    setPreviewImages(imgs);
    if (
      Array.isArray(other.subcategory_ids) &&
      other.subcategory_ids.length > 0
    ) {
      setSelectedSubcategories(other.subcategory_ids);
    }
  }, []);

  // initial edit-mode fetch
  useEffect(() => {
    const resetForAdd = () => {
      setFormData((prev: any) => ({
        ...prev,
        title: "",
        description: "",
        longDescription: "",
        sku: "",
        category: "",
        subcategory: "",
        rating: "",
        ratingCount: "",
        brand: "",
        imageAlt: "",
        videoUrl: "",
        metaTitle: "",
        metaDescription: "",
        metaKeywords: "",
        ogTitle: "",
        ogDescription: "",
        ogImage: "",
        canonicalUrl: "",
        jsonLdSchema: "",
        normalPrice: "",
        discountedPrice: "",
        taxRate: "",
        priceCalculator: "",
        stockQuantity: "",
        lowStockAlert: "",
        stockStatus: "",
        size: [],
        colorVariants: [],
        materialType: [],
        fabricFinish: "",
        printingMethod: "",
        addOnOptions: "",
        variantCombinations: "",
        customTags: "",
        groupedFilters: "",
        processingTime: "",
        shippingClass: [],
      }));
      setTempMetaKeywords("");
      setTempSizes("");
      setTempColorVariants("");
      setTempMaterialType("");
      setTempAddOnOptions("");
      setTempCustomTags("");
      setTempGroupedFilters("");
      setTempShippingClass("");
      setTempVariantCombinations("");
      setPreviewImages([]);
      setSelectedCategories([]);
      setSelectedSubcategories([]);
      setCustomAttributes([]);
    };

    if (!productId) {
      resetForAdd();
      return;
    }

    // EDIT: fetch all pieces
    (async () => {
      try {
        const [basicRes, seoRes, variantRes, shipRes, combosRes, attrsRes] =
          await Promise.all([
            fetch(
              `${API_BASE_URL}/api/show_specific_product/`,
              withFrontendKey({
                method: "POST",
                body: JSON.stringify({ product_id: productId }),
              })
            ),
            fetch(
              `${API_BASE_URL}/api/show_product_seo/`,
              withFrontendKey({
                method: "POST",
                body: JSON.stringify({ product_id: productId }),
              })
            ),
            fetch(
              `${API_BASE_URL}/api/show_product_variant/`,
              withFrontendKey({
                method: "POST",
                body: JSON.stringify({ product_id: productId }),
              })
            ),
            fetch(
              `${API_BASE_URL}/api/show_product_shipping_info/`,
              withFrontendKey({
                method: "POST",
                body: JSON.stringify({ product_id: productId }),
              })
            ),
            fetch(
              `${API_BASE_URL}/api/show_product_variants/`,
              withFrontendKey({
                method: "POST",
                body: JSON.stringify({ product_id: productId }),
              })
            ),
            fetch(
              `${API_BASE_URL}/api/show_product_attributes/`,
              withFrontendKey({
                method: "POST",
                body: JSON.stringify({ product_id: productId }),
              })
            ),
          ]);

        const basic = await parseJsonSafe(basicRes, "show_specific_product");
        const seo = await parseJsonSafe(seoRes, "show_product_seo");
        const variant = await parseJsonSafe(variantRes, "show_product_variant");
        const shipping = await parseJsonSafe(
          shipRes,
          "show_product_shipping_info"
        );
        const combos = await parseJsonSafe(combosRes, "show_product_variants");

        // attributes (404 tolerated)
        let attrs: any[] = [];
        if (attrsRes.status !== 404) {
          try {
            attrs = await parseJsonSafe(attrsRes, "show_product_attributes");
          } catch {
            attrs = [];
          }
        }

        // primary product fields (trimmed)
        setFormData((prev: any) => ({
          ...prev,
          title: basic.name || "",
          description: basic.fit_description || "",
          longDescription: basic.long_description || "",
          sku: basic.id || "",
          category: "",
          subcategory: basic.subcategory?.id || "",
          rating: typeof basic.rating === "number" ? String(basic.rating) : "",
          ratingCount:
            typeof basic.rating_count === "number"
              ? String(basic.rating_count)
              : "",
          brand: basic.brand_title || "",
          imageAlt: seo.image_alt_text || "",
          videoUrl: basic.video_url || "",
          metaTitle: seo.meta_title || "",
          metaDescription: seo.meta_description || "",
          metaKeywords: "",
          ogTitle: seo.open_graph_title || "",
          ogDescription: seo.open_graph_desc || "",
          ogImage: seo.open_graph_image_url || "",
          canonicalUrl: seo.canonical_url || "",
          jsonLdSchema: seo.json_ld || "",
          normalPrice: basic.price || "",
          discountedPrice: basic.discounted_price || "",
          taxRate: basic.tax_rate || "",
          priceCalculator: basic.price_calculator || "",
          stockQuantity: basic.stock_quantity || "",
          lowStockAlert: basic.low_stock_alert || "",
          stockStatus: basic.stock_status || "",
          size: variant.sizes || [],
          colorVariants: variant.color_variants || [],
          materialType: variant.material_types || [],
          fabricFinish: (variant.fabric_finish || [])[0] || "",
          printingMethod: variant.printing_methods?.[0] || "",
          addOnOptions: variant.add_on_options || [],
          variantCombinations: combos.variant_combinations || [],
          customTags: seo.custom_tags || [],
          groupedFilters: seo.grouped_filters || [],
          processingTime: shipping.processing_time || "",
          shippingClass: (shipping.shipping_class || "").split(","),
        }));

        setTempMetaKeywords(
          Array.isArray(seo.meta_keywords) ? seo.meta_keywords.join(", ") : ""
        );
        setTempCustomTags(
          Array.isArray(seo.custom_tags) ? seo.custom_tags.join(", ") : ""
        );
        setTempGroupedFilters(
          Array.isArray(seo.grouped_filters)
            ? seo.grouped_filters.join(", ")
            : ""
        );
        setTempSizes(
          Array.isArray(variant.sizes) ? variant.sizes.join(", ") : ""
        );
        setTempColorVariants(
          Array.isArray(variant.color_variants)
            ? variant.color_variants.join(", ")
            : ""
        );
        setTempMaterialType(
          Array.isArray(variant.material_types)
            ? variant.material_types.join(", ")
            : ""
        );
        setTempAddOnOptions(
          Array.isArray(variant.add_on_options)
            ? variant.add_on_options.join(", ")
            : ""
        );
        setTempShippingClass(shipping.shipping_class || "");
        setTempVariantCombinations(
          Array.isArray(combos.variant_combinations)
            ? combos.variant_combinations
                .map((c: any) => `${c.description}::${c.price_override}`)
                .join(" | ")
            : ""
        );

        // normalize attributes previews
        if (Array.isArray(attrs)) {
          const normalized: CustomAttribute[] = attrs.map((a: any) => ({
            id: String(a?.id || crypto.randomUUID()),
            name: String(a?.name || ""),
            options: Array.isArray(a?.options)
              ? a.options.map((o: any) => ({
                  id: String(o?.id || crypto.randomUUID()),
                  label: String(o?.label || ""),
                  price_delta:
                    typeof o?.price_delta === "number"
                      ? o.price_delta
                      : o?.price_delta
                      ? parseFloat(o.price_delta)
                      : 0,
                  is_default: !!o?.is_default,
                  image_id: o?.image_id || null,
                  _image_file: null,
                  _image_preview: o?.image_url
                    ? urlForDisplay(o.image_url)
                    : null,
                  image: null,
                  description:
                    typeof o?.description === "string" ? o.description : "",
                }))
              : [],
          }));
          setCustomAttributes(normalized);
        } else {
          setCustomAttributes([]);
        }

        // CRITICAL: fetch images from the source of truth API
        await fetchOtherDetails(basic.id || String(productId));
      } catch (err) {
        console.error(err);
        toast.error("Failed to load product details");
      }
    })();
  }, [productId, fetchOtherDetails]);

  // categories/subcategories lists
  useEffect(() => {
    setIsMounted(true);
    if (!FRONTEND_KEY) {
      console.warn("NEXT_PUBLIC_FRONTEND_KEY missing.");
      toast.warn(
        "Frontend key missing. Set NEXT_PUBLIC_FRONTEND_KEY and restart."
      );
      return;
    }
    (async () => {
      try {
        const [catRes, subRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/show-categories/`, withFrontendKey()),
          fetch(`${API_BASE_URL}/api/show-subcategories/`, withFrontendKey()),
        ]);
        const catData = await parseJsonSafe(catRes, "show-categories");
        const subData = await parseJsonSafe(subRes, "show-subcategories");
        setCategories(Array.isArray(catData) ? catData : []);
        setSubcategories(Array.isArray(subData) ? subData : []);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load categories/subcategories.");
      }
    })();
  }, []);

  // derive category from selected subcategory
  useEffect(() => {
    if (formData.subcategory && !formData.category) {
      const selectedSub = subcategories.find(
        (s) => s.id?.toString() === formData.subcategory?.toString()
      );
      if (selectedSub && selectedSub.categories?.length > 0) {
        const firstName = selectedSub.categories[0];
        const match = categories.find((c) => c.name === firstName);
        const firstCategoryId = match?.id || "";
        if (firstCategoryId) {
          setFormData((prev: any) => ({ ...prev, category: firstCategoryId }));
          setSelectedCategories([firstCategoryId]);
        }
      }
    }
  }, [formData.subcategory, formData.category, subcategories, categories]);

  // stock status helper
  useEffect(() => {
    const qty = parseInt(formData.stockQuantity);
    const alert = parseInt(formData.lowStockAlert);
    let status = formData.stockStatus;
    if (!isNaN(qty) && !isNaN(alert)) {
      if (qty === 0) status = "Out Of Stock";
      else if (qty <= alert) status = "Low Stock";
      else status = "In Stock";
      setFormData((prev: any) => ({ ...prev, stockStatus: status }));
    }
  }, [formData.stockQuantity, formData.lowStockAlert]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // quill configs
  const quillModules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [2, 3, 4, false] }],
          ["bold", "italic", "underline"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["link"],
          ["clean"],
          ["undo", "redo"],
        ],
        handlers: {
          undo: function (this: any) {
            try {
              this.quill.history.undo();
            } catch {}
          },
          redo: function (this: any) {
            try {
              this.quill.history.redo();
            } catch {}
          },
        },
      },
      history: { delay: 500, maxStack: 100, userOnly: true },
    }),
    []
  );
  const quillModulesLong = quillModules;
  const quillFormats = [
    "header",
    "bold",
    "italic",
    "underline",
    "list",
    "link",
  ];

  const hidden = !isMounted || !isOpen;

  // ---------- validation ----------
  const validate = () => {
    const newErrors: any = {};
    if (!formData.title.trim()) newErrors.title = "Product title is required";
    if (!stripHtmlToText(formData.description || ""))
      newErrors.description = "Description is required";
    if (!formData.subcategory)
      newErrors.subcategory = "Subcategory is required";
    if (!isEditMode && previewImages.length === 0)
      newErrors.image = "At least one image is required";
    return newErrors;
  };

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  // ---------- local image add/remove (unsaved files) ----------
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const currentCount = previewImages.length;
    const allowed = Math.max(0, MAX_IMAGES - currentCount);
    const chosen = files.slice(0, allowed);
    if (files.length > allowed)
      toast.warn(
        `You can upload up to ${MAX_IMAGES} images. Extra ${
          files.length - allowed
        } ignored.`
      );

    const items: ModalImage[] = chosen.map((file) => ({
      src: URL.createObjectURL(file),
      file,
      kind: "file",
      alt: "",
      caption: "",
      tags: [],
      image_id: null, // not saved yet
      is_primary: false,
    }));

    setPreviewImages((prev) => [...prev, ...items]);

    if (onFirstImageUpload && currentCount === 0 && chosen[0])
      onFirstImageUpload(chosen[0]);

    setErrors((prev: any) => {
      const { image, ...rest } = prev;
      return rest;
    });
    (e.target as any).value = "";
  };

  const removeImageAt = (idx: number) => {
    setPreviewImages((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(idx, 1);
      if (
        removed?.kind === "file" &&
        (removed.src as any)?.startsWith?.("blob:")
      )
        URL.revokeObjectURL(removed.src);
      if (isPreviewOpen) {
        if (idx === activePreviewIndex)
          setActivePreviewIndex((i) => Math.max(0, i - 1));
        else if (idx < activePreviewIndex)
          setActivePreviewIndex((i) => Math.max(0, i - 1));
      }
      return copy;
    });
  };

  // ---------- per-image meta ----------
  const updateActiveImageMeta = (
    patch: Partial<Pick<ModalImage, "alt" | "caption" | "tags">>
  ) => {
    setPreviewImages((prev) => {
      if (prev.length === 0) return prev;
      const idx = activePreviewIndex;
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  // ---------- Set as thumbnail ----------
  const setActiveAsThumbnail = async () => {
    if (!isEditMode) {
      toast.info("Save the product first, then set a thumbnail.");
      return;
    }
    const img = previewImages[activePreviewIndex];
    const prodId = formData.sku || productId;
    if (!img?.image_id) {
      toast.info(
        "This image isn’t saved on the product yet. Save first, then set as thumbnail."
      );
      return;
    }
    if (!prodId) {
      toast.error("Missing product ID.");
      return;
    }
    try {
      setIsSettingThumb(true);
      const res = await fetch(
        `${API_BASE_URL}/api/set-product-thumbnail/`,
        withFrontendKey({
          method: "POST",
          body: JSON.stringify({ product_id: prodId, image_id: img.image_id }),
        })
      );
      const data = await parseJsonSafe(res, "set-product-thumbnail");
      if (data?.success) {
        // Re-fetch authoritative flags so only ONE shows as thumbnail
        await fetchOtherDetails(String(prodId));
        toast.success("Thumbnail updated.");
      } else {
        toast.error(data?.error || "Failed to set thumbnail.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not set thumbnail.");
    } finally {
      setIsSettingThumb(false);
    }
  };

  // ---------- category / subcategory helpers ----------
  const handleCategoryChange = (id: any) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSubcategoryChange = (id: any, linkedCategories?: string[]) => {
    setSelectedSubcategories((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
    if (selectedCategories.length === 0 && linkedCategories?.length) {
      const matchedIds = linkedCategories
        .map((catName) => categories.find((c) => c.name === catName)?.id)
        .filter(Boolean);
      setSelectedCategories((prev) => [...new Set([...prev, ...matchedIds])]);
    }
  };

  const filteredSubcategories =
    selectedCategories.length === 0
      ? subcategories
      : subcategories.filter((sub: any) =>
          sub.categories?.some((catName: string) =>
            categories
              .filter((cat: any) => selectedCategories.includes(cat.id))
              .map((cat: any) => cat.name)
              .includes(catName)
          )
        );

  useEffect(() => {
    if (!isOpen || !FRONTEND_KEY) return;
    if (activeSubcategoryIds.length === 0) {
      setLibraryAttributes([]);
      setLibraryAttributesError(null);
      setIsLoadingLibraryAttributes(false);
      return;
    }

    let cancelled = false;
    const loadAttributesForSubcategories = async () => {
      setIsLoadingLibraryAttributes(true);
      setLibraryAttributesError(null);
      try {
        let encounteredError = false;
        const responses = await Promise.all(
          activeSubcategoryIds.map(async (subId) => {
            try {
              const res = await fetch(
                `${API_BASE_URL}/api/show-subcat-attributes/?subcategory_id=${encodeURIComponent(
                  subId
                )}`,
                withFrontendKey({ method: "GET" })
              );
              if (res.status === 404) return [];
              const data = await parseJsonSafe(res, "show-subcat-attributes");
              if (Array.isArray(data)) return data;
              if (Array.isArray(data?.results)) return data.results;
              if (Array.isArray(data?.attributes)) return data.attributes;
              return [];
            } catch (error) {
              console.error("Failed to load attribute library", error);
              encounteredError = true;
              return [];
            }
          })
        );

        if (cancelled) return;

        const normalized = responses.flat().map((raw: any) => {
          const values = Array.isArray(raw?.values)
            ? raw.values
            : Array.isArray(raw?.options)
            ? raw.options
            : [];

          const mappedOptions: AttributeOption[] = values.map((opt: any) => {
            const price =
              typeof opt?.price_delta === "number"
                ? opt.price_delta
                : opt?.price_delta
                ? parseFloat(opt.price_delta) || 0
                : typeof opt?.price === "number"
                ? opt.price
                : 0;

            // 👇 NEW: prefer `description`, then `short_description`
            const rawDesc =
              typeof opt?.description === "string" && opt.description.trim()
                ? opt.description
                : typeof opt?.short_description === "string" &&
                  opt.short_description.trim()
                ? opt.short_description
                : "";

            return {
              id: String(opt?.id ?? opt?.value_id ?? crypto.randomUUID()),
              label: String(opt?.name ?? opt?.label ?? ""),
              price_delta: Number.isFinite(price) ? price : 0,
              is_default: Boolean(opt?.is_default),
              image_id: opt?.image_id ?? null,
              _image_file: null,
              _image_preview: opt?.image_url
                ? urlForDisplay(String(opt.image_url))
                : null,
              image: null,
              description: rawDesc, // 👈 keep it
            };
          });

          return {
            id: String(raw?.id ?? raw?.attribute_id ?? crypto.randomUUID()),
            name: String(raw?.name ?? raw?.title ?? "Attribute"),
            status: String(raw?.status ?? "active"), // ← keep API status
            options: mappedOptions.sort((a, b) =>
              a.label.localeCompare(b.label)
            ),
          } as CustomAttribute;
        });
        // build set of already-selected attribute keys
        const selectedAttrKeys = new Set(
          (customAttributes || [])
            .map((a) => getAttributeKey(a))
            .filter(Boolean)
        );

        // apply visibility rule:
        // hide if status === "hidden", unless it's selected AND we're in edit mode
        const normalizedVisible = normalized.filter((attr) => {
          const key = getAttributeKey(attr);
          const isHidden = String(attr.status || "").toLowerCase() === "hidden";
          const isSelected = key && selectedAttrKeys.has(key);
          return !isHidden || (isEditMode && isSelected);
        });

        const merged = new Map<string, CustomAttribute>();
        normalizedVisible.forEach((attr) => {
          const key = attr.id || attr.name;
          const existing = merged.get(key);
          if (!existing) {
            merged.set(key, attr);
            return;
          }
          const optionMap = new Map<string, AttributeOption>();
          [...existing.options, ...attr.options].forEach((opt) => {
            const optKey = getOptionKey(opt);
            if (!optionMap.has(optKey)) optionMap.set(optKey, opt);
          });
          merged.set(key, {
            ...existing,
            name: attr.name || existing.name,
            status: attr.status || existing.status,
            options: Array.from(optionMap.values()).sort((a, b) =>
              a.label.localeCompare(b.label)
            ),
          });
        });

        setLibraryAttributes(Array.from(merged.values()));
        if (encounteredError) {
          setLibraryAttributesError(
            "Some attributes could not be loaded. Showing available results."
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setLibraryAttributes([]);
          setLibraryAttributesError(
            "Unable to load attributes for the selected subcategory."
          );
        }
      } finally {
        if (!cancelled) setIsLoadingLibraryAttributes(false);
      }
    };

    loadAttributesForSubcategories();

    return () => {
      cancelled = true;
    };
  }, [activeSubcategoryIds, isOpen]);

  const isLibraryOptionSelected = useCallback(
    (attr: CustomAttribute, option: AttributeOption) => {
      const match = customAttributes.find(
        (a) =>
          a.id === attr.id ||
          a.name?.toLowerCase?.() === attr.name?.toLowerCase?.()
      );
      if (!match) return false;
      return match.options.some(
        (opt) =>
          opt.id === option.id ||
          opt.label?.toLowerCase?.() === option.label?.toLowerCase?.()
      );
    },
    [customAttributes]
  );
  const isLibraryAttributeFullySelected = useCallback(
    (attr: CustomAttribute) => {
      if (!attr?.options?.length) return false;
      const attrKey = getAttributeKey(attr);
      if (!attrKey) return false;
      const match = customAttributes.find(
        (a) => getAttributeKey(a) === attrKey
      );
      if (!match) return false;
      const selectedKeys = new Set(
        (match.options || []).map((opt) => getOptionKey(opt))
      );
      return attr.options.every((opt) => selectedKeys.has(getOptionKey(opt)));
    },
    [customAttributes]
  );

  const isLibraryAttributePartiallySelected = useCallback(
    (attr: CustomAttribute) => {
      if (!attr?.options?.length) return false;
      const attrKey = getAttributeKey(attr);
      if (!attrKey) return false;
      const match = customAttributes.find(
        (a) => getAttributeKey(a) === attrKey
      );
      if (!match) return false;
      const selectedKeys = new Set(
        (match.options || []).map((opt) => getOptionKey(opt))
      );
      let count = 0;
      attr.options.forEach((opt) => {
        if (selectedKeys.has(getOptionKey(opt))) count += 1;
      });
      return count > 0 && count < attr.options.length;
    },
    [customAttributes]
  );

  const handleLibraryAttributeToggle = useCallback(
    (attr: CustomAttribute, checked: boolean) => {
      const attrKey = getAttributeKey(attr);
      if (!attrKey) return;
      setCustomAttributes((prev) => {
        const attrIndex = prev.findIndex((a) => getAttributeKey(a) === attrKey);

        if (checked) {
          const normalizedOptions = (attr.options || []).map((opt) =>
            normalizeLibraryOption(opt)
          );
          if (attrIndex === -1) {
            const nextOptions = ensureDefaultOption(normalizedOptions);
            const storedId =
              attr.id ?? (attrKey || attr.name || crypto.randomUUID());
            return [
              ...prev,
              {
                id: storedId,
                name: attr.name,
                options: nextOptions,
              },
            ];
          }

          const existingAttr = prev[attrIndex];
          const defaultOption = existingAttr.options?.find(
            (opt) => opt.is_default
          );
          const defaultKey = defaultOption
            ? getOptionKey(defaultOption)
            : undefined;
          const optionMap = new Map<string, AttributeOption>();
          (existingAttr.options || []).forEach((opt) => {
            optionMap.set(getOptionKey(opt), opt);
          });
          normalizedOptions.forEach((opt) => {
            const optionKey = getOptionKey(opt);
            const existing = optionMap.get(optionKey);
            optionMap.set(
              optionKey,
              existing
                ? {
                    ...existing,
                    ...opt,
                    is_default: existing.is_default,
                    // keep a non-null preview if either side has it
                    _image_preview:
                      existing._image_preview ?? opt._image_preview ?? null,
                    image_id: existing.image_id ?? opt.image_id ?? null,
                    description: existing.description ?? opt.description ?? "",
                  }
                : opt
            );
          });
          const mergedOptions = ensureDefaultOption(
            Array.from(optionMap.values()),
            defaultKey
          );
          const storedId =
            existingAttr.id ??
            attr.id ??
            (attrKey || attr.name || crypto.randomUUID());
          return [
            ...prev.slice(0, attrIndex),
            {
              ...existingAttr,
              id: storedId,
              name: attr.name,
              options: mergedOptions,
            },
            ...prev.slice(attrIndex + 1),
          ];
        }

        if (attrIndex === -1) return prev;
        return [...prev.slice(0, attrIndex), ...prev.slice(attrIndex + 1)];
      });
    },
    [setCustomAttributes]
  );

  const handleLibraryOptionToggle = useCallback(
    (attr: CustomAttribute, option: AttributeOption, checked: boolean) => {
      const attrKey = getAttributeKey(attr);
      const optionKey = getOptionKey(option);
      if (!attrKey || !optionKey) return;

      setCustomAttributes((prev) => {
        const attrIndex = prev.findIndex((a) => getAttributeKey(a) === attrKey);
        const normalizedOption = normalizeLibraryOption(option);

        if (checked) {
          if (attrIndex === -1) {
            const nextOptions = ensureDefaultOption([normalizedOption]);
            const storedId =
              attr.id ?? (attrKey || attr.name || crypto.randomUUID());
            return [
              ...prev,
              {
                id: storedId,
                name: attr.name,
                options: nextOptions,
              },
            ];
          }

          const existingAttr = prev[attrIndex];
          const defaultOption = existingAttr.options?.find(
            (opt) => opt.is_default
          );
          const defaultKey = defaultOption
            ? getOptionKey(defaultOption)
            : undefined;
          const existingOptions = existingAttr.options || [];
          const optionIndex = existingOptions.findIndex(
            (opt) => getOptionKey(opt) === optionKey
          );
          let nextOptions: AttributeOption[];
          if (optionIndex === -1) {
            nextOptions = [...existingOptions, normalizedOption];
          } else {
            nextOptions = existingOptions.map((optExisting, idx) =>
              idx === optionIndex
                ? {
                    ...optExisting,
                    ...normalizedOption,
                    is_default: optExisting.is_default,
                    _image_preview:
                      optExisting._image_preview ??
                      normalizedOption._image_preview ??
                      null,
                    image_id:
                      optExisting.image_id ?? normalizedOption.image_id ?? null,
                    description:
                      optExisting.description ??
                      normalizedOption.description ??
                      "",
                  }
                : optExisting
            );
          }
          nextOptions = ensureDefaultOption(nextOptions, defaultKey);
          return [
            ...prev.slice(0, attrIndex),
            { ...existingAttr, options: nextOptions },
            ...prev.slice(attrIndex + 1),
          ];
        }

        if (attrIndex === -1) return prev;
        const existingAttr = prev[attrIndex];
        const remaining = (existingAttr.options || []).filter(
          (opt) => getOptionKey(opt) !== optionKey
        );
        if (remaining.length === 0) {
          return [...prev.slice(0, attrIndex), ...prev.slice(attrIndex + 1)];
        }

        const defaultOption = remaining.find((opt) => opt.is_default);
        const defaultKey = defaultOption
          ? getOptionKey(defaultOption)
          : undefined;
        const adjusted = ensureDefaultOption(remaining, defaultKey);

        return [
          ...prev.slice(0, attrIndex),
          { ...existingAttr, options: adjusted },
          ...prev.slice(attrIndex + 1),
        ];
      });
    },
    [setCustomAttributes]
  );

  // ---------- attribute helpers (unchanged behavior) ----------
  const addAttribute = () =>
    setCustomAttributes((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", options: [] },
    ]);
  const removeAttribute = (attrId: string) =>
    setCustomAttributes((prev) => prev.filter((a) => a.id !== attrId));
  const updateAttribute = (attrId: string, patch: Partial<CustomAttribute>) =>
    setCustomAttributes((prev) =>
      prev.map((a) => (a.id === attrId ? { ...a, ...patch } : a))
    );
  const addOption = (attrId: string) =>
    setCustomAttributes((prev) =>
      prev.map((a) =>
        a.id === attrId
          ? {
              ...a,
              options: [
                ...a.options,
                {
                  id: crypto.randomUUID(),
                  label: "",
                  price_delta: 0,
                  is_default: a.options.length === 0,
                  _image_file: null,
                  _image_preview: null,
                  image: null,
                  image_id: null,
                  description: "",
                },
              ],
            }
          : a
      )
    );
  const removeOption = (attrId: string, optId: string) =>
    setCustomAttributes((prev) =>
      prev.map((a) =>
        a.id === attrId
          ? { ...a, options: a.options.filter((o) => o.id !== optId) }
          : a
      )
    );
  const updateOption = (
    attrId: string,
    optId: string,
    patch: Partial<AttributeOption>
  ) =>
    setCustomAttributes((prev) =>
      prev.map((a) =>
        a.id === attrId
          ? {
              ...a,
              options: a.options.map((o) =>
                o.id === optId ? { ...o, ...patch } : o
              ),
            }
          : a
      )
    );
  const setDefaultOption = (attrId: string, optId: string) =>
    setCustomAttributes((prev) =>
      prev.map((a) =>
        a.id === attrId
          ? {
              ...a,
              options: a.options.map((o) =>
                o.id === optId
                  ? { ...o, is_default: true, price_delta: 0 }
                  : { ...o, is_default: false }
              ),
            }
          : a
      )
    );
  const handleOptionImageChange = (
    attrId: string,
    optId: string,
    file: File | null
  ) => {
    if (!file) {
      return updateOption(attrId, optId, {
        _image_file: null,
        _image_preview: null,
        image: null,
        image_id: null,
      });
    }
    const preview = URL.createObjectURL(file);
    updateOption(attrId, optId, {
      _image_file: file,
      _image_preview: preview,
      image_id: null,
    });
  };

  // ---------- Save product (trimmed to the relevant imaging bits) ----------
  const handleSubmit = async (e: any) => {
    e.preventDefault();
    const formErrors = validate();
    setErrors(formErrors);
    if (Object.keys(formErrors).length > 0) {
      toast.error("Please correct the highlighted fields.");
      return;
    }

    const finalSubcategoryIds = [
      ...new Set(
        [...selectedSubcategories, formData.subcategory].filter(Boolean)
      ),
    ];
    if (finalSubcategoryIds.length === 0) {
      toast.error("Please select at least one subcategory.");
      return;
    }

    let toastId: any;
    try {
      toastId = toast.loading(
        isEditMode ? "Updating product..." : "Saving product..."
      );

      // Build images_with_meta (per-image tags/alt/caption)
      const images_with_meta = await Promise.all(
        previewImages.map(async (img) => {
          const tags = Array.isArray(img.tags) ? img.tags : [];
          if (img.kind === "file" && img.file) {
            const dataUrl = await fileToBase64(img.file);
            return {
              dataUrl,
              url: null as string | null,
              image_id: img.image_id || null,
              alt: img.alt || "",
              caption: img.caption || "",
              tags,
              is_primary: !!img.is_primary,
            };
          }
          if (
            typeof img.src === "string" &&
            img.src.startsWith("data:image/")
          ) {
            return {
              dataUrl: img.src,
              url: null as string | null,
              image_id: img.image_id || null,
              alt: img.alt || "",
              caption: img.caption || "",
              tags,
              is_primary: !!img.is_primary,
            };
          }
          return {
            dataUrl: null as string | null,
            url: img.src,
            image_id: img.image_id || null,
            alt: img.alt || "",
            caption: img.caption || "",
            tags,
            is_primary: !!img.is_primary,
          };
        })
      );

      const newImagesBase64: string[] = images_with_meta
        .map((o) => o.dataUrl)
        .filter(Boolean) as string[];
      const hasNewImages = newImagesBase64.length > 0;

      const attributesPayload = await buildAttributesPayload(customAttributes);

      // (omitting unrelated payload fields for brevity; keep your prior code)
      const cleanCommaArray = (val: string) =>
        String(val || "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);

      const commonFields: any = {
        name: formData.title,
        description: formData.description,
        long_description: formData.longDescription,
        brand_title: formData.brand,
        price: parseFloat(formData.normalPrice) || 0,
        discounted_price: parseFloat(formData.discountedPrice) || 0,
        ...(formData.rating !== "" ? { rating: Number(formData.rating) } : {}),
        ...(formData.ratingCount !== ""
          ? { rating_count: Number(formData.ratingCount) }
          : {}),
        tax_rate: parseFloat(formData.taxRate) || 0,
        price_calculator:
          (formData as any).price_calculator ?? formData.priceCalculator,
        video_url: formData.videoUrl,
        fabric_finish: formData.fabricFinish,
        status: "active",
        quantity: parseInt(formData.stockQuantity) || 0,
        low_stock_alert: parseInt(formData.lowStockAlert) || 0,
        stock_status: formData.stockStatus || "In Stock",
        category_ids: selectedCategories,
        subcategory_ids: finalSubcategoryIds,
        shippingClass: cleanCommaArray(tempShippingClass),
        processing_time: formData.processingTime,
        image_alt_text: formData.imageAlt,
        meta_title: formData.metaTitle,
        meta_description: formData.metaDescription,
        meta_keywords: cleanCommaArray(tempMetaKeywords),
        open_graph_title: formData.ogTitle,
        open_graph_desc: formData.ogDescription,
        open_graph_image_url: formData.ogImage,
        canonical_url: formData.canonicalUrl,
        json_ld: formData.jsonLdSchema,
        printing_method: formData.printingMethod,
        size: cleanCommaArray(tempSizes),
        colorVariants: cleanCommaArray(tempColorVariants),
        materialType: cleanCommaArray(tempMaterialType),
        addOnOptions: cleanCommaArray(tempAddOnOptions),
        customTags: cleanCommaArray(tempCustomTags),
        groupedFilters: cleanCommaArray(tempGroupedFilters),
        customAttributes: attributesPayload,
        images_with_meta,
      };

      let res: Response;
      if (isEditMode) {
        const payload: any = {
          product_ids: [formData.sku || productId],
          ...commonFields,
        };
        payload.force_replace_images = !!hasNewImages;
        if (hasNewImages) payload.images = newImagesBase64;

        res = await fetch(
          `${API_BASE_URL}/api/edit-product/`,
          withFrontendKey({ method: "POST", body: JSON.stringify(payload) })
        );
      } else {
        const payload: any = {
          ...commonFields,
          images: newImagesBase64,
          force_replace_images: true,
        };
        res = await fetch(
          `${API_BASE_URL}/api/save-product/`,
          withFrontendKey({ method: "POST", body: JSON.stringify(payload) })
        );
      }

      let result: any = {};
      try {
        result = await res.clone().json();
      } catch {}

      toast.dismiss(toastId);
      if (res.ok) {
        toast.success(
          isEditMode
            ? "Product updated successfully!"
            : "Product saved successfully!"
        );

        // After saving new images in edit mode, refresh to pick up server-provided image_ids/is_primary
        const prodId = formData.sku || productId;
        if (prodId) await fetchOtherDetails(String(prodId));

        onClose?.();
      } else {
        toast.error(
          result?.error ||
            `Failed to ${isEditMode ? "update" : "save"} product.`
        );
      }
    } catch (err) {
      toast.dismiss(toastId);
      console.error(err);
      toast.error("Something went wrong while saving.");
    }
  };

  // draft text for the active image's tag input
  const [tagDraft, setTagDraft] = useState("");

  const addTagsFromString = useCallback(
    (raw: string) => {
      const parts = String(raw || "")
        .split(/[,|]/)
        .map((t) => t.trim())
        .filter(Boolean);

      if (parts.length === 0) return;

      setPreviewImages((prev) => {
        if (prev.length === 0) return prev;
        const idx = activePreviewIndex;
        const next = [...prev];
        const current = Array.isArray(next[idx].tags) ? next[idx].tags : [];
        // dedupe while preserving order
        const merged = [...current];
        for (const p of parts) if (!merged.includes(p)) merged.push(p);
        next[idx] = { ...next[idx], tags: merged };
        return next;
      });
      setTagDraft("");
    },
    [activePreviewIndex, setPreviewImages]
  );

  const removeTagAt = useCallback(
    (removeIdx: number) => {
      setPreviewImages((prev) => {
        if (prev.length === 0) return prev;
        const idx = activePreviewIndex;
        const next = [...prev];
        const tags = (next[idx].tags || []).filter((_, i) => i !== removeIdx);
        next[idx] = { ...next[idx], tags };
        return next;
      });
    },
    [activePreviewIndex, setPreviewImages]
  );

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
        e.preventDefault();
        if (tagDraft.trim()) addTagsFromString(tagDraft);
      } else if (e.key === "Backspace" && !tagDraft) {
        // delete last tag if draft is empty
        setPreviewImages((prev) => {
          if (prev.length === 0) return prev;
          const idx = activePreviewIndex;
          const next = [...prev];
          const tags = Array.isArray(next[idx].tags) ? next[idx].tags : [];
          if (tags.length > 0) tags.pop();
          next[idx] = { ...next[idx], tags };
          return next;
        });
      }
    },
    [tagDraft, addTagsFromString, activePreviewIndex, setPreviewImages]
  );

  const handleTagPaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData("text");
      if (text && /[,|]/.test(text)) {
        e.preventDefault();
        addTagsFromString(text);
      }
    },
    [addTagsFromString]
  );

  // reset draft when switching images / opening
  useEffect(() => {
    setTagDraft("");
  }, [activePreviewIndex, isPreviewOpen]);

  if (hidden) return null;

  return (
    <div
      className="fixed inset-0 bg-blur-500 bg-opacity-40 backdrop-blur-md flex items-center justify-center z-50 animate-fadeIn"
      style={{ backdropFilter: "blur(8px)" }}
    >
      {/* CHANGE #1: h-[80vh] overflow-hidden (no scrolling here) */}
      <div
        className="bg-white text-gray-900 rounded-xl shadow-2xl max-w-5xl w-full h-[80vh] overflow-hidden p-6 sm:p-8 flex flex-col sm:flex-row"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: gallery */}
        <div className="hidden sm:block sm:w-1/2 pr-0 sm:pr-6 h-[420px] shrink-0">
          {previewImages.length > 0 ? (
            <div className="space-y-3">
              <div className="aspect-video w-full overflow-hidden rounded-lg shadow-lg h-[280px] relative">
                <img
                  src={previewImages[0].src}
                  alt={previewImages[0].alt || "Product Preview"}
                  className="w-full h-full object-cover cursor-zoom-in"
                  onClick={() => openImageDetailsAt(0)}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      "/images/default.jpg";
                  }}
                />
                {previewImages[0].is_primary === true && (
                  <span className="absolute top-2 left-2 text-xs bg-[#8B1C1C] text-white px-2 py-1 rounded">
                    Thumbnail
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {previewImages.map((img, idx) => (
                  <div
                    key={(img.image_id ?? img.src) + ":" + idx}
                    className="relative group"
                  >
                    <img
                      src={img.src}
                      alt={img.alt || `Image ${idx + 1}`}
                      className="w-full h-24 object-cover rounded-md border cursor-zoom-in"
                      onClick={() => openImageDetailsAt(idx)}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "/images/default.jpg";
                      }}
                    />
                    {img.is_primary === true && (
                      <span className="absolute bottom-1 left-1 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded">
                        Thumbnail
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImageAt(idx)}
                      className="absolute top-1 right-1 px-2 py-0.5 text-xs bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition"
                      aria-label={`Remove image ${idx + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg text-gray-400">
              No images selected
            </div>
          )}
          {errors.image && <p className="text-red-600 mt-2">{errors.image}</p>}
          <p className="text-xs text-gray-500 mt-2">
            You can upload up to {MAX_IMAGES} images.
          </p>
        </div>

        {/* Right: form */}
        {/* CHANGE #2: make this the scroll container; add min-h-0 to play nice in flex */}
        <div className="w-full sm:w-1/2 h-full min-h-0 overflow-y-auto relative">
          {/* CHANGE #3: hardened sticky header */}
          <header className="sticky top-0 z-20 flex justify-between items-center border-b border-gray-300 pb-3 mb-6 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-wide text-[#8B1C1C]">
              {isEditMode ? "View / Edit Product" : "Add Product"}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="text-gray-500 m-3 hover:text-[#8B1C1C] transition-colors text-3xl font-bold leading-none focus:outline-none focus:ring-2 focus:ring-[#8B1C1C] rounded"
            >
              ×
            </button>
          </header>

          {/* Keep your form sections here (Basic Info, SEO, Pricing, etc.) — unchanged logic */}
          <form className="space-y-8" onSubmit={handleSubmit} noValidate>
            {/* Basic Info */}
            <section>
              <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 border-b border-gray-200 pb-2 text-[#8B1C1C]">
                Basic Info
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <input
                  name="title"
                  type="text"
                  placeholder="Product Title"
                  className={`input-primary ${
                    errors.title ? "border-red-600" : ""
                  }`}
                  value={formData.title}
                  onChange={handleChange}
                  required
                />
                {errors.title && (
                  <p className="text-red-600 sm:col-span-2">{errors.title}</p>
                )}

                <div
                  className={`sm:col-span-2 ${
                    errors.description ? "ring-1 ring-red-600 rounded-md" : ""
                  }`}
                >
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Short Description
                  </label>

                  <ReactQuill
                    theme="snow"
                    value={formData.description}
                    onChange={(content) =>
                      setFormData((prev: any) => ({
                        ...prev,
                        description: content,
                      }))
                    }
                    modules={quillModules}
                    formats={quillFormats}
                    placeholder="Write a clear, scannable product description…"
                    className="h-50 mb-10"
                  />
                </div>

                {errors.description && (
                  <p className="text-red-600 sm:col-span-2">
                    {errors.description}
                  </p>
                )}

                <div
                  className={`sm:col-span-2 ${
                    errors.longDescription
                      ? "ring-1 ring-red-600 rounded-md"
                      : ""
                  }`}
                >
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Long Description
                  </label>
                  <ReactQuill
                    theme="snow"
                    value={formData.longDescription}
                    onChange={(content) =>
                      setFormData((prev: any) => ({
                        ...prev,
                        longDescription: content,
                      }))
                    }
                    modules={quillModulesLong}
                    formats={quillFormats}
                    placeholder="Detailed specs, care instructions, materials, FAQs…"
                    className="h-100 mb-10"
                  />
                </div>
                {errors.longDescription && (
                  <p className="text-red-600 sm:col-span-2">
                    {errors.longDescription}
                  </p>
                )}

                {!isEditMode ? (
                  <>
                    <div className="relative">
                      <select
                        name="category"
                        className={`input-primary w-full pr-10 ${
                          errors.category ? "border-red-600" : ""
                        } custom-select`}
                        value={formData.category}
                        onChange={(e) => {
                          const selectedId = e.target.value;
                          setFormData((prev: any) => ({
                            ...prev,
                            category: selectedId,
                            subcategory: "",
                          }));
                          setSelectedCategories([selectedId]);
                        }}
                      >
                        <option value="">Select Category</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                      <svg
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>

                    <div className="relative">
                      <select
                        name="subcategory"
                        className={`input-primary w-full pr-10 ${
                          errors.subcategory ? "border-red-600" : ""
                        } custom-select`}
                        value={formData.subcategory}
                        onChange={(e) => {
                          const subId = e.target.value;
                          setFormData((prev: any) => ({
                            ...prev,
                            subcategory: subId,
                          }));
                          if (!formData.category) {
                            const selectedSub = subcategories.find(
                              (s) => s.id?.toString() === subId?.toString()
                            );
                            if (
                              selectedSub &&
                              selectedSub.categories?.length > 0
                            ) {
                              const matchedCatIds = selectedSub.categories
                                .map(
                                  (catName: string) =>
                                    categories.find((c) => c.name === catName)
                                      ?.id
                                )
                                .filter(Boolean);
                              setSelectedCategories(matchedCatIds);
                              setFormData((prev: any) => ({
                                ...prev,
                                category: matchedCatIds[0] || "",
                              }));
                            }
                          }
                        }}
                        required
                      >
                        <option value="">Select Subcategory</option>
                        {filteredSubcategories.map((sub: any) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name}
                          </option>
                        ))}
                      </select>
                      <svg
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      className="input-primary bg-gray-100 cursor-not-allowed"
                      value={categoryName}
                      readOnly
                      aria-label="Category (locked in edit mode)"
                    />
                    <input
                      type="text"
                      className="input-primary bg-gray-100 cursor-not-allowed"
                      value={subcategoryName}
                      readOnly
                      aria-label="Subcategory (locked in edit mode)"
                    />
                  </>
                )}

                {errors.subcategory && (
                  <p className="text-red-600 sm:col-span-2">
                    {errors.subcategory}
                  </p>
                )}

                <input
                  name="brand"
                  type="text"
                  placeholder="Brand / Vendor"
                  className={`input-primary ${
                    errors.brand ? "border-red-600" : ""
                  }`}
                  value={formData.brand}
                  onChange={handleChange}
                  required
                />
                {errors.brand && (
                  <p className="text-red-600 sm:col-span-2">{errors.brand}</p>
                )}

                <div className="relative">
                  <select
                    name="rating"
                    className="input-primary w-full pr-10 custom-select"
                    value={formData.rating}
                    onChange={(e) =>
                      setFormData((p: any) => ({
                        ...p,
                        rating: e.target.value,
                      }))
                    }
                  >
                    <option value="">Select Rating</option>
                    <option value="5">5.0</option>
                    <option value="4.5">4.5</option>
                    <option value="4">4.0</option>
                    <option value="3.5">3.5</option>
                    <option value="3">3.0</option>
                    <option value="2.5">2.5</option>
                    <option value="2">2.0</option>
                    <option value="1.5">1.5</option>
                    <option value="1">1.0</option>
                    <option value="0.5">0.5</option>
                    <option value="0">0</option>
                  </select>
                  <svg
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>

                <input
                  name="ratingCount"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Rating Count"
                  className="input-primary"
                  value={formData.ratingCount}
                  onChange={(e) =>
                    setFormData((p: any) => ({
                      ...p,
                      ratingCount:
                        e.target.value === ""
                          ? ""
                          : String(Math.max(0, Number(e.target.value))),
                    }))
                  }
                />
              </div>
            </section>

            {/* Images & Media */}
            <section>
              <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 border-b border-gray-200 pb-2 text-[#8B1C1C]">
                Images & Media
              </h3>
              <div className="grid gap-4 sm:gap-6">
                <div>
                  <label
                    htmlFor="file-upload"
                    className="ml-5 btn-primary inline-block cursor-pointer text-center"
                  >
                    Choose Image(s)
                  </label>
                  <input
                    id="file-upload"
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {/* Legacy field retained (fallback); per-image alt lives in the popup now */}
                <input
                  name="imageAlt"
                  type="text"
                  placeholder="Default image alt text (fallback)"
                  className={`input-primary ${
                    errors.imageAlt ? "border-red-600" : ""
                  }`}
                  value={formData.imageAlt}
                  onChange={handleChange}
                />
                {errors.imageAlt && (
                  <p className="text-red-600">{errors.imageAlt}</p>
                )}

                <input
                  name="videoUrl"
                  type="url"
                  placeholder="Optional video or 360° view embed"
                  className="input-primary"
                  value={formData.videoUrl}
                  onChange={handleChange}
                />
              </div>
            </section>

            {/* SEO & Metadata */}
            <section>
              <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 border-b border-gray-200 pb-2 text-[#8B1C1C]">
                SEO & Metadata
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:gap-6">
                <input
                  name="metaTitle"
                  type="text"
                  placeholder="Meta Title"
                  className="input-primary"
                  value={formData.metaTitle}
                  onChange={handleChange}
                />
                <textarea
                  name="metaDescription"
                  placeholder="Meta Description"
                  className="input-primary h-20 resize-y"
                  value={formData.metaDescription}
                  onChange={handleChange}
                />
                <input
                  name="metaKeywords"
                  type="text"
                  placeholder="Meta Keywords (comma-separated)"
                  className="input-primary"
                  value={tempMetaKeywords}
                  onChange={(e) => setTempMetaKeywords(e.target.value)}
                />
                <input
                  name="ogTitle"
                  type="text"
                  placeholder="Open Graph Title"
                  className="input-primary"
                  value={formData.ogTitle}
                  onChange={handleChange}
                />
                <textarea
                  name="ogDescription"
                  placeholder="Open Graph Description"
                  className="input-primary h-20 resize-y"
                  value={formData.ogDescription}
                  onChange={handleChange}
                />
                <input
                  name="ogImage"
                  type="url"
                  placeholder="Open Graph Image URL"
                  className="input-primary"
                  value={formData.ogImage}
                  onChange={handleChange}
                />
                <input
                  name="canonicalUrl"
                  type="url"
                  placeholder="Canonical URL"
                  className="input-primary"
                  value={formData.canonicalUrl}
                  onChange={handleChange}
                />
                <textarea
                  name="jsonLdSchema"
                  placeholder="JSON-LD Schema (Structured Data)"
                  className="input-primary h-24 resize-y font-mono text-sm"
                  value={formData.jsonLdSchema}
                  onChange={handleChange}
                />
              </div>
            </section>

            {/* Pricing */}
            <section>
              <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 border-b border-gray-200 pb-2 text-[#8B1C1C]">
                Pricing
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <input
                  name="normalPrice"
                  type="number"
                  placeholder="Normal Price"
                  className="input-primary"
                  value={formData.normalPrice}
                  onChange={handleChange}
                />
                <input
                  name="discountedPrice"
                  type="number"
                  placeholder="Discounted Price"
                  className="input-primary"
                  value={formData.discountedPrice}
                  onChange={handleChange}
                />
                <input
                  name="taxRate"
                  type="number"
                  placeholder="Tax Rate (%)"
                  className="input-primary"
                  value={formData.taxRate}
                  onChange={handleChange}
                />
                <input
                  name="priceCalculator"
                  type="text"
                  placeholder="Price Calculator"
                  className="input-primary"
                  value={formData.priceCalculator}
                  onChange={handleChange}
                />
              </div>
            </section>

            {/* Inventory */}
            <section>
              <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 border-b border-gray-200 pb-2 text-[#8B1C1C]">
                Inventory
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                <input
                  name="stockQuantity"
                  type="number"
                  placeholder="Stock Quantity"
                  className="input-primary"
                  value={formData.stockQuantity}
                  onChange={handleChange}
                />
                <input
                  name="lowStockAlert"
                  type="number"
                  placeholder="Low Stock Alert"
                  className="input-primary"
                  value={formData.lowStockAlert}
                  onChange={handleChange}
                />
                <input
                  name="stockStatus"
                  type="text"
                  placeholder="Stock Status"
                  className="input-primary"
                  value={formData.stockStatus}
                  onChange={handleChange}
                />
              </div>
            </section>

            {/* Product Variations */}
            <section>
              <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 border-b border-gray-200 pb-2 text-[#8B1C1C]">
                Product Variations
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <input
                  name="size"
                  type="text"
                  placeholder="Enter sizes (comma-separated)"
                  className="input-primary"
                  value={tempSizes}
                  onChange={(e) => setTempSizes(e.target.value)}
                />
                <input
                  name="colorVariants"
                  type="text"
                  placeholder="Enter color variants (comma-separated)"
                  className="input-primary"
                  value={tempColorVariants}
                  onChange={(e) => setTempColorVariants(e.target.value)}
                />
                <input
                  name="materialType"
                  type="text"
                  placeholder="Enter material types (comma-separated)"
                  className="input-primary"
                  value={tempMaterialType}
                  onChange={(e) => setTempMaterialType(e.target.value)}
                />
                <input
                  name="fabricFinish"
                  type="text"
                  placeholder="Fabric Finish"
                  className="input-primary"
                  value={formData.fabricFinish}
                  onChange={handleChange}
                />
                <div className="relative">
                  <select
                    name="printingMethod"
                    className="input-primary w-full pr-10 custom-select"
                    value={formData.printingMethod}
                    onChange={handleChange}
                  >
                    <option value="">Select Printing Method</option>
                    {printingMethods.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
                <input
                  name="addOnOptions"
                  type="text"
                  placeholder="Add-On Options (comma-separated)"
                  className="input-primary"
                  value={tempAddOnOptions}
                  onChange={(e) => setTempAddOnOptions(e.target.value)}
                />
                <input
                  name="variantCombinations"
                  type="text"
                  placeholder='Use format: "Desc::Price | Desc2::Price2"'
                  className="input-primary"
                  value={tempVariantCombinations}
                  onChange={(e) => setTempVariantCombinations(e.target.value)}
                />
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg sm:text-xl font-semibold border-b border-gray-200 pb-2 text-[#8B1C1C] flex-1">
                  Category Attributes
                </h3>
                {isLoadingLibraryAttributes && (
                  <span className="text-xs text-gray-500 animate-pulse">
                    Loading…
                  </span>
                )}
              </div>

              {activeSubcategoryIds.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-4 py-6 text-center text-sm text-gray-500">
                  Select a category and subcategory to view predefined attribute
                  options.
                </div>
              ) : libraryAttributes.length === 0 &&
                !isLoadingLibraryAttributes ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-4 py-6 text-center text-sm text-gray-500">
                  {libraryAttributesError ||
                    "No predefined attributes were found for the selected subcategory."}
                </div>
              ) : (
                <>
                  {libraryAttributesError && (
                    <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs text-yellow-800">
                      {libraryAttributesError}
                    </div>
                  )}
                  {libraryAttributes.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-4 py-6 text-center text-sm text-gray-500">
                      Loading attribute options…
                    </div>
                  ) : (
                    <>
                      <p className="mb-4 text-xs text-gray-500">
                        Toggle an option to add it to the Custom Attributes
                        section below for further editing.
                      </p>
                      <div className="space-y-6">
                        {libraryAttributes.map((attr, attrIndex) => {
                          const attrKey = getAttributeKey(attr);
                          const fullySelected =
                            isLibraryAttributeFullySelected(attr);
                          const partiallySelected =
                            isLibraryAttributePartiallySelected(attr);
                          const attributeContainerClasses = [
                            "space-y-3 rounded-xl border border-gray-200 bg-white p-4 transition hover:border-gray-300",
                          ];
                          if (fullySelected) {
                            attributeContainerClasses.push(
                              "border-gray-400 bg-gray-50 shadow-sm"
                            );
                          } else if (partiallySelected) {
                            attributeContainerClasses.push(
                              "border-gray-300 bg-gray-50"
                            );
                          }

                          return (
                            <div
                              key={
                                attrKey ||
                                attr.id ||
                                attr.name ||
                                `attr-${attrIndex}`
                              }
                              className={attributeContainerClasses.join(" ")}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 text-[#8B1C1C] focus:ring-[#8B1C1C]"
                                    checked={fullySelected}
                                    ref={(el) => {
                                      if (el)
                                        el.indeterminate =
                                          !fullySelected && partiallySelected;
                                    }}
                                    onChange={(e) =>
                                      handleLibraryAttributeToggle(
                                        attr,
                                        e.target.checked
                                      )
                                    }
                                  />
                                  <span className="break-words leading-snug text-gray-900">
                                    {attr.name}
                                  </span>
                                </label>
                                {attr.options?.length ? (
                                  <span className="text-xs text-gray-400">
                                    {attr.options.length} option
                                    {attr.options.length === 1 ? "" : "s"}
                                  </span>
                                ) : null}
                              </div>
                              {attr.options.length === 0 ? (
                                <p className="text-xs text-gray-500">
                                  No options configured for this attribute.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  {attr.options.map((opt, optIndex) => {
                                    const checked = isLibraryOptionSelected(
                                      attr,
                                      opt
                                    );
                                    const priceDeltaValue =
                                      typeof opt.price_delta === "number" &&
                                      !Number.isNaN(opt.price_delta) &&
                                      opt.price_delta !== 0
                                        ? opt.price_delta
                                        : null;
                                    const optionClasses = [
                                      "flex h-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition focus-within:border-gray-400 focus-within:ring-2 focus-within:ring-gray-200",
                                      checked
                                        ? "border-gray-400 bg-gray-50 shadow-sm"
                                        : "hover:border-gray-300 hover:bg-gray-50",
                                    ].join(" ");
                                    const priceText =
                                      priceDeltaValue !== null
                                        ? formatPriceDelta(priceDeltaValue)
                                        : null;
                                    const priceColor =
                                      priceDeltaValue !== null
                                        ? priceDeltaValue > 0
                                          ? "text-green-600"
                                          : "text-red-600"
                                        : "";
                                    const optionImageSrc =
                                      opt._image_preview ||
                                      (opt.image
                                        ? urlForDisplay(opt.image)
                                        : null);

                                    return (
                                      <label
                                        key={`${
                                          attrKey ||
                                          attr.id ||
                                          attr.name ||
                                          `attr-${attrIndex}`
                                        }:${
                                          getOptionKey(opt) ||
                                          opt.id ||
                                          opt.label ||
                                          `opt-${optIndex}`
                                        }`}
                                        className={`${optionClasses} cursor-pointer`}
                                      >
                                        <div className="flex flex-1 items-start gap-3">
                                          <div className="flex-shrink-0 overflow-hidden rounded-md border border-gray-200">
                                            {optionImageSrc ? (
                                              <img
                                                src={optionImageSrc}
                                                alt={opt.label || "Option"}
                                                className="h-16 w-16 object-cover"
                                              />
                                            ) : (
                                              <div className="flex h-16 w-16 items-center justify-center border border-dashed border-gray-200 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
                                                No Image
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex min-w-0 flex-1 flex-col">
                                            <span className="break-words text-sm font-medium leading-snug text-gray-800">
                                              {opt.label || "Option"}
                                            </span>

                                            {priceText && (
                                              <span
                                                className={`mt-1 text-xs sm:text-sm font-semibold leading-tight ${priceColor} whitespace-nowrap`}
                                              >
                                                {priceText}
                                              </span>
                                            )}

                                            {/* Description preview (text-only, safely stripped) */}
                                            {(() => {
                                              const descText = stripHtmlToText(
                                                opt.description || ""
                                              );
                                              return descText ? (
                                                <span
                                                  className="mt-1 text-xs text-gray-600"
                                                  style={{
                                                    display: "-webkit-box",
                                                    WebkitLineClamp: 3,
                                                    WebkitBoxOrient: "vertical",
                                                    overflow: "hidden",
                                                  }}
                                                  title={descText} // full text on hover
                                                >
                                                  {descText}
                                                </span>
                                              ) : null;
                                            })()}
                                          </div>
                                        </div>
                                        <input
                                          type="checkbox"
                                          className="h-4 w-4 shrink-0 text-[#8B1C1C] focus:ring-[#8B1C1C]"
                                          checked={checked}
                                          onChange={(e) =>
                                            handleLibraryOptionToggle(
                                              attr,
                                              opt,
                                              e.target.checked
                                            )
                                          }
                                        />
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
            </section>

            {/* Custom Attributes */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg sm:text-xl font-semibold border-b border-gray-200 pb-2 text-[#8B1C1C] flex-1">
                  Custom Attributes
                </h3>
                <button
                  type="button"
                  onClick={addAttribute}
                  className="btn-primary text-xs px-3 py-2 flex items-center gap-2 me-1"
                >
                  <span className="text-sm leading-none">+</span>
                  Add Attribute
                </button>
              </div>

              <div className="space-y-6">
                {customAttributes.length === 0 && (
                  <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50/50">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                    </div>
                    <p className="text-gray-500 text-sm">
                      No custom attributes yet. Click "Add Attribute" to create
                      one.
                    </p>
                  </div>
                )}

                {customAttributes.map((attr, attrIndex) => (
                  <div
                    key={attr.id}
                    className="border-2 border-gray-200 rounded-2xl overflow-hidden shadow-sm bg-white"
                  >
                    {/* Attribute Header */}
                    <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-4 border-b border-gray-200">
                      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-8 h-8 bg-[#8B1C1C] text-white rounded-full flex items-center justify-center text-sm font-semibold">
                            {attrIndex + 1}
                          </div>
                          <input
                            type="text"
                            className="input-primary flex-1 bg-white"
                            placeholder="Attribute name (e.g., Size, Color, Print Type)"
                            value={attr.name}
                            onChange={(e) =>
                              updateAttribute(attr.id, { name: e.target.value })
                            }
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAttribute(attr.id)}
                          className="btn-primary bg-red-600 hover:bg-red-700 text-xs px-2 py-1 w-full sm:w-auto"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {/* Attribute Options */}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-medium text-gray-700 text-sm">
                          Options ({attr.options.length})
                        </h4>
                        <button
                          type="button"
                          onClick={() => addOption(attr.id)}
                          className="btn-primary bg-green-600 hover:bg-green-700 text-sm px-3 py-2 flex items-center gap-1"
                        >
                          <span className="text-sm">+</span>
                          Add Option
                        </button>
                      </div>

                      <div className="space-y-4">
                        {attr.options.map((opt, optIndex) => (
                          <div
                            key={opt.id}
                            className="border border-gray-200 rounded-xl p-4 bg-gray-50/30 hover:bg-gray-50/50 transition-colors"
                          >
                            {/* Option Header */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-1 rounded">
                                  Option {optIndex + 1}
                                </span>
                                {opt.is_default && (
                                  <span className="text-xs font-medium text-[#8B1C1C] bg-red-100 px-2 py-1 rounded">
                                    Default
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeOption(attr.id, opt.id)}
                                className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                title="Remove option"
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </button>
                            </div>

                            {/* Option Content */}
                            <div className="space-y-4">
                              <div className="flex items-start gap-4">
                                {/* Image section */}
                                <div className="space-y-2">
                                  <label className="block text-xs font-medium text-gray-600">
                                    Option Image
                                  </label>
                                  <div className="flex items-center gap-4">
                                    <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 overflow-hidden bg-white flex items-center justify-center shrink-0">
                                      {opt._image_preview ? (
                                        <img
                                          src={opt._image_preview}
                                          alt={opt.label || "option"}
                                          className="w-full h-full object-cover"
                                          onError={(e) => {
                                            (
                                              e.currentTarget as HTMLImageElement
                                            ).src = "/images/default.jpg";
                                          }}
                                        />
                                      ) : (
                                        <svg
                                          className="w-8 h-8 text-gray-300"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={1.5}
                                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                          />
                                        </svg>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-3 h-20">
                                      <label className="btn-primary cursor-pointer py-2 px-3 text-xs text-center">
                                        {opt._image_preview
                                          ? "Change"
                                          : "Upload"}
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="hidden"
                                          onChange={(e) => {
                                            const f =
                                              (e.target.files &&
                                                e.target.files[0]) ||
                                              null;
                                            handleOptionImageChange(
                                              attr.id,
                                              opt.id,
                                              f
                                            );
                                          }}
                                        />
                                      </label>

                                      {opt._image_preview && (
                                        <button
                                          type="button"
                                          className="text-xs text-red-600 hover:text-red-700 underline"
                                          onClick={() =>
                                            handleOptionImageChange(
                                              attr.id,
                                              opt.id,
                                              null
                                            )
                                          }
                                        >
                                          Remove
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Default radio */}
                                <div className="flex-1 flex justify-end">
                                  <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <div className="relative">
                                      <input
                                        type="radio"
                                        name={`default-${attr.id}`}
                                        checked={!!opt.is_default}
                                        onChange={() =>
                                          setDefaultOption(attr.id, opt.id)
                                        }
                                        className="sr-only"
                                      />
                                      <div
                                        className={`w-4 h-4 rounded-full border-2 transition-colors ${
                                          opt.is_default
                                            ? "border-[#8B1C1C] bg-[#8B1C1C]"
                                            : "border-gray-300 bg-white"
                                        }`}
                                      >
                                        {opt.is_default && (
                                          <div className="w-full h-full flex items-center justify-center">
                                            <div className="w-1.5 h-1.5 bg-white rounded-full" />
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <span className="text-xs font-medium text-gray-700">
                                      Set as default
                                    </span>
                                  </label>
                                </div>
                              </div>

                              {/* Label & price */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Option Label *
                                  </label>
                                  <input
                                    type="text"
                                    className="input-primary w-full"
                                    placeholder="e.g., Single Sided, Large, Red"
                                    value={opt.label}
                                    onChange={(e) =>
                                      updateOption(attr.id, opt.id, {
                                        label: e.target.value,
                                      })
                                    }
                                  />
                                </div>

                                <div>
                                  {!opt.is_default ? (
                                    <>
                                      <label className="block text-xs font-medium text-gray-600 mb-1">
                                        Price Adjustment (AED)
                                      </label>
                                      <div className="relative">
                                        <input
                                          type="number"
                                          step="0.01"
                                          className="input-primary w-full pl-8"
                                          placeholder="0.00"
                                          value={opt.price_delta}
                                          onChange={(e) =>
                                            updateOption(attr.id, opt.id, {
                                              price_delta: parseFloat(
                                                e.target.value || ""
                                              ),
                                            })
                                          }
                                        />
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                                          +
                                        </span>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <label className="block text-xs font-medium text-gray-600 mb-1">
                                        Price Adjustment
                                      </label>
                                      <div className="input-primary bg-gray-100 text-gray-500 flex items-center justify-center">
                                        No adjustment
                                      </div>
                                    </>
                                  )}
                                </div>

                                <div></div>
                              </div>
                            </div>
                            <label className="block text-xs font-medium text-gray-600 mb-2">
                              Option Description (optional)
                            </label>
                            <ReactQuill
                              theme="snow"
                              value={opt.description || ""}
                              onChange={(content) =>
                                updateOption(attr.id, opt.id, {
                                  description: content,
                                })
                              }
                              modules={quillModules}
                              formats={quillFormats}
                              placeholder={`Describe ${
                                opt.label || "this option"
                              }…`}
                              className="w-full h-30 mb-18"
                            />
                          </div>
                        ))}

                        {attr.options.length === 0 && (
                          <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg bg-gray-50/50">
                            <p className="text-gray-500 text-sm">
                              No options yet. Click "Add Option" to create the
                              first one.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Additional Metadata */}
            <section>
              <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 border-b border-gray-200 pb-2 text-[#8B1C1C]">
                Additional Metadata
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <input
                  name="customTags"
                  type="text"
                  placeholder="Custom Tags (comma-separated)"
                  className="input-primary"
                  value={tempCustomTags}
                  onChange={(e) => setTempCustomTags(e.target.value)}
                />
                <input
                  name="groupedFilters"
                  type="text"
                  placeholder="Grouped Filters (comma-separated)"
                  className="input-primary"
                  value={tempGroupedFilters}
                  onChange={(e) => setTempGroupedFilters(e.target.value)}
                />
              </div>
            </section>

            {/* Shipping & Processing */}
            <section>
              <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 border-b border-gray-200 pb-2 text-[#8B1C1C]">
                Shipping & Processing
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <input
                  name="processingTime"
                  type="text"
                  placeholder="Processing Time"
                  className="input-primary"
                  value={formData.processingTime}
                  onChange={handleChange}
                />
                <input
                  name="shippingClass"
                  type="text"
                  placeholder="Enter shipping classes (comma-separated)"
                  className="input-primary"
                  value={tempShippingClass}
                  onChange={(e) => setTempShippingClass(e.target.value)}
                />
              </div>
            </section>
          </form>
          <div className="flex justify-center pt-2 mb-4">
            <button
              type="button"
              onClick={handleSubmit as any}
              className="btn-primary"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Image Details Popup */}
      {isPreviewOpen && previewImages.length > 0 && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          onClick={closePreview}
        >
          {/* BONUS: fixed malformed width class */}
          <div
            className="relative max-w-5xl w-[92vw] h-[86vh] bg-white rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between px-4 py-3 border-b">
              <div className="text-sm text-gray-600">
                Image {activePreviewIndex + 1} / {previewImages.length}
                {previewImages[activePreviewIndex].is_primary === true && (
                  <span className="ml-2 text-xs text-white bg-[#8B1C1C] px-2 py-0.5 rounded">
                    Thumbnail
                  </span>
                )}
              </div>
              <button
                onClick={closePreview}
                aria-label="Close preview"
                className="text-gray-700 text-3xl leading-none"
              >
                ×
              </button>
            </header>

            <div className="flex flex-col md:flex-row h-[calc(86vh-56px)]">
              <div className="flex-1 bg-gray-50 flex items-center justify-center p-3 relative select-none">
                {/* Prev / Next overlay arrows */}
                {previewImages.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        prevPreview();
                      }}
                      aria-label="Previous image"
                      className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-10 w-10 md:h-12 md:w-12 rounded-full border border-gray-200 bg-white/80 backdrop-blur-sm shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#8B1C1C] flex items-center justify-center"
                    >
                      {/* Left chevron */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="h-5 w-5 md:h-6 md:w-6 text-gray-800"
                      >
                        <path
                          fillRule="evenodd"
                          d="M15.53 4.47a.75.75 0 0 1 0 1.06L9.06 12l6.47 6.47a.75.75 0 1 1-1.06 1.06l-7-7a.75.75 0 0 1 0-1.06l7-7a.75.75 0 0 1 1.06 0Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        nextPreview();
                      }}
                      aria-label="Next image"
                      className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 h-10 w-10 md:h-12 md:w-12 rounded-full border border-gray-200 bg-white/80 backdrop-blur-sm shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#8B1C1C] flex items-center justify-center"
                    >
                      {/* Right chevron */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="h-5 w-5 md:h-6 md:w-6 text-gray-800"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.47 19.53a.75.75 0 0 1 0-1.06L14.94 12 8.47 5.53a.75.75 0 0 1 1.06-1.06l7 7a.75.75 0 0 1 0 1.06l-7 7a.75.75 0 0 1-1.06 0Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </>
                )}

                <img
                  src={previewImages[activePreviewIndex].src}
                  alt={
                    previewImages[activePreviewIndex].alt ||
                    `Preview ${activePreviewIndex + 1}`
                  }
                  className="max-w-full max-h-full object-contain rounded-md pointer-events-none"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      "/images/default.jpg";
                  }}
                />
              </div>

              <div className="w-full md:w-[400px] border-t md:border-t-0 md:border-l p-4 space-y-4 overflow-y-auto">
                <h4 className="text-base font-semibold text-gray-800">
                  Image Details
                </h4>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Image Alt Text
                  </label>
                  <input
                    type="text"
                    className="input-primary w-full"
                    placeholder="Describe this image"
                    value={previewImages[activePreviewIndex].alt || ""}
                    onChange={(e) =>
                      updateActiveImageMeta({ alt: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Image Caption
                  </label>
                  <textarea
                    className="input-primary w-full h-20 resize-y"
                    placeholder="Optional caption"
                    value={previewImages[activePreviewIndex].caption || ""}
                    onChange={(e) =>
                      updateActiveImageMeta({ caption: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tags
                  </label>

                  <div className="input-primary w-full min-h-[44px] flex flex-wrap items-center gap-2 py-2">
                    {(previewImages[activePreviewIndex].tags || []).map(
                      (t, i) => (
                        <span
                          key={`${t}:${i}`}
                          className="inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs bg-gray-100 border border-gray-200"
                        >
                          {t}
                          <button
                            type="button"
                            className="text-gray-500 hover:text-red-600"
                            onClick={() => removeTagAt(i)}
                            aria-label={`Remove ${t}`}
                            title="Remove"
                          >
                            ×
                          </button>
                        </span>
                      )
                    )}

                    <input
                      type="text"
                      className="flex-1 min-w-[120px] outline-none bg-transparent placeholder:text-gray-400"
                      placeholder={
                        (previewImages[activePreviewIndex].tags || [])
                          .length === 0
                          ? "Type and press comma/Enter…"
                          : ""
                      }
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      onPaste={handleTagPaste}
                      onBlur={() => {
                        if (tagDraft.trim()) addTagsFromString(tagDraft);
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveAsThumbnail();
                        closePreview();
                      }}
                      disabled={
                        isSettingThumb ||
                        !isEditMode ||
                        !previewImages[activePreviewIndex].image_id
                      }
                      className={`px-3 py-2 rounded-md text-sm ${
                        isSettingThumb ||
                        !isEditMode ||
                        !previewImages[activePreviewIndex].image_id
                          ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                          : "bg-[#8B1C1C] text-white hover:opacity-90"
                      }`}
                      title={
                        !isEditMode
                          ? "Save the product first."
                          : !previewImages[activePreviewIndex].image_id
                          ? "Image must be saved on the product before setting thumbnail."
                          : "Set this image as the product thumbnail"
                      }
                    >
                      {isSettingThumb ? "Setting…" : "Set as thumbnail"}
                    </button>
                  </div>
                </div>
                <button
                  onClick={closePreview}
                  type="button"
                  className="btn-primary ml-20 mt-5 px-4 py-2"
                >
                  Save & Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .custom-select {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          background: transparent;
        }
        .custom-select:focus + svg {
          color: #8b1c1c;
        }
      `}</style>
    </div>
  );
};

export default Modal;
