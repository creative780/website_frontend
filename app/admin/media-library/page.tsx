"use client";
import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Plus,
  Trash2,
  Edit2,
  ImagePlus,
  X,
  Download,
  RefreshCcw,
  Upload,
  Eye,
} from "lucide-react";
import Cropper from "react-easy-crop";
import imageCompression from "browser-image-compression";
import { useDropzone } from "react-dropzone";
import { toast } from "react-hot-toast";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import AdminSideBar from "../components/AdminSideBar";
import { getCroppedImg } from "../utils/CropImage";
import { API_BASE_URL } from "../../utils/api";

// 🔐 Frontend key helper (used only for /api/* calls)
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

// Only treat URLs under /api/ as API calls (attach headers there). Never for /media/*
const isApiPath = (url: string) => {
  try {
    const u = new URL(url, API_BASE_URL);
    return u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
};

// 🔧 Build filename: AltText.png (strip risky chars, cap length)
const buildPngDownloadName = (alt?: string) => {
  const base = (alt || "image")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/[\[\]]/g, "")
    .trim()
    .slice(0, 80);
  return `${base}.png`;
};

async function downloadImageClient(img: any) {
  try {
    if (img.isLocal && (img.file instanceof Blob || img.blob instanceof Blob)) {
      const blob = (img.file as Blob) || (img.blob as Blob);
      const pngBlob =
        blob.type === "image/png"
          ? blob
          : await (async () => {
              // Ensure PNG container so filename extension matches contents
              const b = await blob.arrayBuffer();
              return new Blob([b], { type: "image/png" });
            })();

      const url = URL.createObjectURL(pngBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildPngDownloadName(img.alt_text || img.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Download started");
      return;
    }

    // 2) Server image — must succeed via CORS blob fetch (no fallback navigation)
    const absUrl = img.url?.startsWith("http")
      ? img.url
      : `${API_BASE_URL}${img.url}`;
    const init: RequestInit = {
      ...(isApiPath(absUrl) ? withFrontendKey() : {}),
      method: "GET",
      cache: "no-store",
      headers: {
        ...(isApiPath(absUrl)
          ? Object.fromEntries((withFrontendKey().headers as Headers).entries())
          : {}),
        Accept: "image/*",
      },
    };

    const res = await fetch(absUrl, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const blob = await res.blob();

    // Normalize to PNG to match the requested filename rule
    const pngBlob =
      blob.type === "image/png"
        ? blob
        : await (async () => {
            const arrayBuf = await blob.arrayBuffer();
            return new Blob([arrayBuf], { type: "image/png" });
          })();

    const blobUrl = URL.createObjectURL(pngBlob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = buildPngDownloadName(
      String(
        img?.alt_text ||
          img?.filename ||
          img?.original_name ||
          img?.image_id ||
          img?.id ||
          "image"
      )
    );
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);

    toast.success("Download started");
  } catch (err) {
    console.error("Failed to download image:", err);
    toast.error(
      "Download blocked. Enable CORS on /media or use an /api proxy."
    );
  }
}

const MediaLibraryPage = () => {
  const [images, setImages] = useState<any[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [modalImage, setModalImage] = useState<any>(null);

  // Replace modal state (staged, not auto-saved)
  const [showReplace, setShowReplace] = useState(false);
  const [replaceMode, setReplaceMode] = useState<"file" | "url">("file");
  const [replaceUrl, setReplaceUrl] = useState("");
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(
    null
  );
  const [pendingFileName, setPendingFileName] = useState<string>("");

  // Extras
  const [resizeWidth, setResizeWidth] = useState(300);
  const [resizeHeight, setResizeHeight] = useState(200);
  const [compress, setCompress] = useState(true);

  // Crop
  const [cropMode, setCropMode] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  // Sorting
  const [sortOption, setSortOption] = useState<"name" | "size">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // 🔹 Tag input state for modal (chips UI)
  const [tagDraft, setTagDraft] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleSelect = (id: string) => {
    setSelectedImages((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    const fetchImages = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/show-all-images/`,
          withFrontendKey()
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const updated = data.map((img: any) => ({
          ...img,
          url: img.url?.startsWith("http")
            ? img.url
            : `${API_BASE_URL}${img.url}`,
          isLocal: false, // server-sourced images
        }));
        setImages(updated);
      } catch (error) {
        console.error("Failed to load images:", error);
        toast.error("Failed to load images");
      }
    };
    fetchImages();
  }, []);

  // 🔒 Lock background scroll when any modal is open
  useEffect(() => {
    const hasModalOpen = !!modalImage || cropMode || showReplace;
    document.body.classList.toggle("overflow-hidden", hasModalOpen);
    return () => document.body.classList.remove("overflow-hidden");
  }, [modalImage, cropMode, showReplace]);

  const groupedImages = useMemo(() => {
    const filtered = images.filter(
      (img) =>
        (img.alt_text || "").toLowerCase().includes(search.toLowerCase()) ||
        (Array.isArray(img.tags) &&
          img.tags?.some((tag: string) =>
            (tag || "").toLowerCase().includes(search.toLowerCase())
          ))
    );

    const sorted = [...filtered].sort((a, b) => {
      const compare =
        sortOption === "name"
          ? (a.alt_text || "").localeCompare(b.alt_text || "")
          : (a.size || 0) - (b.size || 0);
      return sortOrder === "asc" ? compare : -compare;
    });

    const groups: { [key: string]: any[] } = {};
    sorted.forEach((img) => {
      const section = img.linked_table || "uncategorized";
      if (!groups[section]) groups[section] = [];
      groups[section].push(img);
    });

    return groups;
  }, [images, search, sortOption, sortOrder]);

  // ---------- Crop ----------
  const saveCropped = async () => {
    if (!modalImage || !croppedAreaPixels) return;
    const canvas = await getCroppedImg(modalImage.url, croppedAreaPixels);
    canvas.toBlob(
      async (blob) => {
        if (blob) {
          const result = await uploadReplacedImage(
            modalImage.image_id,
            blob,
            modalImage.alt_text,
            modalImage.tags
          );
          if (result) {
            setImages((prev) =>
              prev.map((img) =>
                img.image_id === modalImage.image_id
                  ? { ...img, url: result.url, version: (img.version || 0) + 1 }
                  : img
              )
            );
            toast.success("Cropped image saved!");
            setCropMode(false);
            setModalImage(null);
          } else {
            toast.error("Failed to save cropped image");
          }
        }
      },
      "image/jpeg",
      0.92
    );
  };

  // ---------- Replace (Staged — requires Save) ----------
  const clearPendingReplace = () => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingBlob(null);
    setPendingPreviewUrl(null);
    setPendingFileName("");
    setReplaceUrl("");
  };

  const preparePendingFromFile = async (file: File) => {
    try {
      const fileToUse = compress
        ? await imageCompression(file, { maxSizeMB: 1 })
        : file;
      const preview = URL.createObjectURL(fileToUse);
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
      setPendingBlob(fileToUse);
      setPendingPreviewUrl(preview);
      setPendingFileName(file.name);
      toast.success('Image staged. Click "Save Image" to apply.');
    } catch (e) {
      console.error(e);
      toast.error("Failed to stage image");
    }
  };

  const commitReplace = async () => {
    try {
      if (!modalImage) return;

      let blobToUpload: Blob | null = null;

      if (replaceMode === "file") {
        if (!pendingBlob) {
          toast.error("No file selected");
          return;
        }
        blobToUpload = pendingBlob;
      } else {
        if (!replaceUrl) {
          toast.error("Enter an image URL");
          return;
        }
        const response = await fetch(replaceUrl);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        const rawBlob = await response.blob();
        if (compress && /^image\/(png|jpe?g|webp)$/i.test(rawBlob.type)) {
          const fileLike = new File([rawBlob], "remote_image", {
            type: rawBlob.type,
          });
          const compressed = await imageCompression(fileLike, { maxSizeMB: 1 });
          blobToUpload = compressed;
        } else {
          blobToUpload = rawBlob;
        }
      }

      if (!blobToUpload) {
        toast.error("Could not prepare image to upload");
        return;
      }

      const result = await uploadReplacedImage(
        modalImage.image_id,
        blobToUpload,
        modalImage.alt_text,
        modalImage.tags
      );

      if (result) {
        setImages((prev) =>
          prev.map((img) =>
            img.image_id === modalImage.image_id
              ? {
                  ...img,
                  url: result.url,
                  width: resizeWidth,
                  height: resizeHeight,
                  alt_text: modalImage.alt_text,
                  tags: modalImage.tags,
                  version: (img.version || 0) + 1,
                  updatedAt: new Date().toISOString(),
                }
              : img
          )
        );
        toast.success("Image updated!");
        setShowReplace(false);
        clearPendingReplace();
        setModalImage(null);
      } else {
        toast.error("Failed to update image");
      }
    } catch (err) {
      console.error("Replace failed:", err);
      toast.error("Failed to update image");
    }
  };

  const uploadReplacedImage = async (
    imageId: string,
    blob: Blob,
    alt_text = "",
    tags: string[] = []
  ) => {
    try {
      const formData = new FormData();
      formData.append("image_file", blob);
      formData.append("alt_text", alt_text);
      formData.append("tags", JSON.stringify(tags));

      const res = await fetch(
        `${API_BASE_URL}/api/update-image/${imageId}/`,
        withFrontendKey({
          method: "POST",
          body: formData,
        })
      );

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      return {
        url: data.url?.startsWith("http")
          ? data.url
          : `${API_BASE_URL}${data.url}`,
        alt_text: data.alt_text,
        tags: data.tags,
      };
    } catch (err) {
      console.error("Failed to upload replaced image:", err);
      return null;
    }
  };

  // 🔴 Delete helper (server API)
  const deleteImage = async (imageId: string) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/delete-image/`,
        withFrontendKey({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_id: imageId }),
        })
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to delete image");
      }
      return true;
    } catch (err) {
      console.error("Delete failed:", err);
      return false;
    }
  };

  // 🗑️ Bulk delete
  const deleteSelected = async () => {
    if (selectedImages.length === 0) return;
    if (
      !confirm(
        `Delete ${selectedImages.length} image(s)? This cannot be undone.`
      )
    )
      return;

    const selectedObjs = images.filter((img) =>
      selectedImages.includes(img.image_id || img.id)
    );
    const locals = selectedObjs.filter((img) => img.isLocal);
    const servers = selectedObjs.filter(
      (img) => !img.isLocal && !!img.image_id
    );

    let localDeletedCount = locals.length;

    const serverIds = servers.map((img) => img.image_id as string);
    const results = await Promise.allSettled(
      serverIds.map((id) => deleteImage(id))
    );

    const successfullyDeletedServerIds = new Set<string>();
    results.forEach((r, i) => {
      const id = serverIds[i];
      if (r.status === "fulfilled" && r.value === true)
        successfullyDeletedServerIds.add(id);
    });

    setImages((prev) =>
      prev.filter((img) => {
        const key = img.image_id || img.id;
        if (img.isLocal && selectedImages.includes(key)) return false;
        if (
          !img.isLocal &&
          img.image_id &&
          successfullyDeletedServerIds.has(img.image_id)
        )
          return false;
        return true;
      })
    );

    setSelectedImages([]);

    const serverDeletedCount = successfullyDeletedServerIds.size;
    const serverFailedCount = serverIds.length - serverDeletedCount;

    if (serverFailedCount === 0) {
      toast.success(
        `Deleted ${localDeletedCount + serverDeletedCount} image(s)`
      );
    } else if (serverDeletedCount > 0 || localDeletedCount > 0) {
      toast.error(
        `Deleted ${
          localDeletedCount + serverDeletedCount
        }, failed ${serverFailedCount}`
      );
    } else {
      toast.error("Failed to delete selected image(s)");
    }
  };

  // ---------- Tags helpers (comma + Enter separated) ----------
  const normalizeTags = (arr: string[]) =>
    Array.from(new Set(arr.map((t) => t.trim()).filter(Boolean)));

  const addTagsFromString = (raw: string) => {
    // Split ONLY by comma or newline; spaces alone are allowed inside a tag
    const pieces = raw
      .split(/[,|\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!pieces.length) return;

    setModalImage((prev: any) => {
      const current = Array.isArray(prev?.tags) ? prev.tags : [];
      const next = normalizeTags([...current, ...pieces]);
      return { ...prev, tags: next };
    });
    setTagDraft("");
  };

  const removeTagAt = (idx: number) => {
    setModalImage((prev: any) => {
      const current = Array.isArray(prev?.tags) ? [...prev.tags] : [];
      current.splice(idx, 1);
      return { ...prev, tags: current };
    });
  };

  const handleTagKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (
    e
  ) => {
    // Add tag on Enter or Comma
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (tagDraft.trim()) addTagsFromString(tagDraft);
    }
    // Backspace on empty draft removes last tag (nice-to-have)
    if (e.key === "Backspace" && tagDraft === "") {
      const current = Array.isArray(modalImage?.tags) ? modalImage.tags : [];
      if (current.length > 0) {
        removeTagAt(current.length - 1);
      }
    }
  };

  const handleTagPaste: React.ClipboardEventHandler<HTMLInputElement> = (e) => {
    const text = e.clipboardData.getData("text");
    // If paste includes commas or newlines, consume and split
    if (/[,\n]/.test(text)) {
      e.preventDefault();
      addTagsFromString(text);
    }
  };

  // ---------- Metadata ----------
  const saveMetadata = async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/edit-image/`,
        withFrontendKey({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_id: modalImage.image_id,
            alt_text: modalImage.alt_text,
            tags: Array.isArray(modalImage.tags) ? modalImage.tags : [],
            width: modalImage.width,
            height: modalImage.height,
            linked_id: modalImage.linked_id,
            linked_table: modalImage.linked_table,
            linked_page: modalImage.linked_page,
            image_type: modalImage.image_type,
          }),
        })
      );

      if (!res.ok) throw new Error("Failed to save metadata");
      await res.json();
      setImages((prev) =>
        prev.map((img) =>
          img.image_id === modalImage.image_id ? { ...img, ...modalImage } : img
        )
      );
      toast.success("Metadata saved!");
      setModalImage(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save metadata");
    }
  };

  return (
    <AdminAuthGuard>
      <div className="flex bg-white text-gray-800">
        <AdminSideBar />
        <div className="flex-1 p-6">
          {/* Header */}
          <div className="flex justify-between mb-4">
            <h1 className="text-2xl font-bold">Media Library</h1>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search images..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border px-3 py-2 rounded w-60"
              />
              <select
                value={sortOption}
                onChange={(e) =>
                  setSortOption(e.target.value as "name" | "size")
                }
                className="border px-2 py-1 rounded text-sm"
              >
                <option value="name">Sort by Name</option>
                <option value="size">Sort by Size</option>
              </select>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
                className="border px-2 py-1 rounded text-sm"
              >
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
              {selectedImages.length > 0 && (
                <button
                  onClick={deleteSelected}
                  className="bg-red-500 text-white px-4 py-2 rounded text-sm flex items-center gap-1 hover:bg-red-600"
                >
                  <Trash2 className="w-4 h-4" /> Delete Selected (
                  {selectedImages.length})
                </button>
              )}
            </div>
          </div>

          {/* Image Grid */}
          {Object.entries(groupedImages).map(([section, imgs]) => (
            <div key={section} className="mb-8">
              <h2 className="text-red-600 text-xl font-semibold mb-2 capitalize">
                {section}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {imgs.map((img: any) => {
                  const key = img.image_id || img.id;
                  const isSelected = selectedImages.includes(key);
                  return (
                    <div
                      key={key}
                      onClick={() => toggleSelect(key)}
                      className={`relative cursor-pointer group border rounded ${
                        isSelected ? "ring-2 ring-blue-500" : ""
                      }`}
                    >
                      <img
                        src={img.url}
                        onError={(e) =>
                          (e.currentTarget.src = "/images/img1.jpg")
                        }
                        alt={img.alt_text}
                        className="w-full h-36 object-cover"
                        loading="lazy"
                      />
                      <div className="p-2">
                        <p className="text-sm font-medium truncate">
                          {img.alt_text || "No alt text"}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {Array.isArray(img.tags) && img.tags.length > 0
                            ? img.tags.join(", ")
                            : "No tags"}
                        </p>
                      </div>

                      {/* Hover actions: view, download, delete */}
                      <div className="absolute top-2 right-2 hidden group-hover:flex gap-2 z-10">
                        <button
                          title="View / Edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Ensure modal starts with array tags and empty draft
                            setTagDraft("");
                            setModalImage({
                              ...img,
                              tags: Array.isArray(img.tags) ? img.tags : [],
                            });
                          }}
                        >
                          <Eye className="w-6 h-6 bg-white rounded p-1" />
                        </button>

                        {/* Header-aware client download */}
                        <button
                          title="Download"
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadImageClient(img);
                          }}
                        >
                          <Download className="w-6 h-6 bg-white rounded p-1" />
                        </button>

                        <button
                          title="Delete"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm("Delete this image?")) return;

                            const keyLocal = img.image_id || img.id;

                            // local -> just remove
                            if (img.isLocal) {
                              setImages((prev) =>
                                prev.filter(
                                  (it) => (it.image_id || it.id) !== keyLocal
                                )
                              );
                              setSelectedImages((prev) =>
                                prev.filter((id) => id !== keyLocal)
                              );
                              toast.success("Image deleted");
                              return;
                            }

                            // server -> call API first
                            if (img?.image_id) {
                              const ok = await deleteImage(img.image_id);
                              if (!ok)
                                return toast.error("Failed to delete image");
                            }
                            setImages((prev) =>
                              prev.filter(
                                (it) => (it.image_id || it.id) !== keyLocal
                              )
                            );
                            setSelectedImages((prev) =>
                              prev.filter((id) => id !== keyLocal)
                            );
                            toast.success("Image deleted");
                          }}
                        >
                          <Trash2 className="w-6 h-6 bg-white rounded p-1 text-red-600" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Image Modal */}
          {modalImage && !cropMode && (
            <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm overflow-y-auto">
              <div className="mx-auto my-8 w-[92vw] sm:w-[80vw] md:w-[60vw] lg:w-[50vw] max-h-[85vh] overflow-y-auto bg-white p-6 rounded">
                <div className="flex justify-between mb-4">
                  <h3 className="text-lg font-semibold">Edit Image</h3>
                  <X
                    onClick={() => setModalImage(null)}
                    className="cursor-pointer"
                  />
                </div>
                <img
                  src={modalImage.url}
                  alt="Preview"
                  className="w-full max-h-[50vh] object-contain rounded mb-2"
                  onError={(e) => (e.currentTarget.src = "/images/img1.jpg")}
                />

                <button
                  onClick={() => setCropMode(true)}
                  className="w-full bg-gray-100 py-2 rounded mb-2 flex items-center justify-center gap-2"
                >
                  <RefreshCcw className="w-4 h-4" /> Crop
                </button>

                <button
                  onClick={() => {
                    // open replace modal and reset staged state
                    clearPendingReplace();
                    setReplaceMode("file");
                    setShowReplace(true);
                  }}
                  className="w-full bg-gray-100 py-2 rounded mb-2 flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" /> Replace Image
                </button>

                {/* Optional: keep this toggle visible in the edit modal too */}
                <label className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    checked={compress}
                    onChange={(e) => setCompress(e.target.checked)}
                  />
                  Compress on Replace/Save
                </label>

                <input
                  type="text"
                  value={modalImage.alt_text || ""}
                  onChange={(e) =>
                    setModalImage({ ...modalImage, alt_text: e.target.value })
                  }
                  placeholder="Alt text"
                  className="mt-2 mb-1 border px-3 py-2 rounded w-full"
                />

                {/* 🔧 NEW TAGS UI (comma + Enter separated) */}
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tags
                  </label>
                  <div className="w-full min-h-[44px] flex flex-wrap items-center gap-2 py-2 px-2 border rounded">
                    {(Array.isArray(modalImage.tags)
                      ? modalImage.tags
                      : []
                    ).map((t: string, i: number) => (
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
                    ))}

                    <input
                      type="text"
                      className="flex-1 min-w-[120px] outline-none bg-transparent placeholder:text-gray-400"
                      placeholder={
                        (Array.isArray(modalImage.tags) ? modalImage.tags : [])
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
                  <p className="text-xs text-gray-500 mt-1">
                    Separator: comma or Enter. Paste is supported.
                  </p>
                </div>

                <button
                  onClick={saveMetadata}
                  className="w-full bg-blue-600 text-white py-2 rounded mt-3"
                >
                  Save Metadata
                </button>

                {/* Delete inside modal */}
                <button
                  onClick={async () => {
                    if (!confirm("Delete this image?")) return;
                    const key = modalImage.image_id || modalImage.id;

                    if (modalImage.isLocal) {
                      setImages((prev) =>
                        prev.filter((it) => (it.image_id || it.id) !== key)
                      );
                      setSelectedImages((prev) =>
                        prev.filter((id) => id !== key)
                      );
                      setModalImage(null);
                      toast.success("Image deleted");
                      return;
                    }

                    if (modalImage?.image_id) {
                      const ok = await deleteImage(modalImage.image_id);
                      if (!ok) return toast.error("Failed to delete image");
                    }
                    setImages((prev) =>
                      prev.filter((it) => (it.image_id || it.id) !== key)
                    );
                    setSelectedImages((prev) =>
                      prev.filter((id) => id !== key)
                    );
                    setModalImage(null);
                    toast.success("Image deleted");
                  }}
                  className="w-full bg-red-600 text-white py-2 rounded mt-2 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" /> Delete Image
                </button>
              </div>
            </div>
          )}

          {/* Crop Modal */}
          {cropMode && modalImage && (
            <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded w-[92vw] max-w-2xl h-[85vh] relative">
                <Cropper
                  image={modalImage.url}
                  crop={crop}
                  zoom={zoom}
                  aspect={4 / 3}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, croppedPixels) =>
                    setCroppedAreaPixels(croppedPixels)
                  }
                />
                <div className="absolute bottom-4 left-0 right-0 px-6 flex justify-between">
                  <button
                    onClick={() => setCropMode(false)}
                    className="bg-gray-200 px-4 py-2 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveCropped}
                    className="bg-blue-600 text-white px-4 py-2 rounded"
                  >
                    Save Crop
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Replace Modal (Staged, requires Save) */}
          {showReplace && (
            <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm overflow-y-auto">
              <div className="mx-auto my-8 bg-white p-6 rounded w-[92vw] sm:w-[80vw] md:w-[60vw] lg:w-[50vw] max-h-[85vh] overflow-y-auto">
                <div className="flex justify-between mb-2">
                  <h2 className="text-lg font-semibold">Replace Image</h2>
                  <X
                    onClick={() => {
                      setShowReplace(false);
                      clearPendingReplace();
                    }}
                    className="cursor-pointer"
                    aria-label="Close replace modal"
                  />
                </div>

                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setReplaceMode("file")}
                    className={`px-3 py-1 rounded ${
                      replaceMode === "file"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100"
                    }`}
                  >
                    Upload File
                  </button>
                  <button
                    onClick={() => setReplaceMode("url")}
                    className={`px-3 py-1 rounded ${
                      replaceMode === "url"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100"
                    }`}
                  >
                    From URL
                  </button>
                </div>

                {replaceMode === "file" && (
                  <div className="space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) await preparePendingFromFile(file);
                      }}
                      className="mb-2"
                    />
                    {pendingPreviewUrl && (
                      <div className="rounded border p-2">
                        <div className="text-xs text-gray-600 mb-1">
                          Staged file: {pendingFileName || "selected image"}
                        </div>
                        <img
                          src={pendingPreviewUrl}
                          alt="Staged preview"
                          className="w-full h-48 object-cover rounded"
                        />
                      </div>
                    )}
                  </div>
                )}

                {replaceMode === "url" && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={replaceUrl}
                      onChange={(e) => setReplaceUrl(e.target.value)}
                      placeholder="Enter image URL"
                      className="border px-3 py-2 w-full rounded"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={resizeWidth}
                        onChange={(e) => setResizeWidth(Number(e.target.value))}
                        className="border px-2 py-1 rounded w-24"
                        placeholder="Width"
                      />
                      <input
                        type="number"
                        value={resizeHeight}
                        onChange={(e) =>
                          setResizeHeight(Number(e.target.value))
                        }
                        className="border px-2 py-1 rounded w-24"
                        placeholder="Height"
                      />
                    </div>
                    <div className="rounded border p-2 text-xs text-gray-600">
                      URL will be fetched and processed on <b>Save Image</b>.
                      Compression: {compress ? "On" : "Off"}
                    </div>
                  </div>
                )}

                {/* Footer actions with Compress toggle next to Save */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={compress}
                      onChange={(e) => setCompress(e.target.checked)}
                      aria-label="Compress on Save"
                    />
                    <span className="text-sm">Compress on Save</span>
                  </label>

                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => {
                        setShowReplace(false);
                        clearPendingReplace();
                      }}
                      className="flex-1 sm:flex-none bg-gray-100 text-gray-800 px-4 py-2 rounded"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={commitReplace}
                      className="flex-1 sm:flex-none bg-blue-600 text-white px-4 py-2 rounded"
                    >
                      Save Image
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminAuthGuard>
  );
};

export default MediaLibraryPage;
