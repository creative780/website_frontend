"use client";

import { useState, useEffect } from "react";
import AdminSidebar from "../components/AdminSideBar";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import { toast } from "react-hot-toast";
import { FiSave, FiTrash2 } from "react-icons/fi";
import { MdReviews } from "react-icons/md";
import { FaStar } from "react-icons/fa";
import dynamic from "next/dynamic";
import { API_BASE_URL } from "../../utils/api";

// ===== Frontend key headers (as provided) =====
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

// Keep the table import as-is (no UI change)
const TestimonialsTable = dynamic(() => import("../testimonialsTable/page"), {
  ssr: false,
});

// ===== Types =====
type Testimonial = {
  id?: string | number;
  name: string;
  role: string;
  image: string;
  rating: number;
  content: string;
};

// Factory
const createEmptyTestimonial = (): Testimonial => ({
  name: "",
  role: "",
  image: "",
  rating: 5,
  content: "",
});

export default function TestimonialsPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([
    createEmptyTestimonial(),
  ]);
  const [showBlogTable, setShowBlogTable] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // ===== Read from backend on mount =====
  useEffect(() => {
    let cancelled = false;
    const fetchTestimonials = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/show-testimonials/?all=1`,
          withFrontendKey({ method: "GET" })
        );
        if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
        const data = await res.json();

        // Expecting either an array of testimonials or an object with a list field.
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
                image: t.image ?? "",
                rating: clampRating(Number(t.rating ?? 5)),
                content: t.content ?? "",
              }))
            : [createEmptyTestimonial()];

        if (!cancelled) setTestimonials(normalized);
      } catch (err: any) {
        if (!cancelled) {
          toast.error("Failed to load testimonials from server.");
          setTestimonials([createEmptyTestimonial()]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchTestimonials();
    return () => {
      cancelled = true;
    };
  }, []);

  // ===== UI event handlers (no UI changes) =====
  const handleAddTestimonial = () => {
    setTestimonials((prev) => [...prev, createEmptyTestimonial()]);
  };

  const handleDelete = async (index: number) => {
    const item = testimonials[index];
    // Optimistic UI removal
    setTestimonials((prev) => prev.filter((_, i) => i !== index));

    // If it exists on backend, try to delete
    if (item?.id != null && item?.id !== "") {
      try {
        const url = `${API_BASE_URL}/api/edit-testimonials/?id=${encodeURIComponent(
          String(item.id)
        )}`;
        const res = await fetch(url, withFrontendKey({ method: "DELETE" }));
        if (!res.ok) throw new Error(`Delete failed (${res.status})`);
        toast.success("🗑️ Testimonial deleted.");
      } catch (err: any) {
        toast.error("Delete failed on server. Refresh to re-sync.");
      }
    } else {
      toast.success("Removed unsaved row.");
    }
  };

  const handleChange = (index: number, key: keyof Testimonial, value: any) => {
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
  };

  const handleSave = async () => {
    setIsSaving(true);
    const toastId = toast.loading(
      `Saving ${testimonials.length} testimonial(s)...`
    );
    try {
      const ops = testimonials.map(async (t) => {
        const isDataUrl =
          typeof t.image === "string" && t.image.startsWith("data:image/");
        const isHttpUrl =
          typeof t.image === "string" && /^https?:\/\//i.test(t.image);

        const payload: any = {
          id: t.id ?? undefined,
          name: t.name,
          role: t.role,
          rating: t.rating,
          content: t.content,
          status: "published",
        };

        if (isDataUrl) {
          payload.image = t.image; // let backend decode & store
        } else if (isHttpUrl) {
          payload.image_url = t.image; // tell backend to reference external URL
        }
        // (If you later add a file picker, send multipart with `image` file)

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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        );
        if (!res.ok) throw new Error(`Row save failed (${res.status})`);

        try {
          const data = await res.json();
          const newId = data?.id ?? data?._id ?? data?.testimonial_id;
          if (newId) t.id = newId;
          // normalize image back to whatever server returns
          if (data?.image) t.image = data.image;
          else if (data?.image_url) t.image = data.image_url;
        } catch {}
      });

      await Promise.all(ops);
      toast.success("✅ Save successful.");
      // Re-fetch to reflect server truth (includes resolved image URL)
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/show-testimonials?all=1`,
          withFrontendKey({ method: "GET" })
        );
        if (res.ok) {
          const data = await res.json();
          const list: any[] = Array.isArray(data)
            ? data
            : Array.isArray(data?.results)
            ? data.results
            : data?.data || [];
          const normalized = list.length
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
        }
      } catch {}
    } catch (err: any) {
      toast.error("⚠️ Save failed. Check inputs/server logs.");
    } finally {
      toast.dismiss(toastId);
      setIsSaving(false);
    }
  };

  return (
    <AdminAuthGuard>
      <div className="flex">
        <AdminSidebar />
        <div className="flex-1 px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 lg:py-10 bg-gray-50 min-h-screen">
          <div className="max-w-6xl mx-auto">
            <div className="mb-6 sm:mb-8 bg-gradient-to-r from-white via-[#f8f9fa] to-gray-100 p-4 sm:p-6 rounded-2xl shadow border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex gap-2 items-center flex-wrap">
                <h1 className="text-3xl font-bold text-[#891F1A] flex items-center gap-2">
                  <MdReviews className="text-4xl" /> Testimonial Management
                  (CMS)
                </h1>
                <button
                  onClick={() => setShowBlogTable(!showBlogTable)}
                  className="ml-8 bg-red-100 text-red-800 border border-red-300 rounded-lg px-4 py-2 text-sm hover:bg-red-200 transition"
                >
                  {showBlogTable
                    ? "Hide Testimonials Table"
                    : "Show Testimonials Table"}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving || isLoading}
                  className="flex items-center gap-2 bg-[#891F1A] hover:bg-[#6d1915] disabled:opacity-70 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm shadow transition"
                >
                  <FiSave className="text-lg" />{" "}
                  {isSaving ? "Saving..." : "Save All"}
                </button>
              </div>
            </div>

            {showBlogTable && (
              <div className="mb-10">
                <TestimonialsTable />
              </div>
            )}

            <div className="space-y-6 sm:space-y-8">
              {isLoading ? (
                <div className="text-sm text-gray-600">
                  Loading testimonials…
                </div>
              ) : (
                testimonials.map((testimonial, index) => (
                  <div
                    key={testimonial.id ?? `local-${index}`}
                    className="md:grid md:grid-cols-2 gap-4 sm:gap-6 bg-white p-4 sm:p-6 rounded-xl shadow border flex flex-col"
                  >
                    <div className="space-y-4">
                      <InputField
                        label="Customer Name"
                        value={testimonial.name}
                        onChange={(e: any) =>
                          handleChange(index, "name", e.target.value)
                        }
                      />
                      <InputField
                        label="Role / Designation"
                        value={testimonial.role}
                        onChange={(e: any) =>
                          handleChange(index, "role", e.target.value)
                        }
                      />
                      <InputField
                        label="Image URL"
                        value={testimonial.image}
                        onChange={(e: any) =>
                          handleChange(index, "image", e.target.value)
                        }
                      />
                      <InputField
                        label="Rating (1-5)"
                        type="number"
                        value={testimonial.rating}
                        onChange={(e: any) =>
                          handleChange(
                            index,
                            "rating",
                            Math.max(1, Math.min(5, Number(e.target.value)))
                          )
                        }
                      />
                      <TextareaField
                        label="Testimonial Content"
                        value={testimonial.content}
                        onChange={(e: any) =>
                          handleChange(index, "content", e.target.value)
                        }
                      />
                      <button
                        onClick={() => handleDelete(index)}
                        className="text-sm text-red-600 border border-red-300 hover:bg-red-100 rounded px-3 py-1 mt-2 flex items-center gap-2"
                      >
                        <FiTrash2 /> Delete
                      </button>
                    </div>

                    <div className="border border-[#891F1A] rounded-xl p-4 bg-white shadow-sm mt-6 md:mt-0 flex flex-col relative">
                      <div className="absolute -top-8 left-4">
                        <img
                          src={testimonial.image || "/images/img1.jpg"}
                          onError={(e) =>
                            (e.currentTarget.src = "/images/img1.jpg")
                          }
                          alt="avatar"
                          className="w-16 h-16 rounded-full border-2 border-[#891F1A] object-cover"
                        />
                      </div>
                      <div className="pt-8 pl-4 pr-4">
                        <div className="flex justify-end text-[#891F1A] mb-2">
                          {Array.from(
                            { length: testimonial.rating },
                            (_, i) => (
                              <FaStar key={i} />
                            )
                          )}
                        </div>
                        <p className="text-sm text-gray-800 mb-2 leading-relaxed">
                          {testimonial.content ||
                            "This customer left a great review about your service!"}
                        </p>
                        <p className="font-bold text-[#891F1A] leading-tight">
                          {testimonial.name || "Customer Name"}
                        </p>
                        <p className="text-sm text-gray-500">
                          {testimonial.role || "Designation"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}

              <div className="text-center">
                <button
                  onClick={handleAddTestimonial}
                  className="mt-6 bg-blue-100 text-blue-700 border border-blue-300 px_4 py-2 rounded-lg hover:bg-blue-200"
                >
                  + Add New Testimonial
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminAuthGuard>
  );
}

// ===== Reusable fields (unchanged UI) =====
function InputField({ label, value, onChange, type = "text" }: any) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        className="mt-1 w-full bg-white text-gray-800 border px-4 py-2 rounded-md shadow-sm"
      />
    </div>
  );
}

function TextareaField({ label, value, onChange }: any) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <textarea
        value={value}
        onChange={onChange}
        rows={3}
        className="mt-1 w-full bg-white text-gray-800 border px-4 py-2 rounded-md shadow-sm"
      />
    </div>
  );
}

// ===== Utils =====
function clampRating(n: number) {
  if (Number.isNaN(n)) return 5;
  return Math.max(1, Math.min(5, Math.round(n)));
}
