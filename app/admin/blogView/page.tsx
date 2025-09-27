"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import AdminSidebar from "../components/AdminSideBar";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { API_BASE_URL } from "../../utils/api";

const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

export default function BlogAdminManager() {
  const [blogs, setBlogs] = useState<any[]>([]);
  const [filterCategory, setFilterCategory] = useState("");
  const [viewBlog, setViewBlog] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    loadBlogs();
  }, []);

  const loadBlogs = async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/show-all-blogs/?all=1`,
        withFrontendKey()
      );
      if (!res.ok) throw new Error("Failed to load blogs");
      const data = await res.json();
      setBlogs(data);
    } catch (error) {
      toast.error("❌ Could not fetch blogs from server");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/delete-blogs/`,
        withFrontendKey({
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [id] }),
        })
      );
      if (!res.ok) throw new Error("Delete failed");
      setBlogs((prev) => prev.filter((b: any) => b.id !== id));
      toast.success("🗑️ Blog deleted");
    } catch (error) {
      toast.error("❌ Failed to delete blog");
    }
  };

  const handleEditNavigate = (id: number | string) => {
    // Deep link into the Add/Edit page with ?editId=...
    router.push(`/admin/blog?editId=${id}`);
  };

  return (
    <AdminAuthGuard>
      <ToastContainer />
      <div className="flex flex-col lg:flex-row min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <div className="lg:w-64">
          <AdminSidebar />
        </div>
        <main className="flex-1 p-4 sm:p-6 space-y-8">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-[#891F1A]">Blog Manager</h1>
            <button
              className="bg-[#891F1A] text-white px-4 py-2 rounded"
              onClick={() => router.push("/admin/blog")}
            >
              + Add Blog
            </button>
          </div>

          <select
            className="w-full input bg-white border border-gray-300 rounded px-3 py-2 text-sm text-black"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {[...new Set(blogs.map((b: any) => b.category))].map((cat, i) => (
              <option key={i}>{cat}</option>
            ))}
          </select>

          <div className="overflow-auto rounded-2xl shadow-lg border border-gray-200 max-h-[500px]">
            <table className="w-full table-auto text-sm bg-white">
              <thead className="text-white bg-[#891F1A] sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-center">ID</th>
                  <th className="p-3 text-center">Thumbnail</th>
                  <th className="p-3 text-left">Title</th>
                  <th className="p-3 text-center">Author</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Created</th>
                  <th className="p-3 text-center">Updated</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="text-gray-700 divide-y divide-gray-100">
                {blogs
                  .filter(
                    (blog: any) =>
                      !filterCategory || blog.category === filterCategory
                  )
                  .map((blog: any) => (
                    <tr key={blog.id} className="hover:bg-gray-50 transition">
                      <td className="p-3 text-[#891F1A] font-semibold">
                        {blog.id}
                      </td>
                      <td className="p-3 text-center">
                        <img
                          src={blog.thumbnail}
                          alt="thumb"
                          className="w-12 h-12 object-cover rounded border mx-auto"
                        />
                      </td>
                      <td className="p-3">{blog.title}</td>
                      <td className="p-3 text-center">{blog.author}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            blog.status === "Published"
                              ? "bg-green-100 text-green-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {blog.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">{blog.created}</td>
                      <td className="p-3 text-center">{blog.updated}</td>
                      <td className="p-3 text-center space-x-2">
                        <button
                          className="text-blue-600 hover:underline"
                          onClick={() => setViewBlog(blog)}
                        >
                          View
                        </button>
                        <button
                          className="text-indigo-600 hover:underline"
                          onClick={() => handleEditNavigate(blog.id)}
                        >
                          Edit
                        </button>
                        <button
                          className="text-red-600 hover:underline"
                          onClick={() => handleDelete(blog.id)}
                        >
                          Delete
                        </button>
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
        <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-start justify-center p-6 overflow-auto">
          <div className="bg-white text-black w-full max-w-3xl rounded-xl shadow-lg p-6 relative">
            <button
              className="absolute top-2 right-4 text-lg"
              onClick={() => setViewBlog(null)}
            >
              ✖
            </button>
            <h2 className="text-2xl font-bold mb-2">{viewBlog.title}</h2>
            <img
              src={viewBlog.thumbnail}
              alt="thumb"
              className="w-48 h-32 rounded border mb-4"
            />
            <p>
              <strong>Author:</strong> {viewBlog.author}
            </p>
            <p>
              <strong>Category:</strong> {viewBlog.category}
            </p>
            <p>
              <strong>Status:</strong> {viewBlog.status}
            </p>
            <p>
              <strong>Created:</strong> {viewBlog.created}
            </p>
            <p>
              <strong>Updated:</strong> {viewBlog.updated}
            </p>
            <div className="mt-4">
              <h3 className="font-semibold">Content:</h3>
              <div
                className="text-sm leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: viewBlog.content }}
              />
            </div>
          </div>
        </div>
      )}
    </AdminAuthGuard>
  );
}
