'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import AdminAuthGuard from '../components/AdminAuthGaurd';
import AdminSidebar from '../components/AdminSideBar';
import { API_BASE_URL } from '../../utils/api';

type ImageEntry = {
  type: 'url' | 'file';
  value: string;
  file: File | null;
};
// ADD THIS
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set('X-Frontend-Key', FRONTEND_KEY);
  return { ...init, headers };
};
export default function HeroBannerPage() {
  const [showSidebar, setShowSidebar] = useState(true);
  const [desktopImages, setDesktopImages] = useState<ImageEntry[]>([{ type: 'url', value: '', file: null }]);
  const [mobileImages, setMobileImages] = useState<ImageEntry[]>([{ type: 'url', value: '', file: null }]);

 useEffect(() => {
  fetch(`${API_BASE_URL}/api/hero-banner/`, withFrontendKey())
    .then(res => res.json())
    .then(data => {
      const images: { url: string; device_type: string }[] = data?.images || [];
      const desktop: ImageEntry[] = [];
      const mobile: ImageEntry[] = [];

      images.forEach(({ url, device_type }) => {
      const cleanedUrl = url
  .replace(`${API_BASE_URL}`, '')
  .replace(`${API_BASE_URL}`, '');

const entry = { type: 'url' as const, value: cleanedUrl, file: null };
        device_type.toLowerCase() === 'mobile' ? mobile.push(entry) : desktop.push(entry);
      });

      if (desktop.length) setDesktopImages(desktop);
      if (mobile.length) setMobileImages(mobile);
    })
    .catch(err => console.error('Error fetching hero banner:', err));
}, []);

  const handleImageChange = (
    type: 'desktop' | 'mobile',
    index: number,
    field: 'url' | 'file',
    value: string | File
  ) => {
    const list = type === 'desktop' ? [...desktopImages] : [...mobileImages];
    list[index] =
      field === 'file'
        ? { type: 'file', value: (value as File).name, file: value as File }
        : { type: 'url', value: value as string, file: null };

    type === 'desktop' ? setDesktopImages(list) : setMobileImages(list);
  };

  const handleAddImage = (type: 'desktop' | 'mobile') => {
    const entry = { type: 'url' as const, value: '', file: null };
    type === 'desktop'
      ? setDesktopImages([...desktopImages, entry])
      : setMobileImages([...mobileImages, entry]);
  };

  const handleRemoveImage = (type: 'desktop' | 'mobile', index: number) => {
    const list = type === 'desktop' ? [...desktopImages] : [...mobileImages];
    if (list.length <= 1) return;
    list.splice(index, 1);
    type === 'desktop' ? setDesktopImages(list) : setMobileImages(list);
  };

  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result?.toString();
        if (base64?.startsWith('data:image/')) resolve(base64);
        else reject('Invalid base64 image string');
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

const handleSave = async () => {
  try {
    const processImages = async (
      images: ImageEntry[],
      deviceType: 'desktop' | 'mobile'
    ) => {
      const results = [];

      for (const img of images) {
        let encoded = '';
        if (img.type === 'url') {
          const trimmed = img.value.trim();
          if (!trimmed) continue;

          // ✅ Convert /media/uploads/... to /uploads/... before saving
          if (trimmed.startsWith('/media/uploads/')) {
            encoded = trimmed.replace('/media', '');
          } else {
            encoded = trimmed;
          }
        } else if (img.type === 'file' && img.file) {
          encoded = await toBase64(img.file);
        }

        if (encoded) {
          results.push({ url: encoded, device_type: deviceType });
        }
      }

      return results;
    };

    const desktopPayload = await processImages(desktopImages, 'desktop');
    const mobilePayload = await processImages(mobileImages, 'mobile');

    const finalPayload = [...desktopPayload, ...mobilePayload];

    const res = await fetch(`${API_BASE_URL}/api/hero-banner/`, withFrontendKey({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: finalPayload }),
    }));

    const result = await res.json();
    if (res.ok) {
      alert('✅ Hero Banner saved successfully!');
    } else {
      alert('❌ Failed to save: ' + (result.error || 'Unknown error'));
    }
  } catch (error: any) {
    console.error('Save error:', error);
    alert('❌ Network error: ' + error.message);
  }
};


  const renderImageFields = (
    type: 'desktop' | 'mobile',
    images: ImageEntry[],
    label: string
  ) => (
    <div className="space-y-6 mb-8">
      <h2 className="text-xl font-semibold text-black">{label} Images</h2>
      {images.map((img, index) => (
        <div key={index} className="bg-white p-4 rounded shadow-sm space-y-3">
          <label className="block text-sm text-gray-700 font-medium">
            {label} Image #{index + 1}
          </label>

          <input
            type="text"
            placeholder="Image URL"
            className="w-full border px-3 py-2 rounded text-black"
            value={img.type === 'url' ? img.value : ''}
            onChange={(e) => handleImageChange(type, index, 'url', e.target.value)}
          />

          <input
            type="file"
            accept="image/*"
            className="w-full border px-3 py-2 rounded text-black"
            onChange={(e) => handleImageChange(type, index, 'file', e.target.files?.[0])}
          />

        {img.file ? (
          <div className="pt-2">
            <img
              src={URL.createObjectURL(img.file)}
              alt={`Preview ${index}`}
              width={300}
              height={120}
              className="rounded border object-contain"
            />
          </div>
        ) : img.type === 'url' && img.value ? (
          <div className="pt-2">
            <img
              src={
                img.value.startsWith('http')
                  ? img.value
                  : `${API_BASE_URL}${img.value}`
              }
              alt={`Preview ${index}`}
              width={300}
              height={120}
              className="rounded border object-contain"
            />
          </div>
        ) : null}

          <button
            onClick={() => handleRemoveImage(type, index)}
            className="text-sm text-red-500 hover:underline"
            disabled={images.length <= 1}
          >
            🗑 Remove
          </button>
        </div>
      ))}

      <div>
        <button
          onClick={() => handleAddImage(type)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 w-full sm:w-auto"
        >
          + Add {label} Image
        </button>
      </div>
    </div>
  );

  return (
    <AdminAuthGuard>
      <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50">
        {showSidebar && (
          <div className="lg:w-64 w-full">
            <AdminSidebar />
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6">
          <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
            <h1 className="text-2xl font-bold text-black">Hero Banner</h1>
            <button
              className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 lg:hidden"
              onClick={() => setShowSidebar(!showSidebar)}
            >
              {showSidebar ? 'Hide Sidebar ◀' : 'Show Sidebar ▶'}
            </button>
          </div>

          {renderImageFields('desktop', desktopImages, 'Desktop')}
          {renderImageFields('mobile', mobileImages, 'Mobile')}

          <div className="mt-6 flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 w-full sm:w-auto"
            >
              💾 Save Hero Banner
            </button>
          </div>
        </main>
      </div>
    </AdminAuthGuard>
  );
}
