'use client';

import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  useId,
  useDeferredValue,
  memo,
} from 'react';
import { Trash2, X, Download, RefreshCcw, Upload, Eye } from 'lucide-react';
import dynamic from 'next/dynamic';
import Cropper from 'react-easy-crop';
import imageCompression from 'browser-image-compression';
import { toast } from 'react-hot-toast';
import AdminAuthGuard from '../components/AdminAuthGaurd';
// Lazy-load the sidebar to reduce initial JS and speed up TTI on media-heavy pages
const AdminSideBar = dynamic(() => import('../components/AdminSideBar'), {
  ssr: false,
  loading: () => <div className="p-4 text-sm text-gray-500">Loading menu…</div>,
});
import { getCroppedImg } from '../utils/CropImage';
import { API_BASE_URL } from '../../utils/api';

// 🔐 Frontend key helper (used only for /api/* calls)
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set('X-Frontend-Key', FRONTEND_KEY);
  return { ...init, headers };
};

// Only treat URLs under /api/ as API calls (attach headers there). Never for /media/*
const isApiPath = (url: string) => {
  try {
    const u = new URL(url, API_BASE_URL);
    return u.pathname.startsWith('/api/');
  } catch {
    return false;
  }
};

// 🔧 Build filename: AltText.png (strip risky chars, cap length)
const buildPngDownloadName = (alt?: string) => {
  const base = (alt || 'image')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[\[\]]/g, '')
    .trim()
    .slice(0, 80);
  return `${base}.png`;
};

async function downloadImageClient(img: any) {
  try {
    if (img.isLocal && (img.file instanceof Blob || img.blob instanceof Blob)) {
      const blob = (img.file as Blob) || (img.blob as Blob);
      const pngBlob =
        blob.type === 'image/png'
          ? blob
          : new Blob([await blob.arrayBuffer()], { type: 'image/png' });

      const url = URL.createObjectURL(pngBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildPngDownloadName(img.alt_text || img.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Download started');
      return;
    }

    // Server image — CORS blob fetch (no fallback navigation)
    const absUrl = img.url?.startsWith('http') ? img.url : `${API_BASE_URL}${img.url}`;
    const apiInit =
      isApiPath(absUrl) ? (withFrontendKey() as RequestInit) : ({} as RequestInit);
    const res = await fetch(absUrl, {
      ...apiInit,
      method: 'GET',
      cache: 'no-store',
      headers: {
        ...(isApiPath(absUrl)
          ? Object.fromEntries((withFrontendKey().headers as Headers).entries())
          : {}),
        Accept: 'image/*',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();

    const pngBlob =
      blob.type === 'image/png' ? blob : new Blob([await blob.arrayBuffer()], { type: 'image/png' });

    const blobUrl = URL.createObjectURL(pngBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = buildPngDownloadName(
      String(img?.alt_text || img?.filename || img?.original_name || img?.image_id || img?.id || 'image')
    );
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);

    toast.success('Download started');
  } catch (err) {
    console.error('Failed to download image:', err);
    toast.error('Download blocked. Enable CORS on /media or use an /api proxy.');
  }
}

// Small SR-only announcer for status changes
function SrStatus({ message }: { message: string }) {
  return (
    <p aria-live="polite" className="sr-only">
      {message}
    </p>
  );
}

// Single image card (memoized to cut re-renders)
const ImageCard = memo(function ImageCard({
  img,
  isSelected,
  onToggle,
  onOpen,
  onDownload,
  onDelete,
}: {
  img: any;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onOpen: (img: any) => void;
  onDownload: (img: any) => void;
  onDelete: (img: any) => void;
}) {
  const key = img.image_id || img.id;
  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle(key);
    } else if (e.key.toLowerCase() === 'e') {
      onOpen(img);
    } else if (e.key.toLowerCase() === 'd') {
      onDownload(img);
    } else if (e.key.toLowerCase() === 'x' || e.key === 'Delete') {
      onDelete(img);
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onKeyDown={handleKeyDown}
      onClick={() => onToggle(key)}
      className={`relative cursor-pointer group border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        isSelected ? 'ring-2 ring-blue-500' : ''
      }`}
    >
      <img
        src={img.url}
        onError={(e) => (e.currentTarget.src = '/images/img1.jpg')}
        alt={img.alt_text || 'Image'}
        className="w-full h-36 object-cover"
        loading="lazy"
        decoding="async"
      />
      <div className="p-2">
        <p className="text-sm font-medium truncate">{img.alt_text || 'No alt text'}</p>
        <p className="text-xs text-gray-500 truncate">
          {Array.isArray(img.tags) && img.tags.length > 0 ? img.tags.join(', ') : 'No tags'}
        </p>
      </div>
      <div className="absolute top-2 right-2 hidden group-hover:flex gap-2 z-10">
        <button
          type="button"
          aria-label="View / Edit"
          title="View / Edit"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(img);
          }}
        >
          <Eye className="w-6 h-6 bg-white rounded p-1" />
        </button>
        <button
          type="button"
          aria-label="Download"
          title="Download"
          onClick={(e) => {
            e.stopPropagation();
            onDownload(img);
          }}
        >
          <Download className="w-6 h-6 bg-white rounded p-1" />
        </button>
        <button
          type="button"
          aria-label="Delete"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(img);
          }}
        >
          <Trash2 className="w-6 h-6 bg-white rounded p-1 text-red-600" />
        </button>
      </div>
    </div>
  );
});

const MediaLibraryPage = () => {
  const [images, setImages] = useState<any[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search); // smoother typing, fewer re-filters
  const [sortOption, setSortOption] = useState<'name' | 'size'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [statusMsg, setStatusMsg] = useState('');

  const [modalImage, setModalImage] = useState<any>(null);
  const [showReplace, setShowReplace] = useState(false);
  const [replaceMode, setReplaceMode] = useState<'file' | 'url'>('file');
  const [replaceUrl, setReplaceUrl] = useState('');

  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>('');

  // Extras
  const [resizeWidth, setResizeWidth] = useState(300);
  const [resizeHeight, setResizeHeight] = useState(200);
  const [compress, setCompress] = useState(true);

  // Crop
  const [cropMode, setCropMode] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  // 🔹 Tag input state for modal (chips UI)
  const [tagDraft, setTagDraft] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlId = useId();

  const toggleSelect = useCallback((id: string) => {
    setSelectedImages((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }, []);

  // Prevent admin page from being indexed (SEO best practice)
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex,nofollow';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  // Fetch images with AbortController to avoid state updates after unmount
  useEffect(() => {
    const ac = new AbortController();
    const fetchImages = async () => {
      try {
        setStatusMsg('Loading images…');
        const res = await fetch(`${API_BASE_URL}/api/show-all-images/`, withFrontendKey({ signal: ac.signal }));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const updated = data.map((img: any) => ({
          ...img,
          url: img.url?.startsWith('http') ? img.url : `${API_BASE_URL}${img.url}`,
          isLocal: false, // server-sourced images
        }));
        setImages(updated);
        setStatusMsg('Images loaded.');
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
        console.error('Failed to load images:', error);
        setStatusMsg('Failed to load images.');
        toast.error('Failed to load images');
      }
    };
    fetchImages();
    return () => ac.abort();
  }, []);

  // 🔒 Lock background scroll when any modal is open
  useEffect(() => {
    const hasModalOpen = !!modalImage || cropMode || showReplace;
    document.body.classList.toggle('overflow-hidden', hasModalOpen);
    return () => document.body.classList.remove('overflow-hidden');
  }, [modalImage, cropMode, showReplace]);

  // Group / filter / sort (memoized; uses deferred search)
  const groupedImages = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const filtered = images.filter(
      (img) =>
        (img.alt_text || '').toLowerCase().includes(q) ||
        (Array.isArray(img.tags) && img.tags?.some((tag: string) => (tag || '').toLowerCase().includes(q)))
    );

    const sorted = [...filtered].sort((a, b) => {
      const compare =
        sortOption === 'name'
          ? (a.alt_text || '').localeCompare(b.alt_text || '')
          : (a.size || 0) - (b.size || 0);
      return sortOrder === 'asc' ? compare : -compare;
    });

    const groups: { [key: string]: any[] } = {};
    sorted.forEach((img) => {
      const section = img.linked_table || 'uncategorized';
      if (!groups[section]) groups[section] = [];
      groups[section].push(img);
    });

    return groups;
  }, [images, deferredSearch, sortOption, sortOrder]);

  // ---------- Crop ----------
  const saveCropped = useCallback(async () => {
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
            toast.success('Cropped image saved!');
            setCropMode(false);
            setModalImage(null);
          } else {
            toast.error('Failed to save cropped image');
          }
        }
      },
      'image/jpeg',
      0.92
    );
  }, [croppedAreaPixels, modalImage]);

  // ---------- Replace (Staged — requires Save) ----------
  const clearPendingReplace = useCallback(() => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingBlob(null);
    setPendingPreviewUrl(null);
    setPendingFileName('');
    setReplaceUrl('');
  }, [pendingPreviewUrl]);

  const preparePendingFromFile = useCallback(
    async (file: File) => {
      try {
        const fileToUse = compress ? await imageCompression(file, { maxSizeMB: 1 }) : file;
        const preview = URL.createObjectURL(fileToUse);
        if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
        setPendingBlob(fileToUse);
        setPendingPreviewUrl(preview);
        setPendingFileName(file.name);
        toast.success('Image staged. Click "Save Image" to apply.');
      } catch (e) {
        console.error(e);
        toast.error('Failed to stage image');
      }
    },
    [compress, pendingPreviewUrl]
  );

  const commitReplace = useCallback(async () => {
    try {
      if (!modalImage) return;

      let blobToUpload: Blob | null = null;

      if (replaceMode === 'file') {
        if (!pendingBlob) {
          toast.error('No file selected');
          return;
        }
        blobToUpload = pendingBlob;
      } else {
        if (!replaceUrl) {
          toast.error('Enter an image URL');
          return;
        }
        const response = await fetch(replaceUrl);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        const rawBlob = await response.blob();
        if (compress && /^image\/(png|jpe?g|webp)$/i.test(rawBlob.type)) {
          const fileLike = new File([rawBlob], 'remote_image', { type: rawBlob.type });
          const compressed = await imageCompression(fileLike, { maxSizeMB: 1 });
          blobToUpload = compressed;
        } else {
          blobToUpload = rawBlob;
        }
      }

      if (!blobToUpload) {
        toast.error('Could not prepare image to upload');
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
        toast.success('Image updated!');
        setShowReplace(false);
        clearPendingReplace();
        setModalImage(null);
      } else {
        toast.error('Failed to update image');
      }
    } catch (err) {
      console.error('Replace failed:', err);
      toast.error('Failed to update image');
    }
  }, [modalImage, replaceMode, pendingBlob, replaceUrl, compress, resizeWidth, resizeHeight, clearPendingReplace]);

  const uploadReplacedImage = useCallback(
    async (imageId: string, blob: Blob, alt_text = '', tags: string[] = []) => {
      try {
        const formData = new FormData();
        formData.append('image_file', blob);
        formData.append('alt_text', alt_text);
        formData.append('tags', JSON.stringify(tags));

        const res = await fetch(
          `${API_BASE_URL}/api/update-image/${imageId}/`,
          withFrontendKey({
            method: 'POST',
            body: formData,
            // keepalive for background tab safety
            keepalive: true,
          })
        );

        if (!res.ok) throw new Error('Upload failed');
        const data = await res.json();
        return {
          url: data.url?.startsWith('http') ? data.url : `${API_BASE_URL}${data.url}`,
          alt_text: data.alt_text,
          tags: data.tags,
        };
      } catch (err) {
        console.error('Failed to upload replaced image:', err);
        return null;
      }
    },
    []
  );

  // 🔴 Delete helper (server API)
  const deleteImage = useCallback(async (imageId: string) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/delete-image/`,
        withFrontendKey({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_id: imageId }),
          keepalive: true,
        })
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to delete image');
      }
      return true;
    } catch (err) {
      console.error('Delete failed:', err);
      return false;
    }
  }, []);

  // 🗑️ Bulk delete
  const deleteSelected = useCallback(async () => {
    if (selectedImages.length === 0) return;
    if (!confirm(`Delete ${selectedImages.length} image(s)? This cannot be undone.`)) return;

    const selectedObjs = images.filter((img) => selectedImages.includes(img.image_id || img.id));
    const locals = selectedObjs.filter((img) => img.isLocal);
    const servers = selectedObjs.filter((img) => !img.isLocal && !!img.image_id);

    const localDeletedCount = locals.length;

    const serverIds = servers.map((img) => img.image_id as string);
    const results = await Promise.allSettled(serverIds.map((id) => deleteImage(id)));

    const successfullyDeletedServerIds = new Set<string>();
    results.forEach((r, i) => {
      const id = serverIds[i];
      if (r.status === 'fulfilled' && r.value === true) successfullyDeletedServerIds.add(id);
    });

    setImages((prev) =>
      prev.filter((img) => {
        const key = img.image_id || img.id;
        if (img.isLocal && selectedImages.includes(key)) return false;
        if (!img.isLocal && img.image_id && successfullyDeletedServerIds.has(img.image_id)) return false;
        return true;
      })
    );

    setSelectedImages([]);

    const serverDeletedCount = successfullyDeletedServerIds.size;
    const serverFailedCount = serverIds.length - serverDeletedCount;

    if (serverFailedCount === 0) {
      toast.success(`Deleted ${localDeletedCount + serverDeletedCount} image(s)`);
    } else if (serverDeletedCount > 0 || localDeletedCount > 0) {
      toast.error(`Deleted ${localDeletedCount + serverDeletedCount}, failed ${serverFailedCount}`);
    } else {
      toast.error('Failed to delete selected image(s)');
    }
  }, [images, selectedImages, deleteImage]);

  // ---------- Tags helpers (comma + Enter separated) ----------
  const normalizeTags = (arr: string[]) =>
    Array.from(new Set(arr.map((t) => t.trim()).filter(Boolean)));

  const addTagsFromString = useCallback((raw: string) => {
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
    setTagDraft('');
  }, []);

  const removeTagAt = useCallback((idx: number) => {
    setModalImage((prev: any) => {
      const current = Array.isArray(prev?.tags) ? [...prev.tags] : [];
      current.splice(idx, 1);
      return { ...prev, tags: current };
    });
  }, []);

  const handleTagKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (tagDraft.trim()) addTagsFromString(tagDraft);
    }
    if (e.key === 'Backspace' && tagDraft === '') {
      const current = Array.isArray(modalImage?.tags) ? modalImage.tags : [];
      if (current.length > 0) {
        removeTagAt(current.length - 1);
      }
    }
  };

  const handleTagPaste: React.ClipboardEventHandler<HTMLInputElement> = (e) => {
    const text = e.clipboardData.getData('text');
    if (/[,\n]/.test(text)) {
      e.preventDefault();
      addTagsFromString(text);
    }
  };

  // ---------- Metadata ----------
  const saveMetadata = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/edit-image/`,
        withFrontendKey({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
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

      if (!res.ok) throw new Error('Failed to save metadata');
      await res.json();
      setImages((prev) =>
        prev.map((img) => (img.image_id === modalImage.image_id ? { ...img, ...modalImage } : img))
      );
      toast.success('Metadata saved!');
      setModalImage(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save metadata');
    }
  }, [modalImage]);

  // Handlers bound once for memoized ImageCard
  const openEditor = useCallback(
    (img: any) => {
      setTagDraft('');
      setModalImage({ ...img, tags: Array.isArray(img.tags) ? img.tags : [] });
    },
    []
  );
  const downloadOne = useCallback((img: any) => downloadImageClient(img), []);
  const deleteOne = useCallback(
    async (img: any) => {
      if (!confirm('Delete this image?')) return;
      const key = img.image_id || img.id;

      if (img.isLocal) {
        setImages((prev) => prev.filter((it) => (it.image_id || it.id) !== key));
        setSelectedImages((prev) => prev.filter((id) => id !== key));
        toast.success('Image deleted');
        return;
      }

      if (img?.image_id) {
        const ok = await deleteImage(img.image_id);
        if (!ok) return toast.error('Failed to delete image');
      }
      setImages((prev) => prev.filter((it) => (it.image_id || it.id) !== key));
      setSelectedImages((prev) => prev.filter((id) => id !== key));
      toast.success('Image deleted');
    },
    [deleteImage]
  );

  return (
    <AdminAuthGuard>
      <SrStatus message={statusMsg} />
      <div className="flex bg-white text-gray-800">
        <aside className="hidden lg:block">
          <AdminSideBar />
        </aside>

        <div className="flex-1 p-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h1 className="text-2xl font-bold">Media Library</h1>
            <div className="flex items-center gap-2">
              <label htmlFor={`${urlId}-search`} className="sr-only">
                Search images
              </label>
              <input
                id={`${urlId}-search`}
                type="search"
                placeholder="Search by alt or tag…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border px-3 py-2 rounded w-60"
                inputMode="search"
                autoComplete="off"
              />
              <label htmlFor={`${urlId}-sortBy`} className="sr-only">
                Sort by
              </label>
              <select
                id={`${urlId}-sortBy`}
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as 'name' | 'size')}
                className="border px-2 py-1 rounded text-sm"
              >
                <option value="name">Sort by Name</option>
                <option value="size">Sort by Size</option>
              </select>

              <label htmlFor={`${urlId}-sortDir`} className="sr-only">
                Sort direction
              </label>
              <select
                id={`${urlId}-sortDir`}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                className="border px-2 py-1 rounded text-sm"
              >
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>

              {selectedImages.length > 0 && (
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="bg-red-600 text-white px-4 py-2 rounded text-sm flex items-center gap-1 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-600"
                  aria-label={`Delete ${selectedImages.length} selected image${selectedImages.length > 1 ? 's' : ''}`}
                >
                  <Trash2 className="w-4 h-4" /> Delete Selected ({selectedImages.length})
                </button>
              )}
            </div>
          </div>

          {/* Image Grid */}
          {Object.entries(groupedImages).map(([section, imgs]) => (
            <section key={section} className="mb-8" aria-labelledby={`sec-${section}`}>
              <h2 id={`sec-${section}`} className="text-red-600 text-xl font-semibold mb-2 capitalize">
                {section}
              </h2>
              <div
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
                role="list"
                aria-label={`${section} images`}
              >
                {imgs.map((img: any) => {
                  const key = img.image_id || img.id;
                  const isSelected = selectedImages.includes(key);
                  return (
                    <ImageCard
                      key={key}
                      img={img}
                      isSelected={isSelected}
                      onToggle={toggleSelect}
                      onOpen={openEditor}
                      onDownload={downloadOne}
                      onDelete={deleteOne}
                    />
                  );
                })}
              </div>
            </section>
          ))}

          {/* Image Modal */}
          {modalImage && !cropMode && (
            <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true">
              <div className="mx-auto my-8 w-[92vw] sm:w-[80vw] md:w-[60vw] lg:w-[50vw] max-h-[85vh] overflow-y-auto bg-white p-6 rounded shadow-lg">
                <div className="flex justify-between mb-4">
                  <h3 className="text-lg font-semibold">Edit Image</h3>
                  <button type="button" onClick={() => setModalImage(null)} aria-label="Close edit modal">
                    <X className="cursor-pointer" />
                  </button>
                </div>

                <img
                  src={modalImage.url}
                  alt={modalImage.alt_text || 'Preview'}
                  className="w-full max-h-[50vh] object-contain rounded mb-2"
                  loading="lazy"
                  decoding="async"
                  onError={(e) => (e.currentTarget.src = '/images/img1.jpg')}
                />

                <button
                  type="button"
                  onClick={() => setCropMode(true)}
                  className="w-full bg-gray-100 py-2 rounded mb-2 flex items-center justify-center gap-2"
                >
                  <RefreshCcw className="w-4 h-4" /> Crop
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearPendingReplace();
                    setReplaceMode('file');
                    setShowReplace(true);
                  }}
                  className="w-full bg-gray-100 py-2 rounded mb-2 flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" /> Replace Image
                </button>

                <label className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    checked={compress}
                    onChange={(e) => setCompress(e.target.checked)}
                    aria-label="Compress on Replace/Save"
                  />
                  Compress on Replace/Save
                </label>

                <label className="sr-only" htmlFor={`${urlId}-alt`}>
                  Alt text
                </label>
                <input
                  id={`${urlId}-alt`}
                  type="text"
                  value={modalImage.alt_text || ''}
                  onChange={(e) => setModalImage({ ...modalImage, alt_text: e.target.value })}
                  placeholder="Alt text"
                  className="mt-2 mb-1 border px-3 py-2 rounded w-full"
                />

                {/* Tags */}
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                  <div className="w-full min-h-[44px] flex flex-wrap items-center gap-2 py-2 px-2 border rounded">
                    {(Array.isArray(modalImage.tags) ? modalImage.tags : []).map((t: string, i: number) => (
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
                        (Array.isArray(modalImage.tags) ? modalImage.tags : []).length === 0
                          ? 'Type and press comma/Enter…'
                          : ''
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
                  <p className="text-xs text-gray-500 mt-1">Separator: comma or Enter. Paste is supported.</p>
                </div>

                <button
                  type="button"
                  onClick={saveMetadata}
                  className="w-full bg-blue-600 text-white py-2 rounded mt-3 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600"
                >
                  Save Metadata
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('Delete this image?')) return;
                    const key = modalImage.image_id || modalImage.id;

                    if (modalImage.isLocal) {
                      setImages((prev) => prev.filter((it) => (it.image_id || it.id) !== key));
                      setSelectedImages((prev) => prev.filter((id) => id !== key));
                      setModalImage(null);
                      toast.success('Image deleted');
                      return;
                    }

                    if (modalImage?.image_id) {
                      const ok = await deleteImage(modalImage.image_id);
                      if (!ok) return toast.error('Failed to delete image');
                    }
                    setImages((prev) => prev.filter((it) => (it.image_id || it.id) !== key));
                    setSelectedImages((prev) => prev.filter((id) => id !== key));
                    setModalImage(null);
                    toast.success('Image deleted');
                  }}
                  className="w-full bg-red-600 text-white py-2 rounded mt-2 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-600"
                >
                  <Trash2 className="w-4 h-4" /> Delete Image
                </button>
              </div>
            </div>
          )}

          {/* Crop Modal */}
          {cropMode && modalImage && (
            <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50" role="dialog" aria-modal="true">
              <div className="bg-white p-6 rounded w-[92vw] max-w-2xl h-[85vh] relative shadow-lg">
                <Cropper
                  image={modalImage.url}
                  crop={crop}
                  zoom={zoom}
                  aspect={4 / 3}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, croppedPixels) => setCroppedAreaPixels(croppedPixels)}
                />
                <div className="absolute bottom-4 left-0 right-0 px-6 flex justify-between">
                  <button type="button" onClick={() => setCropMode(false)} className="bg-gray-200 px-4 py-2 rounded">
                    Cancel
                  </button>
                  <button type="button" onClick={saveCropped} className="bg-blue-600 text-white px-4 py-2 rounded">
                    Save Crop
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Replace Modal (Staged, requires Save) */}
          {showReplace && (
            <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true">
              <div className="mx-auto my-8 bg-white p-6 rounded w-[92vw] sm:w-[80vw] md:w-[60vw] lg:w-[50vw] max-h-[85vh] overflow-y-auto shadow-lg">
                <div className="flex justify-between mb-2">
                  <h2 className="text-lg font-semibold">Replace Image</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setShowReplace(false);
                      clearPendingReplace();
                    }}
                    className="cursor-pointer"
                    aria-label="Close replace modal"
                  >
                    <X />
                  </button>
                </div>

                <div className="flex gap-2 mb-3" role="tablist" aria-label="Replace options">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={replaceMode === 'file'}
                    onClick={() => setReplaceMode('file')}
                    className={`px-3 py-1 rounded ${replaceMode === 'file' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
                  >
                    Upload File
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={replaceMode === 'url'}
                    onClick={() => setReplaceMode('url')}
                    className={`px-3 py-1 rounded ${replaceMode === 'url' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
                  >
                    From URL
                  </button>
                </div>

                {replaceMode === 'file' && (
                  <div className="space-y-2">
                    <label htmlFor={`${urlId}-file`} className="sr-only">
                      Choose replacement image
                    </label>
                    <input
                      id={`${urlId}-file`}
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
                          Staged file: {pendingFileName || 'selected image'}
                        </div>
                        <img
                          src={pendingPreviewUrl}
                          alt="Staged preview"
                          className="w-full h-48 object-cover rounded"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    )}
                  </div>
                )}

                {replaceMode === 'url' && (
                  <div className="space-y-2">
                    <label htmlFor={`${urlId}-url`} className="sr-only">
                      Image URL
                    </label>
                    <input
                      id={`${urlId}-url`}
                      type="url"
                      value={replaceUrl}
                      onChange={(e) => setReplaceUrl(e.target.value)}
                      placeholder="Enter image URL"
                      className="border px-3 py-2 w-full rounded"
                      inputMode="url"
                      autoComplete="off"
                    />
                    <div className="flex gap-2">
                      <label className="sr-only" htmlFor={`${urlId}-w`}>
                        Width
                      </label>
                      <input
                        id={`${urlId}-w`}
                        type="number"
                        value={resizeWidth}
                        onChange={(e) => setResizeWidth(Number(e.target.value))}
                        className="border px-2 py-1 rounded w-24"
                        placeholder="Width"
                      />
                      <label className="sr-only" htmlFor={`${urlId}-h`}>
                        Height
                      </label>
                      <input
                        id={`${urlId}-h`}
                        type="number"
                        value={resizeHeight}
                        onChange={(e) => setResizeHeight(Number(e.target.value))}
                        className="border px-2 py-1 rounded w-24"
                        placeholder="Height"
                      />
                    </div>
                    <div className="rounded border p-2 text-xs text-gray-600">
                      URL will be fetched and processed on <b>Save Image</b>. Compression: {compress ? 'On' : 'Off'}
                    </div>
                  </div>
                )}

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
                      type="button"
                      onClick={() => {
                        setShowReplace(false);
                        clearPendingReplace();
                      }}
                      className="flex-1 sm:flex-none bg-gray-100 text-gray-800 px-4 py-2 rounded"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={commitReplace}
                      className="flex-1 sm:flex-none bg-blue-600 text-white px-4 py-2 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600"
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
