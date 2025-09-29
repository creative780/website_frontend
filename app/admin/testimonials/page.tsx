"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import AdminSidebar from "../components/AdminSideBar";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import { toast } from "react-hot-toast";
import { FiSave, FiTrash2 } from "react-icons/fi";
import { MdReviews } from "react-icons/md";
import { FaStar } from "react-icons/fa";
import dynamic from "next/dynamic";
import { API_BASE_URL } from "../../utils/api";

/* ================= Frontend key helper (no preflight) ================= */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  return {
    ...init,
    headers,
    cache: "no-store",
    credentials: "omit",
    mode: "cors",
  };
};

/* ================= Lazy table (unchanged UI) ================= */
const TestimonialsTable = dynamic(() => import("../testimonialsTable/page"), {
  ssr: false,
  // Give screen readers a hint while it loads
  loading: () => (
    <div role="status" aria-live="polite" className="text-sm text-gray-600">
      Loading testimonials table…
    </div>
  ),
});

/* ================= Types ================= */
type Testimonial = {
  id?: string | number;
  name: string;
  role: string;
  image: string;
  rating: number;
  content: string;
};

const createEmptyTestimonial = (): Testimonial => ({
  name: "",
  role: "",
  image: "",
  rating: 5,
  content: "",
});

/* ================= Page ================= */
export default function TestimonialsPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([
    createEmptyTestimonial(),
  ]);
  const [showBlogTable, setShowBlogTable] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const captionId = useId();

  /* ---------- Fetch on mount (abort-safe, tolerant payload) ---------- */
  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/show-testimonials/?all=1&_=${Date.now()}`,
          withFrontendKey({ method: "GET", signal: ac.signal as any })
        );
        if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
        const data = await res.json().catch(() => ({} as any));

        const list: any[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
          ? data.results
          : data?.data || [];

        const normalized: Testimonial[] =
          list.length > 0
            ? list.map((t: any) => ({
                id: t.id ?? t._id ?? t.testimonial_id ?? undefined,
                name: t.name ?? "",
                role: t.role ?? "",
                image: t.image ?? t.image_url ?? "",
                rating: clampRating(Number(t.rating ?? 5)),
                content: t.content ?? "",
              }))
            : [createEmptyTestimonial()];

        setTestimonials(normalized);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          toast.error("Failed to load testimonials from server.");
          setTestimonials([createEmptyTestimonial()]);
        }
      } finally {
        setIsLoading(false);
      }
    })();

    return () => ac.abort();
  }, []);

  /* ---------- Handlers (memoized to avoid re-renders) ---------- */
  const handleAddTestimonial = useCallback(() => {
    setTestimonials((prev) => [...prev, createEmptyTestimonial()]);
  }, []);

  const handleDelete = useCallback(
    async (index: number) => {
      const item = testimonials[index];

      // Optimistic remove
      setTestimonials((prev) => prev.filter((_, i) => i !== index));

      if (item?.id != null && item?.id !== "") {
        try {
          const url = `${API_BASE_URL}/api/edit-testimonials/?id=${encodeURIComponent(
            String(item.id)
          )}`;
          const res = await fetch(url, withFrontendKey({ method: "DELETE" }));
          if (!res.ok) throw new Error(`Delete failed (${res.status})`);
          toast.success("🗑️ Testimonial deleted.");
        } catch {
          toast.error("Delete failed on server. Refresh to re-sync.");
        }
      } else {
        toast.success("Removed unsaved row.");
      }
    },
    [testimonials]
  );

  const handleChange = useCallback(
    (index: number, key: keyof Testimonial, value: any) => {
      setTestimonials((prev) => {
        const copy = [...prev];
        const updated: Testimonial = { ...copy[index] };
        if (key === "rating") {
          updated.rating = clampRating(Number(value));
        } else {
          (updated as any)[key] = value;
        }
        copy[index] = updated;
        return copy;
      });
    },
    []
  );

  const refetchServerTruth = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/show-testimonials/?all=1&_=${Date.now()}`,
        withFrontendKey({ method: "GET" })
      );
      if (!res.ok) return;
      const data = await res.json().catch(() => ({} as any));
      const list: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
        ? data.results
        : data?.data || [];
      const normalized: Testimonial[] =
        list.length > 0
          ? list.map((t: any) => ({
              id: t.id ?? t._id ?? t.testimonial_id ?? undefined,
              name: t.name ?? "",
              role: t.role ?? "",
              image: t.image ?? t.image_url ?? "",
              rating: clampRating(Number(t.rating ?? 5)),
              content: t.content ?? "",
            }))
          : [createEmptyTestimonial()];
      setTestimonials(normalized);
    } catch {
      /* ignore */
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);

    // Basic validation — avoid empty rows being sent
    const rows = testimonials.filter(
      (t) =>
        t.name.trim() ||
        t.role.trim() ||
        t.content.trim() ||
        (t.image && t.image.trim())
    );

    const toastId = toast.loading(
      `Saving ${rows.length} testimonial${rows.length === 1 ? "" : "s"}...`
    );

    try {
      await Promise.all(
        rows.map(async (t) => {
          const isDataUrl =
            typeof t.image === "string" && t.image.startsWith("data:image/");
          const isHttpUrl =
            typeof t.image === "string" && /^https?:\/\//i.test(t.image);

          const payload: any = {
            id: t.id ?? undefined,
            name: t.name.trim(),
            role: t.role.trim(),
            rating: clampRating(Number(t.rating ?? 5)),
            content: t.content.trim(),
            status: "published",
          };

          if (isDataUrl) payload.image = t.image;
          else if (isHttpUrl) payload.image_url = t.image;

          const isUpdate =
            payload.id !== undefined && payload.id !== null && payload.id !== "";
          const url = `${API_BASE_URL}/api/${
            isUpdate ? "edit-testimonials" : "save-testimonials"
          }`;
          const method = isUpdate ? "PUT" : "POST";

          const res = await fetch(
            url,
            withFrontendKey({
              method,
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify(payload),
            })
          );

          if (!res.ok) throw new Error(`Row save failed (${res.status})`);

          // Try to reflect server-returned values (IDs/normalized URLs)
          try {
            const data = await res.json();
            const newId = data?.id ?? data?._id ?? data?.testimonial_id;
            const src = data?.image ?? data?.image_url;
            if (newId || src) {
              setTestimonials((prev) =>
                prev.map((row) =>
                  row === t
                    ? {
                        ...row,
                        id: newId ?? row.id,
                        image: src ?? row.image,
                      }
                    : row
                )
              );
            }
          } catch {
            /* ignore parse */
          }
        })
      );

      toast.success("✅ Save successful.");
      await refetchServerTruth();
    } catch {
      toast.error("⚠️ Save failed. Check inputs/server logs.");
    } finally {
      toast.dismiss(toastId);
      setIsSaving(false);
    }
  }, [isSaving, testimonials, refetchServerTruth]);

  /* ---------- Derived ---------- */
  const rows = useMemo(() => testimonials, [testimonials]);

  /* ========================= Render ========================= */
  return (
    <AdminAuthGuard>
      <div
        className="flex bg-gray-50 text-black"
        style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}
      >
        <aside className="w-64 hidden lg:block border-r border-gray-200 bg-white">
          <AdminSidebar />
        </aside>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 lg:py-10 min-h-screen">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <header className="mb-6 sm:mb-8 bg-gradient-to-r from-white via-[#f8f9fa] to-gray-100 p-4 sm:p-6 rounded-2xl shadow border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex gap-2 items-center flex-wrap">
                <h1 className="text-3xl font-bold text-[#891F1A] flex items-center gap-2">
                  <MdReviews className="text-4xl" aria-hidden="true" /> Testimonial Management (CMS)
                </h1>
                <button
                  type="button"
                  onClick={() => setShowBlogTable((v) => !v)}
                  className="ml-0 md:ml-8 bg-red-100 text-red-800 border border-red-300 rounded-lg px-4 py-2 text-sm hover:bg-red-200 transition"
                  aria-pressed={showBlogTable}
                  aria-controls="testimonials-table"
                >
                  {showBlogTable ? "Hide Testimonials Table" : "Show Testimonials Table"}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || isLoading}
                  className="flex items-center gap-2 bg-[#891F1A] hover:bg-[#6d1915] disabled:opacity-70 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm shadow transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#891F1A]"
                >
                  <FiSave className="text-lg" aria-hidden="true" />{" "}
                  {isSaving ? "Saving..." : "Save All"}
                </button>
              </div>
            </header>

            {/* Table (optional) */}
            {showBlogTable && (
              <section id="testimonials-table" className="mb-10" aria-live="polite">
                <TestimonialsTable />
              </section>
            )}

            {/* Editor list */}
            <section aria-describedby={captionId} className="space-y-6 sm:space-y-8">
              <p id={captionId} className="sr-only">
                Create, edit, or delete testimonial cards. All fields are editable.
              </p>

              {isLoading ? (
                <div className="text-sm text-gray-600">Loading testimonials…</div>
              ) : (
                rows.map((testimonial, index) => (
                  <TestimonialEditorRow
                    key={testimonial.id ?? `local-${index}`}
                    t={testimonial}
                    index={index}
                    onChange={handleChange}
                    onDelete={handleDelete}
                  />
                ))
              )}

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleAddTestimonial}
                  className="mt-6 bg-blue-100 text-blue-700 border border-blue-300 px-4 py-2 rounded-lg hover:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-400"
                >
                  + Add New Testimonial
                </button>
              </div>
            </section>
          </div>
        </main>
      </div>
    </AdminAuthGuard>
  );
}

/* ================= Testimonial Row ================= */
function TestimonialEditorRow({
  t,
  index,
  onChange,
  onDelete,
}: {
  t: Testimonial;
  index: number;
  onChange: (idx: number, key: keyof Testimonial, value: any) => void;
  onDelete: (idx: number) => void;
}) {
  const nameId = useId();
  const roleId = useId();
  const imageId = useId();
  const ratingId = useId();
  const contentId = useId();

  return (
    <div className="md:grid md:grid-cols-2 gap-4 sm:gap-6 bg-white p-4 sm:p-6 rounded-xl shadow border flex flex-col">
      <div className="space-y-4">
        <InputField
          id={nameId}
          label="Customer Name"
          value={t.name}
          onChange={(e: any) => onChange(index, "name", e.target.value)}
        />
        <InputField
          id={roleId}
          label="Role / Designation"
          value={t.role}
          onChange={(e: any) => onChange(index, "role", e.target.value)}
        />
        <InputField
          id={imageId}
          label="Image URL (or data:image/* base64)"
          value={t.image}
          onChange={(e: any) => onChange(index, "image", e.target.value)}
          inputMode="url"
        />
        <InputField
          id={ratingId}
          label="Rating (1–5)"
          type="number"
          min={1}
          max={5}
          value={t.rating}
          onChange={(e: any) => onChange(index, "rating", e.target.value)}
        />
        <TextareaField
          id={contentId}
          label="Testimonial Content"
          value={t.content}
          onChange={(e: any) => onChange(index, "content", e.target.value)}
        />

        <button
          type="button"
          onClick={() => onDelete(index)}
          className="text-sm text-red-600 border border-red-300 hover:bg-red-100 rounded px-3 py-1 mt-2 inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-400"
          aria-label="Delete testimonial"
        >
          <FiTrash2 aria-hidden="true" /> Delete
        </button>
      </div>

      {/* Preview card */}
      <article className="border border-[#891F1A] rounded-xl p-4 bg-white shadow-sm mt-6 md:mt-0 flex flex-col relative">
        <figure className="absolute -top-8 left-4">
          {/* Using native <img> here keeps it simple inside admin. */}
          <img
            src={t.image || "/images/img1.jpg"}
            onError={(e) => ((e.currentTarget as HTMLImageElement).src = "/images/img1.jpg")}
            alt={t.name ? `${t.name} avatar` : "Avatar"}
            className="w-16 h-16 rounded-full border-2 border-[#891F1A] object-cover"
            width={64}
            height={64}
            loading="lazy"
          />
        </figure>

        <div className="pt-8 pl-4 pr-4">
          <div className="flex justify-end text-[#891F1A] mb-2" aria-label={`Rating: ${t.rating} out of 5`}>
            {Array.from({ length: clampRating(t.rating) }, (_, i) => (
              <FaStar key={i} aria-hidden="true" />
            ))}
          </div>
          <p className="text-sm text-gray-800 mb-2 leading-relaxed">
            {t.content || "This customer left a great review about your service!"}
          </p>
          <p className="font-bold text-[#891F1A] leading-tight">{t.name || "Customer Name"}</p>
          <p className="text-sm text-gray-500">{t.role || "Designation"}</p>
        </div>
      </article>
    </div>
  );
}

/* ================= Reusable fields (a11y-first) ================= */
function InputField({
  id,
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  min,
  max,
}: {
  id: string;
  label: string;
  value: any;
  onChange: (e: any) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        inputMode={inputMode}
        min={min}
        max={max}
        className="mt-1 w-full bg-white text-gray-800 border px-4 py-2 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#891F1A]/40 focus:border-[#891F1A]"
      />
    </div>
  );
}

function TextareaField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: any;
  onChange: (e: any) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={onChange}
        rows={3}
        className="mt-1 w-full bg-white text-gray-800 border px-4 py-2 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#891F1A]/40 focus:border-[#891F1A]"
      />
    </div>
  );
}

/* ================= Utils ================= */
function clampRating(n: number) {
  if (Number.isNaN(n)) return 5;
  return Math.max(1, Math.min(5, Math.round(n)));
}
