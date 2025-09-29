'use client';

import { useEffect, useMemo, useRef, useState, useId } from 'react';
import AdminAuthGuard from '../components/AdminAuthGaurd';
import AdminSidebar from '../components/AdminSideBar';
import { API_BASE_URL } from '../../utils/api';

// Frontend key helper
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set('X-Frontend-Key', FRONTEND_KEY);
  headers.set('Accept', 'application/json');
  return { ...init, headers, cache: 'no-store' };
};

// Types
type Category = { id: string; name: string; slug?: string; status?: string };
type Subcategory = {
  id: string;
  name: string;
  slug?: string;
  status?: string;
  category_ids?: string[];
};

type ImageRow = {
  type: 'url' | 'file';
  value: string;
  file: File | null;
  title: string;
  categoryFilterId: string;
  subcategoryId: string;
  subcategoryName: string;
};

const MAX_FILE_MB = 5;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export default function FirstCarouselPage() {
  const [showSidebar, setShowSidebar] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);

  const [images, setImages] = useState<ImageRow[]>([
    { type: 'url', value: '', file: null, title: '', categoryFilterId: '', subcategoryId: '', subcategoryName: '' },
  ]);

  const titleId = useId();
  const descId = useId();

  // Helpers
  const toStringIdOrNull = (idStr: string) => {
    const v = (idStr ?? '').toString().trim();
    return v ? v : null;
  };
  const findSubById = (id: string) => subcategories.find((s) => s.id === id);
  const findSubByName = (name: string) => {
    const n = (name || '').trim().toLowerCase();
    if (!n) return undefined;
    return subcategories.find((s) => s.name.trim().toLowerCase() === n);
  };
  const getLastLinkedSub = (rows: ImageRow[], stopIndex: number) => {
    for (let i = stopIndex - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.subcategoryName?.toString().trim()) {
        const byName = findSubByName(r.subcategoryName);
        if (byName) return byName;
      }
      if (r.subcategoryId?.toString().trim()) {
        const byId = findSubById(r.subcategoryId);
        if (byId) return byId;
      }
    }
    return undefined;
  };

  // Fetch visible categories + subcategories (abortable)
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const [catsRes, subsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/show-categories/?_=${Date.now()}`, withFrontendKey({ signal: controller.signal })),
          fetch(`${API_BASE_URL}/api/show-subcategories/?_=${Date.now()}`, withFrontendKey({ signal: controller.signal })),
        ]);

        const arrCats = catsRes.ok ? await catsRes.json() : [];
        const arrSubs = subsRes.ok ? await subsRes.json() : [];

        const visibleCategories = (Array.isArray(arrCats) ? arrCats : []).filter((c: any) => c?.status === 'visible');
        const visibleSubcategories = (Array.isArray(arrSubs) ? arrSubs : []).filter((sc: any) => sc?.status === 'visible');

        const cats: Category[] = visibleCategories.map((c: any) => ({
          id: c?.id != null ? String(c.id) : String(c?.category_id ?? ''),
          name: String(c?.name ?? c?.title ?? ''),
          slug: String(c?.slug ?? ''),
          status: String(c?.status ?? ''),
        }));

        const subs: Subcategory[] = visibleSubcategories.map((s: any) => ({
          id: s?.id != null ? String(s.id) : String(s?.subcategory_id ?? ''),
          name: String(s?.name ?? s?.title ?? ''),
          slug: String(s?.slug ?? ''),
          status: String(s?.status ?? ''),
          category_ids: Array.isArray(s?.category_ids) ? s.category_ids.map((x: any) => String(x)) : [],
        }));

        setCategories(cats);
        setSubcategories(subs);
      } catch (err: any) {
        if (err?.name !== 'AbortError') console.error('Fetch cats/subs error:', err);
      }
    })();

    return () => controller.abort();
  }, []);

  // Fetch existing carousel + normalize into rows
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/first-carousel/?_=${Date.now()}`, withFrontendKey({ signal: controller.signal }));
        if (!res.ok) return;
        const data = await res.json();

        if (data?.title) setTitle(data.title);
        if (data?.description) setDescription(data.description);

        if (Array.isArray(data?.images) && data.images.length) {
          const formatted: ImageRow[] = data.images.map((img: any, idx: number) => {
            const src = typeof img === 'string' ? img : img?.src || '';
            const cleanedUrl = src.replace(`${API_BASE_URL}`, '').replace(`${API_BASE_URL}`, '');
            const idStr = img?.subcategory?.id != null ? String(img.subcategory.id) : '';
            const nameStr = img?.subcategory?.name ? String(img.subcategory.name) : '';
            return {
              type: 'url',
              value: cleanedUrl || '',
              file: null,
              title: img?.title || `Product ${idx + 1}`,
              categoryFilterId: '',
              subcategoryId: idStr,
              subcategoryName: nameStr,
            };
          });

          const hydrated = formatted.map((row, idx, arr) => {
            if (!row.subcategoryName?.toString().trim() && !row.subcategoryId?.toString().trim()) {
              const last = getLastLinkedSub(arr, idx);
              if (last) return { ...row, subcategoryName: last.name, subcategoryId: last.id };
            }
            return row;
          });

          setImages(hydrated);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') console.error('Error fetching carousel data:', err);
      }
    })();
    return () => controller.abort();
  }, []);

  // After subcategories load, backfill row category filter based on selected sub
  useEffect(() => {
    if (!subcategories.length) return;
    setImages((prev) =>
      prev.map((row) => {
        if (!row.categoryFilterId && row.subcategoryId) {
          const sub = findSubById(row.subcategoryId);
          if (sub?.category_ids?.length) return { ...row, categoryFilterId: sub.category_ids[0] };
        }
        return row;
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subcategories]);

  // Row handlers
  const handleAddImage = () => {
    setImages((prev) => {
      const last = getLastLinkedSub(prev, prev.length);
      return [
        ...prev,
        {
          type: 'url',
          value: '',
          file: null,
          title: '',
          categoryFilterId: last?.category_ids?.[0] ?? '',
          subcategoryId: last?.id ?? '',
          subcategoryName: last?.name ?? '',
        },
      ];
    });
  };

  const handleRemoveLastImage = () => {
    setImages((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  const handleRowChange = (index: number, patch: Partial<ImageRow>) => {
    setImages((prev) => {
      const list = [...prev];
      list[index] = { ...list[index], ...patch };
      return list;
    });
  };

  const handleRowCategoryChange = (index: number, categoryId: string) => {
    setImages((prev) => {
      const list = [...prev];
      const row = { ...list[index], categoryFilterId: categoryId };
      if (row.subcategoryId) {
        const sub = findSubById(row.subcategoryId);
        const belongs = !categoryId || (sub?.category_ids || []).includes(categoryId);
        if (!belongs) {
          row.subcategoryId = '';
          row.subcategoryName = '';
        }
      }
      list[index] = row;
      return list;
    });
  };

  const handleRowSubSelect = (index: number, subId: string) => {
    const sub = findSubById(subId);
    setImages((prev) => {
      const list = [...prev];
      const row = { ...list[index] };
      row.subcategoryId = subId;
      row.subcategoryName = sub?.name || row.subcategoryName;
      if (sub?.category_ids?.length) row.categoryFilterId = sub.category_ids[0];
      list[index] = row;
      return list;
    });
  };

  const handleRowSubName = (index: number, name: string) => {
    const match = findSubByName(name);
    setImages((prev) => {
      const list = [...prev];
      const row = { ...list[index] };
      row.subcategoryName = name;
      if (match) {
        row.subcategoryId = match.id;
        if (match.category_ids?.length) row.categoryFilterId = match.category_ids[0];
      }
      list[index] = row;
      return list;
    });
  };

  // Guard: validate a single file
  const validateFile = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      alert('Unsupported image type. Use PNG, JPEG, WEBP, or GIF.');
      return false;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      alert(`File too large. Max ${MAX_FILE_MB} MB.`);
      return false;
    }
    return true;
  };

  // Save
  const handleSave = async () => {
    // basic client-side validation
    const hasAtLeastOne = images.some((r) => (r.type === 'url' ? r.value.trim() : r.file));
    if (!hasAtLeastOne) {
      alert('Add at least one image (URL or file).');
      return;
    }

    try {
      const uploadedImageData = await Promise.all(
        images.map(async (img, idx, arr) => {
          let src = '';

          if (img.type === 'url') {
            const trimmed = img.value.trim();
            if (!trimmed) return null;
            src = trimmed.startsWith('/media/uploads/')
              ? trimmed.replace('/media', '')
              : trimmed;
          } else if (img.type === 'file' && img.file) {
            if (!validateFile(img.file)) return null;
            const reader = new FileReader();
            src = await new Promise<string>((resolve, reject) => {
              reader.onloadend = () => {
                const base64String = reader.result?.toString();
                base64String?.startsWith('data:image/')
                  ? resolve(base64String)
                  : reject(new Error('Invalid image data'));
              };
              reader.onerror = () => reject(new Error('File read error'));
              reader.readAsDataURL(img.file);
            });
          } else {
            return null;
          }

          let chosenId: string | '' = '';
          const byName = findSubByName(img.subcategoryName);
          if (byName) chosenId = byName.id;
          else if (img.subcategoryId) chosenId = img.subcategoryId;
          else {
            const last = getLastLinkedSub(images, idx);
            if (last) chosenId = last.id;
          }

          return {
            src,
            title: img.title || `Product ${idx + 1}`,
            subcategory_id: toStringIdOrNull(chosenId),
          };
        })
      );

      const validImages = uploadedImageData.filter(Boolean);
      if (!validImages.length) {
        alert('Nothing to save. Please provide valid images.');
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/first-carousel/`,
        withFrontendKey({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description, images: validImages }),
        })
      );

      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        alert('✅ Saved successfully!');
      } else {
        alert('❌ Failed to save: ' + (result?.error || `HTTP ${response.status}`));
      }
    } catch (error: any) {
      alert('❌ Save error: ' + (error?.message || String(error)));
    }
  };

  // Derived for perf
  const categoriesMap = useMemo(() => {
    const m = new Map<string, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  return (
    <AdminAuthGuard>
      <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50">
        {/* Sidebar */}
        {showSidebar && (
          <div className="lg:w-64 w-full">
            <AdminSidebar />
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-6" aria-labelledby="page-title">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <h1 id="page-title" className="text-2xl font-bold text-black">
              First Carousel
            </h1>
            <button
              className="lg:hidden px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
              onClick={() => setShowSidebar((s) => !s)}
              aria-expanded={showSidebar}
              aria-controls="admin-sidebar"
            >
              {showSidebar ? 'Hide Sidebar ◀' : 'Show Sidebar ▶'}
            </button>
          </div>

          {/* Title */}
          <div className="mb-4">
            <label htmlFor={titleId} className="block text-sm font-medium text-gray-700 mb-1">
              First Carousel Title
            </label>
            <input
              id={titleId}
              type="text"
              placeholder="First Carousel Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border text-black px-3 py-2 rounded shadow-sm"
              aria-describedby="title-help"
            />
            <p id="title-help" className="text-xs text-gray-500 mt-1">
              Optional. Shown above the carousel on the storefront.
            </p>
          </div>

          {/* Description */}
          <div className="mb-6">
            <label htmlFor={descId} className="block text-sm font-medium text-gray-700 mb-1">
              First Carousel Description
            </label>
            <input
              id={descId}
              type="text"
              placeholder="First Carousel Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border text-black px-3 py-2 rounded shadow-sm"
              aria-describedby="desc-help"
            />
            <p id="desc-help" className="text-xs text-gray-500 mt-1">
              Optional blurb under the title.
            </p>
          </div>

          {/* Image Rows */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-black">Carousel Images</h2>
            </div>

            {images.map((img, index) => {
              const rowSubOptions = img.categoryFilterId
                ? subcategories.filter((sc) => (sc.category_ids || []).includes(img.categoryFilterId))
                : subcategories;

              const subLabelId = `${index}-subcat-label`;
              const catLabelId = `${index}-cat-label`;
              const urlId = `${index}-url`;
              const fileId = `${index}-file`;
              const titleInputId = `${index}-imgtitle`;

              return (
                <div key={index} className="bg-white p-4 rounded shadow-sm space-y-3">
                  <p className="block font-medium text-sm text-gray-700">Image #{index + 1}</p>

                  {/* URL Input */}
                  <label htmlFor={urlId} className="text-sm text-gray-700">Image URL</label>
                  <input
                    id={urlId}
                    type="text"
                    placeholder="https://… or /media/uploads/…"
                    value={img.type === 'url' ? img.value : ''}
                    onChange={(e) => handleRowChange(index, { value: e.target.value, type: 'url', file: null })}
                    className="w-full border px-3 py-2 rounded text-black"
                    inputMode="url"
                    autoComplete="off"
                  />

                  {/* File Input */}
                  <label htmlFor={fileId} className="text-sm text-gray-700">Or upload image</label>
                  <input
                    id={fileId}
                    type="file"
                    accept={ALLOWED_TYPES.join(',')}
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (file && !validateFile(file)) return;
                      handleRowChange(index, { file, type: file ? 'file' : img.type });
                    }}
                    className="w-full border px-3 py-2 rounded text-black"
                  />

                  {/* Image Title (caption) */}
                  <label htmlFor={titleInputId} className="block font-medium text-sm text-gray-700">
                    Image Title
                  </label>
                  <input
                    id={titleInputId}
                    type="text"
                    placeholder="Image Title"
                    value={img.title}
                    onChange={(e) => handleRowChange(index, { title: e.target.value })}
                    className="w-full border px-3 py-2 rounded text-black"
                  />

                  {/* Per-image filters */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Category filter (row-scoped) */}
                    <div>
                      <label id={catLabelId} className="block text-sm font-medium text-gray-700 mb-1">
                        Category (Filter for this image)
                      </label>
                      <select
                        aria-labelledby={catLabelId}
                        className="w-full border rounded px-3 py-2 text-black"
                        value={img.categoryFilterId}
                        onChange={(e) => handleRowCategoryChange(index, e.target.value)}
                      >
                        <option value="">All Categories</option>
                        {categories.map((cat) => (
                          <option key={`cat::${cat.id}`} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Subcategory select */}
                    <div>
                      <label id={subLabelId} className="block text-sm font-medium text-gray-700 mb-1">
                        Subcategory (Select)
                      </label>
                      <select
                        aria-labelledby={subLabelId}
                        className="w-full border border-[#891F1A] rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#891F1A]"
                        value={img.subcategoryId}
                        onChange={(e) => handleRowSubSelect(index, e.target.value)}
                      >
                        <option value="">Select a Subcategory</option>
                        {rowSubOptions.map((sub) => (
                          <option key={`subopt::${sub.id}`} value={sub.id}>
                            {sub.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Image Preview */}
                  {img.type === 'url' && img.value && (
                    <div className="pt-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.value.startsWith('http') ? img.value : `${API_BASE_URL}${img.value}`}
                        alt={`Preview ${index + 1}${
                          img.subcategoryName ? ` – ${img.subcategoryName}` : ''
                        }`}
                        width={240}
                        height={120}
                        className="rounded border object-contain max-h-40"
                        onError={(e) => {
                          const el = e.currentTarget as HTMLImageElement;
                          el.onerror = null;
                          el.src = '/images/img1.jpg';
                        }}
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:gap-4 gap-3">
            <button
              onClick={handleAddImage}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 w-full sm:w-auto"
              aria-label="Add another carousel image"
            >
              + Add More Images
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 w-full sm:w-auto"
              aria-label="Save first carousel section"
            >
              💾 Save Section
            </button>
            <button
              onClick={handleRemoveLastImage}
              disabled={images.length <= 1}
              className={`px-4 py-2 text-white rounded w-full sm:w-auto transition-opacity ${
                images.length <= 1
                  ? 'bg-red-500 opacity-50 cursor-not-allowed'
                  : 'bg-red-500 hover:bg-red-600'
              }`}
              aria-disabled={images.length <= 1}
              aria-label="Remove last carousel image"
            >
              🗑 Remove Last Section
            </button>
          </div>
        </main>
      </div>
    </AdminAuthGuard>
  );
}
