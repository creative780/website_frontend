'use client'
import { useEffect, useState, useCallback } from 'react'
import { API_BASE_URL } from '../../utils/api'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim()
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {})
  if (FRONTEND_KEY) headers.set('X-Frontend-Key', FRONTEND_KEY)
  return { ...init, headers }
}

type DataUrl = string | null

const GeneralSettings = () => {
  const [siteTitle, setSiteTitle] = useState('')

  // server-truth
  const [logoUrl, setLogoUrl] = useState<string>('')
  const [faviconUrl, setFaviconUrl] = useState<string>('')

  // optional unsaved previews
  const [logoPreview, setLogoPreview] = useState<DataUrl>(null)
  const [faviconPreview, setFaviconPreview] = useState<DataUrl>(null)

  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const buster = (u: string) => (u ? `${u}${u.includes('?') ? '&' : '?'}v=${Date.now()}` : '')

  const fetchJSON = async (url: string, init?: RequestInit) => {
    const res = await fetch(url, withFrontendKey(init))
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`${res.status} ${res.statusText} - ${txt}`)
    }
    return res.json()
  }

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = reject
      r.readAsDataURL(file)
    })

  // fetchers from Show APIs (single source of truth)
  const refreshTitle = useCallback(async () => {
    const t = await fetchJSON(`${API_BASE_URL}/api/show-sitetitle-details/`)
    if (typeof t?.site_title === 'string') setSiteTitle(t.site_title)
  }, [])

  const refreshLogo = useCallback(async () => {
    const l = await fetchJSON(`${API_BASE_URL}/api/show-logo/`)
    setLogoUrl(l?.logo?.url || '')
  }, [])

  const refreshFavicon = useCallback(async () => {
    const f = await fetchJSON(`${API_BASE_URL}/api/show-favicon/`)
    setFaviconUrl(f?.favicon?.url || '')
  }, [])

  useEffect(() => {
    (async () => {
      try {
       await Promise.all([refreshTitle(), refreshLogo(), refreshFavicon()])
// add this after refresh to avoid stale cached images for a moment
setLogoUrl(u => (u ? `${u}${u.includes('?') ? '&' : '?'}v=${Date.now()}` : ''))
setFaviconUrl(u => (u ? `${u}${u.includes('?') ? '&' : '?'}v=${Date.now()}` : ''))

      } catch (e) {
        console.error(e)
        toast.error('Failed to load settings')
      } finally {
        setLoading(false)
      }
    })()
  }, [refreshTitle, refreshLogo, refreshFavicon])

  // file inputs -> local data URL preview ONLY (do not replace server URL yet)
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, files } = e.target
    const file = files?.[0]
    if (!file) return
    try {
      const dataUrl = await fileToDataUrl(file)
      if (name === 'logo') setLogoPreview(dataUrl)
      if (name === 'favicon') setFaviconPreview(dataUrl)
    } catch {
      toast.error('Could not read image')
    }
  }

  // saves
  const saveTitle = async () => {
    await fetchJSON(`${API_BASE_URL}/api/save-sitetitle-details/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_title: siteTitle }),
    })
  }

  const saveLogo = async () => {
    if (!logoPreview) return
    const res = await fetch(`${API_BASE_URL}/api/save-logo/`, withFrontendKey({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: logoPreview }), // base64 data URL
    }))
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`${res.status} ${res.statusText} - ${txt}`)
    }
    // After save: re-fetch from Show API and clear preview
    await refreshLogo()
    setLogoPreview(null)
  }

  const saveFavicon = async () => {
    if (!faviconPreview) return
    const res = await fetch(`${API_BASE_URL}/api/save-favicon/`, withFrontendKey({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: faviconPreview }), // base64 data URL
    }))
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`${res.status} ${res.statusText} - ${txt}`)
    }
    await refreshFavicon()
    setFaviconPreview(null)
  }

  const handleSaveAll = async () => {
    setSaving(true)
    try {
      await Promise.all([saveTitle(), saveLogo(), saveFavicon()])
      toast.success('General settings saved')
      // hard refresh of display from Show APIs
     await Promise.all([refreshTitle(), refreshLogo(), refreshFavicon()])
// add this after refresh to avoid stale cached images for a moment
setLogoUrl(u => (u ? `${u}${u.includes('?') ? '&' : '?'}v=${Date.now()}` : ''))
setFaviconUrl(u => (u ? `${u}${u.includes('?') ? '&' : '?'}v=${Date.now()}` : ''))

    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  // deletes -> always re-fetch afterwards
  const postVoid = async (url: string) => {
    const r = await fetch(url, withFrontendKey({ method: 'POST' }))
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      throw new Error(`${r.status} ${r.statusText} - ${txt}`)
    }
  }

  const deleteLogo = async () => {
    try {
      await postVoid(`${API_BASE_URL}/api/delete-logo/`)
      await refreshLogo()
      setLogoPreview(null)
      toast.success('Logo deleted')
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to delete logo')
    }
  }

  const deleteFavicon = async () => {
    try {
      await postVoid(`${API_BASE_URL}/api/delete-favicon/`)
      await refreshFavicon()
      setFaviconPreview(null)
      toast.success('Favicon deleted')
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to delete favicon')
    }
  }

  const deleteTitle = async () => {
    try {
      await postVoid(`${API_BASE_URL}/api/delete-sitetitle-details/`)
      await refreshTitle()
      toast.success('Site title cleared')
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to clear title')
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading settings…</div>

  // Display:
  // - “Current” always uses the Show API URL (+ cache-buster)
  // - “New (unsaved)” shows your picked data URL; it NEVER replaces the current until saved
  const currentLogo = buster(logoUrl)
  const currentFavicon = buster(faviconUrl)

  return (
    <div className="space-y-10 max-w-4xl text-black">
      <ToastContainer position="top-right" autoClose={2500} />

      <section className="bg-white p-6 rounded-2xl shadow border border-gray-200">
        <h2 className="text-2xl font-bold text-[#891F1A] mb-4 flex items-center gap-2">⚙️ Site Details</h2>

        {/* Title */}
        <div className="mb-6">
          <label className="block font-medium mb-1">Site Title</label>
          <div className="flex gap-3">
            <input
              type="text"
              name="siteTitle"
              value={siteTitle}
              onChange={(e) => setSiteTitle(e.target.value)}
              className="input-field flex-1"
              placeholder="Enter your site title"
            />
            <button type="button" onClick={deleteTitle} className="px-3 py-2 rounded-md border text-sm">
              Clear
            </button>
          </div>
        </div>

        {/* Logo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div>
            <label className="block font-medium mb-1">Logo — Current</label>
            {currentLogo ? (
              <img
                src={currentLogo}
                alt="Current logo"
                className="h-12 mb-2 object-contain"
                onError={() => setLogoUrl('')} // avoid alt-text-only render
              />
            ) : (
              <div className="h-12 mb-2 flex items-center text-gray-400 text-sm">No logo</div>
            )}
            <div className="flex items-center gap-3">
              <button type="button" onClick={deleteLogo} className="px-3 py-2 rounded-md border text-sm">
                Delete
              </button>
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Logo — New (unsaved)</label>
            {logoPreview ? (
              <img src={logoPreview} alt="New logo preview" className="h-12 mb-2 object-contain" />
            ) : (
              <div className="h-12 mb-2 flex items-center text-gray-400 text-sm">Choose a file to preview</div>
            )}
            <input type="file" name="logo" accept="image/*" onChange={onFileChange} className="input-field" />
          </div>
        </div>

        {/* Favicon */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-8">
          <div>
            <label className="block font-medium mb-1">Favicon — Current</label>
            {currentFavicon ? (
              <img
                src={currentFavicon}
                alt="Current favicon"
                className="h-8 w-8 mb-2"
                onError={() => setFaviconUrl('')}
              />
            ) : (
              <div className="h-8 mb-2 flex items-center text-gray-400 text-sm">No favicon</div>
            )}
            <div className="flex items-center gap-3">
              <button type="button" onClick={deleteFavicon} className="px-3 py-2 rounded-md border text-sm">
                Delete
              </button>
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Favicon — New (unsaved)</label>
            {faviconPreview ? (
              <img src={faviconPreview} alt="New favicon preview" className="h-8 w-8 mb-2" />
            ) : (
              <div className="h-8 mb-2 flex items-center text-gray-400 text-sm">Choose a file to preview</div>
            )}
            <input type="file" name="favicon" accept="image/*" onChange={onFileChange} className="input-field" />
          </div>
        </div>
      </section>

      <div className="pt-2 flex gap-3">
        <button onClick={handleSaveAll} disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Save General Settings'}
        </button>
      </div>

      <style jsx>{`
        .input-field {
          width: 100%;
          padding: 0.5rem;
          border-radius: 0.5rem;
          border: 1px solid #d1d5db;
          background: white;
        }
        .btn-primary {
          background: #891f1a;
          color: white;
          padding: 0.6rem 1.5rem;
          border-radius: 0.5rem;
          font-weight: 600;
        }
        .btn-primary:hover { background: #6d1915; }
      `}</style>
    </div>
  )
}

export default GeneralSettings
