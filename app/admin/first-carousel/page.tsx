'use client';

import { useState, useEffect } from 'react';
import AdminAuthGuard from '../components/AdminAuthGaurd';
import AdminSidebar from '../components/AdminSideBar';
import { API_BASE_URL } from '../../utils/api';

// Frontend key helper
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set('X-Frontend-Key', FRONTEND_KEY);
  return { ...init, headers };
};

// Types
type Category = { id: string; name: string; slug?: string; status?: string };
type Subcategory = {
  id: string;
  name: string;
  slug?: string;
  status?: string;
  category_ids?: string[]; // provided by backend
};

type ImageRow = {
  type: 'url' | 'file';
  value: string;
  file: File | null;
  title: string;
  // row-scoped filter + selection
  categoryFilterId: string;   // '' = All Categories (for THIS row)
  subcategoryId: string;      // selected subcategory id
  subcategoryName: string;    // source of truth on save (we still resolve ID from this)
};

export default function FirstCarouselPage() {
  const [showSidebar, setShowSidebar] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Master lists (visible only)
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);

  // Carousel rows
  const [images, setImages] = useState<ImageRow[]>([
    { type: 'url', value: '', file: null, title: '', categoryFilterId: '', subcategoryId: '', subcategoryName: '' }
  ]);

  // Helpers
  const toStringIdOrNull = (idStr: string) => {
    const v = (idStr ?? '').toString().trim();
    return v ? v : null;
  };
  const findSubById = (id: string) => subcategories.find(s => s.id === id);
  const findSubByName = (name: string) => {
    const n = (name || '').trim().toLowerCase();
    if (!n) return undefined;
    return subcategories.find(s => s.name.trim().toLowerCase() === n);
  };
  const getLastLinkedSub = (rows: ImageRow[], stopIndex: number) => {
    for (let i = stopIndex - 1; i >= 0; i--) {
      const r = rows[i];
      if ((r.subcategoryName ?? '').toString().trim()) {
        const byName = findSubByName(r.subcategoryName);
        if (byName) return byName;
      }
      if ((r.subcategoryId ?? '').toString().trim()) {
        const byId = findSubById(r.subcategoryId);
        if (byId) return byId;
      }
    }
    return undefined;
  };

  // Fetch visible categories + subcategories with AbortController
  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetch(`${API_BASE_URL}/api/show-categories/`, withFrontendKey({ signal: controller.signal })),
      fetch(`${API_BASE_URL}/api/show-subcategories/`, withFrontendKey({ signal: controller.signal })),
    ])
      .then(async ([catsRes, subsRes]) => {
        const [arrCats, arrSubs] = await Promise.all([catsRes.json(), subsRes.json()]);

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
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') console.error('Fetch cats/subs error:', err);
      });

    return () => controller.abort();
  }, []);

  // Fetch existing carousel + normalize into rows
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/first-carousel/`, withFrontendKey())
      .then(res => res.json())
      .then(data => {
        if (data?.title) setTitle(data.title);
        if (data?.description) setDescription(data.description);

        if (Array.isArray(data?.images) && data.images.length) {
          const formatted: ImageRow[] = data.images.map((img: any, idx: number) => {
            const src = typeof img === 'string' ? img : (img?.src || '');
            const cleanedUrl = src.replace(`${API_BASE_URL}`, '').replace(`${API_BASE_URL}`, '');

            const idStr = img?.subcategory?.id != null ? String(img.subcategory.id) : '';
            const nameStr = img?.subcategory?.name ? String(img.subcategory.name) : '';

            return {
              type: 'url',
              value: cleanedUrl || '',
              file: null,
              title: img?.title || `Product ${idx + 1}`,
              categoryFilterId: '', // we’ll backfill after subs are loaded
              subcategoryId: idStr,
              subcategoryName: nameStr,
            };
          });

          // Pre-hydrate missing rows with the latest previously linked subcategory
          const hydrated = formatted.map((row, idx, arr) => {
            if (!(row.subcategoryName ?? '').toString().trim() && !(row.subcategoryId ?? '').toString().trim()) {
              const last = getLastLinkedSub(arr, idx);
              if (last) return { ...row, subcategoryName: last.name, subcategoryId: last.id };
            }
            return row;
          });

          setImages(hydrated);
        }
      })
      .catch(err => console.error('Error fetching carousel data:', err));
  }, []);

  // After subcategories are loaded, if a row has a subcategory but no row category filter,
  // set the row filter to the first mapped parent (for better UX).
  useEffect(() => {
    if (!subcategories.length) return;
    setImages(prev => prev.map(row => {
      if (!row.categoryFilterId && row.subcategoryId) {
        const sub = findSubById(row.subcategoryId);
        if (sub?.category_ids?.length) {
          return { ...row, categoryFilterId: sub.category_ids[0] };
        }
      }
      return row;
    }));
  }, [subcategories]); // eslint-disable-line react-hooks/exhaustive-deps

  // Row handlers
  const handleAddImage = () => {
    setImages(prev => {
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
        }
      ];
    });
  };

  const handleRemoveLastImage = () => {
    setImages(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  const handleRowChange = (index: number, patch: Partial<ImageRow>) => {
    setImages(prev => {
      const list = [...prev];
      list[index] = { ...list[index], ...patch };
      return list;
    });
  };

  const handleRowCategoryChange = (index: number, categoryId: string) => {
    setImages(prev => {
      const list = [...prev];
      const row = { ...list[index], categoryFilterId: categoryId };

      // If current sub no longer belongs to the chosen category, clear it
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
    setImages(prev => {
      const list = [...prev];
      const row = { ...list[index] };
      row.subcategoryId = subId;
      row.subcategoryName = sub?.name || row.subcategoryName;

      // Auto-select row category filter based on chosen sub’s parent (first match)
      if (sub?.category_ids?.length) row.categoryFilterId = sub.category_ids[0];

      list[index] = row;
      return list;
    });
  };

  const handleRowSubName = (index: number, name: string) => {
    const match = findSubByName(name);
    setImages(prev => {
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

  const handleSave = async () => {
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
            const reader = new FileReader();
            src = await new Promise<string>((resolve, reject) => {
              reader.onloadend = () => {
                const base64String = reader.result?.toString();
                base64String?.startsWith('data:image/')
                  ? resolve(base64String)
                  : reject(new Error('Invalid base64'));
              };
              reader.onerror = () => reject(new Error('File read error'));
              reader.readAsDataURL(img.file);
            });
          }

          // Resolve subcategory for POST (name → id → fallback)
          let chosenId: string | '' = '';
          const byName = findSubByName(img.subcategoryName);
          if (byName) chosenId = byName.id;
          else if (img.subcategoryId) chosenId = img.subcategoryId;
          else {
            const last = getLastLinkedSub(arr, idx);
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

      const response = await fetch(
        `${API_BASE_URL}/api/first-carousel/`,
        withFrontendKey({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description, images: validImages }),
        })
      );

      const result = await response.json();
      if (response.ok) {
        alert('✅ Saved successfully!');
      } else {
        alert('❌ Failed to save: ' + (result?.error || 'Unknown error'));
      }
    } catch (error: any) {
      alert('❌ Save error: ' + (error?.message || String(error)));
    }
  };

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
        <main className="flex-1 p-4 sm:p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-black">First Carousel</h1>
            <button
              className="lg:hidden px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
              onClick={() => setShowSidebar(!showSidebar)}
            >
              {showSidebar ? 'Hide Sidebar ◀' : 'Show Sidebar ▶'}
            </button>
          </div>

          {/* Title */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">First Carousel Title</label>
            <input
              type="text"
              placeholder="First Carousel Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border text-black px-3 py-2 rounded shadow-sm"
            />
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">First Carousel Description</label>
            <input
              type="text"
              placeholder="First Carousel Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border text-black px-3 py-2 rounded shadow-sm"
            />
          </div>

          {/* Image Rows */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-black">Carousel Images</h2>
            </div>

            {images.map((img, index) => {
              // Row-specific sub options based on the row’s category filter
              const rowSubOptions =
                img.categoryFilterId
                  ? subcategories.filter(sc => (sc.category_ids || []).includes(img.categoryFilterId))
                  : subcategories;

              return (
                <div key={index} className="bg-white p-4 rounded shadow-sm space-y-3">
                  <label className="block font-medium text-sm text-gray-700">
                    Image #{index + 1}
                  </label>

                  {/* URL Input */}
                  <input
                    type="text"
                    placeholder="Image URL"
                    value={img.type === 'url' ? img.value : ''}
                    onChange={(e) => handleRowChange(index, { value: e.target.value, type: 'url', file: null })}
                    className="w-full border px-3 py-2 rounded text-black"
                  />

                  {/* File Input */}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleRowChange(index, { file, type: 'file' });
                    }}
                    className="w-full border px-3 py-2 rounded text-black"
                  />
                  <p className="block font-medium text-sm text-gray-700" >Image Title</p>
                  {/* Image Title (caption) */}
                  <input
                    type="text"
                    placeholder="Image Title"
                    value={img.title}
                    onChange={(e) => handleRowChange(index, { title: e.target.value })}
                    className="w-full border px-3 py-2 rounded text-black"
                  />

                  {/* ⬇️ Per-image filters placed directly BELOW the caption */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Category filter (row-scoped) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category (Filter for this image)</label>
                      <select
                        className="w-full border rounded px-3 py-2 text-black"
                        value={img.categoryFilterId}
                        onChange={(e) => handleRowCategoryChange(index, e.target.value)}
                      >
                        <option value="">All Categories</option>
                        {categories.map((cat) => (
                          <option key={`cat::${cat.id}`} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Subcategory select (filtered by the row's category) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Subcategory (Select)</label>
                      <select
                        className="w-full border border-[#891F1A] rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#891F1A]"
                        value={img.subcategoryId}
                        onChange={(e) => handleRowSubSelect(index, e.target.value)}
                      >
                        <option value="">Select a Subcategory</option>
                        {rowSubOptions.map((sub) => (
                          <option key={`subopt::${sub.id}`} value={sub.id}>{sub.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Image Preview */}
                  {img.type === 'url' && img.value && (
                    <div className="pt-2">
                      <img
                        src={img.value.startsWith('http') ? img.value : `${API_BASE_URL}${img.value}`}
                        alt={`Preview ${index + 1}`}
                        width={240}
                        height={120}
                        className="rounded border object-contain max-h-40"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/img1.jpg'; }}
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
            >
              + Add More Images
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 w-full sm:w-auto"
            >
              💾 Save Section
            </button>
            <button
              onClick={handleRemoveLastImage}
              disabled={images.length <= 1}
              className={`px-4 py-2 text-white rounded w-full sm:w-auto transition-opacity ${
                images.length <= 1 ? 'bg-red-500 opacity-50 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600'
              }`}
            >
              🗑 Remove Last Section
            </button>
          </div>
        </main>
      </div>
    </AdminAuthGuard>
  );
}
