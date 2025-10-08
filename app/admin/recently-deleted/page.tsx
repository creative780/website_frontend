// app/admin/recently-deleted/RecentlyDeletedPage.tsx
'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import AdminAuthGuard from '../components/AdminAuthGaurd';
import AdminSidebar from '../components/AdminSideBar';
import { API_BASE_URL } from '../../utils/api';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// --- INLINE FRONTEND FIXES (no new files) ---
const BASE_URL = (API_BASE_URL || '').replace(/\/+$/, '');
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();

async function apiFetch(path: string, init: RequestInit = {}) {
  const url = `${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');

  // Send your custom gate key
  if (FRONTEND_KEY) headers.set('X-Frontend-Key', FRONTEND_KEY);

  return fetch(url, {
    ...init,
    headers,
    credentials: 'include', // if you use cookies/session
    cache: 'no-store',
  });
}
// --- END FIXES ---

type BlockedBy = { model: string; id: string; reason: string };
type WillRestoreWith = { model: string; by: string; parent_field: string };

type DeletedItem = {
  id: string;
  table: string;
  record_id: string;
  record_data?: Record<string, any> | null;
  status: 'VISIBLE' | 'HIDE' | 'UNHIDE' | 'PERMANENT' | string;
  deleted_at: string;
  display_name?: string;

  // NEW (from backend)
  standalone?: boolean;
  blocked_by?: BlockedBy[];
  will_restore_with?: WillRestoreWith[];
};

type SortOrder = 'asc' | 'desc';
const sortOptions: Record<SortOrder, string> = { asc: 'Oldest first', desc: 'Newest first' };

// Pull a token if you’re using JWT. If not, harmless.
function getAccessToken() {
  if (typeof window === 'undefined') return null;
  return (
    localStorage.getItem('access') ||
    localStorage.getItem('access_token') ||
    localStorage.getItem('token')
  );
}

function badge(text: string, tone: 'gray' | 'green' | 'red' | 'amber' = 'gray') {
  const palette: Record<typeof tone, string> = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
  } as any;
  return `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${palette[tone]}`;
}

function formatBlocked(blocked: BlockedBy[] | undefined) {
  if (!blocked || blocked.length === 0) return '';
  return blocked.map((b) => `${b.model}:${b.id}`).join(', ');
}

function formatWillRestore(withList: WillRestoreWith[] | undefined) {
  if (!withList || withList.length === 0) return '—';
  const models = Array.from(new Set(withList.map((w) => w.model)));
  return models.join(', ');
}

export default function RecentlyDeletedPage() {
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('All');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await apiFetch('/api/show-deleted-items/');
      if (res.status === 401) {
        throw new Error('401 Unauthorized — login expired or token missing');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DeletedItem[] = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setErrorMsg(`Failed to load deleted items. ${err?.message ?? ''}`.trim());
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const tables = useMemo(() => {
    const unique = new Set<string>();
    items.forEach((i) => unique.add(i.table));
    return ['All', ...Array.from(unique).sort()];
  }, [items]);

  const sortedFiltered = useMemo(() => {
    let data = [...items];
    if (selectedTable !== 'All') data = data.filter((i) => i.table === selectedTable);
    data.sort((a, b) => {
      const t1 = new Date(a.deleted_at).getTime();
      const t2 = new Date(b.deleted_at).getTime();
      return sortOrder === 'asc' ? t1 - t2 : t2 - t1;
    });
    return data;
  }, [items, selectedTable, sortOrder]);

  const inferDisplayName = (item: DeletedItem) => {
    if (item.display_name) return item.display_name;
    const rd = item.record_data || {};
    const candidates = [rd.name, rd.title, rd.slug, rd.code, rd.sku, rd.label].filter(Boolean);
    if (candidates.length > 0) return String(candidates[0]);
    return `${item.table} #${item.record_id}`;
  };

  const blockedInfo = (item: DeletedItem) => {
    const blocked = (item.blocked_by && item.blocked_by.length > 0) || false;
    const nonStandalone = item.standalone === false;
    return { blocked, nonStandalone };
  };

  const handleAction = async (item: DeletedItem, action: 'restore' | 'permanent' | 'hide') => {
    // Block illegal restores early with a helpful toast
    if (action === 'restore') {
      const { blocked, nonStandalone } = blockedInfo(item);
      if (blocked) {
        const needs = formatBlocked(item.blocked_by);
        toast.info(
          nonStandalone
            ? `Restore ${needs} first. This ${item.table} cannot exist alone.`
            : `Dependencies missing: ${needs}`
        );
        return;
      }
    }

    // Map actions → endpoints/payloads
    let path = '';
    let payload: Record<string, any> = {};

    switch (action) {
      case 'restore':
        // Backend expects an array field: ids: [trash_uuid]
        path = '/api/restore-item/'; // wired to RestoreItemsAPIView.as_view()
        payload = { ids: [item.id] };
        break;
      case 'permanent':
        // Match backend route exactly
        path = '/api/permanently-item/';
        payload = { id: item.id };
        break;
      case 'hide':
        path = '/api/recover-item/';
        payload = { id: item.id, status: 'HIDE' };
        break;
    }

    const t = toast.loading(
      action === 'restore'
        ? 'Restoring…'
        : action === 'permanent'
        ? 'Deleting permanently…'
        : 'Hiding…'
    );

    try {
      const res = await apiFetch(path, { method: 'POST', body: JSON.stringify(payload) });
      const txt = await res.text().catch(() => '');
      let json: any = null;
      try {
        json = txt ? JSON.parse(txt) : null;
      } catch {
        /* ignore parse */
      }

      if (!res.ok) {
        if (res.status === 409 && (json?.blocked_by || json?.details)) {
          const needs =
            json?.blocked_by
              ? (json.blocked_by as BlockedBy[]).map((b) => `${b.model}:${b.id}`).join(', ')
              : (json?.details || [])
                  .map((d: any) =>
                    (d.blocked_by || [])
                      .map((b: any) => `${b.model}:${b.id}`)
                      .join(', ')
                  )
                  .filter(Boolean)
                  .join(' • ');
          toast.update(t, {
            render: needs ? `Cannot restore alone. Restore ${needs} first.` : (json?.error || 'Restore blocked.'),
            type: 'warning',
            isLoading: false,
            autoClose: 4500,
          });
          return;
        }

        throw new Error(json?.error || txt || `HTTP ${res.status}`);
      }

      await fetchItems();

      toast.update(t, {
        render:
          action === 'restore'
            ? json?.success || 'Restored and removed from trash.'
            : action === 'permanent'
            ? json?.success || 'Permanently deleted.'
            : json?.success || 'Hidden.',
        type: 'success',
        isLoading: false,
        autoClose: 2200,
      });
    } catch (err: any) {
      toast.update(t, {
        render: `Failed to ${action}. ${err?.message ?? ''}`.trim(),
        type: 'error',
        isLoading: false,
        autoClose: 5000,
      });
    }
  };

  return (
    <AdminAuthGuard>
      <div className="flex min-h-screen bg-gray-100">
        <AdminSidebar />

        <main className="flex-1 p-6">
          <ToastContainer position="top-right" newestOnTop />

          {/* Top Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-800">Recently Deleted</h1>
              <span className={badge('gray')}>
                {items.length} item{items.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                className="border rounded px-3 py-2 text-sm bg-white"
                aria-label="Sort by time"
              >
                {Object.entries(sortOptions).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                onClick={fetchItems}
                className="px-3 py-2 text-sm rounded bg-white border hover:bg-gray-100"
                title="Refresh"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Table Filters */}
          <div className="flex gap-2 flex-wrap mb-4">
            {tables.map((table) => (
              <button
                key={table}
                onClick={() => setSelectedTable(table)}
                className={`px-4 py-2 text-sm border rounded ${
                  selectedTable === table
                    ? 'bg-[#891F1A] text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {table}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="bg-white rounded shadow p-4 space-y-3">
            {loading ? (
              <div className="text-gray-500 text-sm">Loading…</div>
            ) : errorMsg ? (
              <div className="text-red-600 text-sm">{errorMsg}</div>
            ) : sortedFiltered.length === 0 ? (
              <div className="text-gray-500 text-sm">No deleted items found.</div>
            ) : (
              sortedFiltered.map((item) => {
                const { blocked, nonStandalone } = blockedInfo(item);
                const blockedText = formatBlocked(item.blocked_by);
                const willText = formatWillRestore(item.will_restore_with);

                return (
                  <div key={item.id} className="border rounded-md p-3">
                    {/* Row header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{inferDisplayName(item)}</div>
                        <div className="text-xs text-gray-500">
                          Table: <span className="font-medium">{item.table}</span> • Deleted:{' '}
                          {new Date(item.deleted_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {nonStandalone ? (
                          <span className={badge('Requires parent', 'amber')}></span>
                        ) : (
                          <span className={badge('Standalone', 'green')}></span>
                        )}
                        {blocked ? (
                          <span className={badge('Blocked', 'red')} title={blockedText}></span>
                        ) : (
                          <span className={badge('Ready', 'green')}></span>
                        )}
                      </div>
                    </div>

                    {/* Dependency info */}
                    <div className="mt-2 text-xs text-gray-600 space-y-1">
                      <div>
                        <span className="font-medium">Will restore with:</span> <span>{willText}</span>
                      </div>
                      {blocked && (
                        <div>
                          <span className="font-medium text-red-700">Needs:</span>{' '}
                          <span className="text-red-700">{blockedText}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-3 flex gap-2">
                      <button
                        className={`bg-green-600 text-white px-3 py-1 rounded text-sm ${
                          blocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-700'
                        }`}
                        disabled={blocked}
                        onClick={() => handleAction(item, 'restore')}
                        title={
                          blocked
                            ? nonStandalone
                              ? `Restore ${blockedText} first`
                              : `Missing dependencies: ${blockedText}`
                            : 'Restore'
                        }
                      >
                        Restore
                      </button>

                      <button
                        className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                        onClick={() => handleAction(item, 'permanent')}
                        title="Permanently Delete"
                      >
                        Permanently Delete
                      </button>

                      <button
                        className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-800"
                        onClick={() => handleAction(item, 'hide')}
                        title="Hide from the trash list (toggle visibility only)"
                      >
                        Hide
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </main>
      </div>
    </AdminAuthGuard>
  );
}
