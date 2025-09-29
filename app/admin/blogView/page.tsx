"use client";

import { useEffect, useMemo, useState, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import AdminSidebar from "../components/AdminSideBar";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { API_BASE_URL } from "../../utils/api";

/* ---------- FRONTEND KEY helper (avoid header when empty to reduce preflights) ---------- */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers, cache: "no-store", credentials: "omit", mode: "cors" };
};

/* -------------------------------- Types -------------------------------- */
type Blog = {
  id: number | string;
  title: string;
  author?: string;
  category?: string;
  status?: "Published" | "Draft" | string;
  thumbnail?: string;
  created?: string;
  updated?: string;
  content?: string; // HTML string from backend (rendered in modal)
};

export default function BlogAdminManager() {
  const router = useRouter();
  const dialogLabelId = useId();

  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [viewBlog, setViewBlog] = useState<Blog | null>(null);
  const [deletingId, setDeletingId] = useState<Blog["id"] | null>(null);

  /* ------------------------------ Load blogs ----------------------------- */
  const loadBlogs = useCallback(async () => {
    setLoading(true);
    const ac = new AbortController();
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/show-all-blogs/?all=1&_=${Date.now()}`,
        { ...withFrontendKey(), signal: ac.signal }
      );
      if (!res.ok) throw new Error(`Failed to load blogs (${res.status})`);
      const data = await res.json();

      // Normalize shape defensively
      const list: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
        ? data.results
        : data?.data || [];

      const mapped: Blog[] = list.map((b: any) => ({
        id: b.id ?? b.blog_id ?? String(Math.random()),
        title: b.title ?? "",
        author: b.author ?? "",
        category: b.category ?? "",
        status: b.status ?? (b.published ? "Published" : "Draft"),
        thumbnail: b.thumbnail ?? b.image ?? "",
        created: b.created ?? b.created_at ?? "",
        updated: b.updated ?? b.updated_at ?? "",
        content: b.content ?? "",
      }));

      // Stable order: published first, then newest updated
      mapped.sort((a, b) => {
        const aPub = (a.status || "").toLowerCase() === "published" ? 1 : 0;
        const bPub = (b.status || "").toLowerCase() === "published" ? 1 : 0;
        if (aPub !== bPub) return bPub - aPub;
        const ad = Date.parse(a.updated || a.created || "") || 0;
        const bd = Date.parse(b.updated || b.created || "") || 0;
        return bd - ad;
      });

      setBlogs(mapped);
    } catch (err) {
      toast.error("❌ Could not fetch blogs from server");
      setBlogs([]);
    } finally {
      setLoading(false);
    }

    return () => ac.abort();
  }, []);

  useEffect(() => {
    const cleanup = loadBlogs();
    return () => {
      // abort fetch if the component unmounts early
      try {
        (cleanup as any)?.();
      } catch {}
    };
  }, [loadBlogs]);

  /* -------------------------- Derived UI state -------------------------- */
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          blogs
            .map((b) => (b.category || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [blogs]
  );

  const filteredBlogs = useMemo(
    () =>
      blogs.filter((b) => !filterCategory || (b.category || "") === filterCategory),
    [blogs, filterCategory]
  );

  /* ------------------------------ Handlers ------------------------------- */
  const handleDelete = async (id: Blog["id"]) => {
    if (!id || deletingId) return;
    const ok = confirm("Delete this blog? This cannot be undone.");
    if (!ok) return;

    setDeletingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/delete-blogs/`, {
        ...withFrontendKey({
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [id] }),
        }),
      });
      if (!res.ok) throw new Error("Delete failed");
      setBlogs((prev) => prev.filter((b) => b.id !== id));
      toast.success("🗑️ Blog deleted");
      // If the deleted blog is open in the modal, close it
      setViewBlog((vb) => (vb?.id === id ? null : vb));
    } catch {
      toast.error("❌ Failed to delete blog");
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditNavigate = (id: Blog["id"]) => {
    // Deep link into the Add/Edit page with ?editId=...
    if (id === undefined || id === null) return;
    router.push(`/admin/blog?editId=${id}`);
  };

  return (
    <AdminAuthGuard>
      <ToastContainer position="top-right" newestOnTop closeOnClick pauseOnFocusLoss={false} />
      <div
        className="flex flex-col lg:flex-row min-h-screen bg-gradient-to-br from-gray-50 to-white text-black"
        style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}
      >
        <aside className="lg:w-64 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white">
          <AdminSidebar />
        </aside>

        <main className="flex-1 p-4 sm:p-6 space-y-8">
          {/* Header actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-bold text-[#891F1A]">Blog Manager</h1>
            <button
              type="button"
              className="bg-[#891F1A] text-white px-4 py-2 rounded-full font-medium hover:bg-[#6f1414] transition-colors"
              onClick={() => router.push("/admin/blog")}
              aria-label="Add a new blog"
            >
              + Add Blog
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <label className="text-sm font-medium" htmlFor="category-filter">
              Filter by category
            </label>
            <select
              id="category-filter"
              className="min-w-[220px] bg-white border border-gray-300 rounded px-3 py-2 text-sm"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              aria-label="Filter blogs by category"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="overflow-auto rounded-2xl shadow-lg border border-gray-200 max-h-[560px] bg-white">
            <table className="w-full table-auto text-sm">
              <caption className="sr-only">List of blogs</caption>
              <thead className="text-white bg-[#891F1A] sticky top-0 z-10">
                <tr>
                  <th scope="col" className="p-3 text-center">
                    ID
                  </th>
                  <th scope="col" className="p-3 text-center">
                    Thumbnail
                  </th>
                  <th scope="col" className="p-3 text-left">
                    Title
                  </th>
                  <th scope="col" className="p-3 text-center">
                    Author
                  </th>
                  <th scope="col" className="p-3 text-center">
                    Status
                  </th>
                  <th scope="col" className="p-3 text-center">
                    Created
                  </th>
                  <th scope="col" className="p-3 text-center">
                    Updated
                  </th>
                  <th scope="col" className="p-3 text-center">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="text-gray-800 divide-y divide-gray-100">
                {loading && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-gray-500">
                      Loading blogs…
                    </td>
                  </tr>
                )}

                {!loading && filteredBlogs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-gray-500">
                      No blogs found.
                    </td>
                  </tr>
                )}

                {!loading &&
                  filteredBlogs.map((blog) => (
                    <tr key={blog.id} className="hover:bg-gray-50 transition-colors">
                      <th scope="row" className="p-3 text-[#891F1A] font-semibold text-center">
                        {blog.id}
                      </th>
                      <td className="p-3 text-center">
                        {blog.thumbnail ? (
                          <img
                            src={blog.thumbnail}
                            alt={`${blog.title} thumbnail`}
                            width={48}
                            height={48}
                            loading="lazy"
                            decoding="async"
                            className="w-12 h-12 object-cover rounded border mx-auto"
                          />
                        ) : (
                          <span className="inline-block w-12 h-12 rounded border bg-gray-100" aria-hidden="true" />
                        )}
                      </td>
                      <td className="p-3">{blog.title}</td>
                      <td className="p-3 text-center">{blog.author || "-"}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            (blog.status || "").toLowerCase() === "published"
                              ? "bg-green-100 text-green-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {blog.status || "Draft"}
                        </span>
                      </td>
                      <td className="p-3 text-center">{blog.created || "-"}</td>
                      <td className="p-3 text-center">{blog.updated || "-"}</td>
                      <td className="p-3 text-center">
                        <div className="inline-flex gap-3">
                          <button
                            type="button"
                            className="text-blue-600 hover:underline"
                            onClick={() => setViewBlog(blog)}
                            aria-label={`View blog ${blog.title}`}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="text-indigo-600 hover:underline"
                            onClick={() => handleEditNavigate(blog.id)}
                            aria-label={`Edit blog ${blog.title}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-red-600 hover:underline disabled:opacity-50"
                            onClick={() => handleDelete(blog.id)}
                            disabled={deletingId === blog.id}
                            aria-label={`Delete blog ${blog.title}`}
                          >
                            {deletingId === blog.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {/* View Modal */}
      {viewBlog && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-6 overflow-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogLabelId}
          onClick={(e) => {
            // click outside to close
            if (e.target === e.currentTarget) setViewBlog(null);
          }}
        >
          <div className="bg-white text-black w-full max-w-3xl rounded-xl shadow-xl p-6 relative">
            <button
              type="button"
              className="absolute top-3 right-4 text-gray-600 hover:text-black"
              onClick={() => setViewBlog(null)}
              aria-label="Close"
            >
              ✖
            </button>

            <h2 id={dialogLabelId} className="text-2xl font-bold mb-2">
              {viewBlog.title}
            </h2>

            {viewBlog.thumbnail && (
              <img
                src={viewBlog.thumbnail}
                alt={`${viewBlog.title} thumbnail`}
                width={192}
                height={128}
                loading="lazy"
                decoding="async"
                className="w-48 h-32 rounded border mb-4 object-cover"
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <p>
                <strong>Author:</strong> {viewBlog.author || "-"}
              </p>
              <p>
                <strong>Category:</strong> {viewBlog.category || "-"}
              </p>
              <p>
                <strong>Status:</strong> {viewBlog.status || "Draft"}
              </p>
              <p>
                <strong>Created:</strong> {viewBlog.created || "-"}
              </p>
              <p>
                <strong>Updated:</strong> {viewBlog.updated || "-"}
              </p>
            </div>

            <div className="mt-4">
              <h3 className="font-semibold mb-2">Content</h3>
              {/* Content is trusted from admin backend; if not, sanitize server-side */}
              <div
                className="prose max-w-none prose-p:leading-relaxed text-sm"
                dangerouslySetInnerHTML={{ __html: viewBlog.content || "" }}
              />
            </div>
          </div>
        </div>
      )}
    </AdminAuthGuard>
  );
}
