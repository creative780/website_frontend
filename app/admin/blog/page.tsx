"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminSidebar from "../components/AdminSideBar";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { FiSave } from "react-icons/fi";
import { MdOutlineArticle } from "react-icons/md";
import { API_BASE_URL } from "../../utils/api";

// ⬇️ Keep CSS; remove Quill runtime imports from module scope
import "quill/dist/quill.snow.css";

import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";

// Force dynamic to avoid prerender/CSR bailout during build
export const dynamic = "force-dynamic";

// --------- Utility helpers ----------
function insertImage(quill: any, dataUrl: string) {
  const range = quill.getSelection(true);
  const index = range ? range.index : quill.getLength();
  quill.insertEmbed(index, "image", dataUrl, "user");
  quill.setSelection(index + 1, 0, "user");
}
function replaceImageNode(node: HTMLImageElement, dataUrl: string) {
  node.src = dataUrl;
}

const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

// Helpers for datetime-local
function isoToLocalInput(iso?: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  } catch {
    return "";
  }
}

// ===== Simple modal to host CropperJS =====
function CropModal({
  src,
  onClose,
  onConfirm,
}: {
  src: string;
  onClose: () => void;
  onConfirm: (croppedDataUrl: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const cropperRef = useRef<Cropper | null>(null);

  useEffect(() => {
    if (!imgRef.current) return;
    cropperRef.current = new Cropper(imgRef.current, {
      viewMode: 1,
      dragMode: "move",
      autoCropArea: 1,
      responsive: true,
      background: false,
    });
    return () => {
      cropperRef.current?.destroy();
      cropperRef.current = null;
    };
  }, [src]);

  const handleConfirm = () => {
    if (!cropperRef.current) return;
    const canvas = cropperRef.current.getCroppedCanvas({
      maxWidth: 2000,
      imageSmoothingQuality: "high",
    });
    onConfirm(canvas.toDataURL("image/jpeg", 0.9));
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-white/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl w-[90vw] max-w-3xl p-4">
        <div className="mb-3 text-lg font-semibold">Crop Image</div>
        <div className="w-full h-[60vh]">
          <img ref={imgRef} src={src} alt="Crop" className="max-w-full" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-[#891F1A] text-white rounded-lg"
          >
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Custom Quill component with resize, wrap, crop =====
function QuillEditor({
  value,
  onChange,
  modules,
  placeholder,
  onReady,
}: {
  value: string;
  onChange: (html: string) => void;
  modules: any;
  placeholder?: string;
  onReady?: (quill: any) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<any | null>(null);
  const lastHtml = useRef<string>("");

  const [cropTarget, setCropTarget] = useState<HTMLImageElement | null>(null);
  const [cropSrc, setCropSrc] = useState<string>("");

  // Toolbar float handlers (wrap text like Word)
  const setFloat = (side: "left" | "right" | "none") => {
    const quill = quillRef.current;
    if (!quill) return;
    const range = quill.getSelection(true);
    if (!range) return;

    // Find an image blot around cursor
    const [leaf] = quill.getLeaf(range.index) as any;
    if (!leaf || !leaf.domNode || leaf.domNode.tagName !== "IMG") return;
    const img: HTMLImageElement = leaf.domNode;
    img.classList.remove("img-float-left", "img-float-right", "img-float-none");
    if (side === "left") img.classList.add("img-float-left");
    if (side === "right") img.classList.add("img-float-right");
    if (side === "none") img.classList.add("img-float-none");
  };

  const pickImageAndInsert = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const compressed = await compressBase64Image(base64);
        if (quillRef.current) insertImage(quillRef.current, compressed);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  function mountToolbar(host: HTMLElement) {
    const bar = document.createElement("div");
    bar.className = "ql-custom-toolbar";
    bar.innerHTML = `
      <span class="ql-formats">
        <select class="ql-font"></select>
        <select class="ql-size"></select>
      </span>
      <span class="ql-formats">
        <button class="ql-bold"></button>
        <button class="ql-italic"></button>
        <button class="ql-underline"></button>
        <button class="ql-strike"></button>
      </span>
      <span class="ql-formats">
        <select class="ql-color"></select>
        <select class="ql-background"></select>
      </span>
      <span class="ql-formats">
        <button class="ql-script" value="sub"></button>
        <button class="ql-script" value="super"></button>
      </span>
      <span class="ql-formats">
        <button class="ql-header" value="1"></button>
        <button class="ql-header" value="2"></button>
      </span>
      <span class="ql-formats">
        <select class="ql-align"></select>
      </span>
      <span class="ql-formats">
        <button class="ql-list" value="ordered"></button>
        <button class="ql-list" value="bullet"></button>
        <button class="ql-indent" value="-1"></button>
        <button class="ql-indent" value="+1"></button>
        <button class="ql-direction" value="rtl"></button>
      </span>
      <span class="ql-formats">
        <button class="ql-blockquote"></button>
        <button class="ql-code-block"></button>
        <button class="ql-link"></button>
        <button class="ql-image"></button>
        <button class="ql-video"></button>
        <button class="ql-clean"></button>
      </span>
      <span class="ql-formats">
        <button class="ql-wrap-left" title="Wrap Left">L</button>
        <button class="ql-wrap-right" title="Wrap Right">R</button>
        <button class="ql-wrap-none" title="No Wrap">N</button>
      </span>
    `;
    host.appendChild(bar);

    (bar.querySelector(".ql-wrap-left") as HTMLButtonElement).onclick = () =>
      setFloat("left");
    (bar.querySelector(".ql-wrap-right") as HTMLButtonElement).onclick = () =>
      setFloat("right");
    (bar.querySelector(".ql-wrap-none") as HTMLButtonElement).onclick = () =>
      setFloat("none");
    (bar.querySelector(".ql-image") as HTMLButtonElement).onclick =
      pickImageAndInsert;

    return bar;
  }

  useEffect(() => {
    if (!containerRef.current || quillRef.current) return;

    const toolbar = mountToolbar(containerRef.current);
    const editor = document.createElement("div");
    containerRef.current.appendChild(editor);

    let cancelled = false;

    (async () => {
      const Quill = (await import("quill")).default;
      const BlotFormatter = (await import("quill-blot-formatter")).default;

      const Size = Quill.import("attributors/style/size");
      Size.whitelist = ["12px", "14px", "16px", "18px", "24px", "32px"];
      Quill.register(Size, true);

      const Font = Quill.import("formats/font");
      Font.whitelist = ["sans-serif", "serif", "monospace"];
      Quill.register(Font, true);

      Quill.register("modules/blotFormatter", BlotFormatter);

      if (cancelled) return;

      const config = {
        theme: "snow",
        modules: {
          blotFormatter: {},
          toolbar: { container: toolbar },
          clipboard: { matchVisual: false },
          history: { delay: 500, maxStack: 200, userOnly: true },
          keyboard: {
            bindings: {
              undo: {
                key: "z",
                shortKey: true,
                handler(this: any) {
                  this.quill.history.undo();
                  return false;
                },
              },
              redo: {
                key: "y",
                shortKey: true,
                handler(this: any) {
                  this.quill.history.redo();
                  return false;
                },
              },
            },
          },
        },
        placeholder: placeholder || "Write your masterpiece…",
      } as any;

      const quill = new Quill(editor, config) as any;
      quillRef.current = quill;

      quill.clipboard.dangerouslyPasteHTML(value || "");
      lastHtml.current = quill.root.innerHTML;

      quill.on("text-change", () => {
        const html = quill.root.innerHTML;
        if (html !== lastHtml.current) {
          lastHtml.current = html;
          onChange(html);
        }
      });

      const onPaste = (e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items as any) {
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file && file.type.startsWith("image/")) {
              e.preventDefault();
              const reader = new FileReader();
              reader.onload = async () => {
                const base64 = reader.result as string;
                const compressed = await compressBase64Image(base64);
                insertImage(quill, compressed);
              };
              reader.readAsDataURL(file);
            }
          }
        }
      };

      const onDrop = (e: DragEvent) => {
        if (!e.dataTransfer) return;
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith("image/")) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = reader.result as string;
            const compressed = await compressBase64Image(base64);
            insertImage(quill, compressed);
          };
          reader.readAsDataURL(file);
        }
      };

      const onDblClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target && target.tagName === "IMG") {
          const img = target as HTMLImageElement;
          setCropSrc(img.src);
          setCropTarget(img);
        }
      };

      quill.root.addEventListener("paste", onPaste);
      quill.root.addEventListener("drop", onDrop);
      quill.root.addEventListener("dblclick", onDblClick);

      onReady?.(quill);

      const cleanup = () => {
        quill.root.removeEventListener("paste", onPaste);
        quill.root.removeEventListener("drop", onDrop);
        quill.root.removeEventListener("dblclick", onDblClick);
      };

      (quill as any).__cleanup = cleanup;
    })();

    return () => {
      let cancelled = true;
      cancelled = true;
      const q: any = quillRef.current;
      if (q && q.__cleanup) q.__cleanup();
      if (containerRef.current) containerRef.current.innerHTML = "";
      quillRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef.current]);

  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) return;
    const current = quill.root.innerHTML;
    if (value !== current) {
      const sel = quill.getSelection();
      quill.clipboard.dangerouslyPasteHTML(value || "");
      if (sel) quill.setSelection(sel);
      lastHtml.current = value || "";
    }
  }, [value]);

  return (
    <>
      <div ref={containerRef} className="quill-container" />
      {cropTarget && cropSrc && (
        <CropModal
          src={cropSrc}
          onClose={() => {
            setCropTarget(null);
            setCropSrc("");
          }}
          onConfirm={(cropped) => {
            replaceImageNode(cropTarget, cropped);
            setCropTarget(null);
            setCropSrc("");
          }}
        />
      )}
      <style jsx global>{`
        .ql-editor img.img-float-left {
          float: left;
          margin: 0 1rem 1rem 0;
        }
        .ql-editor img.img-float-right {
          float: right;
          margin: 0 0 1rem 1rem;
        }
        .ql-editor img.img-float-none {
          float: none;
          margin: 0 auto;
          display: block;
        }
        .ql-editor::after {
          content: "";
          display: block;
          clear: both;
        }
        .ql-custom-toolbar {
          border: 1px solid #e5e7eb;
          border-bottom: 0;
          border-radius: 0.75rem 0.75rem 0 0;
          padding: 6px;
        }
        .quill-container .ql-container {
          border-radius: 0 0 0.75rem 0.75rem;
        }
      `}</style>
    </>
  );
}

// =================== PAGE ===================
interface FormState {
  id: string;
  title: string;
  slug: string;
  content: string;
  tags: string;
  author: string;
  featuredImage: string;
  metaTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogImage: string;
  schemaEnabled: boolean;
  publishDate: string; // from <input type="datetime-local">
  draft: boolean;
}

function BlogManagementPage() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("editId"); // ⬅️ if present, we're editing

  const [form, setForm] = useState<FormState>({
    id: "",
    title: "",
    slug: "",
    content: "",
    // category removed
    tags: "",
    author: "",
    featuredImage: "",
    metaTitle: "",
    metaDescription: "",
    ogTitle: "",
    ogImage: "",
    schemaEnabled: false,
    publishDate: "",
    draft: false, // default to NON-draft
  });

  const [imagePreview, setImagePreview] = useState("");
  const [formTouched, setFormTouched] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState<boolean>(!!editId);

  // Prefill if editId is present
  useEffect(() => {
    let cancelled = false;

    const hydrateForEdit = async (id: string) => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/show-specific-blog?blog_id=${encodeURIComponent(
            id
          )}&all=true`,
          withFrontendKey()
        );
        if (!res.ok) throw new Error("Failed to load blog");
        const blog = await res.json();

        const normalized: FormState = {
          id: String(blog.id || blog.blog_id || ""),
          title: blog.title || "",
          slug: blog.slug || "",
          content: blog.content || "",
          tags: blog.tags || "",
          author: blog.author || "",
          featuredImage: blog.thumbnail || "",
          metaTitle: blog.metaTitle || "",
          metaDescription: blog.metaDescription || "",
          ogTitle: blog.ogTitle || "",
          ogImage: blog.ogImage || "",
          schemaEnabled: Boolean(blog.schemaEnabled),
          publishDate: blog.publishDate
            ? isoToLocalInput(blog.publishDate)
            : "",
          draft: Boolean(blog.draft),
        };

        if (!cancelled) {
          setForm(normalized);
          setImagePreview(normalized.featuredImage || "");
          setLoadingEdit(false);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadingEdit(false);
          toast.error("❌ Failed to load blog for editing.");
        }
      }
    };

    if (editId) {
      setLoadingEdit(true);
      hydrateForEdit(editId);
    } else {
      setLoadingEdit(false);
    }

    return () => {
      cancelled = true;
    };
  }, [editId]);

  const handleChange = (e: any) => {
    const { name, value, type, checked, files } = e.target;
    setFormTouched(true);

    if (type === "file") {
      const file = files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const compressed = await compressBase64Image(base64);
        setImagePreview(compressed);
        setForm((prev) => ({ ...prev, featuredImage: compressed }));
      };
      reader.readAsDataURL(file);
    } else {
      setForm((prev) => ({
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      }));
    }
  };

  // —— core submit: creates or updates based on presence of form.id
  const handleSubmit = async (overrides: Partial<FormState> = {}) => {
    try {
      const rawPublish: any =
        overrides.publishDate !== undefined
          ? overrides.publishDate
          : form.publishDate;

      const normalizedPublish =
        rawPublish && String(rawPublish).trim()
          ? new Date(String(rawPublish)).toISOString()
          : null;

      const now = new Date();
      const isScheduled = normalizedPublish
        ? new Date(normalizedPublish) > now
        : false;
      const status = isScheduled ? "scheduled" : "published";

      const draftFlag = overrides.draft !== undefined ? overrides.draft : false;

      const payloadBase: any = {
        title: overrides.title ?? form.title,
        slug: overrides.slug ?? form.slug,
        content: overrides.content ?? form.content,
        tags: overrides.tags ?? form.tags,
        author: overrides.author ?? form.author,
        featuredImage: overrides.featuredImage ?? form.featuredImage,
        metaTitle: overrides.metaTitle ?? form.metaTitle,
        metaDescription: overrides.metaDescription ?? form.metaDescription,
        ogTitle: overrides.ogTitle ?? form.ogTitle,
        ogImage: overrides.ogImage ?? form.ogImage,
        schemaEnabled: overrides.schemaEnabled ?? form.schemaEnabled,
        publishDate: normalizedPublish,
        draft: draftFlag,
        status,
      };

      const payload: any = {
        ...payloadBase,
        featured_image: payloadBase.featuredImage,
        meta_title: payloadBase.metaTitle,
        meta_description: payloadBase.metaDescription,
        og_title: payloadBase.ogTitle,
        og_image: payloadBase.ogImage,
      };

      const isEdit = Boolean(
        (overrides.id ?? form.id)?.toString?.() || (overrides.id ?? form.id)
      );
      let endpoint = `${API_BASE_URL}/api/save-blog/`;
      let method: "POST" | "PUT" = "POST";

      if (isEdit) {
        const id = (overrides.id ?? form.id) as string;
        endpoint = `${API_BASE_URL}/api/edit-blog/${id}/`;
        method = "PUT";
      } else {
        payload.id = overrides.id ?? form.id ?? "";
        payload.blog_id = overrides.id ?? form.id ?? "";
      }

      const res = await fetch(
        endpoint,
        withFrontendKey({
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      );

      if (!res.ok) throw new Error("Save failed");

      if (isEdit) {
        toast.success("✅ Blog updated");
      } else {
        toast.success(
          status === "scheduled"
            ? `⏳ Scheduled for ${
                rawPublish ? new Date(String(rawPublish)).toLocaleString() : ""
              }`
            : "✅ Blog post published!"
        );
      }

      setFormTouched(false);

      if (isEdit) {
        const url = new URL(window.location.href);
        url.searchParams.delete("editId");
        router.replace(url.pathname);
      }
    } catch {
      toast.error("❌ Failed to save blog. Please try again.");
    }
  };

  const handleSchedule = async () => {
    if (!form.publishDate || new Date(form.publishDate) <= new Date()) {
      return toast.error("❌ Enter a valid future date.");
    }
    toast.success(
      `⏳ Scheduled for ${new Date(form.publishDate).toLocaleString()}`
    );
    await handleSubmit({ draft: false });
  };

  const quillModules = useMemo(() => ({}), []);

  return (
    <AdminAuthGuard>
      <div className="flex">
        <AdminSidebar />
        <div className="flex-1 px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 lg:py-10 bg-gray-50 min-h-screen">
          <div className="max-w-5xl mx-auto">
            <div className="mb-6 sm:mb-8 bg-white p-4 sm:p-6 rounded-2xl shadow border flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h1 className="text-3xl font-bold text-[#891F1A] flex items-center gap-2">
                <MdOutlineArticle className="text-4xl" />
                {editId ? "Edit Blog" : "Blog Management (CMS)"}
              </h1>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSubmit({ draft: false, id: form.id })}
                  className="flex items-center gap-2 bg-[#891F1A] hover:bg-[#6d1915] text-white px-5 py-2.5 rounded-xl text-sm shadow"
                  disabled={loadingEdit}
                >
                  <FiSave className="text-lg" />{" "}
                  {editId ? "Save Changes" : "Save Blog Post"}
                </button>
                {!editId && (
                  <button
                    onClick={handleSchedule}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm shadow"
                  >
                    🕒 Schedule Post
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white text-black rounded-2xl shadow-xl border p-6 space-y-6">
              <InputField
                label="Title"
                name="title"
                value={form.title}
                onChange={handleChange}
              />

              {!editId && (
                <InputField
                  label="Slug"
                  name="slug"
                  value={form.slug}
                  onChange={handleChange}
                />
              )}

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Content
                </label>
                <QuillEditor
                  value={form.content}
                  onChange={(content) =>
                    setForm((prev) => ({ ...prev, content }))
                  }
                  modules={quillModules}
                  placeholder={
                    loadingEdit ? "Loading..." : "Write your masterpiece…"
                  }
                />
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <InputField
                  label="Tags"
                  name="tags"
                  value={form.tags}
                  onChange={handleChange}
                />
                <InputField
                  label="Author"
                  name="author"
                  value={form.author}
                  onChange={handleChange}
                />
                <div />
              </div>

              <InputField
                label="Meta Title"
                name="metaTitle"
                value={form.metaTitle}
                onChange={handleChange}
              />
              <TextareaField
                label="Meta Description"
                name="metaDescription"
                value={form.metaDescription}
                onChange={handleChange}
              />

              <InputField
                label="OG Title"
                name="ogTitle"
                value={form.ogTitle}
                onChange={handleChange}
              />
              <InputField
                label="OG Image URL"
                name="ogImage"
                value={form.ogImage}
                onChange={handleChange}
              />

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Featured Image
                </label>
                <input type="file" accept="image/*" onChange={handleChange} />
                {(imagePreview || form.featuredImage) && (
                  <img
                    src={imagePreview || form.featuredImage}
                    alt="Preview"
                    className="mt-3 h-32 rounded shadow border object-cover"
                  />
                )}
              </div>

              <div className="grid md:grid-cols-3 gap-6 items-center">
                <CheckboxField
                  label="Enable Schema"
                  name="schemaEnabled"
                  checked={form.schemaEnabled}
                  onChange={handleChange}
                />

                <button
                  onClick={() => handleSubmit({ draft: true, id: form.id })}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-5 py-2.5 rounded-xl text-sm shadow"
                  disabled={loadingEdit}
                >
                  Save as Draft
                </button>

                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Publish Date
                  </label>
                  <input
                    type="datetime-local"
                    name="publishDate"
                    value={form.publishDate}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border rounded"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminAuthGuard>
  );
}

// Suspense + Toast container wrapper (fixes useSearchParams CSR bailout)
export default function BlogManagementPageWrapper() {
  return (
    <>
      <Suspense fallback={<div className="p-6">Loading blog editor…</div>}>
        <BlogManagementPage />
      </Suspense>
      <ToastContainer />
    </>
  );
}

function InputField({ label, name, value, onChange }: any) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        className="w-full px-4 py-2 bg-gray-50 border rounded"
      />
    </div>
  );
}
function TextareaField({ label, name, value, onChange }: any) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        className="w-full px-4 py-2 bg-gray-50 border rounded"
        rows={3}
      />
    </div>
  );
}
function CheckboxField({ label, name, checked, onChange }: any) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        className="ml-2"
      />
    </div>
  );
}

// === Utilities ===
async function compressBase64Image(
  base64: string,
  maxWidth = 1400,
  quality = 0.9
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = base64;
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(base64);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(base64);
  });
}
